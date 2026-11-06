/**
 * Search ranking for the command palette. Higher is better, 0 = no match.
 * exact > prefix > word prefix > substring > in-order letters (fuzzy, scored by how tight).
 */
export function matchScore(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return 1
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  if (new RegExp(`(^|[\\s._\\-/])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return 60
  if (t.includes(q)) return 40
  // Letters in order: score by span (tight "clc" in "calculator" beats letters scattered over 30 chars).
  let i = 0
  let first = -1
  let last = -1
  for (let k = 0; k < t.length && i < q.length; k++) {
    if (t[k] === q[i]) {
      if (first < 0) first = k
      last = k
      i++
    }
  }
  if (i < q.length) return 0
  const span = last - first + 1
  return span <= q.length * 2 ? 20 : span <= q.length * 4 ? 8 : 0
}
