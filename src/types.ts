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
  id: string                // group id — e.g. "blue", "white", "back", "middle", "forward"
  label?: string            // display label — e.g. "Blue", "Back tees"
  color?: string            // hex if known
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
  fromPoint: LonLat         // start of this shot
  aimPoint: LonLat          // where we're aiming
  expectedLandingPoint: LonLat  // most likely landing
  expectedLie: Lie
  expectedDistanceToPin: number  // yards from landing to pin
  expectedStrokesAfter: number   // SG to hole out from landing
  shotDistance: number      // yards (from → aim)
  rationale: string
  overridden: boolean       // user adjusted this shot
}

export interface ShotOverride {
  fixedAim?: LonLat
  fixedClub?: ClubId
}

export interface HoleOverride {
  teePosition?: LonLat              // user-dragged tee start
  shotOverrides?: ShotOverride[]    // indexed by shotIndex
  pinPosition?: LonLat              // future: pin override
}

export interface HoleStrategy {
  holeNumber: number
  teeId: string
  startPoint: LonLat              // where the plan starts (tee or override)
  recommendations: ShotRecommendation[]
  expectedScore: number
  parScore: number          // score relative to par
  confidence: 'high' | 'medium' | 'low'
  needsManualTee: boolean   // true if hole has no tee and user hasn't placed one
}

// Actual played rounds — score per hole. Fed by manual entry or 18Birdies/CSV paste.
export interface PlayedRound {
  id: string
  courseId: string
  date: string                    // YYYY-MM-DD
  scores: (number | null)[]       // length 18; null = not played / no data
  notes?: string
}

export interface HoleStats {
  played: number              // count of rounds with a score for this hole
  averageScore: number        // mean over played rounds
  averageVsPar: number        // mean - par
  bogeyOrWorseRate: number    // fraction of plays where score >= par+1
  doubleOrWorseRate: number   // fraction of plays where score >= par+2
  best: number                // min score
  worst: number               // max score
}

export interface RoundPlan {
  id: string
  courseId: string
  courseName: string
  teeId: string
  playerVersion: number     // playerSnapshot.updatedAt — bump invalidates cache
  playerSnapshot: PlayerProfile
  strategies: HoleStrategy[]
  overrides: Record<number, HoleOverride>  // by hole number
  expectedScore: number
  generatedAt: number
}
