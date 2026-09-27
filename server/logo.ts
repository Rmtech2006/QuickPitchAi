// Finds a website's own logo and returns it as a data URL, so proposals don't depend on hotlinks.
// ponytail: HTML heuristics, no browser. Covers the common cases (logo in the home link, <img> named
// "logo", JSON-LD, app icon); sites that draw the logo with JavaScript or CSS backgrounds fall through.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
const MAX_BYTES = 1_000_000

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const attr = (tag: string, name: string) =>
  decode(tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? '')

export const normalizeUrl = (raw: string) => new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString()

async function fetchImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
    const type = res.headers.get('content-type')?.split(';')[0].trim() ?? ''
    if (!res.ok || !/^image\/(png|jpeg|webp|svg\+xml|gif|x-icon|vnd\.microsoft\.icon)$/.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_BYTES || buf.length < 100) return null
    return `data:${type === 'image/gif' || type.includes('icon') ? 'image/png' : type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function svgDataUrl(svg: string): string | null {
  // Sprites (<use>) and scripts don't survive being lifted out of the page.
  if (/<use\b|<script|<foreignObject/i.test(svg)) return null
  let s = svg
  if (!/xmlns=/.test(s)) s = s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  return `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
}

function pickFromHtml(html: string, pageUrl: string) {
  const base = new URL(pageUrl)
  const abs = (u: string) => { try { return new URL(u, base).toString() } catch { return '' } }
  const isHome = (href: string) => {
    try {
      const u = new URL(href, base)
      return u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '') && (u.pathname === '/' || u.pathname === '')
    } catch { return false }
  }
  const candidates: { svg?: string; url?: string }[] = []

  // 1. What visitors see: the logo inside the first link back to the home page.
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]{0,8000}?)<\/a>/gi)) {
    if (!isHome(attr(`<a ${m[1]}>`, 'href'))) continue
    const inner = m[2]
    const svg = inner.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0]
    const img = inner.match(/<img\b[^>]*>/i)?.[0]
    if (img) candidates.push({ url: abs(attr(img, 'src') || attr(img, 'data-src')) })
    else if (svg && svg.length > 200) candidates.push({ svg })
    if (candidates.length) break
  }
  // 2. Images explicitly named "logo" (skipping partner / client logo walls further down the page).
  for (const img of html.match(/<img\b[^>]*>/gi) ?? []) {
    const hint = `${attr(img, 'src')} ${attr(img, 'alt')} ${attr(img, 'class')} ${attr(img, 'id')}`
    if (/logo/i.test(hint)) { candidates.push({ url: abs(attr(img, 'src') || attr(img, 'data-src')) }); break }
  }
  // 3. Structured data and meta tags.
  for (const block of html.match(/<script[^>]*ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    const logo = block.match(/"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/)?.[1]
    if (logo) { candidates.push({ url: abs(logo) }); break }
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? [])
    if (/og:logo/i.test(attr(tag, 'property'))) candidates.push({ url: abs(attr(tag, 'content')) })
  // 4. Last resort: the square app icon, then the site icon.
  const links = html.match(/<link\b[^>]*>/gi) ?? []
  for (const l of links) if (/apple-touch-icon/i.test(attr(l, 'rel'))) candidates.push({ url: abs(attr(l, 'href')) })
  for (const l of links) if (/(^|\s)icon(\s|$)/i.test(attr(l, 'rel'))) candidates.push({ url: abs(attr(l, 'href')) })
  return candidates.filter((c) => c.svg || c.url)
}

export async function findLogo(site: string): Promise<{ dataUrl: string; source: string } | null> {
  const url = normalizeUrl(site)
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000), redirect: 'follow' })
  if (!res.ok) return null
  const html = (await res.text()).slice(0, 3_000_000)
  for (const c of pickFromHtml(html, res.url || url)) {
    const dataUrl = c.svg ? svgDataUrl(c.svg) : await fetchImage(c.url ?? '')
    if (dataUrl) return { dataUrl, source: c.svg ? 'home link (inline SVG)' : (c.url ?? '') }
  }
  return null
}

// Quick check: node --experimental-strip-types server/logo.ts apple.com
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const site of process.argv.slice(2)) {
    const r = await findLogo(site).catch((e) => ({ error: String(e) }))
    console.log(site, '->', r && 'dataUrl' in r ? `${r.source} (${r.dataUrl.slice(5, 30)}…, ${r.dataUrl.length} chars)` : r)
  }
}
