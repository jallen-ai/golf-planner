// Hole optimizer.
//
// Walks each hole shot-by-shot. At each step, for each available club + candidate
// aim point, runs a Monte Carlo simulation of the player's dispersion and picks
// the (club, aim) pair that minimizes expected strokes to hole out.
//
// Supports per-shot overrides (fixed aim, fixed club, or both) for user customization.

import type {
  ClubProfile, Hole, HoleStrategy, Lie, LonLat, PlayerProfile,
  ShotOverride, ShotRecommendation, TeeMarker,
} from '../types'
import { CLUB_ORDER } from '../types'
import { bearingDeg, destination, distanceYards, pointInPolygon } from './geometry'
import { expectedStrokes } from './sg'

const SAMPLES = 60      // Monte Carlo samples per shot
const GRID_STEP_YD = 15 // landing grid spacing along centerline
const LATERAL_OFFSETS_YD = [-15, 0, 15]

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

interface ShotEval {
  club: ClubProfile
  aim: LonLat
  expectedStrokesAfter: number   // 1 + E[strokes from landing]
  expectedDistanceAfter: number  // expected yards remaining after landing
  expectedLie: Lie
  expectedLanding: LonLat        // mean landing point
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
    const distAfter = distanceToPin(landing, hole)
    totalDist += distAfter
    sumLon += landing[0]
    sumLat += landing[1]
    if (lie === 'green') {
      totalNext += expectedStrokes('green', distAfter * 3, handicap)
    } else {
      totalNext += expectedStrokes(lie, distAfter, handicap)
    }
  }

  const expectedStrokesAfter = 1 + totalNext / SAMPLES
  const expectedDistanceAfter = totalDist / SAMPLES
  const expectedLanding: LonLat = [sumLon / SAMPLES, sumLat / SAMPLES]
  const expectedLie = (Object.entries(lieCounts).sort((a, b) => b[1] - a[1])[0][0]) as Lie
  return { club, aim, expectedStrokesAfter, expectedDistanceAfter, expectedLie, expectedLanding }
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

function clubsAvailable(player: PlayerProfile): ClubProfile[] {
  return CLUB_ORDER.filter((id) => id !== 'putter' && player.bag[id]?.inBag).map((id) => player.bag[id])
}

function rationaleFor(shot: ShotEval, hole: Hole, distAfter: number, _shotIndex: number): string {
  const lie = shot.expectedLie
  const club = shot.club.id
  if (lie === 'green') return `Reaches the green with ${club}; ${Math.round(distAfter)}y to the pin.`
  if (lie === 'fairway') return `${club} to the fairway; ${Math.round(distAfter)}y left to the pin.`
  if (lie === 'rough') return `Likely rough at ${Math.round(distAfter)}y — but better expectation than a longer alternative.`
  if (lie === 'sand') return `Risk of finding sand. Other clubs flirt with worse trouble.`
  if (lie === 'water') return `Best of bad options here — most clubs put water in play.`
  if (lie === 'ob') return `OB is a major risk. Consider laying further back manually.`
  return `${club} → ${Math.round(distAfter)}y remaining.`
  // (hole arg kept for future context-aware messaging like "fade away from right water")
  void hole
}

export interface PlanOptions {
  startPoint?: LonLat                    // override tee position
  shotOverrides?: ShotOverride[]         // override per shot index
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

  // No tee → can't plan. Return placeholder requesting manual tee placement.
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
  let shotIndex = 0
  const clubs = clubsAvailable(player)
  const overrides = options.shotOverrides ?? []

  while (shotIndex < maxShots) {
    const distRemaining = distanceToPin(position, hole)
    if (distRemaining < 25) break

    const ovr = overrides[shotIndex]
    let best: ShotEval | null = null

    if (ovr?.fixedClub && ovr?.fixedAim) {
      // Both fixed — simulate this exact shot.
      const c = player.bag[ovr.fixedClub]
      if (c) best = evaluateShot(position, ovr.fixedAim, c, hole, handicap)
    } else if (ovr?.fixedClub) {
      // Fixed club; pick best aim within its reach.
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
      // Fixed aim; pick best club to reach it.
      const aimDist = distanceYards(position, ovr.fixedAim)
      for (const c of clubs) {
        const reach = c.carry + c.rollout
        if (aimDist > reach + 15 || aimDist < 30) continue
        const shot = evaluateShot(position, ovr.fixedAim, c, hole, handicap)
        if (!best || shot.expectedStrokesAfter < best.expectedStrokesAfter) best = shot
      }
    } else {
      // Free optimization.
      for (const c of clubs) {
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
      rationale: rationaleFor(best, hole, best.expectedDistanceAfter, shotIndex),
      overridden: !!ovr,
    })
    position = best.expectedLanding
    shotIndex++
    if (best.expectedLie === 'green' || best.expectedDistanceAfter < 25) break
  }

  const finalEV = expectedFromPosition(position, hole, handicap)
  const expectedScore = recommendations.length + finalEV

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
