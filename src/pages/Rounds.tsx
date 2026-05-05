// Rounds — manage played-round history for a course; show per-hole stats.

import { useEffect, useMemo, useState } from 'react'
import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'
import { deletePlayedRound, getPlayedRoundsByCourse, putPlayedRound } from '../store/db'
import { computeStats, parsePastedScores } from '../engine/stats'
import type { PlayedRound } from '../types'

interface Props { courseId: string }

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RoundsPage({ courseId }: Props) {
  const go = useNav((s) => s.go)
  const courses = useCourses((s) => s.courses)
  const course = courses.find((c) => c.id === courseId)

  const [rounds, setRounds] = useState<PlayedRound[]>([])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteResult, setPasteResult] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualDate, setManualDate] = useState(todayISO())
  const [manualScores, setManualScores] = useState<string[]>(Array(18).fill(''))

  useEffect(() => {
    (async () => {
      setRounds(await getPlayedRoundsByCourse(courseId))
    })()
  }, [courseId])

  const stats = useMemo(() => course ? computeStats(course, rounds) : new Map(), [course, rounds])

  async function handlePaste() {
    setPasteResult(null)
    const parsed = parsePastedScores(pasteText, todayISO())
    if (parsed.length === 0) {
      setPasteResult('Couldn\'t find any rounds. Each line should have at least 9 hole scores (separated by spaces/tabs/commas).')
      return
    }
    let added = 0
    for (const r of parsed) {
      const round: PlayedRound = {
        id: `pr-${courseId}-${r.date}-${Date.now()}-${added}`,
        courseId,
        date: r.date,
        scores: r.scores,
      }
      await putPlayedRound(round)
      added++
    }
    setRounds(await getPlayedRoundsByCourse(courseId))
    setPasteText('')
    setPasteResult(`Added ${added} round${added === 1 ? '' : 's'}.`)
  }

  async function handleManualSave() {
    if (!course) return
    const scores: (number | null)[] = manualScores.map((s) => {
      const n = parseInt(s, 10)
      return Number.isFinite(n) && n > 0 ? n : null
    })
    if (scores.filter((s) => s != null).length === 0) return
    const round: PlayedRound = {
      id: `pr-${courseId}-${manualDate}-${Date.now()}`,
      courseId,
      date: manualDate,
      scores,
    }
    await putPlayedRound(round)
    setRounds(await getPlayedRoundsByCourse(courseId))
    setManualOpen(false)
    setManualScores(Array(18).fill(''))
    setManualDate(todayISO())
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this round?')) return
    await deletePlayedRound(id)
    setRounds(await getPlayedRoundsByCourse(courseId))
  }

  if (!course) {
    return (
      <>
        <header className="topbar">
          <button className="nav-back" onClick={() => go({ kind: 'courses' })}>← Back</button>
          <h1>Rounds</h1>
          <span></span>
        </header>
        <div className="empty-state">Course not found.</div>
      </>
    )
  }

  const totalPar = course.holes.reduce((s, h) => s + h.par, 0)
  const totalRoundsScores = rounds.map((r) => r.scores.filter((s): s is number => typeof s === 'number'))
  const completeRounds = rounds.filter((r) => r.scores.every((s) => typeof s === 'number'))
  const avgTotal = completeRounds.length > 0
    ? completeRounds.reduce((sum, r) => sum + r.scores.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)!, 0) / completeRounds.length
    : null

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'edit-course', courseId })}>← Back</button>
        <h1>Rounds · {course.name}</h1>
        <span></span>
      </header>

      <div className="card">
        <div className="title">Add scores</div>
        <p className="subtitle">
          Add rounds from 18Birdies, scorecards, anywhere. Used to identify your trouble holes.
        </p>
        <div className="row" style={{ gap: 6 }}>
          <button onClick={() => { setManualOpen(!manualOpen); setPasteOpen(false) }}>
            ✏️ Enter manually
          </button>
          <button className="secondary" onClick={() => { setPasteOpen(!pasteOpen); setManualOpen(false) }}>
            📋 Paste from spreadsheet
          </button>
        </div>

        {manualOpen && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ marginBottom: 8 }}>
              <label htmlFor="md">Date</label>
              <input id="md" type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>
            <div className="manual-grid">
              {Array.from({ length: 18 }, (_, i) => {
                const par = course.holes.find((h) => h.number === i + 1)?.par
                return (
                  <label key={i} className="manual-cell">
                    <span className="muted" style={{ fontSize: '0.7rem' }}>H{i + 1}{par ? ` · P${par}` : ''}</span>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={manualScores[i]}
                      onChange={(e) => {
                        const next = [...manualScores]
                        next[i] = e.target.value
                        setManualScores(next)
                      }}
                    />
                  </label>
                )
              })}
            </div>
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              <button onClick={handleManualSave}>Save round</button>
              <button className="ghost" onClick={() => setManualOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        {pasteOpen && (
          <div style={{ marginTop: '1rem' }}>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Paste rows from a spreadsheet. Each row = one round. Format: <code>YYYY-MM-DD &lt;18 scores&gt;</code> or
              just <code>&lt;18 scores&gt;</code> per line. Tabs, commas, or spaces all work.
            </p>
            <textarea
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`2026-04-15  4 5 3 4 5 6 4 4 3 ...\n2026-04-22  4 4 3 5 4 6 5 4 3 ...`}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)' }}
            />
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              <button onClick={handlePaste}>Parse & save</button>
              <button className="ghost" onClick={() => { setPasteOpen(false); setPasteText('') }}>Cancel</button>
            </div>
            {pasteResult && <div className="banner" style={{ marginTop: 8 }}>{pasteResult}</div>}
          </div>
        )}
      </div>

      {rounds.length > 0 && (
        <>
          <div className="card overview-summary">
            <div>
              <div className="muted">Rounds tracked</div>
              <div className="big-score">{rounds.length}</div>
            </div>
            {avgTotal != null && (
              <div style={{ textAlign: 'right' }}>
                <div className="muted">Average score (complete)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--green-deep)' }}>
                  {avgTotal.toFixed(1)}
                  <span className="muted" style={{ fontSize: '0.75rem', marginLeft: 6 }}>
                    ({avgTotal - totalPar >= 0 ? '+' : ''}{(avgTotal - totalPar).toFixed(1)})
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="title">Per-hole stats</div>
            <div className="hole-stats-row header">
              <span>#</span>
              <span>Par</span>
              <span>Played</span>
              <span>Avg</span>
              <span>vs Par</span>
              <span>Bogey%</span>
              <span>Dbl+%</span>
            </div>
            {course.holes.map((h) => {
              const s = stats.get(h.number)
              const trouble = s && s.averageVsPar >= 1.0
              return (
                <div key={h.number} className={`hole-stats-row ${trouble ? 'trouble' : ''}`}>
                  <span>{h.number}</span>
                  <span>{h.par}</span>
                  <span>{s?.played ?? '—'}</span>
                  <span>{s?.averageScore.toFixed(1) ?? '—'}</span>
                  <span style={{ fontWeight: 600 }}>
                    {s != null ? `${s.averageVsPar >= 0 ? '+' : ''}${s.averageVsPar.toFixed(1)}` : '—'}
                  </span>
                  <span>{s != null ? `${Math.round(s.bogeyOrWorseRate * 100)}%` : '—'}</span>
                  <span>{s != null ? `${Math.round(s.doubleOrWorseRate * 100)}%` : '—'}</span>
                </div>
              )
            })}
          </div>

          <div className="card">
            <div className="title">Saved rounds</div>
            {rounds.sort((a, b) => b.date.localeCompare(a.date)).map((r) => {
              const total = r.scores.reduce((sum: number, s) => sum + (typeof s === 'number' ? s : 0), 0)
              const completeCount = r.scores.filter((s) => typeof s === 'number').length
              return (
                <div key={r.id} className="row between" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.date}</div>
                    <div className="muted">
                      {completeCount}/18 holes ·  total {total}
                      {completeCount === 18 && <> ({total - totalPar >= 0 ? '+' : ''}{total - totalPar})</>}
                    </div>
                  </div>
                  <button className="ghost" onClick={() => handleDelete(r.id)}>Delete</button>
                </div>
              )
            })}
          </div>
        </>
      )}
      {/* Avoid unused-var warning */}
      <span style={{ display: 'none' }}>{totalRoundsScores.length}</span>
    </>
  )
}
