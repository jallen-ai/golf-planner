// Round planning orchestrator.
//
// Owns the (course, tee, profile) → RoundPlan computation, with caching keyed by
// (courseId, teeId, playerVersion). Per-hole overrides (tee position, shot overrides)
// trigger only that hole to recompute.

import type { Course, Hole, HoleOverride, HoleStrategy, PlayerProfile, RoundPlan, TeeMarker } from '../types'
import { db, putRound } from '../store/db'
import { planHole } from './optimizer'

function teeForHole(hole: Hole, teeId: string): TeeMarker | null {
  return hole.tees.find((t) => t.id === teeId) ?? hole.tees[0] ?? null
}

function emptyHoleStrategy(hole: Hole, teeId: string): HoleStrategy {
  const tee = teeForHole(hole, teeId)
  return {
    holeNumber: hole.number,
    teeId: tee?.id ?? '',
    startPoint: tee?.position ?? hole.greenCenter,
    recommendations: [],
    expectedScore: hole.par,
    parScore: 0,
    confidence: hole.confidence,
    needsManualTee: !tee,
  }
}

export function computeHoleStrategy(
  hole: Hole,
  teeId: string,
  player: PlayerProfile,
  override: HoleOverride | undefined,
): HoleStrategy {
  const tee = teeForHole(hole, teeId)
  const startPoint = override?.teePosition ?? tee?.position
  return planHole(hole, tee, player, {
    startPoint,
    shotOverrides: override?.shotOverrides,
  })
}

function totalExpected(strategies: HoleStrategy[]): number {
  return Math.round(strategies.reduce((s, x) => s + x.expectedScore, 0) * 10) / 10
}

function roundId(courseId: string, teeId: string, playerVersion: number): string {
  return `round-${courseId}-${teeId}-${playerVersion}`
}

export async function loadRound(courseId: string, teeId: string, playerVersion: number): Promise<RoundPlan | null> {
  const id = roundId(courseId, teeId, playerVersion)
  const r = await (await db()).get('rounds', id)
  return r ?? null
}

export async function saveRound(plan: RoundPlan): Promise<void> {
  await putRound({ ...plan, expectedScore: totalExpected(plan.strategies) })
}

export function makeEmptyPlan(course: Course, teeId: string, player: PlayerProfile): RoundPlan {
  return {
    id: roundId(course.id, teeId, player.updatedAt),
    courseId: course.id,
    courseName: course.name,
    teeId,
    playerVersion: player.updatedAt,
    playerSnapshot: player,
    strategies: course.holes.map((h) => emptyHoleStrategy(h, teeId)),
    overrides: {},
    expectedScore: 0,
    generatedAt: Date.now(),
  }
}

/**
 * Plan all holes for a round, calling onProgress(strategiesSoFar, percentComplete)
 * after each hole completes. Yields to the event loop between holes so the UI
 * can update and remain interactive.
 */
export async function planAllHoles(
  course: Course,
  teeId: string,
  player: PlayerProfile,
  overrides: Record<number, HoleOverride>,
  onProgress?: (strategies: HoleStrategy[], pct: number) => void,
): Promise<HoleStrategy[]> {
  const strategies: HoleStrategy[] = []
  for (let i = 0; i < course.holes.length; i++) {
    const h = course.holes[i]
    const ov = overrides[h.number]
    const s = computeHoleStrategy(h, teeId, player, ov)
    strategies.push(s)
    onProgress?.([...strategies], Math.round(((i + 1) / course.holes.length) * 100))
    await new Promise((r) => setTimeout(r, 0))
  }
  return strategies
}

/**
 * Recompute a single hole's strategy in an existing plan and persist.
 */
export async function updateHoleInPlan(
  plan: RoundPlan,
  course: Course,
  holeNumber: number,
  override: HoleOverride | undefined,
  player: PlayerProfile,
): Promise<RoundPlan> {
  const hole = course.holes.find((h) => h.number === holeNumber)
  if (!hole) return plan
  const newStrategy = computeHoleStrategy(hole, plan.teeId, player, override)
  const strategies = plan.strategies.map((s) => (s.holeNumber === holeNumber ? newStrategy : s))
  const overrides = { ...plan.overrides }
  if (override && (override.teePosition || override.shotOverrides?.length)) {
    overrides[holeNumber] = override
  } else {
    delete overrides[holeNumber]
  }
  const next: RoundPlan = {
    ...plan,
    strategies,
    overrides,
    expectedScore: totalExpected(strategies),
    generatedAt: Date.now(),
  }
  await saveRound(next)
  return next
}
