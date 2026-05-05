// Geometry helpers. Coordinates are [lon, lat]. Distances are returned in YARDS.

import type { LonLat, Polygon } from '../types'

const EARTH_RADIUS_M = 6371000
const M_TO_YD = 1.0936133

export function haversineMeters(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const dφ = ((lat2 - lat1) * Math.PI) / 180
  const dλ = ((lon2 - lon1) * Math.PI) / 180
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function distanceYards(a: LonLat, b: LonLat): number {
  return haversineMeters(a, b) * M_TO_YD
}

export function bearingDeg(from: LonLat, to: LonLat): number {
  const [lon1, lat1] = from
  const [lon2, lat2] = to
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)
  return ((θ * 180) / Math.PI + 360) % 360
}

// Move from point along bearing (deg) for given distance (yards), return new [lon, lat].
export function destination(from: LonLat, bearingDegrees: number, distanceYd: number): LonLat {
  const distM = distanceYd / M_TO_YD
  const δ = distM / EARTH_RADIUS_M
  const θ = (bearingDegrees * Math.PI) / 180
  const φ1 = (from[1] * Math.PI) / 180
  const λ1 = (from[0] * Math.PI) / 180
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
  )
  return [((λ2 * 180) / Math.PI + 540) % 360 - 180, (φ2 * 180) / Math.PI]
}

export function centroid(ring: LonLat[]): LonLat {
  // Simple average of vertices — good enough for small rings (greens, tees, bunkers).
  let lonSum = 0
  let latSum = 0
  let n = 0
  for (let i = 0; i < ring.length - 1; i++) {
    lonSum += ring[i][0]
    latSum += ring[i][1]
    n++
  }
  return [lonSum / n, latSum / n]
}

// Ray-casting point-in-polygon test (lon/lat treated as planar; fine at hole scale).
export function pointInPolygon(p: LonLat, poly: Polygon): boolean {
  const ring = poly.ring
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect = yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Min distance from point to polygon ring (yards). 0 if inside.
export function distanceToPolygonYd(p: LonLat, poly: Polygon): number {
  if (pointInPolygon(p, poly)) return 0
  let min = Infinity
  const ring = poly.ring
  for (let i = 0; i < ring.length - 1; i++) {
    const d = distancePointToSegmentYd(p, ring[i], ring[i + 1])
    if (d < min) min = d
  }
  return min
}

export function distancePointToSegmentYd(p: LonLat, a: LonLat, b: LonLat): number {
  // Project in local equirectangular meters, then back to yards.
  const lat0 = (a[1] + b[1]) / 2
  const cosLat = Math.cos((lat0 * Math.PI) / 180)
  const toXY = (q: LonLat): [number, number] => [
    q[0] * cosLat * 111319.49,
    q[1] * 111319.49,
  ]
  const [px, py] = toXY(p)
  const [ax, ay] = toXY(a)
  const [bx, by] = toXY(b)
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  const distM = Math.hypot(px - cx, py - cy)
  return distM * M_TO_YD
}

// Buffer a polyline into a thin polygon ring of the given half-width (yards).
// Used to convert OSM waterway=stream / creek lines into hazard polygons.
export function bufferLine(line: LonLat[], halfWidthYd: number): LonLat[] {
  if (line.length < 2) return []
  const M_TO_YD_LOCAL = 1.0936133
  const widthM = halfWidthYd / M_TO_YD_LOCAL
  const lat0 = line[Math.floor(line.length / 2)][1]
  const cosLat = Math.cos((lat0 * Math.PI) / 180)
  const toXY = (q: LonLat): [number, number] => [
    q[0] * cosLat * 111319.49,
    q[1] * 111319.49,
  ]
  const fromXY = (p: [number, number]): LonLat => [
    p[0] / (cosLat * 111319.49),
    p[1] / 111319.49,
  ]

  const xy = line.map(toXY)
  const left: [number, number][] = []
  const right: [number, number][] = []
  for (let i = 0; i < xy.length; i++) {
    let nx = 0, ny = 0
    if (i === 0) {
      nx = xy[1][0] - xy[0][0]
      ny = xy[1][1] - xy[0][1]
    } else if (i === xy.length - 1) {
      nx = xy[i][0] - xy[i - 1][0]
      ny = xy[i][1] - xy[i - 1][1]
    } else {
      nx = xy[i + 1][0] - xy[i - 1][0]
      ny = xy[i + 1][1] - xy[i - 1][1]
    }
    const len = Math.hypot(nx, ny) || 1
    const px = -ny / len * widthM
    const py = nx / len * widthM
    left.push([xy[i][0] + px, xy[i][1] + py])
    right.push([xy[i][0] - px, xy[i][1] - py])
  }
  // Build closed ring: left forward + right reversed + close.
  const ring: LonLat[] = [
    ...left.map(fromXY),
    ...right.reverse().map(fromXY),
  ]
  ring.push(ring[0])
  return ring
}

// Bounding box around a list of points, expanded by `paddingYd`.
export function bboxAround(points: LonLat[], paddingYd: number): { south: number; west: number; north: number; east: number } {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity
  for (const [lon, lat] of points) {
    if (lat < south) south = lat
    if (lat > north) north = lat
    if (lon < west) west = lon
    if (lon > east) east = lon
  }
  const padDeg = paddingYd / 1760 / 60 // ~1 minute lat ≈ 1 nautical mile ≈ 2025 yd; rough
  return { south: south - padDeg, west: west - padDeg, north: north + padDeg, east: east + padDeg }
}
