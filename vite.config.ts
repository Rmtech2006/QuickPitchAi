import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { z } from 'zod'
import { buildPrompt, LENGTHS, Proposal, SYSTEM } from './src/proposal.ts'

// The CLI's validator rejects the draft-2020 `$schema` tag zod adds.
const { $schema: _, ...proposalSchema } = z.toJSONSchema(Proposal)

const Request = z.object({
  model: z.enum(['opus', 'sonnet']),
  notes: z.string().min(1).max(20000),
  length: z.coerce.number().refine((n) => n in LENGTHS),
  company: z.string().max(200),
})

// Runs the `claude` CLI on this machine, so generation uses your own Claude login, no API key.
// ponytail: dev-server only (localhost); a hosted version would need its own backend.
function claudeLocal(): Plugin {
  return {
    name: 'claude-local',
    configureServer(server) {
      server.middlewares.use('/api/generate', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json')
          return send(405, { error: 'POST JSON only' })

        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', () => {
          const parsed = Request.safeParse(JSON.parse(raw || '{}'))
          if (!parsed.success) return send(400, { error: 'Invalid request' })
          const r = parsed.data

          const claude = spawn('claude', [
            '-p',
            '--output-format', 'json',
            '--json-schema', JSON.stringify(proposalSchema),
            '--system-prompt', SYSTEM,
            '--model', r.model,
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
          claude.on('error', () => send(500, { error: '`claude` command not found. Install Claude Code and log in.' }))
          claude.on('close', () => {
            try {
              const result = JSON.parse(out)
              if (result.is_error || !result.structured_output)
                return send(502, { error: result.result || 'Claude returned no proposal.' })
              send(200, result.structured_output)
            } catch {
              send(502, { error: err.trim() || 'Could not read Claude output.' })
            }
          })
          claude.stdin.end(buildPrompt({ ...r, length: r.length as keyof typeof LENGTHS }))
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), claudeLocal()],
})
