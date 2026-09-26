import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import {
  buildPrompt, LENGTH_KEYS, MODELS, type Profile, ProfileInput, Proposal, STATUSES, SYSTEM, type StoredProposal,
} from '../src/proposal.ts'

// ponytail: one JSON file, whole-file rewrite per change. Fine for a few users on one machine;
// move to SQLite/Postgres when this is hosted.
// QP_DATA_DIR lets you run a separate copy (e.g. demo data) without touching your real data.
const DIR = process.env.QP_DATA_DIR ? pathToFileURL(process.env.QP_DATA_DIR.replace(/\/?$/, '/')) : new URL('../data/', import.meta.url)
const FILE = new URL('db.json', DIR)
type Db = { profiles: Profile[]; proposals: StoredProposal[] }

function load(): Db {
  if (!existsSync(FILE)) return { profiles: [], proposals: [] }
  return JSON.parse(readFileSync(FILE, 'utf8'))
}
function save(db: Db) {
  mkdirSync(DIR, { recursive: true })
  const tmp = new URL('db.json.tmp', DIR)
  writeFileSync(tmp, JSON.stringify(db, null, 2)) // write then rename, so a crash never leaves half a file
  renameSync(tmp, FILE)
}

// The CLI's validator rejects the draft-2020 `$schema` tag zod adds.
const { $schema: _, ...proposalSchema } = z.toJSONSchema(Proposal)

const GenerateBody = z.object({
  profileId: z.string(),
  notes: z.string().min(1).max(20000),
  length: z.literal([...LENGTH_KEYS]),
  model: z.enum(Object.keys(MODELS) as [keyof typeof MODELS]),
})
const StatusBody = z.object({ status: z.enum(STATUSES) })

// Runs the `claude` CLI on this machine, so generation uses your own Claude login, no API key.
function runClaude(prompt: string, model: string): Promise<Proposal> {
  return new Promise((resolve, reject) => {
    const claude = spawn('claude', [
      '-p',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(proposalSchema),
      '--system-prompt', SYSTEM,
      '--model', model,
      '--tools', '',
      // Keep your personal Claude setup (connected apps, skills, CLAUDE.md, memory) out of the request.
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--setting-sources', '',
      '--no-session-persistence',
    ], { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    claude.stdout.on('data', (c) => (out += c))
    claude.stderr.on('data', (c) => (err += c))
    claude.on('error', () => reject(new Error('`claude` command not found. Install Claude Code and log in.')))
    claude.on('close', () => {
      try {
        const result = JSON.parse(out)
        if (result.is_error || !result.structured_output)
          return reject(new Error(result.result || 'Claude returned no proposal.'))
        resolve(Proposal.parse(result.structured_output))
      } catch (e) {
        reject(new Error(err.trim() || (e instanceof Error ? e.message : 'Could not read Claude output.')))
      }
    })
    claude.stdin.end(prompt)
  })
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return JSON.parse(raw || '{}')
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

async function route(method: string, path: string[], body: () => Promise<unknown>, query: URLSearchParams) {
  const db = load()
  const now = new Date().toISOString()
  const profile = (id: string) => db.profiles.find((p) => p.id === id) ?? (() => { throw new HttpError(404, 'Profile not found') })()
  const proposal = (id: string) => db.proposals.find((p) => p.id === id) ?? (() => { throw new HttpError(404, 'Proposal not found') })()

  switch (`${method} ${path[0]}${path[1] ? '/:id' : ''}`) {
    case 'GET profiles':
      return db.profiles.map(({ id, name, company, accent }) => ({ id, name, company, accent }))
    case 'POST profiles': {
      const p: Profile = { ...ProfileInput.parse(await body()), id: randomUUID(), createdAt: now }
      db.profiles.push(p)
      save(db)
      return p
    }
    case 'GET profiles/:id':
      return profile(path[1])
    case 'PUT profiles/:id': {
      Object.assign(profile(path[1]), ProfileInput.parse(await body()))
      save(db)
      return profile(path[1])
    }
    case 'GET proposals':
      return db.proposals
        .filter((p) => p.profileId === query.get('profileId'))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    case 'GET proposals/:id':
      return proposal(path[1])
    case 'PATCH proposals/:id': {
      const p = proposal(path[1])
      p.status = StatusBody.parse(await body()).status
      p.updatedAt = now
      save(db)
      return p
    }
    case 'POST generate': {
      const b = GenerateBody.parse(await body())
      const owner = profile(b.profileId)
      const result = await runClaude(buildPrompt(owner, b.notes, b.length), b.model)
      const fresh = load() // re-read: other requests may have saved while Claude was writing
      const stored: StoredProposal = {
        id: randomUUID(), profileId: owner.id, notes: b.notes, length: b.length,
        proposal: result, status: 'Draft', createdAt: now, updatedAt: new Date().toISOString(),
      }
      fresh.proposals.push(stored)
      save(fresh)
      return stored
    }
  }
  throw new HttpError(404, 'Not found')
}

export async function handleApi(req: IncomingMessage, res: ServerResponse) {
  const send = (status: number, data: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
  }
  // JSON-only bodies force a CORS preflight, so other websites can't call this local API.
  if (req.method !== 'GET' && req.headers['content-type'] !== 'application/json')
    return send(415, { error: 'JSON only' })
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname.split('/').filter(Boolean)
  try {
    send(200, await route(req.method ?? 'GET', path, () => readJson(req), url.searchParams))
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message })
    if (e instanceof z.ZodError) return send(400, { error: 'Please check the form: ' + e.issues.map((i) => i.path.join('.')).join(', ') })
    send(500, { error: e instanceof Error ? e.message : 'Something went wrong' })
  }
}
