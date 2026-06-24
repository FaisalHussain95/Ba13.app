'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Project } from '@/types'
import * as db from '@/lib/db'
import { generateId } from '@/lib/utils'

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      const all = await db.getAllProjects()
      setProjects(all)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const createProject = useCallback(async (name: string): Promise<Project> => {
    const now = Date.now()
    const project: Project = {
      id: generateId(),
      name: name.trim() || 'Nouveau chantier',
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      walls: [],
      bomOverrides: {},
    }
    await db.saveProject(project)
    setProjects((prev) => [project, ...prev])
    return project
  }, [])

  const updateProject = useCallback(async (project: Project): Promise<void> => {
    const updated = { ...project, updatedAt: Date.now() }
    await db.saveProject(updated)
    setProjects((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p)).sort((a, b) => b.updatedAt - a.updatedAt)
    )
  }, [])

  const removeProject = useCallback(async (id: string): Promise<void> => {
    await db.deleteProject(id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { projects, loading, error, createProject, updateProject, removeProject, reload: loadProjects }
}

export function useProject(id: string | null) {
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false
    db.getProject(id)
      .then((p) => {
        if (!cancelled) {
          setProject(p ?? null)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erreur')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const save = useCallback(
    async (updated: Project): Promise<void> => {
      const withTs = { ...updated, updatedAt: Date.now() }
      await db.saveProject(withTs)
      setProject(withTs)
    },
    []
  )

  return { project, loading, error, save, setProject }
}
