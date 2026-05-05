// Hole optimizer.
//
// Approach: discretize candidate landing zones along/around the hole centerline,
// then back-from-green dynamic programming. For each candidate "current position"
// (lie + remaining distance), find the club that minimizes expected strokes,
// where the expected strokes from a shot = 1 + E[strokes from resulting position].
//
// Expected resulting position is approximated by Monte Carlo over the player's
// dispersion (sigmaLong/Short/Left/Right), evaluating the lie at each sample.

import type { ClubProfile, Hole, HoleStrategy, Lie, LonLat, PlayerProfile, ShotRecommendation, TeeMarker } from '../types'
import { CLUB_ORDER } from '../types'
import { bearingDeg, destination, distanceYards, pointInPolygon } from './geometry'
import { expectedStrokes } from './sg'

const SAMPLES = 60      // Monte Carlo samples per shot
const GRID_STEP_YD = 15 // landing grid spacing

function sampleNormal(): number {
  // Box-Muller, returns standard normal.
  const u = Math.random() || 1e-9
  const v = Math.random() || 1e-9
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function classifyLie(point: LonLat, hole: Hole): Lie {
  for (const w of hole.waterHazards) if (pointInPolygon(point, w)) return 'water'
  for (const ob of hole.outOfBounds) if (pointInPolygon(point, ob)) return 'ob'
  if (pointInPolygon(point, hole.greenPolygon)) return 'green'
  for (const b of hole.bunkers) if (pointInPolygon(point, b)) return 'sand'
  for (const f of hole.fairwayPolygons) if (pointInPolygon(point, f)) return 'fairway'
  return 'rough'
}

function distanceToPin(point: LonLat, hole: Hole): number {
  return distanceYards(point, hole.greenCenter)
}

// Expected strokes from a position to hole-out, treating green distances in feet.
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
  expectedStrokesAfter: number
  expectedDistanceAfter: number
  expectedLie: Lie
}

// Evaluate a shot from `from` aimed at `aim` with the given club.
// Returns expected strokes to hole out (1 + E[strokes_from_landing]).
function evaluateShot(from: LonLat, aim: LonLat, club: ClubProfile, hole: Hole, handicap: number): ShotEval {
  const aimDist = distanceYards(from, aim)
  const heading = bearingDeg(from, aim)
  const carryYd = Math.min(club.carry, aimDist)

  let totalNext = 0
  let totalDist = 0
  const lieCounts: Record<Lie, number> = {
    tee: 0, fairway: 0, rough: 0, sand: 0, recovery: 0, green: 0, water: 0, ob: 0,
  }

  for (let i = 0; i < SAMPLES; i++) {
    // Long/short on the line of flight; left/right perpendicular.
    const longErr = sampleNormal() * (Math.random() < 0.5 ? club.sigmaShort : club.sigmaLong) * (Math.random() < 0.5 ? -1 : 1)
    const lateral = sampleNormal() * (Math.random() < 0.5 ? club.sigmaLeft : club.sigmaRight) * (Math.random() < 0.5 ? -1 : 1)
    const flightYd = carryYd + longErr + club.rollout * 0.6 // most rollout reduced when not center-cut
    const onAxis = destination(from, heading, Math.max(5, flightYd))
    // Apply lateral by moving perpendicular to heading.
    const perpHeading = (heading + 90) % 360
    const landing = destination(onAxis, perpHeading, lateral)

    const lie = classifyLie(landing, hole)
    lieCounts[lie]++
    const distAfter = distanceToPin(landing, hole)
    totalDist += distAfter
    if (lie === 'green') {
      totalNext += expectedStrokes('green', distAfter * 3, handicap)
    } else {
      totalNext += expectedStrokes(lie, distAfter, handicap)
    }
  }

  const expectedStrokesAfter = 1 + totalNext / SAMPLES
  const expectedDistanceAfter = totalDist / SAMPLES
  // Most likely lie:
  const expectedLie = (Object.entries(lieCounts).sort((a, b) => b[1] - a[1])[0][0]) as Lie
  return { club, aim, expectedStrokesAfter, expectedDistanceAfter, expectedLie }
}

function generateAimCandidates(from: LonLat, hole: Hole, maxCarry: number): LonLat[] {
  const headingToGreen = bearingDeg(from, hole.greenCenter)
  const distToGreen = distanceYards(from, hole.greenCenter)
  const candidates: LonLat[] = []
  // Distances along centerline at GRID_STEP_YD intervals up to maxCarry.
  for (let d = 50; d <= Math.min(maxCarry, distToGreen + 10); d += GRID_STEP_YD) {
    // Lateral offsets to give the optimizer a few side options.
    for (const lat of [-15, 0, 15]) {
      const onAxis = destination(from, headingToGreen, d)
      const aim = destination(onAxis, (headingToGreen + 90) % 360, lat)
      candidates.push(aim)
    }
  }
  // Also include "going for the green" if reachable.
  if (distToGreen <= maxCarry + 20) candidates.push(hole.greenCenter)
  return candidates
}

function clubsAvailable(player: PlayerProfile): ClubProfile[] {
  return CLUB_ORDER.filter((id) => id !== 'putter' && player.bag[id]?.inBag).map((id) => player.bag[id])
}

function rationaleFor(shot: ShotEval, _hole: Hole): string {
  const lie = shot.expectedLie
  if (lie === 'green') return `Reaches the green; ~${Math.round(shot.expectedDistanceAfter)}y to the pin.`
  if (lie === 'fairway') return `Lays back to ${Math.round(shot.expectedDistanceAfter)}y in the fairway.`
  if (lie === 'rough') return `Targets a safer line — most-likely outcome is rough at ${Math.round(shot.expectedDistanceAfter)}y.`
  if (lie === 'sand') return 'Risk of finding a bunker; chose this club because alternatives are worse on expectation.'
  if (lie === 'water' || lie === 'ob') return 'Best of bad options — alternatives also risk penalty.'
  return ''
}

export function planHole(hole: Hole, tee: TeeMarker, player: PlayerProfile, maxShots = 5): HoleStrategy {
  const recommendations: ShotRecommendation[] = []
  let position: LonLat = tee.position
  let shotIndex = 0
  const handicap = player.handicap
  const clubs = clubsAvailable(player)

  while (shotIndex < maxShots) {
    const distRemaining = distanceToPin(position, hole)
    if (distRemaining < 25) break // close enough — chip/putt territory, modeled by SG green
    // Generate candidate (club, aim) shots.
    let best: ShotEval | null = null
    for (const c of clubs) {
      const candidates = generateAimCandidates(position, hole, c.carry + c.rollout)
      for (const aim of candidates) {
        const aimDist = distanceYards(position, aim)
        if (aimDist < 30) continue // don't recommend tiny shots from full clubs
        if (aimDist > c.carry + c.rollout + 15) continue
        const shot = evaluateShot(position, aim, c, hole, handicap)
        if (!best || shot.expectedStrokesAfter < best.expectedStrokesAfter) best = shot
      }
    }
    if (!best) break
    recommendations.push({
      shotIndex,
      club: best.club.id,
      aimPoint: best.aim,
      expectedLie: best.expectedLie,
      expectedDistanceToPin: best.expectedDistanceAfter,
      expectedStrokesAfter: best.expectedStrokesAfter,
      rationale: rationaleFor(best, hole),
    })
    // Move position to expected landing along chosen line of flight.
    position = destination(position, bearingDeg(position, best.aim), Math.min(distanceYards(position, best.aim), best.club.carry))
    shotIndex++
    // Stop if expected lie is green or we're close enough.
    if (best.expectedLie === 'green' || best.expectedDistanceAfter < 25) break
  }

  // Add a short-game finisher: chip/putt to hole-out from green expectation.
  const finalEV = expectedFromPosition(position, hole, handicap)
  const expectedScore = recommendations.length + finalEV

  return {
    holeNumber: hole.number,
    teeId: tee.id,
    recommendations,
    expectedScore: Math.round(expectedScore * 10) / 10,
    parScore: Math.round((expectedScore - hole.par) * 10) / 10,
    confidence: hole.confidence,
  }
}
