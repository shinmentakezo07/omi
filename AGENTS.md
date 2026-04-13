# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the Next.js 16 app, API routes, shared utilities, and database modules under `src/lib/db/`.
- `open-sse/` holds the request pipeline, provider executors, translators, and MCP server code.
- `electron/` contains the desktop app, `bin/` ships CLI entrypoints, and `tests/` stores unit, integration, e2e, and protocol coverage.
- Keep changes surgical: touch only files directly related to the task and follow existing folder patterns.

## Build, Test, and Development Commands
- `npm run dev` starts the web app locally.
- `npm run build` creates the production Next.js build.
- `npm run lint` runs ESLint across the repo.
- `npm run typecheck:core` checks the main TypeScript surfaces.
- `npm run test:unit`, `npm run test:vitest`, and `npm run test:e2e` cover unit, Vitest, and Playwright flows.
- For a targeted unit test, use `node --import tsx/esm --test tests/unit/<file>.test.mjs`.

## Coding Style & Naming Conventions
- Use Prettier defaults configured in the repo: 2 spaces, semicolons, double quotes, 100 character width, trailing commas where supported.
- Match the existing architecture and avoid speculative abstractions.
- Use PascalCase for React components, UPPER_SNAKE for constants, and camelCase or kebab-case for file names depending on nearby files.
- Validate external input with Zod and route database access through `src/lib/db/` modules instead of inline SQL.

## Behavioral Guidelines for LLM Contributors
Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on common pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
- State assumptions explicitly before implementing.
- If multiple interpretations exist, present them instead of picking silently.
- Call out simpler approaches or push back when the requested path is overcomplicated.
- If something is unclear, stop, name the confusion, and ask.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- Do not add features, abstractions, flexibility, or impossible-scenario handling that was not requested.
- If a solution grows unnecessarily, rewrite it smaller.
- Sanity check every change with: would a senior engineer consider this overcomplicated?

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Avoid refactoring unrelated code, comments, or formatting.
- Match local style, even if you would design it differently.
- Remove imports, variables, or functions made unused by your change, but leave pre-existing dead code alone unless asked.
- Every changed line should trace directly to the request.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
- Turn requests into verifiable goals such as reproducing a bug with a test before fixing it.
- For multi-step work, state a short plan with verification for each step.
- Prefer strong success criteria over vague goals like “make it work.”

Example plan format:
```text
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## Testing Guidelines
- Add or update tests for changes under `src/`, `open-sse/`, `electron/`, or `bin/`.
- Keep the 60% coverage gate in mind when adding or modifying behavior.
- Prefer the smallest relevant test command while iterating, then run the full relevant validators before finishing.

## Commit & Pull Request Guidelines
- Use Conventional Commit prefixes such as `fix:`, `feat:`, `refactor:`, or scoped forms like `fix(auth):`.
- Before committing, review `git status`, inspect staged diffs for secrets, and confirm generated files are intentional.
- Pull requests should clearly describe user-visible impact, list validation performed, and include screenshots for UI or Electron changes.

## Security & Architecture Notes
- Do not use `eval`, `new Function`, or similar dynamic execution patterns.
- For provider work, register constants, executors, and model metadata in the existing provider registry flow.
- Use abort signals for SSE or streaming work to avoid leaked resources.
