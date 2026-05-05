// Overpass API client. Pulls golf=* features inside a bounding box around a course
// and assembles them into our Course/Hole types.

import { centroid, distancePointToSegmentYd, distanceYards } from './geometry'
import type { Course, Hole, LonLat, Polygon, TeeMarker } from '../types'

const OVERPASS = 'https://overpass-api.de/api/interpreter'

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
  lat?: number
  lon?: number
}

interface OverpassResponse {
  elements: OverpassElement[]
}

function distancePointToSegYd(p: LonLat, a: LonLat, b: LonLat): number {
  return distancePointToSegmentYd(p, a, b)
}

function distancePointToLineYd(p: LonLat, line: LonLat[]): number {
  let min = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const d = distancePointToSegYd(p, line[i], line[i + 1])
    if (d < min) min = d
  }
  return min
}

function geomToRing(g: { lat: number; lon: number }[]): LonLat[] {
  const ring: LonLat[] = g.map(({ lat, lon }) => [lon, lat])
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0])
  }
  return ring
}

function geomToLine(g: { lat: number; lon: number }[]): LonLat[] {
  return g.map(({ lat, lon }) => [lon, lat])
}

export interface ImportResult {
  course: Course
  warnings: string[]
}

export async function fetchCourseFromOverpass(args: {
  name: string
  bbox: { south: number; west: number; north: number; east: number }
}): Promise<ImportResult> {
  const { south, west, north, east } = args.bbox
  const bb = `${south},${west},${north},${east}`
  // Pull holes (ways), and all polygon features that might belong to those holes.
  const query = `
    [out:json][timeout:45];
    (
      way["golf"="hole"](${bb});
      way["golf"="fairway"](${bb});
      way["golf"="green"](${bb});
      way["golf"="tee"](${bb});
      way["golf"="bunker"](${bb});
      way["golf"="water_hazard"](${bb});
      way["golf"="lateral_water_hazard"](${bb});
      way["golf"="rough"](${bb});
    );
    out tags geom;
  `.trim()

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  const data = (await res.json()) as OverpassResponse

  const warnings: string[] = []
  const holesRaw = data.elements.filter((e) => e.tags?.golf === 'hole' && e.geometry)
  if (!holesRaw.length) {
    warnings.push('No golf=hole ways found in this area. You may need to draw the holes manually.')
  }

  // Group by ref + course name to handle adjacent courses.
  // Keep holes whose ref is 1..18 and pick the most-tagged set.
  const candidatesByRef = new Map<number, OverpassElement[]>()
  for (const h of holesRaw) {
    const ref = parseInt(h.tags!.ref ?? '', 10)
    if (!Number.isFinite(ref) || ref < 1 || ref > 18) continue
    const list = candidatesByRef.get(ref) ?? []
    list.push(h)
    candidatesByRef.set(ref, list)
  }

  // If multiple courses share a bbox, ask user later. For now, pick by majority golf:course:name.
  const nameCounts = new Map<string, number>()
  for (const list of candidatesByRef.values()) {
    for (const h of list) {
      const c = h.tags?.['golf:course:name'] ?? h.tags?.['name'] ?? ''
      nameCounts.set(c, (nameCounts.get(c) ?? 0) + 1)
    }
  }
  const dominantCourse = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

  const chosenHoles: OverpassElement[] = []
  for (const [, list] of candidatesByRef) {
    const matching = list.find((h) => (h.tags?.['golf:course:name'] ?? h.tags?.['name'] ?? '') === dominantCourse) ?? list[0]
    chosenHoles.push(matching)
  }
  chosenHoles.sort((a, b) => parseInt(a.tags!.ref!, 10) - parseInt(b.tags!.ref!, 10))

  const greens = data.elements.filter((e) => e.tags?.golf === 'green' && e.geometry)
  const tees = data.elements.filter((e) => e.tags?.golf === 'tee' && e.geometry)
  const fairways = data.elements.filter((e) => e.tags?.golf === 'fairway' && e.geometry)
  const bunkers = data.elements.filter((e) => e.tags?.golf === 'bunker' && e.geometry)
  const waters = data.elements.filter(
    (e) => (e.tags?.golf === 'water_hazard' || e.tags?.golf === 'lateral_water_hazard') && e.geometry,
  )

  const PROXIMITY_YD = 35 // a feature within 35y of the hole centerline is part of that hole

  function ringForFeature(e: OverpassElement): Polygon {
    return { ring: geomToRing(e.geometry!) }
  }

  function nearestHoleAttach(c: LonLat): number | null {
    let best = -1
    let bestDist = Infinity
    for (let i = 0; i < chosenHoles.length; i++) {
      const line = geomToLine(chosenHoles[i].geometry!)
      const d = distancePointToLineYd(c, line)
      if (d < bestDist) { bestDist = d; best = i }
    }
    return bestDist <= PROXIMITY_YD ? best : null
  }

  const holes: Hole[] = chosenHoles.map((h) => {
    const ref = parseInt(h.tags!.ref!, 10)
    const par = parseInt(h.tags!.par ?? '4', 10) as Hole['par']
    const handicap = h.tags?.handicap ? parseInt(h.tags.handicap, 10) : undefined
    const centerline = geomToLine(h.geometry!)
    return {
      number: ref,
      par,
      handicap,
      name: h.tags?.name,
      centerline,
      tees: [],
      greenPolygon: { ring: [] },
      greenCenter: centerline[centerline.length - 1] ?? [0, 0],
      fairwayPolygons: [],
      bunkers: [],
      waterHazards: [],
      outOfBounds: [],
      confidence: 'high',
    }
  })

  // Attach features by spatial proximity to each hole's centerline.
  for (const g of greens) {
    const ring = ringForFeature(g)
    const c = centroid(ring.ring)
    const idx = nearestHoleAttach(c)
    if (idx == null) continue
    holes[idx].greenPolygon = ring
    holes[idx].greenCenter = c
  }
  for (const t of tees) {
    const ring = ringForFeature(t)
    const c = centroid(ring.ring)
    const idx = nearestHoleAttach(c)
    if (idx == null) continue
    const id = (t.tags?.ref ?? t.tags?.name ?? `tee-${t.id}`).toString().toLowerCase()
    const marker: TeeMarker = { id, position: c, color: t.tags?.colour }
    holes[idx].tees.push(marker)
  }
  for (const f of fairways) {
    const ring = ringForFeature(f)
    const c = centroid(ring.ring)
    const idx = nearestHoleAttach(c)
    if (idx == null) continue
    holes[idx].fairwayPolygons.push(ring)
  }
  for (const b of bunkers) {
    const ring = ringForFeature(b)
    const c = centroid(ring.ring)
    const idx = nearestHoleAttach(c)
    if (idx == null) continue
    holes[idx].bunkers.push(ring)
  }
  for (const w of waters) {
    const ring = ringForFeature(w)
    const c = centroid(ring.ring)
    const idx = nearestHoleAttach(c)
    if (idx == null) continue
    holes[idx].waterHazards.push(ring)
  }

  // Confidence: high if hole has tees + green + fairway, medium if missing fairway, low otherwise.
  for (const h of holes) {
    const hasTees = h.tees.length > 0
    const hasGreen = h.greenPolygon.ring.length > 0
    const hasFairway = h.fairwayPolygons.length > 0
    h.confidence = hasTees && hasGreen && hasFairway ? 'high' : hasGreen && hasTees ? 'medium' : 'low'
    if (!hasTees) warnings.push(`Hole ${h.number}: no tee polygons found.`)
    if (!hasGreen) warnings.push(`Hole ${h.number}: no green polygon found.`)
  }

  // Compute scorecard yardages from geometry: tee centroid → green center.
  for (const h of holes) {
    if (!h.greenPolygon.ring.length) continue
    for (const t of h.tees) {
      t.yardage = Math.round(distanceYards(t.position, h.greenCenter))
    }
  }

  const course: Course = {
    id: `course-${Date.now()}`,
    name: args.name || dominantCourse || 'Unnamed course',
    location: { lat: (south + north) / 2, lon: (west + east) / 2 },
    holes,
    source: 'overpass',
    importedAt: Date.now(),
    updatedAt: Date.now(),
  }

  return { course, warnings }
}
