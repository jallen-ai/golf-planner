import { create } from 'zustand'
import type { ClubId, ClubProfile, PlayerProfile } from '../types'
import { CLUB_ORDER } from '../types'
import { getPlayer, putPlayer } from './db'

// Starter bag — rough averages for a ~12 handicap male amateur, for first-run.
// Editable in Player Profile.
const STARTER_CARRIES: Record<ClubId, number> = {
  driver: 230, '3w': 215, '5w': 200, hybrid: 190,
  '3i': 185, '4i': 175, '5i': 165, '6i': 155,
  '7i': 145, '8i': 135, '9i': 125,
  pw: 115, gw: 100, sw: 85, lw: 70,
  putter: 0,
}

export function defaultClub(id: ClubId): ClubProfile {
  const carry = STARTER_CARRIES[id]
  // Dispersion grows with carry. These are rough heuristics for a mid-handicapper.
  // Long shots: ~7% L/R, ~5% short, ~3% long.
  const sigmaLR = Math.max(3, carry * 0.07)
  const sigmaShort = Math.max(3, carry * 0.05)
  const sigmaLong = Math.max(2, carry * 0.03)
  return {
    id,
    inBag: id === 'putter' || carry > 0,
    carry,
    rollout: id === 'driver' ? 18 : id === '3w' || id === '5w' ? 12 : 6,
    sigmaLong,
    sigmaShort,
    sigmaLeft: sigmaLR,
    sigmaRight: sigmaLR,
  }
}

export function defaultProfile(): PlayerProfile {
  const bag: Record<ClubId, ClubProfile> = {} as Record<ClubId, ClubProfile>
  for (const c of CLUB_ORDER) bag[c] = defaultClub(c)
  bag.putter = defaultClub('putter')
  return {
    handicap: 12,
    dominantMiss: 'fade',
    bag,
    updatedAt: Date.now(),
  }
}

interface PlayerStore {
  profile: PlayerProfile | null
  loaded: boolean
  load: () => Promise<void>
  setProfile: (p: PlayerProfile) => Promise<void>
  updateClub: (id: ClubId, patch: Partial<ClubProfile>) => Promise<void>
  setHandicap: (h: number) => Promise<void>
  setDominantMiss: (m: PlayerProfile['dominantMiss']) => Promise<void>
}

export const usePlayer = create<PlayerStore>((set, get) => ({
  profile: null,
  loaded: false,
  async load() {
    const p = (await getPlayer()) ?? defaultProfile()
    set({ profile: p, loaded: true })
    if (!(await getPlayer())) await putPlayer(p)
  },
  async setProfile(p) {
    await putPlayer(p)
    set({ profile: p })
  },
  async updateClub(id, patch) {
    const cur = get().profile
    if (!cur) return
    const next: PlayerProfile = {
      ...cur,
      bag: { ...cur.bag, [id]: { ...cur.bag[id], ...patch } },
      updatedAt: Date.now(),
    }
    await putPlayer(next)
    set({ profile: next })
  },
  async setHandicap(h) {
    const cur = get().profile
    if (!cur) return
    const next = { ...cur, handicap: h, updatedAt: Date.now() }
    await putPlayer(next)
    set({ profile: next })
  },
  async setDominantMiss(m) {
    const cur = get().profile
    if (!cur) return
    const next = { ...cur, dominantMiss: m, updatedAt: Date.now() }
    await putPlayer(next)
    set({ profile: next })
  },
}))
