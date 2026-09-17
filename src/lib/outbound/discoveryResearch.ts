/** Source-backed website research; no queue or sender mutations. */
import { businessHost, fetchResearchPage, type ResearchResponse } from './researchFetch'
import { robotsAllows } from './researchRobots'

const MAX_RESEARCH_PAGES = 4
const CONTACT_LINK = /contact|about|services|team|צור\s*קשר|אודות|שירותים|צוות|שיעורים/i
const NON_BUSINESS_HOSTS = ['facebook.com', 'instagram.com', 'linkedin.com', 'lessoons.co.il', 'limudnaim.co.il', 'd.co.il', 'b144.co.il', 'easy.co.il']
const FILE_EXTENSION = /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|woff2?|pdf)$/i

export type ResearchFact = { label: string; value: string; sourceUrl: string; quote: string }
// Explicit total-team statements only, never class sizes or partial staff lists.
// Keep the database qualification gate in sync with this pattern.
const TEAM_NUMBER_WORDS: Record<string, number> = { שני: 2, שתי: 2, שלושה: 3, שלוש: 3, ארבעה: 4, ארבע: 4, חמישה: 5, חמש: 5, שישה: 6, שש: 6, שבעה: 7, שבע: 7, שמונה: 8, תשעה: 9, תשע: 9, עשרה: 10, עשר: 10 }
const teamNumber = (value: string) => TEAM_NUMBER_WORDS[value] ?? Number(value)
const TEAM_COUNT = /(?:צוות(?:\s+המורים)?\s+(?:של|מונה)|our\s+team\s+consists of)\s+(\d{1,3}|שני|שתי|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש|שבעה|שבע|שמונה|תשעה|תשע|עשרה|עשר)\s+(?:מורים|מורות|teachers)(?![\p{L}\p{N}])/giu

export function teacherCountGate(facts: ResearchFact[], websiteUrl?: string | null): string | null {
  const counts = new Set<number>()
  for (const fact of facts.filter((f) => f.label === 'מספר מורים')) {
    if (!businessHost(fact.sourceUrl) || (websiteUrl && businessHost(fact.sourceUrl) !== businessHost(websiteUrl))) continue
    for (const match of fact.quote.matchAll(new RegExp(TEAM_COUNT))) counts.add(teamNumber(match[1]!))
  }
  if (!counts.size) return 'TEAM_SIZE_UNKNOWN'
  if (counts.size !== 1) return 'TEAM_SIZE_CONFLICT'
  const count = [...counts][0]!
  return count >= 2 && count <= 5 ? null : 'TEAM_SIZE_OUT_OF_RANGE'
}

export type ResearchPage = { url: string; kind: 'website' | 'contact_page'; text: string }
export type WebsiteResearch = {
  pages: ResearchPage[]
  email: string | null
  emailSourceUrl: string | null
  facts: ResearchFact[]
  failure: 'NO_WEBSITE' | 'ROBOTS_DENIED' | 'FETCH_FAILED' | 'NO_CONTACT' | 'AMBIGUOUS_EMAIL' | null
}

export function normalizePublicEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase().replace(/[),.;:]+$/, '')
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email)) return null
  const local = email.split('@')[0]!
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null
  if (FILE_EXTENSION.test(email) || /@(?:.*\.)?example\.(?:com|org|net)$/i.test(email) || /^(?:no-?reply|mailer-daemon|postmaster)@/.test(email)) return null
  return email
}

function decodeCloudflareEmail(encoded: string): string | null {
  if (!/^[0-9a-f]+$/i.test(encoded) || encoded.length < 4 || encoded.length % 2 !== 0) return null
  const key = Number.parseInt(encoded.slice(0, 2), 16)
  let decoded = ''
  for (let i = 2; i < encoded.length; i += 2) decoded += String.fromCharCode(Number.parseInt(encoded.slice(i, i + 2), 16) ^ key)
  return normalizePublicEmail(decoded)
}

export function extractPublicEmails(html: string): string[] {
  const found = new Set<string>()
  const add = (value: string | null) => {
    const email = value && normalizePublicEmail(value)
    if (email) found.add(email)
  }
  for (const match of html.matchAll(/(?:mailto:|data-email=["'])\s*([^"'\s>?]+)/gi)) {
    try { add(decodeURIComponent(match[1] ?? '')) } catch { /* malformed mailto */ }
  }
  for (const match of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) add(decodeCloudflareEmail(match[1] ?? ''))
  // Scan visible text only: filenames and analytics/script contacts aren't business contacts.
  const plain = htmlToText(html).replace(/\s*(?:\[at\]|\(at\)|&#64;)\s*/gi, '@').replace(/\s*(?:\[dot\]|\(dot\))\s*/gi, '.')
  for (const match of plain.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi)) add(match[0])
  return [...found]
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim()
}

/** Home is always counted; team evidence, then contact, get the remaining page budget. */
export function researchUrls(homeUrl: string, html: string): string[] {
  let origin: string
  try { origin = new URL(homeUrl).origin } catch { return [] }
  const urls = new Map<string, number>()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1]
    if (!href) continue
    const label = htmlToText(match[2] ?? '')
    let decoded = href
    try { decoded = decodeURI(href) } catch { /* use original */ }
    if (!CONTACT_LINK.test(label + ' ' + decoded)) continue
    try {
      const url = new URL(href.replace(/&amp;/g, '&'), homeUrl)
      if (url.origin !== origin || FILE_EXTENSION.test(url.pathname)) continue
      url.hash = ''
      if (url.toString() === homeUrl) continue
      urls.set(url.toString(), /team|צוות|המורים/i.test(label + ' ' + decoded) ? 3 : /contact|צור\s*קשר/i.test(label + ' ' + decoded) ? 2 : 1)
    } catch { /* malformed link */ }
  }
  return [homeUrl, ...[...urls.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_RESEARCH_PAGES - 1).map(([url]) => url)]
}

export function extractResearchFacts(text: string, sourceUrl: string): ResearchFact[] {
  const facts: ResearchFact[] = []
  const add = (label: string, value: string, test: RegExp) => {
    const match = test.exec(text)
    if (!match) return
    const prefix = text.slice(Math.max(0, match.index - 35), match.index)
    if (/(?:אין|ללא|לא מציעים|לא מלמדים|איננו|לא מתקיימת)\s+(?:\S+\s+){0,2}$/.test(prefix)) return
    facts.push({ label, value, sourceUrl, quote: text.slice(Math.max(0, match.index - 45), match.index + match[0].length + 70).trim() })
  }
  add('קבוצות קטנות', 'לימוד בקבוצות קטנות', /קבוצות? קטנות?/i)
  add('הוראה פרטנית', 'הוראה פרטנית', /הוראה פרטנית|לימוד פרטני/i)
  add('התאמה אישית', 'התאמה אישית לתלמידים', /התאמה אישית/i)
  add('מרכז למידה', 'פעילות של מרכז למידה', /מרכז למידה/i)
  add('הוראה מתקנת', 'הוראה מתקנת', /הוראה מתקנת/i)
  add('מתמטיקה', 'לימודי מתמטיקה', /מתמטיקה/i)
  add('עברית', 'לימודי עברית', /לימודי?\s+עברית|עברית לבגרות/i)
  add('הכנה לבגרות', 'הכנה לבגרות', /הכנה לבגרות|בגרויות/i)
  add('צוות מורים', 'עבודה עם צוות מורים', /צוות מורים|המורים שלנו|מספר מורים/i)
  const years = text.match(/((?:מעל|יותר מ[- ]?)?\s*\d{1,2})\s*(?:שנות?|שנים)\s*(?:ניסיון בהוראה|בהוראה)/i)
  if (years) add('ניסיון', years[1]!.trim() + ' שנות ניסיון בהוראה', /\d{1,2}\s*(?:שנות?|שנים)\s*(?:ניסיון בהוראה|בהוראה)/i)
  for (const match of text.matchAll(new RegExp(TEAM_COUNT))) {
    const prefix = text.slice(Math.max(0, match.index! - 25), match.index)
    if (/(?:לא|אין|בעבר|עד לאחרונה)\s*$/.test(prefix)) continue
    facts.push({ label: 'מספר מורים', value: 'צוות של ' + teamNumber(match[1]!) + ' מורים', sourceUrl, quote: match[0] })
  }
  return facts
}

export function scoreDiscoveryCandidate(input: { businessName: string; category?: string | null; websiteUrl: string | null; email: string | null; phone: string | null; facts: ResearchFact[] }): { score: number; reasons: string[]; excluded: boolean } {
  const host = input.websiteUrl ? businessHost(input.websiteUrl) : null
  if ((host && NON_BUSINESS_HOSTS.some((blocked) => host === blocked || host.endsWith('.' + blocked))) ||
    /אינדקס|מאגר מורים|בית[ -]?ספר|אוניברסיט|מכלל|רשת\s|קידום אתרים|יואל גבע|אנקורי|היי[ -]?קיו|college|university|school/i.test(input.businessName + ' ' + (input.category ?? ''))) {
    return { score: 0, reasons: ['EXCLUDED'], excluded: true }
  }
  // A tutoring business names itself by what it teaches at least as often as by "teacher".
  const target = /מרכז למידה|מור(?:ה|ים|ות)|הוראה|תגבור|בגרות|שיעורים|לימוד|מתמטיקה|אנגלית|פיזיקה|פסיכומטרי|tutor|learning/i.test(input.businessName) ||
    input.facts.some((fact) => ['מרכז למידה', 'הוראה מתקנת', 'הוראה פרטנית', 'צוות מורים', 'מתמטיקה', 'הכנה לבגרות'].includes(fact.label))
  if (!target) return { score: 0, reasons: ['NOT_TARGET'], excluded: true }
  let score = 20
  const reasons = ['TARGET']
  if (host) { score += 20; reasons.push('WEBSITE') }
  if (input.email && normalizePublicEmail(input.email)) { score += 25; reasons.push('EMAIL') }
  if (input.phone) { score += 10; reasons.push('PHONE') }
  const factCount = new Set(input.facts.map((fact) => fact.label)).size
  if (factCount >= 2) { score += 25; reasons.push('FACTS_MULTIPLE') }
  else if (factCount === 1) { score += 10; reasons.push('FACT_ONE') }
  return { score: Math.min(100, score), reasons, excluded: false }
}

export function researchGate(input: { email: string | null; emailSourceUrl: string | null; facts: ResearchFact[]; score: number; excluded: boolean }): string | null {
  if (input.excluded) return 'EXCLUDED_BUSINESS'
  if (!input.email || !normalizePublicEmail(input.email) || !input.emailSourceUrl) return 'NO_CONTACT'
  if (new Set(input.facts.filter((f) => f.quote && businessHost(f.sourceUrl)).map((f) => f.label)).size < 2) return 'INSUFFICIENT_FACTS'
  if (input.score < 70) return 'LOW_QUALITY'
  return teacherCountGate(input.facts)
}

/** Contact pages on the same business host only; robots checked on every hop. */
export async function researchWebsite(website: string | null, fetchPage: (url: string) => Promise<ResearchResponse> = fetchResearchPage): Promise<WebsiteResearch> {
  const result: WebsiteResearch = { pages: [], email: null, emailSourceUrl: null, facts: [], failure: null }
  const host = website && businessHost(website)
  if (!website || !host) return { ...result, failure: 'NO_WEBSITE' }
  const policies = new Map<string, string | null>()
  const sameSite = (url: string) => businessHost(url) === host
  const deadline = Date.now() + 55_000
  async function policy(url: string): Promise<string | null> {
    const origin = new URL(url).origin
    if (policies.has(origin)) return policies.get(origin)!
    let robotsUrl = origin + '/robots.txt'
    let rules: string | null = null
    try {
      for (let hop = 0; hop < 5 && Date.now() < deadline; hop++) {
        if (!sameSite(robotsUrl)) break
        const response = await fetchPage(robotsUrl)
        if (response.status >= 300 && response.status < 400 && response.location) {
          robotsUrl = new URL(response.location, robotsUrl).toString()
          continue
        }
        if (response.status === 404 || response.status === 410) rules = ''
        else if (response.status >= 200 && response.status < 300 && !/text\/html/i.test(response.contentType)) rules = response.text
        break
      }
    } catch { /* deny when policy cannot be read */ }
    policies.set(origin, rules)
    return rules
  }
  let blocked = false
  async function read(url: string): Promise<{ url: string; html: string } | null> {
    try {
      for (let hop = 0; hop < 5 && Date.now() < deadline; hop++) {
        if (!sameSite(url)) return null
        const robots = await policy(url)
        if (robots === null || !robotsAllows(robots, url)) { blocked = true; return null }
        const response = await fetchPage(url)
        if (response.status >= 300 && response.status < 400 && response.location) {
          url = new URL(response.location, url).toString()
          continue
        }
        if (response.status < 200 || response.status >= 300 || !/text\/(?:html|plain)|application\/xhtml\+xml/i.test(response.contentType)) return null
        return { url, html: response.text }
      }
    } catch { /* other pages may still work */ }
    return null
  }
  const home = await read(new URL(website).toString())
  if (!home) return { ...result, failure: blocked ? 'ROBOTS_DENIED' : 'FETCH_FAILED' }
  const emails = new Map<string, string>()
  const seen = new Set<string>()
  for (const url of researchUrls(home.url, home.html)) {
    const page = url === home.url ? home : await read(url)
    if (!page || seen.has(page.url)) continue
    seen.add(page.url)
    const text = htmlToText(page.html)
    result.pages.push({ url: page.url, kind: page.url === home.url ? 'website' : 'contact_page', text })
    for (const email of extractPublicEmails(page.html)) if (!emails.has(email)) emails.set(email, page.url)
    for (const fact of extractResearchFacts(text, page.url)) {
      if (!result.facts.some((existing) => existing.label === fact.label && (fact.label !== 'מספר מורים' || existing.quote === fact.quote))) result.facts.push(fact)
    }
  }
  // Prefer a business-domain contact; ambiguous addresses wait for a person.
  const own = [...emails].filter(([email]) => email.split('@')[1]?.replace(/^www\./, '') === host)
  const freeMail = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'walla.co.il', 'walla.com', 'live.com', 'icloud.com'])
  const choices = own.length ? own : [...emails].filter(([email]) => freeMail.has(email.split('@')[1]!))
  const general = choices.filter(([email]) => /^(?:info|contact|office|hello|admin)@/.test(email))
  const selected = general.length === 1 ? general[0] : choices.length === 1 ? choices[0] : null
  if (selected) [result.email, result.emailSourceUrl] = selected
  result.failure = selected ? null : choices.length > 1 ? 'AMBIGUOUS_EMAIL' : 'NO_CONTACT'
  return result
}
