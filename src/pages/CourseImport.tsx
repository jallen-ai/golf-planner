import { useState } from 'react'
import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'
import { fetchCourseFromOverpass } from '../engine/overpass'

export default function CourseImportPage() {
  const go = useNav((s) => s.go)
  const save = useCourses((s) => s.save)
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [radiusYd, setRadiusYd] = useState('900')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [success, setSuccess] = useState<string | null>(null)

  async function importCourse() {
    setError(null)
    setWarnings([])
    setSuccess(null)
    setBusy(true)
    try {
      const latNum = Number(lat)
      const lonNum = Number(lon)
      const r = Number(radiusYd)
      if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) throw new Error('Enter valid coordinates.')
      // Convert radius to degrees (approx — works near typical latitudes).
      const dLat = r / 1760 / 60.04 // ~1' lat ≈ 2025 yd
      const dLon = dLat / Math.cos((latNum * Math.PI) / 180)
      const bbox = {
        south: latNum - dLat,
        north: latNum + dLat,
        west: lonNum - dLon,
        east: lonNum + dLon,
      }
      const { course, warnings: ws } = await fetchCourseFromOverpass({ name, bbox })
      if (!course.holes.length) throw new Error('No golf holes found in this area. Try widening the radius or check coordinates.')
      await save(course)
      setWarnings(ws)
      setSuccess(`Imported "${course.name}" with ${course.holes.length} holes.`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'courses' })}>← Back</button>
        <h1>Import course</h1>
        <span></span>
      </header>

      <div className="card">
        <div className="title">From OpenStreetMap</div>
        <p className="subtitle">
          Find your course's lat/lon (Google Maps → right-click → "What's here?"), then we'll pull hole geometry from OSM.
        </p>
        <div className="col">
          <div>
            <label htmlFor="name">Course name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bethpage Black" />
          </div>
          <div className="field-group">
            <div>
              <label htmlFor="lat">Latitude</label>
              <input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="40.7375" />
            </div>
            <div>
              <label htmlFor="lon">Longitude</label>
              <input id="lon" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-73.4673" />
            </div>
          </div>
          <div>
            <label htmlFor="radius">Search radius (yards)</label>
            <input
              id="radius"
              type="number"
              min={300}
              max={3000}
              step={100}
              value={radiusYd}
              onChange={(e) => setRadiusYd(e.target.value)}
            />
          </div>
          <button onClick={importCourse} disabled={busy || !lat || !lon}>
            {busy ? 'Searching OSM…' : 'Import from OpenStreetMap'}
          </button>
        </div>

        {error && <div className="banner error">{error}</div>}
        {success && <div className="banner success">{success}</div>}
        {warnings.length > 0 && (
          <div className="banner">
            <strong>{warnings.length} warning{warnings.length > 1 ? 's' : ''}:</strong>
            <ul style={{ margin: '0.3rem 0 0 1rem', padding: 0, fontSize: '0.85rem' }}>
              {warnings.slice(0, 6).map((w, i) => (<li key={i}>{w}</li>))}
              {warnings.length > 6 && <li>…and {warnings.length - 6} more</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="card">
        <div className="title">Manual annotation</div>
        <p className="subtitle">
          Coming soon — for courses without OSM data, draw tees, fairways, hazards, and greens on a satellite image.
        </p>
        <button className="secondary" disabled>Draw on satellite (Phase 2)</button>
      </div>
    </>
  )
}
