# AGENTS.md

## Project Overview

The Emerald Coast Community Band website is designed to be a cinematic, ultra-dynamic platform. It features GSAP ScrollTrigger animations, Three.js 3D elements, custom GLSL shaders, and CSS Houdini effects. The site is built with React 19, TypeScript, Vite, Tailwind CSS, and Radix UI primitives.

## Key Features

-   **Cinematic & Dynamic Website:** Visually rich and interactive public-facing website for the Emerald Coast Community Band.
-   **Cloud Storage Integration:** Seamless integration with major cloud storage providers (Google Drive, OneDrive, Dropbox) to create a comprehensive, easily accessible digital music library directly on the website.
-   **Non-Technical Content Management:** Implementation of a user-friendly system (e.g., a CMS or custom administrative interface) that empowers non-technical board members to update, modify, and create new events and content on the public website without requiring developer assistance.

## Build Commands

```bash
npm run dev          # Start dev server with HMR
npm run build        # Type-check + production build
npm run lint         # Run ESLint on entire codebase
npm run preview      # Preview production build locally
```

## Code Style Guidelines

### Imports
-   Use absolute imports from `src/` (configured in tsconfig)
-   Group imports: React → external libraries → internal components/utils
-   Sort alphabetically within groups

### Formatting
-   2 spaces for indentation
-   Single quotes for strings
-   Trailing commas enabled
-   Print width: 100

### TypeScript
-   Enable `strict: true` in tsconfig
-   Prefer interfaces over type aliases for object shapes
-   Use explicit return types for exported functions
-   Avoid `any`; use `unknown` when type is uncertain

### Naming Conventions
-   Components: PascalCase (`Navigation`, `Hero`)
-   Hooks: camelCase with `use` prefix (`useAnimation`)
-   Utils/functions: camelCase (`cn`, `formatDate`)
-   CSS classes: kebab-case with Tailwind utility pattern
-   Constants: SCREAMING_SNAKE_CASE for config values

### Component Structure
1.  Imports (React, hooks, external, internal)
2.  Types/interfaces
3.  Helper functions
4.  Main component with sub-components defined below
5.  Default export

### Tailwind & CSS
-   Use `cn()` utility from `src/lib/utils.ts` for conditional classes
-   Follow design system colors: primary (#0f766e), primary-light (#5eead4), neutral-dark (#1f2937), accent (#f59e0b)
-   Apply animations via GSAP or Tailwind's `animate-*` classes
-   Use CSS custom properties for animation easing values

### Animation Guidelines (from design.md)
-   Easing library: `--ease-dramatic`, `--ease-smooth`, `--ease-bounce`, `--ease-expo-out`
-   Duration scale: micro (150ms), fast (300ms), normal (500ms), slow (800ms), cinematic (1200ms)
-   Use GSAP ScrollTrigger for scroll-driven animations
-   Include `prefers-reduced-motion` fallback
-   Performance: use `will-change: transform, opacity` and GPU acceleration

### Error Handling
-   Use React error boundaries for component failures
-   Validate form data with Zod schemas (see `react-hook-form` + `zod`)
-   Log errors with context; don't expose sensitive data
-   Provide user-friendly fallback UI for errors

### Testing
-   Use Vitest for unit tests
-   Place tests adjacent to source files (`*.test.tsx`)
-   Run single test: `npx vitest run filename.test.tsx`

### Linting
-   ESLint config extends: `recommended`, `reactHooks`, `reactRefresh`, `typescript-eslint`.
-   Fix auto-fixable issues: `npm run lint -- --fix`

### Git Workflow
-   Commit messages: imperative mood, max 72 chars
-   Feature branches: `feat/description`
-   Bug fixes: `fix/description`
