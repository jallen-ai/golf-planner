import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'
import { usePlayer } from '../store/player'

export default function Home() {
  const go = useNav((s) => s.go)
  const courses = useCourses((s) => s.courses)
  const player = usePlayer((s) => s.profile)

  return (
    <>
      <header className="topbar">
        <h1>Caddy</h1>
        <span className="muted">Pre-round strategy</span>
      </header>

      <div className="card">
        <div className="title">Plan a round</div>
        <p className="subtitle">Pick a saved course to generate a strategy card.</p>
        {courses.length === 0 ? (
          <div className="empty-state">
            <div className="icon">⛳</div>
            <p>No courses yet.</p>
            <button onClick={() => go({ kind: 'import-course' })}>Add your first course</button>
          </div>
        ) : (
          <div className="col">
            {courses.map((c) => (
              <div key={c.id} className="row between" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div className="muted">{c.holes.length} holes · {c.source}</div>
                </div>
                <button onClick={() => go({ kind: 'plan-round', courseId: c.id })}>Plan</button>
              </div>
            ))}
            <button className="secondary" onClick={() => go({ kind: 'import-course' })}>+ Add course</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="title">Your profile</div>
        {player ? (
          <div className="row between">
            <div>
              <div>Handicap: <strong>{player.handicap}</strong></div>
              <div className="muted">Common miss: {player.dominantMiss}</div>
            </div>
            <button className="secondary" onClick={() => go({ kind: 'player' })}>Edit bag</button>
          </div>
        ) : (
          <div className="muted">Loading…</div>
        )}
      </div>
    </>
  )
}
