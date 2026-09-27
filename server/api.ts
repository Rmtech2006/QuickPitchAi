import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import {
  type Client, ClientInput, AVAILABLE_LENGTHS, DesignedProposal, MODELS, type Profile, ProfileInput, STATUSES, type StoredProposal, type Version,
} from '../src/proposal.ts'
import { brandKit } from './brand.ts'
import { buildDesignPrompt, CLIENT_LOGO, DESIGN_SYSTEM, type LogoInfo, OUR_LOGO, REVISE_SYSTEM } from './design.ts'
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
    if (p.html && !p.versions) p.versions = [{ html: p.html, title: p.title, label: 'Generated', createdAt: p.createdAt }]
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
  // Regenerate: add a new version to this proposal instead of creating another one.
  proposalId: z.string().optional(),
  productImage: z.boolean().default(false),
  // Only the one-page proposal is live for now.
  length: z.literal([...AVAILABLE_LENGTHS] as [1]),
  model: z.enum(Object.keys(MODELS) as [keyof typeof MODELS]),
})
const StatusBody = z.object({ status: z.enum(STATUSES) })
const EditBody = z.object({ html: z.string().min(1).max(8_000_000) })
const ReviseBody = z.object({ instruction: z.string().min(1).max(2000), model: z.enum(Object.keys(MODELS) as [keyof typeof MODELS]) })
const RestoreBody = z.object({ version: z.number().int().min(0) })
const MessageBody = z.object({ message: z.string().max(3000) })
const PdfBody = z.object({ html: z.string().min(1).max(8_000_000) })

// Big inline images (logos, photos) are swapped for short placeholders while Claude revises a page.
function stashImages(html: string) {
  const images: string[] = []
  const text = html.replace(/data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/g, (m) => {
    let i = images.indexOf(m)
    if (i < 0) i = images.push(m) - 1
    return `{{IMG_${i + 1}}}`
  })
  return { text, restore: (out: string) => out.replace(/\{\{IMG_(\d+)\}\}/g, (m, n) => images[Number(n) - 1] ?? m) }
}

function addVersion(p: StoredProposal, v: Omit<Version, 'createdAt'>) {
  const createdAt = new Date().toISOString()
  p.versions = [...(p.versions ?? []), { ...v, createdAt }]
  p.html = v.html
  p.title = v.title
  p.updatedAt = createdAt
}

// A list view doesn't need every page and version, which can be megabytes.
const summary = ({ html: _h, versions, proposal: _p, ...rest }: StoredProposal) => ({ ...rest, versionCount: versions?.length ?? 0 })

// Runs the `claude` CLI on this machine, so generation uses your own Claude login, no API key.
// Claude may only read the web (WebFetch/WebSearch): no shell, no file access.
function runClaude(prompt: string, model: string, system = DESIGN_SYSTEM): Promise<DesignedProposal> {
  return new Promise((resolve, reject) => {
    const claude = spawn('claude', [
      '-p',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(designedSchema),
      '--system-prompt', system,
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

  switch (`${method} ${path[0]}${path[1] ? '/:id' : ''}${path[2] ? `/${path[2]}` : ''}`) {
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
        .map(summary)
    case 'GET proposals/:id':
      return proposal(path[1])
    case 'PATCH proposals/:id': {
      const p = proposal(path[1])
      p.status = StatusBody.parse(await body()).status
      p.updatedAt = now
      save(db)
      return p
    }
    case 'POST proposals/:id/versions': {
      // Text edited directly on the page.
      const p = proposal(path[1])
      addVersion(p, { html: EditBody.parse(await body()).html, title: p.title, label: 'Edited by hand' })
      save(db)
      return p
    }
    case 'POST proposals/:id/restore': {
      const p = proposal(path[1])
      const n = RestoreBody.parse(await body()).version
      const v = p.versions?.[n]
      if (!v) throw new HttpError(404, 'Version not found')
      addVersion(p, { html: v.html, title: v.title, label: `Restored v${n + 1}` })
      save(db)
      return p
    }
    case 'PUT proposals/:id/message': {
      const p = proposal(path[1])
      p.message = MessageBody.parse(await body()).message
      save(db)
      return p
    }
    case 'POST proposals/:id/revise': {
      const p = proposal(path[1])
      if (!p.html) throw new HttpError(400, 'Only designed proposals can be revised. Regenerate this one first.')
      const b = ReviseBody.parse(await body())
      const { text, restore } = stashImages(p.html)
      const result = await runClaude(
        `Client website: ${p.clientUrl || 'not given'}\n\n<requested_change>\n${b.instruction}\n</requested_change>\n\n<current_message>\n${p.message ?? ''}\n</current_message>\n\n<proposal_html>\n${text}\n</proposal_html>`,
        b.model,
        REVISE_SYSTEM,
      )
      const fresh = load() // re-read: other requests may have saved while Claude was writing
      const target = fresh.proposals.find((x) => x.id === p.id)
      if (!target) throw new HttpError(404, 'Proposal was deleted while revising')
      addVersion(target, { html: restore(result.html), title: result.title, label: `Revised: ${b.instruction.slice(0, 80)}` })
      target.message = result.message
      save(fresh)
      return target
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
      const existing = b.proposalId ? proposal(b.proposalId) : null
      const reference = existing?.reference ?? proposalNumber(owner.company, forClient?.name ?? '', db.proposals.filter((p) => p.profileId === owner.id && p.clientId === forClient?.id).length + 1)
      const result = await runClaude(
        buildDesignPrompt({
          profile: owner, client: forClient, notes: b.notes, length: b.length, clientUrl, clientKit, ownKit,
          ourLogo, clientLogo, productImage: b.productImage ? (clientKit?.heroImage ?? '') : '',
          reference,
        }),
        b.model,
      )
      const html = result.html.replaceAll(OUR_LOGO, ourLogo?.dataUrl ?? '').replaceAll(CLIENT_LOGO, clientLogo?.dataUrl ?? '')
      const fresh = load() // re-read: other requests may have saved while Claude was writing
      const again = existing && fresh.proposals.find((x) => x.id === existing.id)
      if (again) {
        Object.assign(again, { notes: b.notes, clientId: forClient?.id, clientUrl, client: forClient?.name ?? result.client, message: result.message })
        addVersion(again, { html, title: result.title, label: 'Regenerated' })
        save(fresh)
        return again
      }
      const stored: StoredProposal = {
        id: randomUUID(), profileId: owner.id, notes: b.notes, length: b.length, clientId: forClient?.id, clientUrl, reference,
        title: result.title, client: forClient?.name ?? result.client, html, message: result.message,
        versions: [{ html, title: result.title, label: 'Generated', createdAt: new Date().toISOString() }],
        status: 'Draft', createdAt: now, updatedAt: new Date().toISOString(),
      }
      fresh.proposals.push(stored)
      save(fresh)
      return stored
    }
  }
  throw new HttpError(404, 'Not found')
}

// Chrome (or a Chromium-based browser) already on this machine turns the page into a real PDF.
function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  for (const c of candidates) if (c && existsSync(c)) return c
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' }).stdout?.trim()
    if (found) return found
  }
  return null
}

function htmlToPdf(html: string): Promise<Buffer> {
  const chrome = findChrome()
  if (!chrome) return Promise.reject(new HttpError(501, 'No Chrome found for PDF export. Use your browser\'s print dialog instead.'))
  const dir = mkdtempSync(join(tmpdir(), 'quickpitch-pdf-'))
  const input = join(dir, 'proposal.html')
  const output = join(dir, 'proposal.pdf')
  writeFileSync(input, html)
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--no-pdf-header-footer',
      `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=10000', `--print-to-pdf=${output}`, pathToFileURL(input).toString(),
    ], { stdio: 'ignore' })
    const timer = setTimeout(() => child.kill(), 60_000)
    // Chrome can linger after writing the file: stop it once the PDF stops growing.
    let lastSize = -1
    const poll = setInterval(() => {
      const size = existsSync(output) ? statSync(output).size : 0
      if (size > 0 && size === lastSize) child.kill()
      lastSize = size
    }, 300)
    child.on('error', (e) => { clearTimeout(timer); clearInterval(poll); rmSync(dir, { recursive: true, force: true }); reject(e) })
    child.on('close', () => {
      clearTimeout(timer)
      clearInterval(poll)
      try {
        resolve(readFileSync(output))
      } catch {
        reject(new Error('PDF export failed. Use your browser\'s print dialog instead.'))
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
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
  // The one binary response: the page as the browser shows it (already fitted to A4), printed to PDF.
  if (req.method === 'POST' && path[0] === 'pdf') {
    try {
      const pdf = await htmlToPdf(PdfBody.parse(await readJson(req)).html)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/pdf')
      return res.end(pdf)
    } catch (e) {
      return send(e instanceof HttpError ? e.status : 500, { error: e instanceof Error ? e.message : 'PDF export failed' })
    }
  }
  try {
    send(200, await route(req.method ?? 'GET', path, () => readJson(req), url.searchParams))
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message })
    if (e instanceof z.ZodError) return send(400, { error: 'Please check the form: ' + e.issues.map((i) => i.path.join('.')).join(', ') })
    send(500, { error: e instanceof Error ? e.message : 'Something went wrong' })
  }
}
