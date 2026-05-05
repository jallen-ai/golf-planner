import { useMemo, useState } from 'react'
import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'
import { usePlayer } from '../store/player'
import { putRound } from '../store/db'
import { planHole } from '../engine/optimizer'
import type { HoleStrategy, RoundPlan } from '../types'

interface Props { courseId: string }

export default function RoundPlannerPage({ courseId }: Props) {
  const go = useNav((s) => s.go)
  const courses = useCourses((s) => s.courses)
  const player = usePlayer((s) => s.profile)
  const course = courses.find((c) => c.id === courseId)

  const allTees = useMemo(() => {
    if (!course) return []
    const map = new Map<string, { id: string; label: string; count: number; totalYds: number }>()
    for (const h of course.holes) {
      for (const t of h.tees) {
        const cur = map.get(t.id) ?? { id: t.id, label: t.id, count: 0, totalYds: 0 }
        cur.count++
        cur.totalYds += t.yardage ?? 0
        map.set(t.id, cur)
      }
    }
    return [...map.values()].sort((a, b) => b.totalYds - a.totalYds)
  }, [course])

  const [selectedTee, setSelectedTee] = useState<string>(allTees[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  if (!course || !player) {
    return (
      <>
        <header className="topbar">
          <button className="nav-back" onClick={() => go({ kind: 'home' })}>← Back</button>
          <h1>Plan</h1>
          <span></span>
        </header>
        <div className="empty-state">Course or player profile missing.</div>
      </>
    )
  }

  async function generate() {
    if (!course || !player) return
    setBusy(true)
    setProgress(0)
    const strategies: HoleStrategy[] = []
    let total = 0
    for (let i = 0; i < course.holes.length; i++) {
      const h = course.holes[i]
      const tee = h.tees.find((t) => t.id === selectedTee) ?? h.tees[0]
      if (!tee || !h.greenPolygon.ring.length) {
        strategies.push({
          holeNumber: h.number,
          teeId: tee?.id ?? '',
          recommendations: [],
          expectedScore: h.par,
          parScore: 0,
          confidence: 'low',
        })
      } else {
        const s = planHole(h, tee, player)
        strategies.push(s)
        total += s.expectedScore
      }
      setProgress(Math.round(((i + 1) / course.holes.length) * 100))
      // Yield to UI between holes.
      await new Promise((r) => setTimeout(r, 0))
    }
    const round: RoundPlan = {
      id: `round-${Date.now()}`,
      courseId: course.id,
      courseName: course.name,
      teeId: selectedTee,
      playerSnapshot: player,
      strategies,
      expectedScore: Math.round(total * 10) / 10,
      generatedAt: Date.now(),
    }
    await putRound(round)
    setBusy(false)
    go({ kind: 'round-card', roundId: round.id })
  }

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'home' })}>← Back</button>
        <h1>{course.name}</h1>
        <span></span>
      </header>

      <div className="card">
        <div className="title">Choose your tee</div>
        {allTees.length === 0 ? (
          <div className="banner error">No tees defined on this course's holes.</div>
        ) : (
          <div className="col">
            {allTees.map((t) => {
              const total = t.totalYds || 0
              return (
                <label
                  key={t.id}
                  className={`row between ${selectedTee === t.id ? '' : ''}`}
                  style={{ padding: '0.55rem 0', borderBottom: '1px solid var(--border)' }}
                >
                  <div className="row" style={{ gap: '0.5rem' }}>
                    <input
                      type="radio"
                      name="tee"
                      checked={selectedTee === t.id}
                      onChange={() => setSelectedTee(t.id)}
                      style={{ width: 'auto' }}
                    />
                    <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{t.label}</span>
                  </div>
                  <span className="muted">{total} yds · {t.count} holes</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="title">Generate strategy</div>
        <p className="subtitle">
          Runs the optimizer back from each green using your bag and dispersion. Takes ~10–20s for 18 holes.
        </p>
        <button onClick={generate} disabled={busy || !selectedTee}>
          {busy ? `Planning… ${progress}%` : 'Generate round card'}
        </button>
      </div>
    </>
  )
}
