# Repository Guidelines

## Project Overview

OmniRoute is a unified AI proxy/router that routes any LLM through one endpoint. It supports 60+ providers (OpenAI, Anthropic, Gemini, DeepSeek, Groq, xAI, and many more), an MCP Server (25 tools), A2A v0.3 Protocol, and an Electron desktop app.

**Stack**: Next.js 16 (App Router), TypeScript 5.9, Node.js ≥18 <24, ES Modules, better-sqlite3, Tailwind CSS v4, Zod v4, next-intl (30 languages).

## Project Structure & Module Organization

- `src/` — Next.js app, API routes, domain layer, DB modules (`src/lib/db/`), services
- `open-sse/` — Request pipeline: handlers, executors, translators, services, MCP server
- `electron/` — Cross-platform desktop app
- `bin/` — CLI tool
- `tests/` — Unit (`tests/unit/`), integration, e2e, translator, security, load tests

Key paths: `src/lib/db/` (persistence), `src/domain/` (policy engine), `open-sse/handlers/` (request handlers), `open-sse/executors/` (provider executors), `open-sse/translator/` (format translation), `open-sse/services/` (36+ service modules), `open-sse/mcp-server/` (MCP tools).

## Build, Test, and Development Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck:core` | TypeScript type checking |
| `npm run test:all` | All tests (unit + vitest + e2e) |
| `npm run test:coverage` | Coverage gate (60% minimum) |
| `node --import tsx/esm --test tests/unit/<file>.test.mjs` | Single test file |
| `npm run test:vitest` | Vitest (MCP, autoCombo) |
| `npm run test:e2e` | Playwright E2E |
| `npm run electron:dev` | Electron dev mode |

## Coding Style & Naming Conventions

**Formatting**: Prettier — 2 spaces, semicolons, double quotes, 100 char width, es5 trailing commas. Run `prettier --write` on changed files.

**TypeScript**: Target ES2022, module `esnext`, `strict: false` (prefer explicit types). Path aliases: `@/*` → `src/`, `@omniroute/open-sse` → `open-sse/`.

**Naming**: Files = camelCase/kebab-case (`chatCore.ts`). React components = PascalCase (`Dashboard.tsx`). Functions/variables = camelCase. Constants = UPPER_SNAKE. Enums = PascalCase members.

**Imports**: External → `@/` and `@omniroute/open-sse` → relative. No barrel imports from `localDb.ts`.

**Security**: `no-eval`, `no-implied-eval`, `no-new-func` enforced. Validate all inputs with Zod. Auth middleware on all API routes. Never commit secrets.

## Testing Guidelines

- Node.js native test runner (most tests) and Vitest (MCP/autoCombo)
- 60% coverage gate required for statements, lines, functions, and branches
- PRs changing `src/`, `open-sse/`, `electron/`, or `bin/` must include tests
- E2E via Playwright; protocol E2E for MCP/A2A transports

## Commit & Pull Request Guidelines

Conventional commits: `fix:`, `feat:`, `chore:`, `refactor:`, `deps:`, `docs:`. Scope optional: `fix(auth):`, `fix(proxy):`. PRs must pass coverage gate and include tests for changed production code.

## Architecture Notes

- **DB ops**: Always use `src/lib/db/` modules, never raw SQL in routes
- **Request flow**: `open-sse/handlers/chatCore.ts` → executor → upstream provider
- **Adding a provider**: Register in `src/shared/constants/providers.ts` → add executor in `open-sse/executors/` → add translator if needed → add models in `open-sse/config/providerRegistry.ts`
- **No memory leaks**: Use abort signals for SSE stream cleanup
- **Provider constants**: Validated at module load via Zod (`src/shared/validation/providerSchema.ts`)
