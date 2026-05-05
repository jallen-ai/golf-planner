import { useEffect } from 'react'
import { useNav } from './store/nav'
import { usePlayer } from './store/player'
import { useCourses } from './store/courses'
import Home from './pages/Home'
import PlayerProfilePage from './pages/PlayerProfile'
import CourseListPage from './pages/CourseList'
import CourseImportPage from './pages/CourseImport'
import CourseEditorPage from './pages/CourseEditor'
import CourseOverviewPage from './pages/CourseOverview'
import HoleViewPage from './pages/HoleView'
import HoleEditorPage from './pages/HoleEditor'
import RoundsPage from './pages/Rounds'

function App() {
  const view = useNav((s) => s.view)
  const go = useNav((s) => s.go)
  const loadPlayer = usePlayer((s) => s.load)
  const loadCourses = useCourses((s) => s.load)

  useEffect(() => {
    loadPlayer()
    loadCourses()
  }, [loadPlayer, loadCourses])

  let page: React.ReactNode
  switch (view.kind) {
    case 'home': page = <Home />; break
    case 'player': page = <PlayerProfilePage />; break
    case 'courses': page = <CourseListPage />; break
    case 'import-course': page = <CourseImportPage />; break
    case 'edit-course': page = <CourseEditorPage courseId={view.courseId} />; break
    case 'course-overview': page = <CourseOverviewPage courseId={view.courseId} />; break
    case 'hole-view': page = <HoleViewPage courseId={view.courseId} holeNumber={view.holeNumber} />; break
    case 'edit-hole': page = <HoleEditorPage courseId={view.courseId} holeNumber={view.holeNumber} />; break
    case 'rounds': page = <RoundsPage courseId={view.courseId} />; break
  }

  return (
    <div className="app">
      {page}
      <nav className="tabbar" aria-label="Primary">
        <button
          className={view.kind === 'home' ? 'active' : ''}
          onClick={() => go({ kind: 'home' })}
        >
          <span className="icon">🏠</span>
          Home
        </button>
        <button
          className={view.kind === 'courses' || view.kind === 'import-course' || view.kind === 'edit-course' ? 'active' : ''}
          onClick={() => go({ kind: 'courses' })}
        >
          <span className="icon">⛳</span>
          Courses
        </button>
        <button
          className={view.kind === 'player' ? 'active' : ''}
          onClick={() => go({ kind: 'player' })}
        >
          <span className="icon">🎒</span>
          My Bag
        </button>
      </nav>
    </div>
  )
}

export default App
