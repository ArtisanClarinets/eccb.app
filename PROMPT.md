# MASTER INSTRUCTIONS: ECCB Platform Implementation

You are an autonomous senior software engineering agent tasked with completing the Emerald Coast Community Band (ECCB) Management Platform to a production-ready state (100% completion).

## 0. Critical Context & Source of Truth

This project is strictly defined by the documentation in the root directory. You MUST align all implementation decisions with these files:

- **`GEMINI.md`**: Master anchor and project identity.
- **`ARCHITECTURE.md`**: System design and technology rationale.
- **`DATABASE_SCHEMA.md`**: Complete Prisma schema and data relationships.
- **`PERMISSIONS.md`**: RBAC system and security implementation patterns.
- **`TODO.md`**: The 13-phase roadmap you must follow.
- **`Design.md`**: UI/UX design system and GSAP animation guidelines.
- **`AGENTS.md`**: Coding standards, import rules, and quality requirements.

## 1. High-Level Objective

Build a community band management platform that integrates a public CMS, secure member portal, and a digital music library. Ensure the app is production-ready, meaning:
- All features from all 13 phases in `TODO.md` are implemented.
- 100% type safety (no `any`).
- Zero linting errors (`npm run lint`).
- Successful build (`npm run build`).
- Security checks (RBAC) on every server action.
- Audit logging for all mutations.
- Cinematic UI consistent with `Design.md`.

## 2. Technical Stack

- **Framework**: Next.js 16 (App Router), React 19.
- **Database**: PostgreSQL with Prisma ORM.
- **Auth**: Better Auth (Core) with RBAC integration.
- **Caching**: Redis (Sessions, Hot Data).
- **Storage**: Free Cloud Method for multiple Gigs (or a way I can incorporate a dropbox library without obtaining the login information) or revert to a Locally Hosted Method (Music Files).
- **Animations**: GSAP ScrollTrigger.
- **Styling**: Tailwind CSS + shadcn/ui.

## 3. Implementation Workflow

You should operate in a loop, completing one phase at a time from `TODO.md`. For each phase:

1.  **Analyze**: Read the requirements for the phase in `TODO.md`.
2.  **Plan**: Draft a sub-task list for that phase.
3.  **Execute**: Implement the code, ensuring compliance with `PERMISSIONS.md` and `DATABASE_SCHEMA.md`.
4.  **Verify**: 
    - Run `npx tsc --noEmit` to check types.
    - Run `npm run lint`.
    - Run unit/integration tests as defined in the phase.
5.  **Refactor**: Clean up and optimize.

## 4. Specific Domain Requirements

### Music Library (Primary Feature)
- Secure PDF storage and assignment.
- Signed URL access via `src/lib/storage.ts`.
- Comprehensive metadata management.

### Security (RBAC)
- All mutations MUST use `requirePermission()` from `src/lib/auth/guards.ts`.
- Audit every mutation with the `auditLog()` service.

### UI/UX
- Use the coastal cinematic theme defined in `Design.md`.
- Implement GSAP animations for "wow" factor on public pages.

## 5. Execution Command

Proceed now to execute **Phase 1: Foundation** and continue sequentially until **Phase 13: Testing & Deployment**. If you encounter missing configuration or environment variables, use the values defined in `LOCAL_SETUP.md` or `DEPLOYMENT.md`.

**GOAL**: 100% Production Ready. No placeholders. No incomplete features.
