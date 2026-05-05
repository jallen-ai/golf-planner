// HoleEditorMap — like HoleMap, but supports drawing/editing polygons.
//
// Modes:
//   - 'select' : tap a polygon to select it; show delete handle
//   - 'tee'    : drag tee marker
//   - 'fairway' / 'bunker' / 'water' / 'ob' / 'green' : tap to add vertices,
//     "Finish" button closes the polygon and adds it to the layer
//
// Vertex editing of existing polygons is not supported (delete & redraw instead)
// for simplicity.

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import type { Hole, LonLat, Polygon as DomainPolygon } from '../types'

import 'leaflet/dist/leaflet.css'

const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTR = 'Tiles &copy; Esri'

const STYLE_FAIRWAY = { color: '#5fa84a', weight: 1, fillColor: '#7fc56a', fillOpacity: 0.35 }
const STYLE_GREEN = { color: '#0a4d2e', weight: 2, fillColor: '#2d9d6a', fillOpacity: 0.55 }
const STYLE_BUNKER = { color: '#a08245', weight: 1.5, fillColor: '#e8d9b0', fillOpacity: 0.75 }
const STYLE_WATER = { color: '#1c6098', weight: 1.5, fillColor: '#3b86c4', fillOpacity: 0.55 }
const STYLE_OB = { color: '#c8533c', weight: 2, fillColor: '#c8533c', fillOpacity: 0.15, dashArray: '6 4' }

export type EditMode = 'select' | 'tee' | 'fairway' | 'bunker' | 'water' | 'ob' | 'green'

export type Selection =
  | { kind: 'fairway'; index: number }
  | { kind: 'bunker'; index: number }
  | { kind: 'water'; index: number }
  | { kind: 'ob'; index: number }
  | { kind: 'green' }
  | null

interface Props {
  hole: Hole
  teePosition: LonLat
  mode: EditMode
  selection: Selection
  drawingPoints: LonLat[]   // current in-progress polygon
  onTeeDrag: (pos: LonLat) => void
  onMapTap: (pos: LonLat) => void
  onSelect: (sel: Selection) => void
}

function polyLatLngs(p: DomainPolygon): L.LatLngExpression[] {
  return p.ring.map((c) => [c[1], c[0]])
}
function ringLatLngs(r: LonLat[]): L.LatLngExpression[] {
  return r.map((c) => [c[1], c[0]])
}

export default function HoleEditorMap({
  hole, teePosition, mode, selection, drawingPoints, onTeeDrag, onMapTap, onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)
  const drawingLayerRef = useRef<L.LayerGroup | null>(null)

  const allPoints: LonLat[] = useMemo(() => {
    const pts: LonLat[] = [teePosition, hole.greenCenter, ...hole.centerline]
    for (const t of hole.tees) pts.push(t.position)
    for (const ring of [
      hole.greenPolygon.ring,
      ...hole.fairwayPolygons.map((p) => p.ring),
      ...hole.bunkers.map((p) => p.ring),
      ...hole.waterHazards.map((p) => p.ring),
      ...hole.outOfBounds.map((p) => p.ring),
    ]) {
      pts.push(...ring)
    }
    return pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  }, [hole, teePosition])

  // Initialize map.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true })
    L.tileLayer(ESRI_TILES, { attribution: ESRI_ATTR, maxZoom: 19 }).addTo(map)
    L.control.zoom({ position: 'topright' }).addTo(map)
    layerGroupRef.current = L.layerGroup().addTo(map)
    drawingLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      layerGroupRef.current = null
      drawingLayerRef.current = null
    }
  }, [])

  // Wire map click to onMapTap (always — semantics depend on parent's mode).
  useEffect(() => {
    const m = mapRef.current
    if (!m) return
    const handler = (e: L.LeafletMouseEvent) => onMapTap([e.latlng.lng, e.latlng.lat])
    m.on('click', handler)
    return () => { m.off('click', handler) }
  }, [onMapTap])

  // Render existing polygons + tee.
  useEffect(() => {
    const map = mapRef.current
    const lg = layerGroupRef.current
    if (!map || !lg) return
    lg.clearLayers()

    const renderPoly = (poly: DomainPolygon, base: L.PathOptions, sel: Selection) => {
      const isSelected = !!sel
      const polyLayer = L.polygon(polyLatLngs(poly), {
        ...base,
        weight: isSelected ? 4 : (base.weight ?? 1),
        color: isSelected ? '#ffeb3b' : base.color,
      }).addTo(lg)
      polyLayer.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e)
        if (mode !== 'select') return
        if (sel) onSelect(sel)
      })
    }

    hole.fairwayPolygons.forEach((p, i) => {
      const sel: Selection = { kind: 'fairway', index: i }
      const isSel = selection?.kind === 'fairway' && selection.index === i
      renderPoly(p, STYLE_FAIRWAY, isSel ? sel : sel) // pass sel; isSel computed inside
      void isSel
    })
    hole.bunkers.forEach((p, i) => {
      const sel: Selection = { kind: 'bunker', index: i }
      renderPoly(p, STYLE_BUNKER, sel)
    })
    hole.waterHazards.forEach((p, i) => {
      const sel: Selection = { kind: 'water', index: i }
      renderPoly(p, STYLE_WATER, sel)
    })
    hole.outOfBounds.forEach((p, i) => {
      const sel: Selection = { kind: 'ob', index: i }
      renderPoly(p, STYLE_OB, sel)
    })
    if (hole.greenPolygon.ring.length) {
      const sel: Selection = { kind: 'green' }
      renderPoly(hole.greenPolygon, STYLE_GREEN, sel)
    }

    // Highlight selected polygon.
    if (selection) {
      let poly: DomainPolygon | null = null
      let style: L.PathOptions = STYLE_FAIRWAY
      if (selection.kind === 'fairway') { poly = hole.fairwayPolygons[selection.index]; style = STYLE_FAIRWAY }
      else if (selection.kind === 'bunker') { poly = hole.bunkers[selection.index]; style = STYLE_BUNKER }
      else if (selection.kind === 'water') { poly = hole.waterHazards[selection.index]; style = STYLE_WATER }
      else if (selection.kind === 'ob') { poly = hole.outOfBounds[selection.index]; style = STYLE_OB }
      else if (selection.kind === 'green') { poly = hole.greenPolygon; style = STYLE_GREEN }
      if (poly) {
        L.polygon(polyLatLngs(poly), {
          ...style,
          weight: 4,
          color: '#ffeb3b',
          fillOpacity: (style.fillOpacity ?? 0.3) + 0.15,
        }).addTo(lg)
      }
    }

    // Pin marker.
    if (hole.greenPolygon.ring.length) {
      L.marker([hole.greenCenter[1], hole.greenCenter[0]], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:10px;height:10px;border-radius:50%;background:#c8533c;border:2px solid white"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
        interactive: false,
      }).addTo(lg)
    }

    // Tee marker (always draggable).
    const teeMarker = L.marker([teePosition[1], teePosition[0]], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:14px;height:14px;border-radius:3px;background:#0a4d2e;border:2px solid white"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      draggable: true,
    }).addTo(lg).bindTooltip('Tee', { direction: 'top' })
    teeMarker.on('dragend', (e: L.LeafletEvent) => {
      const m = e.target as L.Marker
      const ll = m.getLatLng()
      onTeeDrag([ll.lng, ll.lat])
    })

    if (allPoints.length) {
      map.fitBounds([
        [Math.min(...allPoints.map((p) => p[1])), Math.min(...allPoints.map((p) => p[0]))],
        [Math.max(...allPoints.map((p) => p[1])), Math.max(...allPoints.map((p) => p[0]))],
      ], { padding: [24, 24] })
    }
  }, [hole, teePosition, mode, selection, allPoints, onSelect, onTeeDrag])

  // Render in-progress drawing.
  useEffect(() => {
    const dl = drawingLayerRef.current
    if (!dl) return
    dl.clearLayers()
    if (drawingPoints.length === 0 || mode === 'select' || mode === 'tee') return
    const colorByMode = {
      fairway: '#5fa84a', bunker: '#a08245', water: '#1c6098',
      ob: '#c8533c', green: '#0a4d2e',
    }[mode] ?? '#888'
    if (drawingPoints.length === 1) {
      L.circleMarker([drawingPoints[0][1], drawingPoints[0][0]], {
        radius: 5, color: colorByMode, fillColor: colorByMode, fillOpacity: 1,
      }).addTo(dl)
    } else {
      L.polygon(ringLatLngs([...drawingPoints, drawingPoints[0]]), {
        color: colorByMode,
        weight: 2,
        fillColor: colorByMode,
        fillOpacity: 0.2,
        dashArray: '4 4',
      }).addTo(dl)
      drawingPoints.forEach((p) => {
        L.circleMarker([p[1], p[0]], {
          radius: 4, color: colorByMode, fillColor: 'white', fillOpacity: 1, weight: 2,
        }).addTo(dl)
      })
    }
  }, [drawingPoints, mode])

  const cursor: string = mode === 'select' ? 'pointer' : mode === 'tee' ? 'grab' : 'crosshair'
  return <div ref={containerRef} style={{ width: '100%', height: '52vh', minHeight: 320, borderRadius: 12, overflow: 'hidden', cursor }} />
}

// Export a state hook helper to keep parent code clean.
export function useEditorState(hole: Hole) {
  const [mode, setMode] = useState<EditMode>('select')
  const [selection, setSelection] = useState<Selection>(null)
  const [drawingPoints, setDrawingPoints] = useState<LonLat[]>([])
  const [teePosition, setTeePosition] = useState<LonLat>(
    hole.tees[0]?.position ?? hole.centerline[0] ?? hole.greenCenter,
  )
  return { mode, setMode, selection, setSelection, drawingPoints, setDrawingPoints, teePosition, setTeePosition }
}
