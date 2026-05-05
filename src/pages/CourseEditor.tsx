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
        <div className="title">Round history</div>
        <p className="subtitle">Track your scores at this course to identify trouble holes.</p>
        <button className="secondary" onClick={() => go({ kind: 'rounds', courseId })}>
          📊 Manage round history
        </button>
      </div>

      <div className="card">
        <div className="title">Holes</div>
        <p className="subtitle">Source: {course.source} · {course.holes.length} holes — tap any hole to edit its geometry.</p>
        {course.holes.map((h) => (
          <button
            key={h.number}
            className="scorecard-row"
            onClick={() => go({ kind: 'edit-hole', courseId, holeNumber: h.number })}
          >
            <span className="hole-num">{h.number}</span>
            <div className="scorecard-meta">
              <div className="scorecard-title">
                {h.name ?? `Hole ${h.number}`}
                <span className="par-pill">Par {h.par}</span>
              </div>
              <div className="muted scorecard-sub">
                {h.tees.length} tee{h.tees.length !== 1 ? 's' : ''} ·
                {' '}{h.fairwayPolygons.length} fwy · {h.bunkers.length} bnk · {h.waterHazards.length} wtr ·
                {' '}{h.greenPolygon.ring.length ? 'grn ✓' : 'grn ✗'}
                {h.confidence === 'low' && <> · ⚠ low confidence</>}
              </div>
            </div>
            <span className="scorecard-chevron">›</span>
          </button>
        ))}
      </div>
    </>
  )
}
