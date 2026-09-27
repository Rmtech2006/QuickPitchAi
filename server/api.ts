import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import {
  type Client, ClientInput, AVAILABLE_LENGTHS, DesignedProposal, MODELS, type Profile, ProfileInput, STATUSES, type StoredProposal,
} from '../src/proposal.ts'
import { brandKit } from './brand.ts'
import { buildDesignPrompt, CLIENT_LOGO, DESIGN_SYSTEM, type LogoInfo, OUR_LOGO } from './design.ts'
import { findLogo } from './logo.ts'

// ponytail: one JSON file, whole-file rewrite per change. Fine for a few users on one machine;
// move to SQLite/Postgres when this is hosted.
// QP_DATA_DIR lets you run a separate copy (e.g. demo data) without touching your real data.
const DIR = process.env.QP_DATA_DIR ? pathToFileURL(process.env.QP_DATA_DIR.replace(/\/?$/, '/')) : new URL('../data/', import.meta.url)
const FILE = new URL('db.json', DIR)
type Db = { profiles: Profile[]; clients: Client[]; proposals: StoredProposal[] }

function load(): Db {
  if (!existsSync(FILE)) return { profiles: [], clients: [], proposals: [] }
  const db: Db = JSON.parse(readFileSync(FILE, 'utf8'))
  db.clients ??= []
  for (const c of db.clients) {
    c.logo ??= ''
    c.logoTone ??= 'dark'
    c.logoVersion ??= 0
  }
  // Fill fields added after an account was created.
  for (const p of db.profiles) {
    p.website ??= ''
    p.email ??= ''
    p.phone ??= ''
    p.logo ??= ''
    p.logoTone ??= 'dark'
    p.logoVersion ??= 0
  }
  // Older proposals kept title/client inside `proposal`.
  for (const p of db.proposals) {
    p.title ??= p.proposal?.title ?? 'Untitled proposal'
    p.client ??= p.proposal?.client ?? ''
  }
  return db
}
function save(db: Db) {
  mkdirSync(DIR, { recursive: true })
  const tmp = new URL('db.json.tmp', DIR)
  writeFileSync(tmp, JSON.stringify(db, null, 2)) // write then rename, so a crash never leaves half a file
  renameSync(tmp, FILE)
}

// The CLI's validator rejects the draft-2020 `$schema` tag zod adds.
const { $schema: _, ...designedSchema } = z.toJSONSchema(DesignedProposal)

const GenerateBody = z.object({
  profileId: z.string(),
  notes: z.string().min(1).max(20000),
  clientId: z.string().optional(),
  productImage: z.boolean().default(false),
  // Only the one-page proposal is live for now.
  length: z.literal([...AVAILABLE_LENGTHS] as [1]),
  model: z.enum(Object.keys(MODELS) as [keyof typeof MODELS]),
})
const StatusBody = z.object({ status: z.enum(STATUSES) })

// Runs the `claude` CLI on this machine, so generation uses your own Claude login, no API key.
// Claude may only read the web (WebFetch/WebSearch): no shell, no file access.
function runClaude(prompt: string, model: string): Promise<DesignedProposal> {
  return new Promise((resolve, reject) => {
    const claude = spawn('claude', [
      '-p',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(designedSchema),
      '--system-prompt', DESIGN_SYSTEM,
      '--model', model,
      '--tools', 'WebFetch,WebSearch',
      '--allowedTools', 'WebFetch', 'WebSearch',
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
        resolve(DesignedProposal.parse(result.structured_output))
      } catch (e) {
        reject(new Error(err.trim() || (e instanceof Error ? e.message : 'Could not read Claude output.')))
      }
    })
    claude.stdin.end(prompt)
  })
}

// Like a hand-numbered quotation: BLY/2026-27/APL-01 (Indian financial year, April to March).
function proposalNumber(company: string, client: string, n: number) {
  const letters = (name: string, fallback: string) => (name.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || fallback)
  const now = new Date()
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${letters(company, 'QP')}/${fy}-${String(fy + 1).slice(2)}/${letters(client, 'CLT')}-${String(n).padStart(2, '0')}`
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
  const client = (id: string) => db.clients.find((c) => c.id === id) ?? (() => { throw new HttpError(404, 'Client not found') })()
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
    case 'GET clients':
      return db.clients.filter((c) => c.profileId === query.get('profileId')).sort((a, b) => a.name.localeCompare(b.name))
    case 'POST clients': {
      const b = z.object({ profileId: z.string() }).and(ClientInput).parse(await body())
      profile(b.profileId)
      const { profileId, ...input } = b
      const c: Client = { ...ClientInput.parse(input), id: randomUUID(), profileId, createdAt: now }
      db.clients.push(c)
      save(db)
      return c
    }
    case 'GET clients/:id':
      return client(path[1])
    case 'PUT clients/:id': {
      Object.assign(client(path[1]), ClientInput.parse(await body()))
      save(db)
      return client(path[1])
    }
    case 'DELETE clients/:id': {
      client(path[1])
      db.clients = db.clients.filter((c) => c.id !== path[1]) // proposals are kept
      save(db)
      return { ok: true }
    }
    case 'GET logo': {
      const site = query.get('url') ?? ''
      if (!site) throw new HttpError(400, 'Add a website first')
      const found = await findLogo(site).catch(() => null)
      if (!found) throw new HttpError(404, "Couldn't find a logo on that website. Upload one instead.")
      return found
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
    case 'DELETE proposals/:id': {
      proposal(path[1])
      db.proposals = db.proposals.filter((p) => p.id !== path[1])
      save(db)
      return { ok: true }
    }
    case 'POST generate': {
      const b = GenerateBody.parse(await body())
      const owner = profile(b.profileId)
      const forClient = b.clientId ? client(b.clientId) : null
      const clientUrl = forClient?.website ?? ''
      // A site that can't be read just means Claude designs without exact brand values.
      const [clientKit, ownKit] = await Promise.all([
        clientUrl ? brandKit(clientUrl).catch(() => null) : null,
        owner.website ? brandKit(owner.website).catch(() => null) : null,
      ])
      // Saved logos are already cleaned up and know their tone; otherwise look one up on the website.
      const logoFor = async (saved: { logo: string; logoTone: 'light' | 'dark' } | null, site: string): Promise<LogoInfo> => {
        if (saved?.logo) return { dataUrl: saved.logo, tone: saved.logoTone }
        const found = site ? await findLogo(site).catch(() => null) : null
        return found && { dataUrl: found.dataUrl, tone: 'unknown' }
      }
      const [ourLogo, clientLogo] = await Promise.all([logoFor(owner, owner.website), logoFor(forClient, clientUrl)])
      const result = await runClaude(
        buildDesignPrompt({
          profile: owner, client: forClient, notes: b.notes, length: b.length, clientUrl, clientKit, ownKit,
          ourLogo, clientLogo, productImage: b.productImage ? (clientKit?.heroImage ?? '') : '',
          reference: proposalNumber(owner.company, forClient?.name ?? '', db.proposals.filter((p) => p.profileId === owner.id && p.clientId === forClient?.id).length + 1),
        }),
        b.model,
      )
      const fresh = load() // re-read: other requests may have saved while Claude was writing
      const stored: StoredProposal = {
        id: randomUUID(), profileId: owner.id, notes: b.notes, length: b.length, clientId: forClient?.id, clientUrl,
        title: result.title, client: forClient?.name ?? result.client,
        html: result.html.replaceAll(OUR_LOGO, ourLogo?.dataUrl ?? '').replaceAll(CLIENT_LOGO, clientLogo?.dataUrl ?? ''),
        status: 'Draft', createdAt: now, updatedAt: new Date().toISOString(),
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
