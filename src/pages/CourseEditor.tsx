import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'

interface Props { courseId: string }

export default function CourseEditorPage({ courseId }: Props) {
  const go = useNav((s) => s.go)
  const courses = useCourses((s) => s.courses)
  const course = courses.find((c) => c.id === courseId)

  if (!course) {
    return (
      <>
        <header className="topbar">
          <button className="nav-back" onClick={() => go({ kind: 'courses' })}>← Back</button>
          <h1>Course</h1>
          <span></span>
        </header>
        <div className="empty-state">Course not found.</div>
      </>
    )
  }

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'courses' })}>← Back</button>
        <h1>{course.name}</h1>
        <span></span>
      </header>

      <div className="card">
        <div className="title">Hole inventory</div>
        <p className="subtitle">Source: {course.source} · {course.holes.length} holes</p>
        {course.holes.map((h) => (
          <div key={h.number} className={`shot-line confidence-${h.confidence}`} style={{ padding: '0.4rem 0' }}>
            <span className="num">{h.number}</span>
            <div>
              <div style={{ fontWeight: 600 }}>
                {h.name ?? `Hole ${h.number}`}
                <span className="par-pill">Par {h.par}</span>
              </div>
              <div className="muted">
                {h.tees.length} tee{h.tees.length !== 1 ? 's' : ''} ·
                {' '}{h.fairwayPolygons.length} fairway · {h.bunkers.length} bunker · {h.waterHazards.length} water ·
                {' '}{h.greenPolygon.ring.length ? 'green ✓' : 'green ✗'}
              </div>
            </div>
          </div>
        ))}
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Phase 2: tap a hole to fix or annotate missing geometry on a satellite map.
        </p>
      </div>
    </>
  )
}
