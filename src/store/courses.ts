import { create } from 'zustand'
import type { Course } from '../types'
import { deleteCourse, getCourses, putCourse } from './db'

import type { Hole } from '../types'

interface CoursesStore {
  courses: Course[]
  loaded: boolean
  load: () => Promise<void>
  save: (c: Course) => Promise<void>
  updateHole: (courseId: string, holeNumber: number, patch: Partial<Hole>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useCourses = create<CoursesStore>((set) => ({
  courses: [],
  loaded: false,
  async load() {
    const list = await getCourses()
    set({ courses: list, loaded: true })
  },
  async save(c) {
    await putCourse(c)
    const list = await getCourses()
    set({ courses: list })
  },
  async updateHole(courseId, holeNumber, patch) {
    const list = await getCourses()
    const course = list.find((c) => c.id === courseId)
    if (!course) return
    const next = {
      ...course,
      updatedAt: Date.now(),
      source: course.source === 'overpass' ? 'mixed' as const : course.source,
      holes: course.holes.map((h) => (h.number === holeNumber ? { ...h, ...patch } : h)),
    }
    await putCourse(next)
    const fresh = await getCourses()
    set({ courses: fresh })
  },
  async remove(id) {
    await deleteCourse(id)
    const list = await getCourses()
    set({ courses: list })
  },
}))
