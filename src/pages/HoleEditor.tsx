// HoleEditor — manual annotation of one hole's geometry.

import { useCallback, useEffect, useState } from 'react'
import { useNav } from '../store/nav'
import { useCourses } from '../store/courses'
import HoleEditorMap, { type EditMode, type Selection } from '../components/HoleEditorMap'
import type { Hole, LonLat, Polygon as DomainPolygon, TeeMarker } from '../types'
import { centroid, distanceYards } from '../engine/geometry'

interface Props {
  courseId: string
  holeNumber: number
}

const TOOLS: { mode: EditMode; label: string; icon: string }[] = [
  { mode: 'select', label: 'Select', icon: '👆' },
  { mode: 'tee', label: 'Tee', icon: '⛳' },
  { mode: 'fairway', label: 'Fairway', icon: '🟩' },
  { mode: 'bunker', label: 'Bunker', icon: '🟫' },
  { mode: 'water', label: 'Water', icon: '💧' },
  { mode: 'green', label: 'Green', icon: '🟢' },
  { mode: 'ob', label: 'OB', icon: '🚧' },
]

export default function HoleEditor({ courseId, holeNumber }: Props) {
  const go = useNav((s) => s.go)
  const courses = useCourses((s) => s.courses)
  const updateHole = useCourses((s) => s.updateHole)
  const course = courses.find((c) => c.id === courseId)
  const original = course?.holes.find((h) => h.number === holeNumber)

  // Local working copy. We commit to the store on Save.
  const [working, setWorking] = useState<Hole | null>(null)
  const [teePos, setTeePos] = useState<LonLat | null>(null)
  const [mode, setMode] = useState<EditMode>('select')
  const [selection, setSelection] = useState<Selection>(null)
  const [drawing, setDrawing] = useState<LonLat[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!original) return
    setWorking({ ...original })
    setTeePos(original.tees[0]?.position ?? original.centerline[0] ?? original.greenCenter)
    setDirty(false)
    setMode('select')
    setSelection(null)
    setDrawing([])
  }, [original])

  const handleMapTap = useCallback((pos: LonLat) => {
    if (!working) return
    if (mode === 'tee') {
      setTeePos(pos)
      setDirty(true)
      return
    }
    if (mode === 'select') {
      setSelection(null)
      return
    }
    // Drawing mode — append vertex.
    setDrawing((prev) => [...prev, pos])
  }, [mode, working])

  const handleTeeDrag = useCallback((pos: LonLat) => {
    setTeePos(pos)
    setDirty(true)
  }, [])

  const handleDrawVertexDrag = useCallback((idx: number, pos: LonLat) => {
    setDrawing((prev) => prev.map((p, i) => (i === idx ? pos : p)))
  }, [])

  const handleDrawVertexClick = useCallback((idx: number) => {
    // Tap-to-remove the vertex.
    setDrawing((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handlePolygonVertexDrag = useCallback((idx: number, pos: LonLat) => {
    if (!working || !selection) return
    const updateRing = (poly: DomainPolygon): DomainPolygon => {
      const ring = [...poly.ring]
      // The ring may include a closing duplicate vertex (first == last).
      const closed = ring.length > 1
        && ring[0][0] === ring[ring.length - 1][0]
        && ring[0][1] === ring[ring.length - 1][1]
      if (idx < (closed ? ring.length - 1 : ring.length)) {
        ring[idx] = pos
        if (closed && idx === 0) ring[ring.length - 1] = pos
      }
      return { ring }
    }
    const next = { ...working }
    if (selection.kind === 'fairway') {
      next.fairwayPolygons = working.fairwayPolygons.map((p, i) => i === selection.index ? updateRing(p) : p)
    } else if (selection.kind === 'bunker') {
      next.bunkers = working.bunkers.map((p, i) => i === selection.index ? updateRing(p) : p)
    } else if (selection.kind === 'water') {
      next.waterHazards = working.waterHazards.map((p, i) => i === selection.index ? updateRing(p) : p)
    } else if (selection.kind === 'ob') {
      next.outOfBounds = working.outOfBounds.map((p, i) => i === selection.index ? updateRing(p) : p)
    } else if (selection.kind === 'green') {
      const updated = updateRing(working.greenPolygon)
      next.greenPolygon = updated
      if (updated.ring.length) next.greenCenter = centroid(updated.ring)
    }
    setWorking(next)
    setDirty(true)
  }, [working, selection])

  function finishDrawing() {
    if (!working || drawing.length < 3) return
    const ring: LonLat[] = [...drawing, drawing[0]]
    const poly: DomainPolygon = { ring }
    const next = { ...working }
    if (mode === 'fairway') next.fairwayPolygons = [...working.fairwayPolygons, poly]
    else if (mode === 'bunker') next.bunkers = [...working.bunkers, poly]
    else if (mode === 'water') next.waterHazards = [...working.waterHazards, poly]
    else if (mode === 'ob') next.outOfBounds = [...working.outOfBounds, poly]
    else if (mode === 'green') {
      next.greenPolygon = poly
      next.greenCenter = centroid(ring)
    }
    setWorking(next)
    setDrawing([])
    setDirty(true)
    setMode('select')
  }

  function cancelDrawing() { setDrawing([]) }

  function deleteSelected() {
    if (!working || !selection) return
    const next = { ...working }
    if (selection.kind === 'fairway') next.fairwayPolygons = working.fairwayPolygons.filter((_, i) => i !== selection.index)
    else if (selection.kind === 'bunker') next.bunkers = working.bunkers.filter((_, i) => i !== selection.index)
    else if (selection.kind === 'water') next.waterHazards = working.waterHazards.filter((_, i) => i !== selection.index)
    else if (selection.kind === 'ob') next.outOfBounds = working.outOfBounds.filter((_, i) => i !== selection.index)
    else if (selection.kind === 'green') {
      next.greenPolygon = { ring: [] }
      // greenCenter stays — recomputed on next green draw.
    }
    setWorking(next)
    setSelection(null)
    setDirty(true)
  }

  async function save() {
    if (!working || !teePos) return
    // Update tees: replace the first tee's position with the new tee.
    // If no tees existed, create a default "back" tee.
    const tees: TeeMarker[] = working.tees.length
      ? working.tees.map((t, i) => i === 0 ? { ...t, position: teePos } : t)
      : [{ id: 'back', label: 'Back tees', position: teePos }]
    // Recompute yardage for the new tee.
    if (working.greenPolygon.ring.length) {
      tees[0].yardage = Math.round(distanceYards(tees[0].position, working.greenCenter))
    }
    const updates: Partial<Hole> = {
      tees,
      fairwayPolygons: working.fairwayPolygons,
      bunkers: working.bunkers,
      waterHazards: working.waterHazards,
      outOfBounds: working.outOfBounds,
      greenPolygon: working.greenPolygon,
      greenCenter: working.greenCenter,
      confidence: 'high',
    }
    await updateHole(courseId, holeNumber, updates)
    setDirty(false)
    go({ kind: 'hole-view', courseId, holeNumber })
  }

  if (!course || !working || !teePos) {
    return (
      <>
        <header className="topbar">
          <button className="nav-back" onClick={() => go({ kind: 'edit-course', courseId })}>← Back</button>
          <h1>Edit hole</h1>
          <span></span>
        </header>
        <div className="muted">Loading…</div>
      </>
    )
  }

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'hole-view', courseId, holeNumber })}>← Back</button>
        <h1>Edit Hole {holeNumber}</h1>
        <button onClick={save} disabled={!dirty} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          Save
        </button>
      </header>

      <div className="card editor-tools">
        {TOOLS.map((t) => (
          <button
            key={t.mode}
            className={`tool-pill ${mode === t.mode ? 'active' : ''}`}
            onClick={() => { setMode(t.mode); setDrawing([]); setSelection(null) }}
          >
            <span style={{ fontSize: '1.05rem' }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {mode !== 'select' && mode !== 'tee' && (
        <div className="banner">
          <strong>Drawing {mode}.</strong>{' '}
          {drawing.length < 3
            ? `Tap on the map to add points. ${drawing.length}/3 minimum.`
            : `${drawing.length} points placed. Drag points to adjust, tap a point to remove, or tap "Finish".`}
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <button onClick={finishDrawing} disabled={drawing.length < 3}>Finish</button>
            <button
              className="secondary"
              onClick={() => setDrawing((p) => p.slice(0, -1))}
              disabled={drawing.length === 0}
            >
              Undo last
            </button>
            <button className="ghost" onClick={cancelDrawing}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'select' && selection && (
        <div className="banner">
          <strong>Selected:</strong> {selection.kind === 'green' ? 'Green' : `${selection.kind} #${selection.index + 1}`}.{' '}
          Drag the yellow handles on the polygon to reshape it.
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <button className="danger" onClick={deleteSelected}>Delete</button>
            <button className="ghost" onClick={() => setSelection(null)}>Done</button>
          </div>
        </div>
      )}

      {mode === 'tee' && (
        <div className="banner">
          <strong>Tee mode.</strong> Tap the map to drop a new tee position, or drag the existing tee marker.
        </div>
      )}

      <HoleEditorMap
        hole={working}
        teePosition={teePos}
        mode={mode}
        selection={selection}
        drawingPoints={drawing}
        onTeeDrag={handleTeeDrag}
        onMapTap={handleMapTap}
        onSelect={(s) => setSelection(s)}
        onDrawVertexDrag={handleDrawVertexDrag}
        onDrawVertexClick={handleDrawVertexClick}
        onPolygonVertexDrag={handlePolygonVertexDrag}
      />

      <div className="card">
        <div className="muted" style={{ fontSize: '0.85rem' }}>
          <strong>How to edit:</strong>
          <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0 }}>
            <li>Pick a tool (Fairway / Bunker / Water / OB / Green) → tap points around the feature → "Finish"</li>
            <li>While drawing: drag a point to move it, tap a point to remove, "Undo last" to remove the most recent</li>
            <li>Refine an existing shape: pick "Select" → tap the polygon → drag the yellow handles</li>
            <li>Move tee: pick "Tee" tool → tap new spot, or drag the tee marker</li>
            <li>Delete a shape: pick "Select" → tap → "Delete"</li>
            <li>Save when done — affects strategy immediately</li>
          </ul>
        </div>
      </div>
    </>
  )
}
