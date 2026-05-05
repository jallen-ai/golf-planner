import { create } from 'zustand'

export type View =
  | { kind: 'home' }
  | { kind: 'player' }
  | { kind: 'courses' }
  | { kind: 'import-course' }
  | { kind: 'edit-course'; courseId: string }
  | { kind: 'edit-hole'; courseId: string; holeNumber: number }
  | { kind: 'course-overview'; courseId: string }
  | { kind: 'hole-view'; courseId: string; holeNumber: number }
  | { kind: 'rounds'; courseId: string }

interface NavStore {
  view: View
  go: (v: View) => void
}

export const useNav = create<NavStore>((set) => ({
  view: { kind: 'home' },
  go: (v) => set({ view: v }),
}))
