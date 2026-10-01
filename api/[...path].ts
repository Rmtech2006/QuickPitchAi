import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { handleApi, normalize, type Store } from '../server/api.ts'

// The hosted API: the same handler as the local dev server, but each signed-in person gets their
// own data row in Supabase, and Claude runs through the API key (see server/claudeApi.ts).
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null
// Invite-only: every proposal costs API money, so only these emails get in (comma-separated).
const allowed = (process.env.QP_ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const deny = (status: number, error: string) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error }))
  }
  if (!supabase || !process.env.ANTHROPIC_API_KEY) return deny(503, "QuickPitch online isn't set up yet.")
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  const user = token ? (await supabase.auth.getUser(token)).data.user : null
  if (!user) return deny(401, 'Please log in again.')
  if (!allowed.includes(user.email?.toLowerCase() ?? '')) return deny(403, "This email isn't invited to QuickPitch yet.")

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
  req.url = req.url?.replace(/^\/api/, '') || '/'
  return handleApi(req, res, store)
}
