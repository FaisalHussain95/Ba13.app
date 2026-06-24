'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useProjects } from '@/hooks/useProjects'
import ProjectCard from '@/components/ProjectCard'
import BottomSheet from '@/components/BottomSheet'

export default function HomePage() {
  const router = useRouter()
  const { projects, loading, createProject, removeProject } = useProjects()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.toLowerCase()
    return projects.filter((p) => p.name.toLowerCase().includes(q))
  }, [projects, search])

  const handleCreate = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      const project = await createProject(newName)
      setShowCreate(false)
      setNewName('')
      router.push(`/project/${project.id}`)
    } finally {
      setCreating(false)
    }
  }, [creating, createProject, newName, router])

  const handleOpenCreate = useCallback(() => {
    setNewName('')
    setShowCreate(true)
    // Focus input after sheet animation
    setTimeout(() => inputRef.current?.focus(), 350)
  }, [])

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#f7f7f5' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Ba13.app" className="h-8 w-auto" />
        <span
          className="rounded-full border border-[#cfcfca] bg-white px-2.5 py-0.5 text-xs text-[#6b7280]"
        >
          hors ligne
        </span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d4ed8] border-t-transparent" />
        </div>
      ) : projects.length === 0 ? (
        /* Empty state */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 pb-24">
          {/* Hatched placeholder */}
          <div
            className="h-[120px] w-[120px] rounded-2xl border-2 border-dashed border-[#cfcfca]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 1px, transparent 1px, transparent 8px)',
              backgroundColor: '#f9fafb',
            }}
          />
          <div className="text-center">
            <p className="font-semibold text-[#1f2937]">Aucun chantier</p>
            <p className="mt-1 text-sm text-[#6b7280]">
              Créez votre premier chantier pour commencer à chiffrer le matériel.
            </p>
          </div>
        </div>
      ) : (
        /* Project list */
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-28">
          {/* Search */}
          <div className="relative mb-2">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Rechercher un chantier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#cfcfca] bg-white py-2.5 pl-9 pr-3 text-sm text-[#1f2937] placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-center text-sm text-[#6b7280] pt-8">Aucun résultat</p>
          ) : (
            filtered.map((project) => (
              <ProjectCard key={project.id} project={project} onDelete={removeProject} />
            ))
          )}
        </div>
      )}

      {/* Bottom CTA / FAB */}
      {projects.length === 0 ? (
        <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-sm px-4 pb-8 pt-2">
          <button
            onClick={handleOpenCreate}
            className="w-full rounded-xl py-4 text-base font-semibold text-white transition-opacity active:opacity-90"
            style={{ backgroundColor: '#1d4ed8' }}
          >
            + Nouveau chantier
          </button>
        </div>
      ) : (
        <button
          onClick={handleOpenCreate}
          aria-label="Nouveau chantier"
          className="fixed bottom-6 right-4 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
          style={{ backgroundColor: '#1d4ed8' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* Create project sheet */}
      <BottomSheet isOpen={showCreate} onClose={() => setShowCreate(false)}>
        <h2 className="text-lg font-bold text-[#1f2937]">Nouveau chantier</h2>
        <p className="mt-0.5 text-sm text-[#6b7280]">Tout est sauvegardé sur cet appareil.</p>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-[#1f2937]">Nom du chantier</span>
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Ex. Entrepôt Dupont — Bureau"
            className="mt-1.5 w-full rounded-xl border border-[#cfcfca] bg-white px-3 py-3 text-[#1f2937] placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
          />
        </label>

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => setShowCreate(false)}
            className="flex-1 rounded-xl border border-[#cfcfca] bg-[#f7f7f5] py-3 text-sm font-semibold text-[#1f2937]"
          >
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#1d4ed8' }}
          >
            {creating ? 'Création…' : 'Créer'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
