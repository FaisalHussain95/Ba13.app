# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ba13.app** is a mobile-first, offline-first PWA for construction material estimation (dry wall partitions and suspended ceilings). Target users are independent plasterers working on-site. The full functional specification is in [specs/Specs_Outil_Chiffrage_Cloisons_Seches.md](specs/Specs_Outil_Chiffrage_Cloisons_Seches.md).

The Next.js application lives in the `app/` subdirectory. See `app/CLAUDE.md` and `app/AGENTS.md` for framework-specific instructions.

## Tech Stack

- **Next.js 16 / React 19** with TypeScript (App Router) — see `app/node_modules/next/dist/docs/` for accurate API docs
- **Tailwind CSS v4** for styling
- **PWA** (offline-first, installable — next-pwa or @ducanh2912/next-pwa)
- **IndexedDB** (`idb` package) for project data (multi-project, auto-save on every change)
- **localStorage** for small preferences (settings screen)
- **pnpm** as package manager
- No backend, no user accounts — 100% client-side

## Commands (run from `app/`)

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm start        # Preview production build
pnpm lint         # Lint
```

## Next.js 16 Breaking Changes to Know

- `params` in page/layout components is now a **Promise**: `const { id } = await params` — always await it
- All pages/layouts are **Server Components** by default — add `"use client"` for anything using state, effects, or browser APIs
- This app is 100% client-side so nearly every component/page needs `"use client"` or `next/dynamic` with `{ ssr: false }`
- Read bundled docs at `app/node_modules/next/dist/docs/` before using any Next.js API

## Architecture

### Data Model

- **Project**: name, last modified date, walls (with doors), thumbnail
- **Wall**: length, height, frame width (36/48/62/70/90/100 mm), cladding (double/single face), openings, insulation
- **Door**: width (63/73/83/93 cm), opening direction — reference CHAUVAT bloc-porte (Bricoman)
- **Settings**: configurable thresholds stored in localStorage (stud spacing, screw ratio, span limits, etc.)
- **BOM output**: categorized list (ossature / parement / visserie / portes / finition / isolation)

### Key Screens

1. **Home** (`/`) — project list (name, last modified, plan thumbnail), create new project
2. **Plan editor** (`/project/[id]`) — interactive top-view floor plan canvas, V1: walls + heights, door placement
3. **Results** (`/project/[id]/results`) — categorized BOM, manually adjustable quantities, CSV export
4. **Settings** (`/settings`) — adjustable technical parameters (all configurable, never hardcoded)

### Calculation Engine

The core logic lives in `lib/calculation.ts`. Key rules (from DTU 25.41):

**Dry wall (cloison):**
- Plasterboard: 2500×1200 mm = 3 m²/unit (LABELPLAC BA13 standard)
- Rails (3 m fixed): `ceil((wall_length * 2) / 3)` for top+bottom
- Studs: `ceil(wall_length / spacing) + 1`, select nearest commercial length ≥ wall_height
- Screws (ISOLPRO 3.5×25mm, box of 1000): `ceil((surface_m2 * screw_ratio) / 1000)` boxes
- Double face: full plasterboard qty; single face: divide plasterboard qty by 2, frame unchanged

**Door reinforcement (per door):**
- Opening = door outer dimensions (e.g. 83 cm door → 89.7 cm wide, 208 cm tall) + fitting tolerance
- Doubled studs on each side, full height; horizontal lintel above opening
- Deduct opening area from plasterboard calculation

**Suspended ceiling (faux plafond, V2):**
- Span ≤ 2 m → single M48 stud, 60 cm spacing
- 2 m < span ≤ 4 m → doubled studs M48/M100, 60 cm spacing
- Span > 4 m → block self-supporting solution, warn user

**No waste optimization in V1** — simple round up to next unit for all quantities.

### Hardware Reference (Bricoman/ISOLPRO)

Stud widths: 36/48/62/70/90/100 mm (lengths vary by width — see spec section 7.1)
Rail: always 3 m, width matching stud (aile 28 mm standard; 62 mm uses 35 mm)
Plasterboard: LABELPLAC BA13 2500×1200 mm, 3 m²

### Settings Defaults (from DTU 25.41)

All stored in localStorage, never hardcoded in the calculation engine:
- Max self-supporting span (single stud): 2.00 m
- Max self-supporting span (doubled studs): 4.00 m
- Standard stud spacing: 60 cm
- Reinforced stud spacing: 40 cm
- Max wall height (1 board): 6.35 m
- Max wall height (2 boards): 6.85 m
- Screw ratio: 25 screws/m²
- Default plasterboard: 1200×2500 mm
- Door fitting tolerance: 10 mm

## Roadmap

- **V1**: Plan editor (free-draw walls), dry wall calculation, door handling, multi-project (IndexedDB), CSV export, settings
- **V2**: Suspended ceiling module (faux plafond)
- **V3**: Windows support, complex floor plan shapes