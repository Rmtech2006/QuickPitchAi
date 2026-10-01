import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { HttpError, normalize, PdfBody, route, type Claude, type Store } from './route.ts'

// The local API, run inside the Vite dev server: data in data/db.json, writing through your own `claude` login.
// QP_DATA_DIR lets you run a separate copy (e.g. demo data) without touching your real data.
const DIR = process.env.QP_DATA_DIR ? pathToFileURL(process.env.QP_DATA_DIR.replace(/\/?$/, '/')) : new URL('../data/', import.meta.url)
const FILE = new URL('db.json', DIR)

const fileStore: Store = {
  load: async () => normalize(existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}),
  save: async (db) => {
    mkdirSync(DIR, { recursive: true })
    const tmp = new URL('db.json.tmp', DIR)
    writeFileSync(tmp, JSON.stringify(db, null, 2)) // write then rename, so a crash never leaves half a file
    renameSync(tmp, FILE)
  },
}

// Runs the `claude` CLI on this machine, so generation uses your own Claude login, no API key.
// Claude may only read the web (WebFetch/WebSearch): no shell, no file access.
const claudeCli: Claude = (prompt, model, system, parser, jsonSchema) => {
  return new Promise((resolve, reject) => {
    const claude = spawn('claude', [
      '-p',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(jsonSchema),
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
        const u = result.usage ?? {}
        resolve({
          value: parser.parse(result.structured_output),
          cost: {
            usd: Number(result.total_cost_usd) || 0,
            inputTokens: u.input_tokens ?? 0,
            outputTokens: u.output_tokens ?? 0,
            cacheReadTokens: u.cache_read_input_tokens ?? 0,
            cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
            seconds: Math.round((result.duration_ms ?? 0) / 1000),
          },
        })
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
    send(200, await route({ store: fileStore, claude: claudeCli }, req.method ?? 'GET', path, () => readJson(req), url.searchParams))
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message })
    if (e instanceof z.ZodError) return send(400, { error: 'Please check the form: ' + e.issues.map((i) => i.path.join('.')).join(', ') })
    send(500, { error: e instanceof Error ? e.message : 'Something went wrong' })
  }
}
