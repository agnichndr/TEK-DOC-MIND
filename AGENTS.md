# Repository Guidelines

## Project Structure & Module Organization

The application lives in `ai-doc-agent/`; run project commands from that directory. It is a Next.js App Router project using TypeScript and Tailwind CSS. Routes, layouts, and global styles currently live in `ai-doc-agent/src/app/`, while static assets belong in `ai-doc-agent/public/`. As the application grows, place shared UI in `src/components/`, business and database logic in `src/services/`, Server Actions in `src/actions/`, schemas and interfaces in `src/types/`, and tests in `src/__tests__/`. Follow the more detailed rules in `ai-doc-agent/AGENTS.md` for all files below that directory.

## Build, Test, and Development Commands

From `ai-doc-agent/`, use:

- `npm ci` — install the exact dependencies recorded in `package-lock.json`.
- `npm run dev` — start the local development server at `http://localhost:3000`.
- `npm run build` — create and validate a production build.
- `npm run start` — serve the completed production build.
- `npm run lint` — run the Next.js Core Web Vitals and TypeScript ESLint rules.
- `npx tsc --noEmit` — perform a strict TypeScript check without generating files.

## Coding Style & Naming Conventions

Use TypeScript and two-space indentation. Name React components and their files with PascalCase (for example, `DocumentEditor.tsx`); use camelCase for functions and variables. Follow Next.js route filenames such as `page.tsx`, `layout.tsx`, and `route.ts`. Prefer React Server Components; add `"use client"` only when hooks, browser APIs, or event handlers require it. Import application modules through the configured `@/` alias. Keep route handlers thin and validate external input before calling service-layer code.

## Testing Guidelines

No automated test runner is configured yet. Until one is added, `npm run lint`, `npx tsc --noEmit`, and `npm run build` are the required checks. Add future tests under `src/__tests__/` with descriptive `*.test.ts` or `*.test.tsx` names, and introduce the test dependency and `npm test` script in the same change. Include authorization failure cases for protected server actions and API routes.

## Commit & Pull Request Guidelines

History currently contains only an initial commit, so no established message convention exists. Use concise, imperative subjects such as `Add document review workflow`. Keep commits focused. Pull requests should explain the purpose and approach, list verification commands, link relevant issues, and include screenshots for visible UI changes. Call out schema, environment, API-contract, or security changes explicitly; never commit secrets or local `.env` files.
