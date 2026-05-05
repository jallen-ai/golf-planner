// Strokes-Gained baseline tables.
//
// Source: Mark Broadie, *Every Shot Counts* (2014). The tables below approximate
// the published amateur baselines (handicap 0, 10, 20) — expected strokes to hole
// out from a given lie at a given distance. Values for in-between handicaps and
// distances are linearly interpolated.
//
// These are rounded approximations. For v1 they're plenty accurate to compare
// strategies; we can swap in higher-precision tables later if needed.
//
// Lies: tee (par 4/5 only), fairway, rough, sand, recovery, green.

import type { Lie } from '../types'

type LieTable = { [yards: number]: number }
type HandicapBucket = 0 | 10 | 20
type SGTable = Record<Exclude<Lie, 'water' | 'ob'>, Record<HandicapBucket, LieTable>>

// Distances in yards. Values = expected strokes to hole out.
// Approximated from Broadie's published amateur tables.
const TABLE: SGTable = {
  tee: {
    0:  { 100: 2.78, 150: 2.92, 200: 3.06, 250: 3.20, 300: 3.34, 350: 3.50, 400: 3.66, 450: 3.85, 500: 4.07, 550: 4.34, 600: 4.62 },
    10: { 100: 2.99, 150: 3.16, 200: 3.34, 250: 3.51, 300: 3.69, 350: 3.88, 400: 4.10, 450: 4.34, 500: 4.61, 550: 4.92, 600: 5.25 },
    20: { 100: 3.20, 150: 3.42, 200: 3.65, 250: 3.87, 300: 4.10, 350: 4.34, 400: 4.60, 450: 4.88, 500: 5.20, 550: 5.55, 600: 5.94 },
  },
  fairway: {
    0:  { 20: 2.40, 40: 2.60, 60: 2.70, 80: 2.75, 100: 2.80, 120: 2.85, 140: 2.91, 160: 2.98, 180: 3.08, 200: 3.19, 220: 3.32, 240: 3.45, 260: 3.58, 280: 3.69, 300: 3.78 },
    10: { 20: 2.50, 40: 2.72, 60: 2.85, 80: 2.92, 100: 3.00, 120: 3.10, 140: 3.20, 160: 3.32, 180: 3.45, 200: 3.59, 220: 3.74, 240: 3.89, 260: 4.04, 280: 4.18, 300: 4.31 },
    20: { 20: 2.62, 40: 2.86, 60: 3.02, 80: 3.12, 100: 3.22, 120: 3.34, 140: 3.48, 160: 3.62, 180: 3.79, 200: 3.96, 220: 4.14, 240: 4.32, 260: 4.50, 280: 4.66, 300: 4.81 },
  },
  rough: {
    0:  { 20: 2.59, 40: 2.78, 60: 2.91, 80: 3.00, 100: 3.07, 120: 3.13, 140: 3.20, 160: 3.30, 180: 3.42, 200: 3.55, 220: 3.69, 240: 3.83, 260: 3.96, 280: 4.07, 300: 4.16 },
    10: { 20: 2.74, 40: 2.96, 60: 3.12, 80: 3.22, 100: 3.32, 120: 3.42, 140: 3.54, 160: 3.67, 180: 3.81, 200: 3.96, 220: 4.13, 240: 4.30, 260: 4.46, 280: 4.61, 300: 4.74 },
    20: { 20: 2.91, 40: 3.16, 60: 3.34, 80: 3.46, 100: 3.58, 120: 3.71, 140: 3.86, 160: 4.02, 180: 4.20, 200: 4.39, 220: 4.59, 240: 4.79, 260: 4.99, 280: 5.17, 300: 5.32 },
  },
  sand: {
    0:  { 10: 2.53, 20: 2.69, 40: 2.92, 60: 3.13, 80: 3.27, 100: 3.39, 120: 3.49, 140: 3.59, 160: 3.71, 180: 3.85, 200: 4.01, 220: 4.18, 240: 4.34, 260: 4.46, 280: 4.55, 300: 4.61 },
    10: { 10: 2.74, 20: 2.92, 40: 3.18, 60: 3.40, 80: 3.55, 100: 3.69, 120: 3.81, 140: 3.93, 160: 4.07, 180: 4.22, 200: 4.40, 220: 4.59, 240: 4.78, 260: 4.94, 280: 5.06, 300: 5.16 },
    20: { 10: 2.97, 20: 3.18, 40: 3.46, 60: 3.71, 80: 3.88, 100: 4.04, 120: 4.18, 140: 4.32, 160: 4.48, 180: 4.66, 200: 4.86, 220: 5.07, 240: 5.29, 260: 5.49, 280: 5.65, 300: 5.78 },
  },
  recovery: {
    0:  { 100: 3.45, 150: 3.65, 200: 3.85, 250: 4.05, 300: 4.25 },
    10: { 100: 3.65, 150: 3.88, 200: 4.10, 250: 4.32, 300: 4.55 },
    20: { 100: 3.88, 150: 4.13, 200: 4.38, 250: 4.63, 300: 4.88 },
  },
  green: {
    // distance in FEET on green; we'll convert when calling.
    0:  { 1: 1.001, 2: 1.009, 3: 1.05, 4: 1.13, 5: 1.23, 6: 1.34, 7: 1.42, 8: 1.49, 9: 1.55, 10: 1.60, 15: 1.78, 20: 1.87, 30: 1.98, 40: 2.06, 50: 2.14, 60: 2.21, 90: 2.40 },
    10: { 1: 1.001, 2: 1.02, 3: 1.07, 4: 1.18, 5: 1.30, 6: 1.41, 7: 1.49, 8: 1.56, 9: 1.62, 10: 1.67, 15: 1.85, 20: 1.95, 30: 2.07, 40: 2.16, 50: 2.25, 60: 2.32, 90: 2.52 },
    20: { 1: 1.01, 2: 1.04, 3: 1.10, 4: 1.22, 5: 1.35, 6: 1.46, 7: 1.55, 8: 1.62, 9: 1.69, 10: 1.74, 15: 1.93, 20: 2.04, 30: 2.18, 40: 2.28, 50: 2.37, 60: 2.45, 90: 2.66 },
  },
}

// Penalty constants. A drop adds 1 stroke + replays from the penalty area.
// We model water/OB by adding `penaltyStrokes` and computing SG as if from drop zone (~150y from green or, for OB, replayed from near previous).
const WATER_PENALTY = 1
const OB_PENALTY = 1
const OB_REPLAY = true

function interpolate(table: LieTable, distance: number): number {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b)
  if (distance <= keys[0]) return table[keys[0]]
  if (distance >= keys[keys.length - 1]) return table[keys[keys.length - 1]]
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i], hi = keys[i + 1]
    if (distance >= lo && distance <= hi) {
      const t = (distance - lo) / (hi - lo)
      return table[lo] * (1 - t) + table[hi] * t
    }
  }
  return table[keys[keys.length - 1]]
}

function interpolateHandicap(buckets: Record<HandicapBucket, LieTable>, handicap: number, distance: number): number {
  const h = Math.max(0, Math.min(30, handicap))
  if (h <= 10) {
    const t = h / 10
    return interpolate(buckets[0], distance) * (1 - t) + interpolate(buckets[10], distance) * t
  }
  if (h <= 20) {
    const t = (h - 10) / 10
    return interpolate(buckets[10], distance) * (1 - t) + interpolate(buckets[20], distance) * t
  }
  // Beyond 20: extrapolate linearly using 10→20 slope.
  const v10 = interpolate(buckets[10], distance)
  const v20 = interpolate(buckets[20], distance)
  return v20 + (v20 - v10) * ((h - 20) / 10)
}

/**
 * Expected strokes to hole out from a given lie + distance.
 * `distanceYd` is yards for tee/fairway/rough/sand/recovery; for green, pass distance in FEET.
 *
 * Returns Infinity for water/ob — caller must handle penalty + drop separately.
 */
export function expectedStrokes(lie: Lie, distance: number, handicap: number): number {
  if (lie === 'water') return interpolateHandicap(TABLE.fairway, handicap, Math.max(80, distance)) + WATER_PENALTY
  if (lie === 'ob') return interpolateHandicap(TABLE.fairway, handicap, Math.max(80, distance)) + OB_PENALTY + (OB_REPLAY ? 1 : 0)
  if (lie === 'green') {
    // distance passed as feet for greens.
    return interpolateHandicap(TABLE.green, handicap, distance)
  }
  return interpolateHandicap(TABLE[lie], handicap, distance)
}
