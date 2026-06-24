import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { PlafondParams, Project } from '@/types'

interface Ba13DB extends DBSchema {
  projects: { key: string; value: Project }
}

let dbPromise: Promise<IDBPDatabase<Ba13DB>> | null = null

function getDb(): Promise<IDBPDatabase<Ba13DB>> {
  if (!dbPromise) {
    dbPromise = openDB<Ba13DB>('ba13-app', 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

/**
 * Fills in missing fields when reading projects stored under an older schema.
 * Any project without schemaVersion is treated as schema version 0.
 */
function normalizeProject(raw: unknown): Project {
  const p = raw as Partial<Project> & { id: string; name: string; createdAt: number; updatedAt: number }
  return {
    ...p,
    schemaVersion: p.schemaVersion ?? 1,
    bomOverrides: p.bomOverrides ?? {},
    walls: (p.walls ?? []).map((w) => {
      const wall = w as unknown as Record<string, unknown>
      // Migrate legacy door widths (63→73, 93→83) and backfill openingSide
      const migratedDoors = ((wall.doors ?? []) as Array<Record<string, unknown>>).map(d => ({
        ...d,
        width: d.width === 63 ? 73 : d.width === 93 ? 83 : d.width,
        openingSide: (d.openingSide as string | undefined) ?? 'front',
      }))
      return {
        ...wall,
        kind: 'wall' as const,
        hasCeiling: (wall.hasCeiling as boolean | undefined) ?? true,
        lockedSegments: (wall.lockedSegments as number[] | undefined) ?? [],
        lockedAngles: (wall.lockedAngles as number[] | undefined) ?? [],
        doors: migratedDoors,
      }
    }),
    plafond: (() => {
      const raw = p.plafond as (PlafondParams & { longueur?: unknown; largeur?: unknown }) | undefined
      if (!raw) return undefined
      // Strip legacy longueur/largeur fields — dimensions are now derived from the polygon bounding box.
      const { longueur: _l, largeur: _w, ...cleaned } = raw
      void _l; void _w
      return cleaned as PlafondParams
    })(),
  } as Project
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDb()
  const projects = await db.getAll('projects')
  return projects.map(normalizeProject).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDb()
  const raw = await db.get('projects', id)
  return raw !== undefined ? normalizeProject(raw) : undefined
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDb()
  await db.put('projects', project)
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('projects', id)
}
