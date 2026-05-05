// HoleMap — top-down view of one hole.
//
// - Esri World Imagery satellite base layer
// - Colored polygon overlays: fairway, bunkers, water hazards, green
// - Draggable tee marker (calls onTeeDrag)
// - Draggable aim points (one per shot, calls onAimDrag)
// - Polylines connecting fromPoint → aimPoint with yardage labels
// - Pin marker at green center
// - Auto-fit view to hole bounding box

import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import type {
  Hole, HoleStrategy, LonLat, Polygon as DomainPolygon,
} from '../types'
import { distanceYards } from '../engine/geometry'

import 'leaflet/dist/leaflet.css'

const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTR = 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

const STYLE_FAIRWAY = { color: '#5fa84a', weight: 1, fillColor: '#7fc56a', fillOpacity: 0.35 }
const STYLE_GREEN = { color: '#0a4d2e', weight: 2, fillColor: '#2d9d6a', fillOpacity: 0.55 }
const STYLE_BUNKER = { color: '#a08245', weight: 1.5, fillColor: '#e8d9b0', fillOpacity: 0.75 }
const STYLE_WATER = { color: '#1c6098', weight: 1.5, fillColor: '#3b86c4', fillOpacity: 0.55 }

interface Props {
  hole: Hole
  strategy: HoleStrategy
  onTeeDrag?: (newPos: LonLat) => void
  onAimDrag?: (shotIndex: number, newPos: LonLat) => void
  onMapTap?: (pos: LonLat) => void  // for "drop a tee here" on holes with no tee
}

function llBounds(points: LonLat[]): L.LatLngBoundsExpression {
  const lats = points.map((p) => p[1])
  const lons = points.map((p) => p[0])
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ]
}

function polyLatLngs(p: DomainPolygon): L.LatLngExpression[] {
  return p.ring.map((c) => [c[1], c[0]])
}

export default function HoleMap({ hole, strategy, onTeeDrag, onAimDrag, onMapTap }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)

  // Collect all interesting points to set the view bounds.
  const allPoints: LonLat[] = useMemo(() => {
    const pts: LonLat[] = []
    pts.push(hole.greenCenter)
    pts.push(strategy.startPoint)
    for (const t of hole.tees) pts.push(t.position)
    for (const ring of [hole.greenPolygon.ring, ...hole.fairwayPolygons.map((p) => p.ring), ...hole.bunkers.map((p) => p.ring), ...hole.waterHazards.map((p) => p.ring)]) {
      pts.push(...ring)
    }
    pts.push(...hole.centerline)
    return pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  }, [hole, strategy.startPoint])

  // One-time map init.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      attributionControl: true,
      zoomControl: false,
    })
    L.tileLayer(ESRI_TILES, { attribution: ESRI_ATTR, maxZoom: 19 }).addTo(map)
    L.control.zoom({ position: 'topright' }).addTo(map)
    layerGroupRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      layerGroupRef.current = null
    }
  }, [])

  // Bind tap handler (changes when onMapTap changes).
  useEffect(() => {
    const m = mapRef.current
    if (!m || !onMapTap) return
    const handler = (e: L.LeafletMouseEvent) => onMapTap([e.latlng.lng, e.latlng.lat])
    m.on('click', handler)
    return () => { m.off('click', handler) }
  }, [onMapTap])

  // Render layers — clear and redraw on every prop change.
  useEffect(() => {
    const map = mapRef.current
    const lg = layerGroupRef.current
    if (!map || !lg) return
    lg.clearLayers()

    // Fairway, water, bunker, green polygons.
    for (const f of hole.fairwayPolygons) {
      L.polygon(polyLatLngs(f), STYLE_FAIRWAY).addTo(lg)
    }
    for (const w of hole.waterHazards) {
      const poly = L.polygon(polyLatLngs(w), STYLE_WATER).addTo(lg)
      poly.bindTooltip('Water', { sticky: true })
    }
    for (const b of hole.bunkers) {
      const poly = L.polygon(polyLatLngs(b), STYLE_BUNKER).addTo(lg)
      poly.bindTooltip('Bunker', { sticky: true })
    }
    if (hole.greenPolygon.ring.length) {
      L.polygon(polyLatLngs(hole.greenPolygon), STYLE_GREEN).addTo(lg)
    }

    // Pin marker at green center.
    if (hole.greenPolygon.ring.length) {
      const pinIcon = L.divIcon({
        className: 'caddy-pin',
        html: '<div style="width:12px;height:12px;border-radius:50%;background:#c8533c;border:2px solid white;box-shadow:0 0 0 1px #0a4d2e"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })
      L.marker([hole.greenCenter[1], hole.greenCenter[0]], { icon: pinIcon, interactive: true })
        .addTo(lg)
        .bindTooltip('Pin', { direction: 'top' })
    }

    // Tee marker — draggable if onTeeDrag provided.
    const teeIcon = L.divIcon({
      className: 'caddy-tee',
      html: '<div style="width:14px;height:14px;border-radius:3px;background:#0a4d2e;border:2px solid white;box-shadow:0 0 0 1px #0a4d2e"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })
    const teeMarker = L.marker([strategy.startPoint[1], strategy.startPoint[0]], {
      icon: teeIcon,
      draggable: !!onTeeDrag,
    }).addTo(lg).bindTooltip(strategy.needsManualTee ? 'Drop tee here' : 'Tee', { direction: 'top' })

    if (onTeeDrag) {
      teeMarker.on('dragend', (e: L.LeafletEvent) => {
        const m = e.target as L.Marker
        const ll = m.getLatLng()
        onTeeDrag([ll.lng, ll.lat])
      })
    }

    // Shot path: from each shot's fromPoint to aimPoint, then a line aim → next.from.
    const shotLineColors = ['#0a4d2e', '#1a7a4c', '#2d9d6a', '#67c08c']
    strategy.recommendations.forEach((rec, i) => {
      const from: L.LatLngTuple = [rec.fromPoint[1], rec.fromPoint[0]]
      const aim: L.LatLngTuple = [rec.aimPoint[1], rec.aimPoint[0]]
      const color = shotLineColors[i % shotLineColors.length]
      L.polyline([from, aim], { color, weight: 3, opacity: 0.85, dashArray: rec.overridden ? undefined : '6 4' }).addTo(lg)

      // Distance label at midpoint.
      const midLat = (from[0] + aim[0]) / 2
      const midLng = (from[1] + aim[1]) / 2
      const yards = Math.round(rec.shotDistance)
      L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'caddy-distance-label',
          html: `<div style="background:rgba(255,255,255,0.92);padding:1px 6px;border-radius:4px;font-size:11px;font-weight:700;color:${color};border:1px solid ${color};white-space:nowrap;">${yards}y</div>`,
          iconSize: [40, 16],
          iconAnchor: [20, 8],
        }),
        interactive: false,
      }).addTo(lg)

      // Aim marker — draggable.
      const aimIcon = L.divIcon({
        className: 'caddy-aim',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};opacity:0.85;border:2px solid white;box-shadow:0 0 0 1px ${color}"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })
      const aimMarker = L.marker(aim, {
        icon: aimIcon,
        draggable: !!onAimDrag,
      }).addTo(lg).bindTooltip(`Shot ${i + 1} aim`, { direction: 'top' })

      if (onAimDrag) {
        aimMarker.on('dragend', (e: L.LeafletEvent) => {
          const m = e.target as L.Marker
          const ll = m.getLatLng()
          onAimDrag(i, [ll.lng, ll.lat])
        })
      }
    })

    // Final segment: last aim → pin (dashed light line).
    const lastRec = strategy.recommendations[strategy.recommendations.length - 1]
    if (lastRec && hole.greenPolygon.ring.length) {
      const lastLanding: L.LatLngTuple = [lastRec.expectedLandingPoint[1], lastRec.expectedLandingPoint[0]]
      const pin: L.LatLngTuple = [hole.greenCenter[1], hole.greenCenter[0]]
      L.polyline([lastLanding, pin], { color: '#888', weight: 1.5, opacity: 0.6, dashArray: '3 4' }).addTo(lg)
      const remainYd = Math.round(distanceYards(lastRec.expectedLandingPoint, hole.greenCenter))
      const midLat = (lastLanding[0] + pin[0]) / 2
      const midLng = (lastLanding[1] + pin[1]) / 2
      L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'caddy-distance-label',
          html: `<div style="background:rgba(255,255,255,0.85);padding:1px 5px;border-radius:4px;font-size:10px;color:#666;white-space:nowrap;">${remainYd}y to pin</div>`,
          iconSize: [50, 14],
          iconAnchor: [25, 7],
        }),
        interactive: false,
      }).addTo(lg)
    }

    // Fit bounds.
    if (allPoints.length) {
      map.fitBounds(llBounds(allPoints), { padding: [24, 24] })
    }
  }, [hole, strategy, onTeeDrag, onAimDrag, allPoints])

  return <div ref={containerRef} style={{ width: '100%', height: '50vh', minHeight: 280, borderRadius: 12, overflow: 'hidden' }} />
}
