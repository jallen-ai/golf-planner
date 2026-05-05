// Core domain types. All distances in YARDS, all coordinates [lon, lat] (GeoJSON convention).

export type LonLat = [number, number]

export type ClubId =
  | 'driver' | '3w' | '5w' | 'hybrid'
  | '3i' | '4i' | '5i' | '6i' | '7i' | '8i' | '9i'
  | 'pw' | 'gw' | 'sw' | 'lw'
  | 'putter'

export const CLUB_ORDER: ClubId[] = [
  'driver', '3w', '5w', 'hybrid',
  '3i', '4i', '5i', '6i', '7i', '8i', '9i',
  'pw', 'gw', 'sw', 'lw',
]

export const CLUB_LABELS: Record<ClubId, string> = {
  driver: 'Driver', '3w': '3 Wood', '5w': '5 Wood', hybrid: 'Hybrid',
  '3i': '3 Iron', '4i': '4 Iron', '5i': '5 Iron', '6i': '6 Iron',
  '7i': '7 Iron', '8i': '8 Iron', '9i': '9 Iron',
  pw: 'PW', gw: 'GW', sw: 'SW', lw: 'LW',
  putter: 'Putter',
}

export interface ClubProfile {
  id: ClubId
  inBag: boolean
  carry: number             // average carry (yards)
  rollout: number           // expected rollout on neutral fairway (yards)
  sigmaLong: number         // 1σ long (yards)
  sigmaShort: number        // 1σ short (yards)
  sigmaLeft: number         // 1σ left (yards)
  sigmaRight: number        // 1σ right (yards)
}

export type MissBias = 'straight' | 'fade' | 'draw' | 'push' | 'pull' | 'slice' | 'hook'

export interface PlayerProfile {
  handicap: number          // course handicap index, 0–36
  dominantMiss: MissBias
  bag: Record<ClubId, ClubProfile>
  updatedAt: number
}

// --- Course geometry ---

export type Lie = 'tee' | 'fairway' | 'rough' | 'sand' | 'recovery' | 'green' | 'water' | 'ob'

export interface Polygon {
  // Ring of [lon, lat] points, closed (first == last).
  ring: LonLat[]
}

export interface TeeMarker {
  id: string                // e.g. "blue", "white", "red"
  color?: string            // hex
  position: LonLat          // representative point (centroid of tee polygon)
  yardage?: number          // scorecard yardage if known
}

export interface Hole {
  number: number            // 1..18
  par: 3 | 4 | 5 | 6
  handicap?: number         // stroke index 1..18
  name?: string
  centerline: LonLat[]      // OSM golf=hole way (tee → green path); used to associate features
  tees: TeeMarker[]
  greenPolygon: Polygon
  greenCenter: LonLat
  fairwayPolygons: Polygon[]
  bunkers: Polygon[]
  waterHazards: Polygon[]   // includes lateral water; treated as penalty
  outOfBounds: Polygon[]    // we don't get these from OSM reliably; usually user-added
  confidence: 'high' | 'medium' | 'low'  // based on how much was auto-vs-manual
}

export interface Course {
  id: string
  name: string
  location?: { lat: number; lon: number }
  holes: Hole[]
  source: 'overpass' | 'manual' | 'mixed'
  importedAt: number
  updatedAt: number
}

// --- Strategy / round planning ---

export interface ShotRecommendation {
  shotIndex: number         // 0 = tee shot
  club: ClubId
  aimPoint: LonLat
  expectedLie: Lie
  expectedDistanceToPin: number  // yards, after this shot
  expectedStrokesAfter: number   // SG: expected strokes to hole out from resulting position
  rationale: string
}

export interface HoleStrategy {
  holeNumber: number
  teeId: string
  recommendations: ShotRecommendation[]
  expectedScore: number
  parScore: number          // score relative to par
  confidence: 'high' | 'medium' | 'low'
}

export interface RoundPlan {
  id: string
  courseId: string
  courseName: string
  teeId: string
  playerSnapshot: PlayerProfile
  strategies: HoleStrategy[]
  expectedScore: number
  generatedAt: number
}
