import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { claudeApi } from '../server/claudeApi.ts'
import { HttpError, normalize, route, type Store } from '../server/route.ts'

// The hosted app on Cloudflare: serves the built site, and runs the same API routes as the local
// dev server, but each signed-in person gets their own data row in Supabase and Claude runs on the API.
interface Env {
  ASSETS: Fetcher
  ANTHROPIC_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  QP_ALLOWED_EMAILS: string // invite-only: every proposal costs API money (comma-separated emails)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      return Response.json(await api(request, url, env))
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status })
      if (e instanceof z.ZodError) return Response.json({ error: 'Please check the form: ' + e.issues.map((i) => i.path.join('.')).join(', ') }, { status: 400 })
      return Response.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
    }
  },
}

async function api(request: Request, url: URL, env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.ANTHROPIC_API_KEY) throw new HttpError(503, "QuickPitch online isn't set up yet.")
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  const user = token ? (await supabase.auth.getUser(token)).data.user : null
  if (!user) throw new HttpError(401, 'Please log in again.')
  const allowed = (env.QP_ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase())
  if (!allowed.includes(user.email?.toLowerCase() ?? '')) throw new HttpError(403, "This email isn't invited to QuickPitch yet.")

  const store: Store = {
    load: async () => {
      const { data, error } = await supabase.from('user_data').select('data').eq('user_id', user.id).maybeSingle()
      if (error) throw new Error(error.message)
      return normalize(data?.data ?? {})
    },
    save: async (db) => {
      const { error } = await supabase.from('user_data').upsert({ user_id: user.id, data: db, updated_at: new Date().toISOString() })
      if (error) throw new Error(error.message)
    },
  }
  // PDFs are made by the browser's print dialog online (see proposalPage.tsx), so there's no /api/pdf here.
  const path = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean)
  const body = async () => JSON.parse((await request.text()) || '{}')
  return route({ store, claude: claudeApi(env.ANTHROPIC_API_KEY) }, request.method, path, body, url.searchParams)
}
