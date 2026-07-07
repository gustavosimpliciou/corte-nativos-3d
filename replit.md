# Nativos 3D Cutter

A professional web platform for preparing 3D models for printing. Import STL/OBJ/PLY/3MF files, use smart region-selection (inspired by Photoshop Quick Select) to isolate mesh parts, execute intelligent cuts with automatic hole-filling, and export each piece separately.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied to /api)
- `pnpm --filter @workspace/nativos-3d-cutter run dev` — run the frontend (proxied to /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React 19 + Vite + React Three Fiber + Three.js + Drei + Zustand + Framer Motion + TailwindCSS
- **API**: Express 5
- **DB**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- **Build**: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (projects, models, operations, exports)
- `artifacts/api-server/src/routes/` — Express route handlers (projects, models, operations, exports, stats)
- `artifacts/nativos-3d-cutter/src/` — React frontend
  - `src/pages/` — Home (landing), Dashboard, Workspace (editor), Models (import)
  - `src/components/3d/` — React Three Fiber viewport components
  - `src/stores/` — Zustand stores: UIStore, SelectionStore, ProjectStore, HistoryStore

## Architecture decisions

- **OpenAPI-first**: All API contracts are defined in `lib/api-spec/openapi.yaml` first; hooks and Zod schemas are generated from it.
- **Client-side mesh processing**: 3D file parsing and BVH computation run entirely in the browser (Web Workers) — no file upload to server. The backend only stores metadata.
- **Modular engines**: Selection, Cut, Geometry, and Export logic are in separate modules to allow future AI integration without rewriting the core.
- **Always dark**: The UI is locked to dark mode — `document.documentElement.classList.add('dark')` in main.tsx.
- **WebGL note**: Three.js requires WebGL; the Replit screenshot tool (headless/no GPU) shows a WebGL error, but real browsers render correctly.

## Product

- **Home** `/` — Landing page with animated 3D hero canvas, feature callouts, CTA
- **Dashboard** `/dashboard` — Project management hub with stats, recent activity, project cards
- **Workspace** `/projects/:id` — Core editor with 3-pane layout: tool sidebar, 3D viewport (R3F + OrbitControls), properties/history panel
- **Model Import** `/projects/:id/models` — Drag-and-drop file importer with model grid

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any `lib/db/src/schema/` change, run `pnpm run typecheck:libs` BEFORE `pnpm --filter @workspace/api-server run typecheck`, or the server will report missing table exports.
- After any `lib/api-spec/openapi.yaml` change, run `pnpm --filter @workspace/api-spec run codegen` before touching frontend or backend code.
- The `@apply dark` utility is not valid in Tailwind v4 — dark mode is set via `document.documentElement.classList.add('dark')` in main.tsx.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
