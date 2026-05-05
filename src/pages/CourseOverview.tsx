// CourseOverview — pick a tee, see all 18 holes as a scorecard, drill into any hole.

import { useEffect, useMemo, useState } from 'react'
import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'
import { usePlayer } from '../store/player'
import { CLUB_LABELS } from '../types'
import type { Hole, HoleStats, PlayedRound, RoundPlan } from '../types'
import { loadRound, makeEmptyPlan, planAllHoles, saveRound } from '../engine/planRound'
import { getPlayedRoundsByCourse } from '../store/db'
import { computeStats } from '../engine/stats'

interface Props { courseId: string }

export default function CourseOverviewPage({ courseId }: Props) {
  const go = useNav((s) => s.go)
  const courses = useCourses((s) => s.courses)
  const player = usePlayer((s) => s.profile)
  const course = courses.find((c) => c.id === courseId)

  const tees = useMemo(() => {
    if (!course) return [] as Array<{ id: string; label: string; totalYds: number; count: number }>
    const map = new Map<string, { id: string; label: string; totalYds: number; count: number }>()
    for (const h of course.holes) {
      const seen = new Map<string, number>()
      for (const t of h.tees) {
        const yd = t.yardage ?? 0
        if (yd > (seen.get(t.id) ?? -1)) seen.set(t.id, yd)
      }
      for (const t of h.tees) {
        if ((t.yardage ?? 0) !== seen.get(t.id)) continue
        const label = t.label ?? t.id.charAt(0).toUpperCase() + t.id.slice(1)
        const cur = map.get(t.id) ?? { id: t.id, label, totalYds: 0, count: 0 }
        cur.totalYds += t.yardage ?? 0
        cur.count++
        map.set(t.id, cur)
      }
    }
    return [...map.values()].sort((a, b) => b.totalYds - a.totalYds)
  }, [course])

  const [teeId, setTeeId] = useState<string>('')
  const [round, setRound] = useState<RoundPlan | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [computing, setComputing] = useState(false)
  const [playedRounds, setPlayedRounds] = useState<PlayedRound[]>([])

  useEffect(() => {
    if (!course) return
    let cancelled = false
    ;(async () => {
      const rs = await getPlayedRoundsByCourse(course.id)
      if (!cancelled) setPlayedRounds(rs)
    })()
    return () => { cancelled = true }
  }, [course])

  const stats = useMemo(
    () => course ? computeStats(course, playedRounds) : new Map<number, HoleStats>(),
    [course, playedRounds],
  )

  useEffect(() => {
    if (!teeId && tees.length) setTeeId(tees[0].id)
  }, [tees, teeId])

  // Recompute (or load cache) when course/tee/player changes.
  useEffect(() => {
    if (!course || !player || !teeId) return
    let cancelled = false
    ;(async () => {
      const cached = await loadRound(course.id, teeId, player.updatedAt)
      if (cancelled) return
      if (cached) { setRound(cached); setProgress(100); setComputing(false); return }
      // No cache — compute.
      setComputing(true)
      setProgress(0)
      const empty = makeEmptyPlan(course, teeId, player)
      setRound(empty)
      const strategies = await planAllHoles(course, teeId, player, {}, (sofar, pct) => {
        if (cancelled) return
        setProgress(pct)
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
      setComputing(false)
    })()
    return () => { cancelled = true }
  }, [course, player, teeId])

  if (!course) {
    return (
      <>
        <header className="topbar">
          <button className="nav-back" onClick={() => go({ kind: 'home' })}>← Back</button>
          <h1>Course</h1>
          <span></span>
        </header>
        <div className="empty-state">Course not found.</div>
      </>
    )
  }

  const totalPar = course.holes.reduce((s, h) => s + h.par, 0)
  const totalYards = round
    ? course.holes.reduce((s, h) => {
        const tee = h.tees.find((t) => t.id === teeId) ?? h.tees[0]
        return s + (tee?.yardage ?? 0)
      }, 0)
    : 0
  const overUnder = round ? round.expectedScore - totalPar : 0

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'home' })}>← Back</button>
        <h1>{course.name}</h1>
        <span></span>
      </header>

      {tees.length === 0 ? (
        <div className="banner error">No tees defined on this course's holes.</div>
      ) : (
        <div className="card">
          <div className="muted" style={{ marginBottom: '0.4rem' }}>Tee</div>
          <div className="tee-pills">
            {tees.map((t) => (
              <button
                key={t.id}
                className={`tee-pill ${teeId === t.id ? 'active' : ''}`}
                onClick={() => setTeeId(t.id)}
              >
                {t.label}
                <span className="tee-pill-yds">{t.totalYds} yds</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card overview-summary">
        <div>
          <div className="muted">Expected score</div>
          <div className="big-score">
            {round ? round.expectedScore.toFixed(1) : '—'}
            {round && (
              <span className="big-score-delta">
                ({overUnder >= 0 ? '+' : ''}{overUnder.toFixed(1)} vs par {totalPar})
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted">Total yardage</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--green-deep)' }}>
            {totalYards}
          </div>
        </div>
      </div>

      {computing && (
        <div className="banner">Planning your round… {progress}%</div>
      )}

      <div className="card scorecard">
        {course.holes.map((hole) => {
          const strategy = round?.strategies.find((s) => s.holeNumber === hole.number)
          const tee = hole.tees.find((t) => t.id === teeId) ?? hole.tees[0]
          const holeStats = stats.get(hole.number)
          return (
            <ScorecardRow
              key={hole.number}
              hole={hole}
              yardage={tee?.yardage}
              expected={strategy?.expectedScore}
              firstClub={strategy?.recommendations[0]?.club}
              needsManualTee={strategy?.needsManualTee}
              stats={holeStats}
              onTap={() => go({ kind: 'hole-view', courseId: course.id, holeNumber: hole.number })}
            />
          )
        })}
      </div>

      {playedRounds.length === 0 && (
        <div className="card">
          <div className="title">Add round history</div>
          <p className="subtitle">Track your scores at this course to spot trouble holes.</p>
          <button className="secondary" onClick={() => go({ kind: 'rounds', courseId: course.id })}>
            📊 Add rounds
          </button>
        </div>
      )}
    </>
  )
}

function ScorecardRow({
  hole, yardage, expected, firstClub, needsManualTee, stats, onTap,
}: {
  hole: Hole
  yardage?: number
  expected?: number
  firstClub?: keyof typeof CLUB_LABELS
  needsManualTee?: boolean
  stats?: HoleStats
  onTap: () => void
}) {
  const delta = expected != null ? expected - hole.par : null
  const trouble = stats && stats.averageVsPar >= 1.0
  return (
    <button className={`scorecard-row ${trouble ? 'trouble' : ''}`} onClick={onTap}>
      <span className="hole-num">{hole.number}</span>
      <div className="scorecard-meta">
        <div className="scorecard-title">
          {hole.name ?? `Hole ${hole.number}`}
          <span className="par-pill">Par {hole.par}</span>
          {trouble && <span className="trouble-badge">⚠ trouble</span>}
        </div>
        <div className="muted scorecard-sub">
          {yardage ? `${yardage} yds` : '—'}
          {firstClub ? <> · <strong style={{ color: 'var(--green-deep)' }}>{CLUB_LABELS[firstClub]}</strong></> : null}
          {needsManualTee ? <> · ⚠ tap to drop tee</> : null}
          {stats ? <> · you avg {stats.averageScore.toFixed(1)} ({stats.averageVsPar >= 0 ? '+' : ''}{stats.averageVsPar.toFixed(1)}) over {stats.played}</> : null}
        </div>
      </div>
      <div className="scorecard-score">
        {expected != null ? expected.toFixed(1) : '—'}
        {delta != null && (
          <div className={`scorecard-delta ${delta >= 0 ? 'over' : 'under'}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
          </div>
        )}
      </div>
      <span className="scorecard-chevron">›</span>
    </button>
  )
}
