// Hole optimizer.
//
// Walks each hole shot-by-shot. At each step, for each available club + candidate
// aim point, runs a Monte Carlo simulation of the player's dispersion and picks
// the (club, aim) pair that minimizes expected strokes to hole out.
//
// Applies golf-intuition rules:
// - Driver only off the tee.
// - Fairway woods (3W/5W) only from tee or fairway.
// - Hybrids only from tee, fairway, or rough (not sand or recovery).
// - From sand/recovery, only wedges and 9i+ are eligible.
// - Hard reject aim points that lie inside a water/OB polygon.
// - Penalize aims where >20% of dispersion samples land in water/OB.
// - Lay-up logic: when a shot can't reach the green, prefer leaving 100/75/50y
//   wedge distances over awkward in-betweens.
//
// Supports per-shot overrides (fixed aim, fixed club, or both).

import type {
  ClubProfile, Hole, HoleStrategy, Lie, LonLat, PlayerProfile,
  ShotOverride, ShotRecommendation, TeeMarker, ClubId,
} from '../types'
import { CLUB_ORDER } from '../types'
import { bearingDeg, destination, distanceYards, pointInPolygon } from './geometry'
import { expectedStrokes } from './sg'

const SAMPLES = 150
const GRID_STEP_YD = 12
const LATERAL_OFFSETS_YD = [-20, -10, 0, 10, 20]
const PENALTY_HAZARD_THRESHOLD = 0.20  // > 20% samples in water/OB → heavy penalty
const PENALTY_HAZARD_MULTIPLIER = 1.5  // multiply expectedStrokesAfter by this

// Preferred lay-up "wedge yardages" — distance from green at which most amateurs
// have a comfortable full-swing wedge.
const PREFERRED_LAYUP_DISTANCES = [100, 75, 60, 50, 40]
const LAYUP_BONUS = 0.15  // shave this many strokes off EV when landing within 5y of a preferred dist

function sampleNormal(): number {
  const u = Math.random() || 1e-9
  const v = Math.random() || 1e-9
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function classifyLie(point: LonLat, hole: Hole): Lie {
  for (const w of hole.waterHazards) if (pointInPolygon(point, w)) return 'water'
  for (const ob of hole.outOfBounds) if (pointInPolygon(point, ob)) return 'ob'
  if (hole.greenPolygon.ring.length && pointInPolygon(point, hole.greenPolygon)) return 'green'
  for (const b of hole.bunkers) if (pointInPolygon(point, b)) return 'sand'
  for (const f of hole.fairwayPolygons) if (pointInPolygon(point, f)) return 'fairway'
  return 'rough'
}

function distanceToPin(point: LonLat, hole: Hole): number {
  return distanceYards(point, hole.greenCenter)
}

function expectedFromPosition(point: LonLat, hole: Hole, handicap: number): number {
  const lie = classifyLie(point, hole)
  const distYd = distanceToPin(point, hole)
  if (lie === 'green') {
    const distFt = distYd * 3
    return expectedStrokes('green', distFt, handicap)
  }
  return expectedStrokes(lie, distYd, handicap)
}

// Hard rules: which clubs can be played from which lies.
function isClubAllowedFromLie(clubId: ClubId, lie: Lie): boolean {
  // Driver: tee only.
  if (clubId === 'driver') return lie === 'tee'
  // Fairway woods: tee or fairway.
  if (clubId === '3w' || clubId === '5w') return lie === 'tee' || lie === 'fairway'
  // Hybrid: tee, fairway, or rough.
  if (clubId === 'hybrid') return lie === 'tee' || lie === 'fairway' || lie === 'rough'
  // Long irons: not from sand.
  if (clubId === '3i' || clubId === '4i') return lie !== 'sand' && lie !== 'recovery'
  // Mid irons: not from deep recovery.
  if (clubId === '5i' || clubId === '6i') return lie !== 'recovery'
  // Short irons & wedges: anywhere.
  return true
}

function layupBonus(distAfterYd: number, hole: Hole, point: LonLat): number {
  // Only apply if the resulting position is NOT on the green.
  const lie = classifyLie(point, hole)
  if (lie === 'green' || lie === 'water' || lie === 'ob') return 0
  if (distAfterYd < 30) return 0  // already inside wedge range
  for (const target of PREFERRED_LAYUP_DISTANCES) {
    if (Math.abs(distAfterYd - target) <= 5) return LAYUP_BONUS
  }
  return 0
}

interface ShotEval {
  club: ClubProfile
  aim: LonLat
  expectedStrokesAfter: number
  expectedDistanceAfter: number
  expectedLie: Lie
  expectedLanding: LonLat
  hazardRate: number   // fraction of samples ending in water/OB
}

function evaluateShot(
  from: LonLat, aim: LonLat, club: ClubProfile, hole: Hole, handicap: number,
): ShotEval {
  const aimDist = distanceYards(from, aim)
  const heading = bearingDeg(from, aim)
  const carryYd = Math.min(club.carry, aimDist)

  let totalNext = 0
  let totalDist = 0
  let sumLon = 0, sumLat = 0
  let bonusSum = 0
  let hazardCount = 0
  const lieCounts: Record<Lie, number> = {
    tee: 0, fairway: 0, rough: 0, sand: 0, recovery: 0, green: 0, water: 0, ob: 0,
  }

  for (let i = 0; i < SAMPLES; i++) {
    const longErr = sampleNormal() * (Math.random() < 0.5 ? club.sigmaShort : club.sigmaLong) * (Math.random() < 0.5 ? -1 : 1)
    const lateral = sampleNormal() * (Math.random() < 0.5 ? club.sigmaLeft : club.sigmaRight) * (Math.random() < 0.5 ? -1 : 1)
    const flightYd = carryYd + longErr + club.rollout * 0.6
    const onAxis = destination(from, heading, Math.max(5, flightYd))
    const perpHeading = (heading + 90) % 360
    const landing = destination(onAxis, perpHeading, lateral)

    const lie = classifyLie(landing, hole)
    lieCounts[lie]++
    if (lie === 'water' || lie === 'ob') hazardCount++
    const distAfter = distanceToPin(landing, hole)
    totalDist += distAfter
    sumLon += landing[0]
    sumLat += landing[1]
    if (lie === 'green') {
      totalNext += expectedStrokes('green', distAfter * 3, handicap)
    } else {
      totalNext += expectedStrokes(lie, distAfter, handicap)
    }
    bonusSum += layupBonus(distAfter, hole, landing)
  }

  const meanDist = totalDist / SAMPLES
  const meanBonus = bonusSum / SAMPLES
  let expectedStrokesAfter = 1 + totalNext / SAMPLES - meanBonus
  const hazardRate = hazardCount / SAMPLES

  // If the aim point itself is inside a hazard, this aim is unsafe — major penalty.
  const aimLie = classifyLie(aim, hole)
  if (aimLie === 'water' || aimLie === 'ob') {
    expectedStrokesAfter *= PENALTY_HAZARD_MULTIPLIER
  } else if (hazardRate > PENALTY_HAZARD_THRESHOLD) {
    expectedStrokesAfter *= PENALTY_HAZARD_MULTIPLIER
  }

  const expectedLanding: LonLat = [sumLon / SAMPLES, sumLat / SAMPLES]
  const expectedLie = (Object.entries(lieCounts).sort((a, b) => b[1] - a[1])[0][0]) as Lie
  return { club, aim, expectedStrokesAfter, expectedDistanceAfter: meanDist, expectedLie, expectedLanding, hazardRate }
}

function generateAimCandidates(from: LonLat, hole: Hole, maxCarry: number): LonLat[] {
  const headingToGreen = bearingDeg(from, hole.greenCenter)
  const distToGreen = distanceYards(from, hole.greenCenter)
  const candidates: LonLat[] = []
  for (let d = 50; d <= Math.min(maxCarry, distToGreen + 10); d += GRID_STEP_YD) {
    for (const lat of LATERAL_OFFSETS_YD) {
      const onAxis = destination(from, headingToGreen, d)
      const aim = destination(onAxis, (headingToGreen + 90) % 360, lat)
      candidates.push(aim)
    }
  }
  if (distToGreen <= maxCarry + 20) candidates.push(hole.greenCenter)
  return candidates
}

function clubsAllowedFromLie(player: PlayerProfile, lie: Lie): ClubProfile[] {
  return CLUB_ORDER
    .filter((id) => id !== 'putter' && player.bag[id]?.inBag && isClubAllowedFromLie(id, lie))
    .map((id) => player.bag[id])
}

function rationaleFor(shot: ShotEval, _hole: Hole): string {
  const lie = shot.expectedLie
  const club = shot.club.id
  const dist = Math.round(shot.expectedDistanceAfter)
  const hazPct = Math.round(shot.hazardRate * 100)
  if (hazPct > 5) return `${club}: ~${hazPct}% chance of trouble — best of available options.`
  if (lie === 'green') return `${club} reaches the green; ~${dist}y to the pin on average.`
  if (lie === 'fairway') return `${club} to the fairway; ${dist}y left to the pin.`
  if (lie === 'rough') return `${club} to the rough; ${dist}y left.`
  if (lie === 'sand') return `${club}: bunker risk, but better expectation than a longer carry.`
  return `${club} → ~${dist}y remaining.`
}

export interface PlanOptions {
  startPoint?: LonLat
  shotOverrides?: ShotOverride[]
  maxShots?: number
}

export function planHole(
  hole: Hole,
  tee: TeeMarker | null,
  player: PlayerProfile,
  options: PlanOptions = {},
): HoleStrategy {
  const maxShots = options.maxShots ?? 5
  const startPoint: LonLat | null = options.startPoint ?? tee?.position ?? null
  const handicap = player.handicap

  if (!startPoint || !hole.greenPolygon.ring.length) {
    return {
      holeNumber: hole.number,
      teeId: tee?.id ?? '',
      startPoint: startPoint ?? hole.greenCenter,
      recommendations: [],
      expectedScore: hole.par,
      parScore: 0,
      confidence: 'low',
      needsManualTee: !startPoint,
    }
  }

  const recommendations: ShotRecommendation[] = []
  let position: LonLat = startPoint
  // Track the lie at the current position. The very first shot starts at the
  // tee marker, so lie='tee' (driver allowed). Subsequent shots use the
  // classified lie at the actual landing point.
  let currentLie: Lie = 'tee'
  let shotIndex = 0
  const overrides = options.shotOverrides ?? []

  while (shotIndex < maxShots) {
    const distRemaining = distanceToPin(position, hole)
    if (distRemaining < 25) break

    const ovr = overrides[shotIndex]
    const eligibleClubs = clubsAllowedFromLie(player, currentLie)
    let best: ShotEval | null = null

    if (ovr?.fixedClub && ovr?.fixedAim) {
      const c = player.bag[ovr.fixedClub]
      if (c) best = evaluateShot(position, ovr.fixedAim, c, hole, handicap)
    } else if (ovr?.fixedClub) {
      const c = player.bag[ovr.fixedClub]
      if (c) {
        const candidates = generateAimCandidates(position, hole, c.carry + c.rollout)
        for (const aim of candidates) {
          const aimDist = distanceYards(position, aim)
          if (aimDist < 30 || aimDist > c.carry + c.rollout + 15) continue
          const shot = evaluateShot(position, aim, c, hole, handicap)
          if (!best || shot.expectedStrokesAfter < best.expectedStrokesAfter) best = shot
        }
      }
    } else if (ovr?.fixedAim) {
      const aimDist = distanceYards(position, ovr.fixedAim)
      for (const c of eligibleClubs) {
        const reach = c.carry + c.rollout
        if (aimDist > reach + 15 || aimDist < 30) continue
        const shot = evaluateShot(position, ovr.fixedAim, c, hole, handicap)
        if (!best || shot.expectedStrokesAfter < best.expectedStrokesAfter) best = shot
      }
    } else {
      for (const c of eligibleClubs) {
        const candidates = generateAimCandidates(position, hole, c.carry + c.rollout)
        for (const aim of candidates) {
          const aimDist = distanceYards(position, aim)
          if (aimDist < 30 || aimDist > c.carry + c.rollout + 15) continue
          const shot = evaluateShot(position, aim, c, hole, handicap)
          if (!best || shot.expectedStrokesAfter < best.expectedStrokesAfter) best = shot
        }
      }
    }

    if (!best) break

    const shotDist = distanceYards(position, best.aim)
    recommendations.push({
      shotIndex,
      club: best.club.id,
      fromPoint: position,
      aimPoint: best.aim,
      expectedLandingPoint: best.expectedLanding,
      expectedLie: best.expectedLie,
      expectedDistanceToPin: best.expectedDistanceAfter,
      expectedStrokesAfter: best.expectedStrokesAfter,
      shotDistance: shotDist,
      rationale: rationaleFor(best, hole),
      overridden: !!ovr,
    })
    position = best.expectedLanding
    currentLie = best.expectedLie
    shotIndex++
    if (best.expectedLie === 'green' || best.expectedDistanceAfter < 25) break
  }

  // Score = (shots before last) + last shot's expectedStrokesAfter (already
  // accounts for putts/chips from landing distribution). If no shots were
  // taken (shouldn't happen), fall back to expectedFromPosition.
  let expectedScore: number
  if (recommendations.length > 0) {
    const last = recommendations[recommendations.length - 1]
    expectedScore = (recommendations.length - 1) + last.expectedStrokesAfter
  } else {
    expectedScore = expectedFromPosition(startPoint, hole, handicap)
  }

  return {
    holeNumber: hole.number,
    teeId: tee?.id ?? '',
    startPoint,
    recommendations,
    expectedScore: Math.round(expectedScore * 10) / 10,
    parScore: Math.round((expectedScore - hole.par) * 10) / 10,
    confidence: hole.confidence,
    needsManualTee: false,
  }
}
