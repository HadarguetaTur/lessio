/** Path-aware robots rules used by the website researcher (RFC 9309). */
export function robotsAllows(robots: string, url: string, agent = 'lessioresearch'): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = []
  let group: (typeof groups)[number] | undefined
  let hasRules = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split('#')[0]!.trim()
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      if (!group || hasRules) {
        group = { agents: [], rules: [] }
        groups.push(group)
        hasRules = false
      }
      group.agents.push(value.toLowerCase())
    } else if (group && (key === 'allow' || key === 'disallow')) {
      hasRules = true
      if (value.startsWith('/')) group.rules.push({ allow: key === 'allow', path: value })
    }
  }
  const specific = groups.filter((g) => g.agents.includes(agent.toLowerCase()))
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes('*'))
  const parsed = new URL(url)
  const target = normalizePath(parsed.pathname + parsed.search)
  let longest = -1
  let allowed = true
  for (const rule of applicable.flatMap((g) => g.rules)) {
    const path = normalizePath(rule.path)
    const anchored = path.endsWith('$')
    const pattern = (anchored ? path.slice(0, -1) : path)
      .split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    if (!new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(target)) continue
    const length = path.replace(/[*$]/g, '').length
    if (length > longest || (length === longest && rule.allow)) {
      longest = length
      allowed = rule.allow
    }
  }
  return allowed
}

function normalizePath(path: string): string {
  return path.replace(/[^\x00-\x7F]/gu, (char) => encodeURIComponent(char))
    .replace(/%[0-9a-f]{2}/gi, (encoded) => {
      const char = String.fromCharCode(parseInt(encoded.slice(1), 16))
      return /[a-z0-9._~-]/i.test(char) ? char : encoded.toUpperCase()
    })
}
