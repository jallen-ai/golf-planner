import { useEffect, useState } from 'react'
import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'
import { db } from '../store/db'
import { CLUB_LABELS } from '../types'
import type { RoundPlan } from '../types'

interface Props { roundId: string }

export default function RoundCardPage({ roundId }: Props) {
  const go = useNav((s) => s.go)
  const courses = useCourses((s) => s.courses)
  const [round, setRound] = useState<RoundPlan | null>(null)

  useEffect(() => {
    (async () => {
      const r = (await (await db()).get('rounds', roundId)) ?? null
      setRound(r)
    })()
  }, [roundId])

  if (!round) {
    return (
      <>
        <header className="topbar">
          <button className="nav-back" onClick={() => go({ kind: 'home' })}>← Back</button>
          <h1>Round</h1>
          <span></span>
        </header>
        <div className="muted">Loading…</div>
      </>
    )
  }

  const course = courses.find((c) => c.id === round.courseId)
  const totalPar = course ? course.holes.reduce((s, h) => s + h.par, 0) : 0
  const overUnder = round.expectedScore - totalPar

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'home' })}>← Back</button>
        <h1>{round.courseName}</h1>
        <span className="muted" style={{ textTransform: 'capitalize' }}>{round.teeId}</span>
      </header>

      <div className="card">
        <div className="row between">
          <div>
            <div className="muted">Expected score</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--green-deep)' }}>
              {round.expectedScore}
              <span style={{ fontSize: '0.9rem', marginLeft: '0.4rem', color: 'var(--muted)' }}>
                ({overUnder >= 0 ? '+' : ''}{overUnder.toFixed(1)} vs par {totalPar})
              </span>
            </div>
          </div>
          <div className="muted" style={{ textAlign: 'right', fontSize: '0.85rem' }}>
            HCP {round.playerSnapshot.handicap}<br />
            Miss: {round.playerSnapshot.dominantMiss}
          </div>
        </div>
      </div>

      {round.strategies.map((s) => {
        const hole = course?.holes.find((h) => h.number === s.holeNumber)
        return (
          <div key={s.holeNumber} className={`hole-card confidence-${s.confidence}`}>
            <div className="row between">
              <div>
                <span className="hole-num">{s.holeNumber}</span>
                <strong>{hole?.name ?? `Hole ${s.holeNumber}`}</strong>
                <span className="par-pill">Par {hole?.par ?? '?'}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{s.expectedScore.toFixed(1)}</div>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  {s.parScore >= 0 ? '+' : ''}{s.parScore.toFixed(1)}
                </div>
              </div>
            </div>
            {s.recommendations.length === 0 ? (
              <div className="muted" style={{ marginTop: '0.5rem' }}>
                Not enough geometry to plan — open the course to add hazards/green.
              </div>
            ) : (
              s.recommendations.map((r) => (
                <div key={r.shotIndex} className="shot-line">
                  <span className="num">{r.shotIndex + 1}</span>
                  <div>
                    <div>
                      <strong>{CLUB_LABELS[r.club]}</strong>
                      <span className="muted" style={{ marginLeft: '0.5rem' }}>
                        → {Math.round(r.expectedDistanceToPin)}y to pin ({r.expectedLie})
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>{r.rationale}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )
      })}
    </>
  )
}
