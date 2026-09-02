/**
 * Free-text name/phone matching shared by every list that filters people
 * (parents, students) in memory. Kept dependency-free so both server pages
 * and client components can import it.
 */

/** Case-folded, whitespace-collapsed form used for substring matching. */
export function searchable(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

/** Digits only, with the +972 country code folded back to a leading 0. */
export function phoneDigits(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.startsWith('972') ? `0${digits.slice(3)}` : digits
}

/**
 * Whether a raw search term matches any of the given names (substring) or
 * phones (digit substring). An empty term matches everything, so callers can
 * pass the query straight through without guarding.
 */
export function matchesSearch(
  term: string,
  target: { names?: ReadonlyArray<string | null | undefined>; phones?: ReadonlyArray<string | null | undefined> }
): boolean {
  const text = searchable(term)
  if (!text) return true

  if ((target.names ?? []).some((name) => searchable(name).includes(text))) return true

  const digits = phoneDigits(term)
  return Boolean(digits && (target.phones ?? []).some((phone) => phoneDigits(phone).includes(digits)))
}
