'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Project } from '@/types'
import { formatRelativeDate, countWallStats } from '@/lib/utils'

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
}

export default function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const router = useRouter()
  const { walls, doors } = countWallStats(project.walls)

  const handleClick = useCallback(() => {
    router.push(`/project/${project.id}`)
  }, [project.id, router])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = window.confirm(
      `Supprimer le chantier "${project.name}" ? Cette action est irréversible.`
    )
    if (confirmed) onDelete(project.id)
  }, [project.id, project.name, onDelete])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className="flex items-center gap-3 rounded-xl border border-[#cfcfca] bg-white px-4 py-3 active:bg-gray-50 cursor-pointer select-none"
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0">
        {project.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.thumbnail}
            alt="Plan"
            className="h-11 w-11 rounded-lg object-cover"
          />
        ) : (
          <div
            className="h-11 w-11 rounded-lg border border-[#cfcfca]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 1px, transparent 1px, transparent 6px)',
              backgroundColor: '#f9fafb',
            }}
          />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-[#1f2937]">{project.name}</p>
        <p className="text-sm text-[#6b7280]">
          {formatRelativeDate(project.updatedAt)} · {walls} mur{walls !== 1 ? 's' : ''}, {doors}{' '}
          porte{doors !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        aria-label={`Supprimer ${project.name}`}
        className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-red-50 hover:text-[#dc2626] active:bg-red-100 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>

      {/* Chevron */}
      <svg
        className="flex-shrink-0 text-[#6b7280]"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  )
}
