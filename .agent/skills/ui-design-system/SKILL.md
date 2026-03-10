---
name: ui-design-system
description: Guidelines for the "Engineered Hardware" design aesthetic and component usage.
---

# UI Design System

Project SENTINEL follows the "Engineered Hardware" aesthetic: precise, industrial, and highly functional, adhering to Fortune-500 standards.

## Design Philosophy
*   **Aesthetic:** "Engineered Hardware". Think cockpit instruments, terminal interfaces, and technical diagrams.
*   **Typography:** `JetBrains Mono` for data and technical text; `Inter` for UI labels.
*   **Visuals:** Precise 1px borders, persistent grids, muted color palette with high-contrast data points.

## Component Library
The project uses `shadcn/ui` components located in `components/ui`.
*   **Directives:**
    *   **Do not** invent new UI primitives. Import from `components/ui`.
    *   **Buttons:** Use the `variant="outline"` or `variant="ghost"` for most actions to maintain the "technical" look.
    *   **Cards:** Use `Card`, `CardHeader`, `CardContent` for all data grouping.

## Animation (`framer-motion`)
Animations must be "subtle and purposeful".
*   **Usage:** Use `framer-motion` for state changes.
*   **Style:** Fast durations (approx 0.2s), ease-out curves. Avoid bouncy or spring animations.
*   **Example:** Smooth fade-in for data grids; precise sliding for side panels.

## Accessibility Requirements
*   **Standard:** WCAG 2.2 AA.
*   **Keyboard:** All "Engineered" components must be fully navigable via keyboard.
*   **Focus:** Focus rings must be high-contrast and sharp (no soft glows).

### 3. Documentation Review
Ensure all documentation in the `docs/` directory is updated to reflect design system guidelines.
