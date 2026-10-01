import Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'
import type { Model, RunCost } from '../src/proposal.ts'

// The hosted site has no `claude` CLI, so it calls the Claude API with ANTHROPIC_API_KEY instead.
// Same contract as the CLI path in api.ts: prompt in, schema-checked JSON + cost out.
const MODEL_IDS: Record<Model, string> = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5' }
// USD per million tokens: input, output, cache read, cache write. Web search is $10 per 1,000 searches.
const PRICES: Record<Model, [number, number, number, number]> = { opus: [4, 20, 0.2, 5], sonnet: [2, 10, 0.2, 2.5] }

export async function runClaudeApi<T>(prompt: string, model: Model, system: string, parser: z.ZodType<T>, jsonSchema: object): Promise<{ value: T; cost: RunCost }> {
  const client = new Anthropic()
  const started = Date.now()
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }]
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 }

  // Server tools can pause a long turn; send it back to let Claude carry on.
  for (let turn = 0; turn < 6; turn++) {
    const msg = await client.beta.messages.stream({
      model: MODEL_IDS[model],
      max_tokens: 64000,
      system,
      messages,
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 10 },
      ],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: { ...jsonSchema, additionalProperties: false } } },
      // If a safety check declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }).finalMessage()

    const u = msg.usage
    t.input += u.input_tokens
    t.output += u.output_tokens
    t.cacheRead += u.cache_read_input_tokens ?? 0
    t.cacheWrite += u.cache_creation_input_tokens ?? 0
    t.searches += u.server_tool_use?.web_search_requests ?? 0

    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: msg.content })
      continue
    }
    if (msg.stop_reason === 'refusal') throw new Error('Claude declined to write this proposal. Try rewording the notes.')
    if (msg.stop_reason === 'max_tokens') throw new Error('The proposal came out too long. Try again or shorten the notes.')

    const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    const [pIn, pOut, pRead, pWrite] = PRICES[model]
    return {
      value: parser.parse(JSON.parse(text)),
      cost: {
        usd: (t.input * pIn + t.output * pOut + t.cacheRead * pRead + t.cacheWrite * pWrite) / 1e6 + t.searches * 0.01,
        inputTokens: t.input,
        outputTokens: t.output,
        cacheReadTokens: t.cacheRead,
        cacheWriteTokens: t.cacheWrite,
        seconds: Math.round((Date.now() - started) / 1000),
      },
    }
  }
  throw new Error('Claude took too many steps on this proposal. Please try again.')
}
