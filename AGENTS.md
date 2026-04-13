# OmniRoute Agent Guidelines

## Project Overview

Unified AI proxy/router — 60+ providers, MCP Server (25 tools), A2A v0.3 Protocol, Electron desktop app.

**Stack**: Next.js 16 (App Router), TypeScript 5.9, Node.js ≥18 &lt;24, ES Modules, better-sqlite3, Tailwind CSS v4, Zod v4, next-intl (30 languages).

## Key Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server (auto-runs postinstall) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck:core` | TypeScript (core files only) |
| `npm run test:unit` | Unit tests (Node.js test runner) |
| `npm run test:vitest` | Vitest (MCP, autoCombo) |
| `npm run test:e2e` | Playwright E2E |
| `npm run test:protocols:e2e` | MCP + A2A client flows |
| `npm run test:coverage` | Coverage gate (60% min) |
| `npm run electron:dev` | Electron dev mode |

## Project Structure

- `src/` — Next.js app, API routes, DB modules (`src/lib/db/`), domain layer
- `open-sse/` — Request pipeline: handlers, executors, translators, services, MCP server
- `electron/` — Desktop app
- `bin/` — CLI tool
- `tests/` — Unit, integration, e2e, protocol tests

## Coding Conventions

- **Formatting**: Prettier (2 spaces, semicolons, double quotes, 100 char width, es5 trailing commas)
- **TypeScript**: Target ES2022, module `esnext`, `strict: false`. Path aliases: `@/*` → `src/`, `@omniroute/open-sse` → `open-sse/`
- **Naming**: Files = camelCase/kebab-case, React components = PascalCase, constants = UPPER_SNAKE
- **Security**: `no-eval`, `no-implied-eval`, `no-new-func` enforced. Validate inputs with Zod.

## Testing & Coverage

- 60% coverage gate (statements, lines, functions, branches)
- PRs affecting `src/`, `open-sse/`, `electron/`, `bin/` require tests
- Use `node --import tsx/esm --test tests/unit/<file>.test.mjs` to run single test file

## Architecture Patterns

- **DB ops**: Always use `src/lib/db/` modules, never raw SQL in routes
- **Request flow**: `open-sse/handlers/chatCore.ts` → executor → upstream provider
- **Add provider**: Register in `src/shared/constants/providers.ts` → add executor in `open-sse/executors/` → add translator if needed → add models in `open-sse/config/providerRegistry.ts`
- **SSE streams**: Use abort signals for proper cleanup to avoid memory leaks

## Commit Style

Conventional commits: `fix:`, `feat:`, `chore:`, `refactor:`, `deps:`, `docs:`. Scoped: `fix(auth):`.
