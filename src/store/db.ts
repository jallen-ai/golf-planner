import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Course, PlayedRound, PlayerProfile, RoundPlan } from '../types'

interface CaddyDB extends DBSchema {
  player: {
    key: 'profile'
    value: PlayerProfile
  }
  courses: {
    key: string
    value: Course
    indexes: { 'by-name': string }
  }
  rounds: {
    key: string
    value: RoundPlan
    indexes: { 'by-course': string; 'by-date': number }
  }
  playedRounds: {
    key: string
    value: PlayedRound
    indexes: { 'by-course': string; 'by-date': string }
  }
}

let dbPromise: Promise<IDBPDatabase<CaddyDB>> | null = null

export function db() {
  if (!dbPromise) {
    dbPromise = openDB<CaddyDB>('caddy', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('player')
          const courses = db.createObjectStore('courses', { keyPath: 'id' })
          courses.createIndex('by-name', 'name')
          const rounds = db.createObjectStore('rounds', { keyPath: 'id' })
          rounds.createIndex('by-course', 'courseId')
          rounds.createIndex('by-date', 'generatedAt')
        }
        if (oldVersion < 2) {
          const pr = db.createObjectStore('playedRounds', { keyPath: 'id' })
          pr.createIndex('by-course', 'courseId')
          pr.createIndex('by-date', 'date')
        }
      },
    })
  }
  return dbPromise
}

export async function getPlayer(): Promise<PlayerProfile | undefined> {
  return (await db()).get('player', 'profile')
}

export async function putPlayer(p: PlayerProfile): Promise<void> {
  await (await db()).put('player', p, 'profile')
}

export async function getCourses(): Promise<Course[]> {
  return (await db()).getAll('courses')
}

export async function getCourse(id: string): Promise<Course | undefined> {
  return (await db()).get('courses', id)
}

export async function putCourse(c: Course): Promise<void> {
  await (await db()).put('courses', c)
}

export async function deleteCourse(id: string): Promise<void> {
  await (await db()).delete('courses', id)
}

export async function getRounds(): Promise<RoundPlan[]> {
  return (await db()).getAll('rounds')
}

export async function putRound(r: RoundPlan): Promise<void> {
  await (await db()).put('rounds', r)
}

export async function getPlayedRoundsByCourse(courseId: string): Promise<PlayedRound[]> {
  return (await db()).getAllFromIndex('playedRounds', 'by-course', courseId)
}

export async function putPlayedRound(r: PlayedRound): Promise<void> {
  await (await db()).put('playedRounds', r)
}

export async function deletePlayedRound(id: string): Promise<void> {
  await (await db()).delete('playedRounds', id)
}
