# CS2 OPCenter

A complete web panel for managing Counter-Strike 2 game servers, with a secure intermediary backend that forwards all commands to external agents via HTTP — no direct server execution.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/cs2-panel run dev` — run the frontend (port 19623)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET` (JWT secret)

**Default login:** `admin` / `admin` · `operator` / `admin`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, wouter, TanStack Query, Tailwind CSS (Outfit + Space Mono fonts)
- API: Express 5, bcrypt, jsonwebtoken
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (users, servers, activity, modes)
- `artifacts/api-server/src/routes/servers.ts` — Express route handlers (servers, modes, CSTV/demos, game modes)
- `artifacts/cs2-panel/src/` — React frontend
  - `src/contexts/AuthContext.tsx` — auth state, JWT token management
  - `src/pages/` — login, dashboard, servers, server-detail, users, settings
  - `src/components/layout/` — AppLayout, sidebar
  - `src/components/ModesTab.tsx` — game modes tab component
  - `src/components/CSTVTab.tsx` — CSTV/demos tab component
- `lib/api-client-react/src/generated/` — generated hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas (do not edit)
- `scripts/agent/cs2_agent.py` — VPS agent script
- `scripts/vps-install.sh` — automated VPS installation script
- `README.md` — comprehensive setup and deployment guide
- `.env.example` — environment variable template

## Architecture decisions

- **Agent-forwarding pattern**: The backend never runs CS2 commands directly. Every action (start/stop/restart/rcon/players/plugins/demos/mode-switch) is forwarded to an external agent URL stored per-server, authenticated via per-server tokens.
- **Graceful degradation**: When the agent is unreachable, the backend returns simulated/cached data (logs, players, plugins) so the UI stays functional during development.
- **JWT auth**: Sessions use JWT tokens stored in localStorage, attached to every request via `setAuthTokenGetter` in `lib/api-client-react/src/custom-fetch.ts`.
- **Single zod output file**: orval zod config uses `mode: "single"` to avoid barrel conflicts between Zod schemas and TypeScript types.
- **Activity log**: Every server action (start/stop/restart/kick/ban/rcon/mode-change/demo-record) is recorded in the `activity` table for the dashboard timeline.
- **Game modes via plugin file moves**: Mode switching moves .smx files between plugins/ and plugins/disabled/ on the VPS via the agent — no server duplication.
- **CSTV state in agent memory**: Recording state (_recording dict) lives in the agent process; config persisted to limitados_cstv.json on the VPS.

## Product

- Login page → JWT session for admin/user roles
- Dashboard with server counts, player totals, and recent activity timeline
- Server list with status badges (online/offline, player counts)
- Per-server detail with 9 tabs:
  - **Overview** — controls + metrics (CPU/RAM/uptime)
  - **Modos** — game mode cards (Competitive/Retake/DM/etc), click to activate → moves plugins, applies configs, restarts
  - **Players** — kick/ban/mute via RCON
  - **Admins** — SourceMod sm_addadmin/remove via RCON
  - **Maps** — changelevel via RCON, 12 official + workshop maps
  - **Plugins** — list active SourceMod plugins
  - **CSTV** — record/pause/stop demos, list+download+rename+delete demo files, storage settings
  - **Logs** — live poll of server.log
  - **Console** — RCON with 35+ quick-command buttons
- User management (admin-only: create/delete users, set roles)
- Multi-server support: each server has its own agent URL and token

## User preferences

- Language: Portuguese (user messages in pt-BR)
- Architecture: Backend as pure HTTP proxy — never executes commands directly
- Branding: "LIMITADOS" throughout the UI

## Gotchas

- After any OpenAPI spec change, run codegen before anything else
- bcrypt needs build approval: run `pnpm approve-builds` and select bcrypt if it fails to load
- The `lib/api-zod/src/index.ts` must only export from `./generated/api` (not types) — orval single mode
- Agent URLs should NOT have a trailing slash
- CSTV/Demo and Game Modes routes are in servers.ts (not in OpenAPI spec) — use direct authFetch in frontend components
- Game modes table: `lib/db/src/schema/modes.ts` — run `pnpm --filter @workspace/db run push` after schema changes

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- External agent contract: see `scripts/agent/cs2_agent.py` for all supported endpoints
- Full setup guide: `README.md`
- VPS installer: `scripts/vps-install.sh`
