import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'

export default function CourseListPage() {
  const go = useNav((s) => s.go)
  const courses = useCourses((s) => s.courses)
  const remove = useCourses((s) => s.remove)

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'home' })}>← Back</button>
        <h1>Courses</h1>
        <button className="ghost" onClick={() => go({ kind: 'import-course' })}>+ Add</button>
      </header>

      {courses.length === 0 ? (
        <div className="empty-state">
          <div className="icon">⛳</div>
          <p>No courses saved.</p>
          <button onClick={() => go({ kind: 'import-course' })}>Import a course</button>
        </div>
      ) : (
        courses.map((c) => (
          <div key={c.id} className="card">
            <div className="row between">
              <div>
                <div className="title">{c.name}</div>
                <div className="muted">{c.holes.length} holes · {c.source}</div>
              </div>
              <div className="row" style={{ gap: '0.4rem' }}>
                <button className="secondary" onClick={() => go({ kind: 'plan-round', courseId: c.id })}>Plan</button>
                <button className="ghost" onClick={() => go({ kind: 'edit-course', courseId: c.id })}>Edit</button>
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm(`Delete ${c.name}?`)) remove(c.id)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  )
}
