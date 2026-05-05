import { create } from 'zustand'
import type { Course } from '../types'
import { deleteCourse, getCourses, putCourse } from './db'

interface CoursesStore {
  courses: Course[]
  loaded: boolean
  load: () => Promise<void>
  save: (c: Course) => Promise<void>
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
  async remove(id) {
    await deleteCourse(id)
    const list = await getCourses()
    set({ courses: list })
  },
}))
