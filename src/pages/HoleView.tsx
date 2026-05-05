// HoleView — single hole detail page with map, strategy, and overrides.

import { useEffect, useMemo, useState } from 'react'
import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'
import { usePlayer } from '../store/player'
import HoleMap from '../components/HoleMap'
import { CLUB_LABELS, CLUB_ORDER, type ClubId, type HoleOverride, type LonLat, type RoundPlan } from '../types'
import { loadRound, makeEmptyPlan, planAllHoles, saveRound, updateHoleInPlan } from '../engine/planRound'

interface Props {
  courseId: string
  holeNumber: number
}

function pickDefaultTeeId(course: ReturnType<typeof useCourses.getState>['courses'][number]): string {
  const counts = new Map<string, number>()
  for (const h of course.holes) {
    for (const t of h.tees) counts.set(t.id, (counts.get(t.id) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

export default function HoleViewPage({ courseId, holeNumber }: Props) {
  const go = useNav((s) => s.go)
  const courses = useCourses((s) => s.courses)
  const player = usePlayer((s) => s.profile)
  const course = courses.find((c) => c.id === courseId)
  const hole = course?.holes.find((h) => h.number === holeNumber)

  const [round, setRound] = useState<RoundPlan | null>(null)
  const [teeId, setTeeId] = useState<string>('')

  // Resolve the active round (must match course overview's choice).
  useEffect(() => {
    if (!course || !player) return
    let cancelled = false
    ;(async () => {
      // Find the most recently used tee for this course by trying common defaults.
      const candidates = [pickDefaultTeeId(course)]
      for (const t of candidates) {
        if (!t) continue
        const r = await loadRound(course.id, t, player.updatedAt)
        if (cancelled) return
        if (r) { setRound(r); setTeeId(t); return }
      }
      // No cached round — compute the default tee.
      const defTee = pickDefaultTeeId(course)
      setTeeId(defTee)
      const empty = makeEmptyPlan(course, defTee, player)
      setRound(empty)
      const strategies = await planAllHoles(course, defTee, player, {}, (sofar) => {
        if (cancelled) return
        setRound((prev) => prev ? {
          ...prev,
          strategies: prev.strategies.map((s) => sofar.find((x) => x.holeNumber === s.holeNumber) ?? s),
        } : prev)
      })
      if (cancelled) return
      const final: RoundPlan = {
        ...empty,
        strategies,
        expectedScore: Math.round(strategies.reduce((s, x) => s + x.expectedScore, 0) * 10) / 10,
      }
      await saveRound(final)
      setRound(final)
    })()
    return () => { cancelled = true }
  }, [course, player])

  const strategy = useMemo(
    () => round?.strategies.find((s) => s.holeNumber === holeNumber),
    [round, holeNumber],
  )

  if (!course || !hole || !player || !round || !strategy) {
    return (
      <>
        <header className="topbar">
          <button className="nav-back" onClick={() => go({ kind: 'course-overview', courseId })}>← Back</button>
          <h1>Hole {holeNumber}</h1>
          <span></span>
        </header>
        <div className="muted">Loading…</div>
      </>
    )
  }

  const totalPar = course.holes.reduce((s, h) => s + h.par, 0)
  void totalPar

  async function applyOverride(next: HoleOverride | undefined) {
    if (!course || !player || !round) return
    const updated = await updateHoleInPlan(round, course, holeNumber, next, player)
    setRound(updated)
  }

  function curOverride(): HoleOverride {
    return round?.overrides[holeNumber] ?? {}
  }

  async function handleTeeDrag(pos: LonLat) {
    const ov = { ...curOverride(), teePosition: pos }
    await applyOverride(ov)
  }

  async function handleAimDrag(shotIndex: number, pos: LonLat) {
    const ov = { ...curOverride() }
    const arr = [...(ov.shotOverrides ?? [])]
    while (arr.length <= shotIndex) arr.push({})
    arr[shotIndex] = { ...arr[shotIndex], fixedAim: pos }
    ov.shotOverrides = arr
    await applyOverride(ov)
  }

  async function handleClubChange(shotIndex: number, club: ClubId) {
    const ov = { ...curOverride() }
    const arr = [...(ov.shotOverrides ?? [])]
    while (arr.length <= shotIndex) arr.push({})
    arr[shotIndex] = { ...arr[shotIndex], fixedClub: club }
    ov.shotOverrides = arr
    await applyOverride(ov)
  }

  async function handleResetOverrides() {
    await applyOverride(undefined)
  }

  async function handleMapTap(pos: LonLat) {
    if (!strategy?.needsManualTee) return
    await handleTeeDrag(pos)
  }

  const prevHole = course.holes.find((h) => h.number === holeNumber - 1) ? holeNumber - 1 : null
  const nextHole = course.holes.find((h) => h.number === holeNumber + 1) ? holeNumber + 1 : null
  const tee = hole.tees.find((t) => t.id === teeId) ?? hole.tees[0]
  const yardage = tee?.yardage
  const hasOverrides = !!(round.overrides[holeNumber] && (round.overrides[holeNumber].teePosition || (round.overrides[holeNumber].shotOverrides?.length ?? 0) > 0))

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'course-overview', courseId })}>← Back</button>
        <h1>
          Hole {hole.number}
          <span className="par-pill" style={{ marginLeft: 8 }}>Par {hole.par}</span>
        </h1>
        <span className="muted">{yardage ? `${yardage}y` : ''}</span>
      </header>

      {strategy.needsManualTee && (
        <div className="banner">
          <strong>Tee missing.</strong> Tap on the map where the tee box should be to plan this hole.
        </div>
      )}

      <HoleMap
        hole={hole}
        strategy={strategy}
        onTeeDrag={handleTeeDrag}
        onAimDrag={handleAimDrag}
        onMapTap={strategy.needsManualTee ? handleMapTap : undefined}
      />

      <div className="card">
        <div className="row between" style={{ marginBottom: '0.5rem' }}>
          <div>
            <div className="muted">Expected score</div>
            <div className="big-score">
              {strategy.expectedScore.toFixed(1)}
              <span className="big-score-delta">
                ({strategy.parScore >= 0 ? '+' : ''}{strategy.parScore.toFixed(1)} vs par {hole.par})
              </span>
            </div>
            {strategy.recommendations.length > 0 && (() => {
              const last = strategy.recommendations[strategy.recommendations.length - 1]
              const shotsTaken = strategy.recommendations.length
              const putts = strategy.expectedScore - shotsTaken + (last.expectedLie === 'green' ? 1 : 0)
              const finishing = last.expectedLie === 'green'
                ? `${putts.toFixed(1)} putts from ${Math.round(last.expectedDistanceToPin)}y`
                : `${(strategy.expectedScore - (shotsTaken - 1)).toFixed(1)} more strokes from ${Math.round(last.expectedDistanceToPin)}y`
              return (
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                  {shotsTaken === 1 ? '1 shot' : `${shotsTaken} shots`} + {finishing}
                </div>
              )
            })()}
          </div>
          {hasOverrides && (
            <button className="ghost" onClick={handleResetOverrides}>Reset</button>
          )}
        </div>

        {strategy.recommendations.length === 0 ? (
          <div className="muted">{strategy.needsManualTee ? 'Drop a tee to plan.' : 'Not enough data on this hole to plan.'}</div>
        ) : (
          strategy.recommendations.map((r) => (
            <div key={r.shotIndex} className="shot-line">
              <span className="num">{r.shotIndex + 1}</span>
              <div style={{ flex: 1 }}>
                <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <strong>{CLUB_LABELS[r.club]}</strong>
                    {r.overridden && <span className="override-badge">override</span>}
                    <span className="muted" style={{ marginLeft: '0.5rem' }}>
                      {Math.round(r.shotDistance)}y → {Math.round(r.expectedDistanceToPin)}y to pin · {r.expectedLie}
                    </span>
                  </div>
                  <select
                    value={r.club}
                    onChange={(e) => handleClubChange(r.shotIndex, e.target.value as ClubId)}
                    style={{ width: 'auto', padding: '0.3rem 0.4rem', fontSize: '0.78rem' }}
                  >
                    {CLUB_ORDER.filter((id) => id !== 'putter' && player.bag[id]?.inBag).map((id) => (
                      <option key={id} value={id}>{CLUB_LABELS[id]}</option>
                    ))}
                  </select>
                </div>
                <div className="muted" style={{ fontSize: '0.85rem', marginTop: 2 }}>
                  {r.rationale}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card hole-nav">
        {prevHole != null ? (
          <button className="secondary" onClick={() => go({ kind: 'hole-view', courseId, holeNumber: prevHole })}>
            ← Hole {prevHole}
          </button>
        ) : <span />}
        <button className="ghost" onClick={() => go({ kind: 'course-overview', courseId })}>Overview</button>
        {nextHole != null ? (
          <button onClick={() => go({ kind: 'hole-view', courseId, holeNumber: nextHole })}>
            Hole {nextHole} →
          </button>
        ) : <span />}
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <button className="secondary" onClick={() => go({ kind: 'edit-hole', courseId, holeNumber })}>
          ✏️ Edit this hole's geometry
        </button>
      </div>
    </>
  )
}
