// Per-hole stats from played rounds.

import type { Course, HoleStats, PlayedRound } from '../types'

export function computeStats(course: Course, rounds: PlayedRound[]): Map<number, HoleStats> {
  const out = new Map<number, HoleStats>()
  for (const hole of course.holes) {
    const scores: number[] = []
    for (const r of rounds) {
      const s = r.scores[hole.number - 1]
      if (typeof s === 'number' && s > 0) scores.push(s)
    }
    if (scores.length === 0) continue
    const sum = scores.reduce((a, b) => a + b, 0)
    const avg = sum / scores.length
    const par = hole.par
    const bogey = scores.filter((x) => x >= par + 1).length / scores.length
    const dbl = scores.filter((x) => x >= par + 2).length / scores.length
    out.set(hole.number, {
      played: scores.length,
      averageScore: Math.round(avg * 100) / 100,
      averageVsPar: Math.round((avg - par) * 100) / 100,
      bogeyOrWorseRate: Math.round(bogey * 100) / 100,
      doubleOrWorseRate: Math.round(dbl * 100) / 100,
      best: Math.min(...scores),
      worst: Math.max(...scores),
    })
  }
  return out
}

// Parse a pasted block of text. Two supported formats:
//   - "wide": one line per round, optional date, then 18 numbers separated by tabs/commas/spaces
//   - "tall": single round, just 18 numbers
// Returns an array of { date, scores[18] }.
export function parsePastedScores(text: string, defaultDate: string): { date: string; scores: (number | null)[] }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rounds: { date: string; scores: (number | null)[] }[] = []
  for (const line of lines) {
    // Try to extract a leading date.
    const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/)
    let rest = line
    let date = defaultDate
    if (dateMatch) {
      date = normalizeDate(dateMatch[0])
      rest = line.slice(dateMatch[0].length).trim().replace(/^[,\t]+/, '')
    }
    const tokens = rest.split(/[\s,;\t]+/).filter((t) => t.length)
    const nums = tokens.map((t) => {
      const n = parseInt(t, 10)
      return Number.isFinite(n) && n > 0 && n < 20 ? n : null
    })
    if (nums.filter((n) => n != null).length >= 9) {
      // Pad/truncate to 18.
      const scores: (number | null)[] = []
      for (let i = 0; i < 18; i++) scores.push(nums[i] ?? null)
      rounds.push({ date, scores })
    }
  }
  return rounds
}

function normalizeDate(input: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input
  // m/d/yy or m/d/yyyy
  const parts = input.split('/')
  if (parts.length !== 3) return input
  const [m, d, yRaw] = parts
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}
