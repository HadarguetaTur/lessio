import { describe, expect, it, vi } from 'vitest'
import { teacherCountGate, teamSizeStatus, extractPublicEmails, extractResearchFacts, researchGate, researchUrls, researchWebsite, scoreDiscoveryCandidate } from './discoveryResearch'
import { robotsAllows } from './researchRobots'
import { businessHost, isPublicAddress, type ResearchResponse } from './researchFetch'

const home = 'https://tutor.test/'
const response = (text: string, status = 200, contentType = 'text/html'): ResearchResponse => ({ text, status, contentType, location: null })
function site(pages: Record<string, ResearchResponse>) {
  return vi.fn(async (url: string) => pages[url] ?? response('', 404, 'text/plain'))
}
function cf(email: string) {
  return '42' + [...email].map((char) => (char.charCodeAt(0) ^ 0x42).toString(16).padStart(2, '0')).join('')
}
describe('research extraction', () => {
  it('finds mailto, visible text and Cloudflare while rejecting asset and script contacts', () => {
    const html = '<a href="mailto:Office%40tutor.test?subject=hi">Contact</a><p>other@tutor.test</p>' +
      '<span data-cfemail="' + cf('hello@tutor.test') + '">protected</span>' +
      '<img src="logo@2x.png"><p>logo@2x.png fake@tutor.jpg</p><script>vendor@tracking.test</script>'
    expect(extractPublicEmails(html)).toEqual(['office@tutor.test', 'hello@tutor.test', 'other@tutor.test'])
  })
  it('rejects dummy and noreply addresses', () => {
    expect(extractPublicEmails('<p>hello@example.com noreply@tutor.test</p>')).toEqual([])
  })
  it('keeps home in the four-page budget and prioritizes team evidence and contact over services', () => {
    const links = ['about', 'services', 'team', 'contact'].map((p) => '<a href="/' + p + '">' + p + '</a>').join('')
    expect(researchUrls(home, links + '<a href="https://other.test/contact">Contact</a>')).toEqual([
      home, home + 'team', home + 'contact', home + 'about',
    ])
  })
  it('records distinct evidence and avoids negated teaching claims', () => {
    const facts = extractResearchFacts('אנו מרכז למידה. צוות מורים מלמד מתמטיקה בקבוצות קטנות.', home)
    expect(facts.map((f) => f.label)).toEqual(expect.arrayContaining(['מרכז למידה', 'צוות מורים', 'מתמטיקה', 'קבוצות קטנות']))
    expect(facts.every((f) => f.sourceUrl === home && f.quote)).toBe(true)
    expect(extractResearchFacts('אין קבוצות קטנות. לא מציעים הוראה מתקנת.', home)).toEqual([])
  })
  it('requires two DISTINCT facts even if the same fact appears on multiple pages', () => {
    const fact = extractResearchFacts('מרכז למידה', home)[0]!
    expect(researchGate({ email: 'hi@tutor.test', emailSourceUrl: home, facts: [fact, fact], score: 100, excluded: false })).toBe('INSUFFICIENT_FACTS')
  })
  it.each(['בית ספר עירוני', 'מכללת ידע', 'רשת מרכזי למידה', 'יואל גבע'])('excludes %s', (name) => {
    expect(scoreDiscoveryCandidate({ businessName: name, websiteUrl: home, email: 'hi@tutor.test', phone: '123', facts: [] }).excluded).toBe(true)
  })
  it('matches directory hosts precisely, not arbitrary substrings', () => {
    expect(scoreDiscoveryCandidate({ businessName: 'מורה פרטי', websiteUrl: 'https://www.d.co.il/123', email: null, phone: null, facts: [] }).excluded).toBe(true)
    expect(scoreDiscoveryCandidate({ businessName: 'מורה פרטי', websiteUrl: 'https://had.co.il', email: null, phone: null, facts: [] }).excluded).toBe(false)
  })
})
describe('multi-page research', () => {
  it('finds the contact email absent from the homepage and deduplicates facts', async () => {
    const fetch = site({
      [home]: response('<p>מרכז למידה עם צוות מורים</p><a href="/contact">צור קשר</a><a href="/about">אודות</a>'),
      [home + 'contact']: response('<span data-cfemail="' + cf('office@tutor.test') + '"></span>'),
      [home + 'about']: response('מרכז למידה עם צוות מורים בקבוצות קטנות'),
    })
    const result = await researchWebsite(home, fetch)
    expect(result.email).toBe('office@tutor.test')
    expect(result.emailSourceUrl).toBe(home + 'contact')
    expect(result.facts.filter((f) => f.label === 'צוות מורים')).toHaveLength(1)
    expect(result.pages).toHaveLength(3)
  })
  it('does not fetch a disallowed contact page', async () => {
    const fetch = site({
      [home + 'robots.txt']: response('User-agent: *\nDisallow: /contact', 200, 'text/plain'),
      [home]: response('<a href="/contact">Contact</a>'),
    })
    expect((await researchWebsite(home, fetch)).failure).toBe('NO_CONTACT')
    expect(fetch).not.toHaveBeenCalledWith(home + 'contact')
  })
  it('does not follow cross-domain redirects, including robots redirects', async () => {
    const fetch = site({ [home]: { ...response('', 302), location: 'https://other.test/' } })
    await researchWebsite(home, fetch)
    expect(fetch.mock.calls.every(([url]) => url.startsWith(home))).toBe(true)
    const policyFetch = site({ [home + 'robots.txt']: { ...response('', 302), location: 'https://other.test/robots.txt' } })
    expect((await researchWebsite(home, policyFetch)).failure).toBe('ROBOTS_DENIED')
    expect(policyFetch).not.toHaveBeenCalledWith(home)
  })
  it('checks robots again for a redirect to another path', async () => {
    const fetch = site({
      [home + 'robots.txt']: response('User-agent: *\nDisallow: /private', 200, 'text/plain'),
      [home]: { ...response('', 302), location: '/private' },
    })
    expect((await researchWebsite(home, fetch)).failure).toBe('ROBOTS_DENIED')
    expect(fetch).not.toHaveBeenCalledWith(home + 'private')
  })
  it('holds ambiguous emails rather than choosing the first personal address', async () => {
    const result = await researchWebsite(home, site({ [home]: response('one@gmail.com two@gmail.com') }))
    expect(result.failure).toBe('AMBIGUOUS_EMAIL')
    expect(result.email).toBeNull()
  })
  it('prefers a contact on the business domain over a site-builder contact', async () => {
    const result = await researchWebsite(home, site({ [home]: response('builder@vendor.test info@tutor.test') }))
    expect(result.email).toBe('info@tutor.test')
  })
  it('fails closed when robots is unreachable', async () => {
    const fetch = site({ [home + 'robots.txt']: response('', 503, 'text/plain') })
    expect((await researchWebsite(home, fetch)).failure).toBe('ROBOTS_DENIED')
    expect(fetch).not.toHaveBeenCalledWith(home)
  })
})
describe('robots rules', () => {
  it('handles groups, longest match, allow ties and case-sensitive paths', () => {
    const rules = 'User-agent: *\nDisallow: /\nAllow: /Contact\nDisallow: /Contact/private\nAllow: /Contact/private'
    expect(robotsAllows(rules, home + 'Contact')).toBe(true)
    expect(robotsAllows(rules, home + 'contact')).toBe(false)
    expect(robotsAllows(rules, home + 'Contact/private')).toBe(true)
  })
  it('honors an explicit agent group instead of wildcard and merges groups', () => {
    const rules = 'User-agent: *\nDisallow: /\nUser-agent: LessioResearch\nDisallow: /private\nUser-agent: lessioresearch\nDisallow: /other'
    expect(robotsAllows(rules, home)).toBe(true)
    expect(robotsAllows(rules, home + 'other')).toBe(false)
  })
  it('handles wildcards and percent-encoded Hebrew paths', () => {
    expect(robotsAllows('User-agent: *\nDisallow: /*.pdf$', home + 'foo.pdf')).toBe(false)
    expect(robotsAllows('User-agent: *\nDisallow: /פרטי', home + encodeURIComponent('פרטי'))).toBe(false)
  })
})
describe('public fetch boundaries', () => {
  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '172.16.0.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1'])('rejects %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })
  it('permits public IPs but refuses IP URLs and credentials', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true)
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
    expect(businessHost('http://127.0.0.1/')).toBeNull()
    expect(businessHost('https://user:pass@tutor.test')).toBeNull()
    expect(businessHost('https://www.tutor.test/contact')).toBe('tutor.test')
  })
})


describe('strict cold outreach teacher count', () => {
  it.each([2,3,4,5])('accepts a source-backed team of %s teachers', (count) => {
    expect(teacherCountGate(extractResearchFacts('צוות של ' + count + ' מורים', home),home)).toBeNull()
  })
  it.each([1,6,10,46])('rejects a team of %s teachers', (count) => {
    expect(teacherCountGate(extractResearchFacts('צוות של ' + count + ' מורים',home),home)).toBe('TEAM_SIZE_OUT_OF_RANGE')
  })
  it.each(['צוות מורים','קבוצות של 3 תלמידים','3 שנות ניסיון','בעבר צוות של 3 מורים','צוות של מעל 3 מורים','במרכז מלמדים 3 מורים למתמטיקה','הצוות כולל 3 מורים לאנגלית'])('does not infer team size from %s', (text) => {
    expect(teacherCountGate(extractResearchFacts(text,home),home)).toBe('TEAM_SIZE_UNKNOWN')
  })
  it('holds contradictory counts and evidence from another site', () => {
    expect(teacherCountGate(extractResearchFacts('צוות של 3 מורים. צוות של 8 מורים',home),home)).toBe('TEAM_SIZE_CONFLICT')
    expect(teacherCountGate(extractResearchFacts('צוות של 3 מורים','https://other.test/'),home)).toBe('TEAM_SIZE_UNKNOWN')
  })
  it('preserves contradictory counts across pages', async () => {
    const result = await researchWebsite(home,site({
      [home]: response('צוות של 3 מורים<a href="/team">צוות</a>'),
      [home+'team']: response('צוות של 8 מורים'),
    }))
    expect(teacherCountGate(result.facts,home)).toBe('TEAM_SIZE_CONFLICT')
  })
  it('lets an unknown size through to a person and stops only a proven out-of-range team', () => {
    const base = extractResearchFacts('מרכז למידה עם צוות מורים בקבוצות קטנות', home)
    const gate = (facts: typeof base) => researchGate({ email: 'hi@tutor.test', emailSourceUrl: home, facts, score: 90, excluded: false })
    expect(gate(base)).toBeNull()
    expect(teamSizeStatus(base, home)).toBe('unknown')
    expect(gate([...base, ...extractResearchFacts('צוות של 8 מורים', home)])).toBe('TEAM_SIZE_OUT_OF_RANGE')
    expect(teamSizeStatus(extractResearchFacts('צוות של 3 מורים', home), home)).toBe('verified')
  })
})


it('understands explicit Hebrew number words without treating class size as team size', () => {
  expect(teacherCountGate(extractResearchFacts('צוות של שלושה מורים',home),home)).toBeNull()
  expect(teacherCountGate(extractResearchFacts('צוות המורים מונה שש מורות',home),home)).toBe('TEAM_SIZE_OUT_OF_RANGE')
})
