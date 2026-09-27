// Pulls a brand kit (colours, fonts, logo, hero image) straight from a website's HTML and CSS,
// so the proposal uses exact values instead of guesses.
// ponytail: regex over HTML/CSS, no browser. Misses colours set only by JavaScript or images;
// swap in headless Chrome + computed styles if that matters.

export type BrandKit = {
  url: string
  title: string
  description: string
  themeColor: string
  heroImage: string
  logos: string[]
  fonts: string[]
  googleFontsUrls: string[]
  colors: string[]
  neutrals: string[]
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
const GENERIC_FONTS = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', 'inherit', 'initial', 'cursive', 'emoji', '-apple-system', 'blinkmacsystemfont', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'segoe ui', 'roboto', 'helvetica', 'helvetica neue', 'arial', 'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'unset'])

async function get(url: string, maxBytes: number): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000), redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return (await res.text()).slice(0, maxBytes)
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const attr = (tag: string, name: string) => decode(tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? '')
const meta = (html: string, key: string) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? [])
    if ([attr(tag, 'property'), attr(tag, 'name')].some((v) => v.toLowerCase() === key)) return attr(tag, 'content')
  return ''
}

function hex(c: string): string | null {
  let h = c.replace('#', '').toLowerCase()
  if (h.length === 3) h = [...h].map((x) => x + x).join('')
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null
}
function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`
}
function saturation(h: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function top<T>(counts: Map<T, number>, n: number) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
}

export async function brandKit(rawUrl: string): Promise<BrandKit> {
  const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).toString()
  const html = await get(url, 2_000_000)
  const abs = (u: string) => { try { return new URL(u, url).toString() } catch { return '' } }

  const links = html.match(/<link\b[^>]*>/gi) ?? []
  const cssUrls = links
    .filter((l) => /stylesheet/i.test(attr(l, 'rel')) || /\.css(\?|$)/i.test(attr(l, 'href')))
    .map((l) => abs(attr(l, 'href')))
    .filter(Boolean)
  const googleFontsUrls = cssUrls.filter((u) => u.includes('fonts.googleapis.com'))
  const inlineCss = (html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? []).join('\n')
  const inlineStyles = (html.match(/style\s*=\s*"[^"]*"/gi) ?? []).join('\n')
  const sheets = await Promise.all(
    cssUrls.filter((u) => !googleFontsUrls.includes(u)).slice(0, 6).map((u) => get(u, 1_500_000).catch(() => '')),
  )
  const css = [inlineCss, inlineStyles, ...sheets].join('\n')

  const colorCounts = new Map<string, number>()
  const bump = (h: string | null, w = 1) => h && colorCounts.set(h, (colorCounts.get(h) ?? 0) + w)
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) bump(hex(m[0]))
  for (const m of css.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)) bump(rgbToHex(+m[1], +m[2], +m[3]))
  // Colours in custom properties (--primary etc.) are usually the brand palette: weight them up.
  for (const m of css.matchAll(/--[\w-]*(?:primary|brand|accent|secondary|main)[\w-]*\s*:\s*(#[0-9a-f]{3,6})\b/gi)) bump(hex(m[1]), 20)
  const themeColor = hex(meta(html, 'theme-color') || '') ?? ''
  bump(themeColor || null, 30)
  const all = top(colorCounts, 40)
  const colors = all.filter((h) => saturation(h) > 0.25).slice(0, 8)
  const neutrals = all.filter((h) => saturation(h) <= 0.25).slice(0, 5)

  const fontCounts = new Map<string, number>()
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = m[1].split(',')[0].replace(/!important/i, '').trim().replace(/["']/g, '')
    if (first && !first.startsWith('var(') && !GENERIC_FONTS.has(first.toLowerCase())) fontCounts.set(first, (fontCounts.get(first) ?? 0) + 1)
  }
  for (const u of googleFontsUrls)
    for (const f of u.matchAll(/family=([^:&]+)/g)) {
      const name = decodeURIComponent(f[1]).replace(/\+/g, ' ')
      fontCounts.set(name, (fontCounts.get(name) ?? 0) + 10)
    }

  const logos = new Set<string>()
  for (const img of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = attr(img, 'src') || attr(img, 'data-src')
    if (src && /logo/i.test(`${src} ${attr(img, 'alt')} ${attr(img, 'class')} ${attr(img, 'id')}`)) logos.add(abs(src))
  }
  for (const l of links) if (/apple-touch-icon|icon/i.test(attr(l, 'rel'))) logos.add(abs(attr(l, 'href')))

  return {
    url,
    title: decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''),
    description: meta(html, 'description') || meta(html, 'og:description'),
    themeColor,
    heroImage: abs(meta(html, 'og:image')),
    logos: [...logos].filter(Boolean).slice(0, 5),
    fonts: top(fontCounts, 5),
    googleFontsUrls,
    colors,
    neutrals,
  }
}

// Quick check: node --experimental-strip-types server/brand.ts https://example.com
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await brandKit(process.argv[2] ?? 'https://www.blyftit.com'), null, 2))
}
