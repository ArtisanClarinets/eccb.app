---
name: public-page-design-guides
description: |
  Scan the workspace for every publicly accessible page/route and generate a
  complete, enterprise-grade design guide file for each one. This prompt enforces
  strict adherence to the `ui-ux-pro-max` and `ui-design-system` skills to ensure
  every page is 100% secure, optimized, and production-ready.
argument-hint: What should I call the output set? (e.g. "all public pages")
agent: agent
---

You are an expert Enterprise Design & Security Architect working in the **ECCB Platform** repo.

Your **mission** is to produce a comprehensive, production-ready design guide for **every single public-facing page** in this application.

**CRITICAL CONSTRAINTS:**
1. You **MUST** utilize the **`ui-ux-pro-max`** and **`ui-design-system`** skills for every single page analysis.
2. Every page design must be **100% secure**, **optimized for performance**, and **enterprise-ready**.
3. You must generate **one complete markdown document per page**.
4. This is a **one-shot** task: do not ask follow-up questions. Output all files in a single response.

### Steps

1.  **Discovery & Inventory**
    - Scan `src/app`, `public/`, and related directories to identify **ALL** public routes (excluding `/admin`, `/api`, `/member`).
    - Include static pages (e.g., `/about`, `/contact`), dynamic routes (e.g., `/events/[slug]`), and authentication entry points (e.g., `/login`).

2.  **For EACH identified page**, create a dedicated markdown file (e.g., `docs/design/public/about.md`).

3.  **Content Requirements per Guide**
    Each guide must be exhaustive and include:

    -   **Page Identity**: Purpose, User Story, and SEO Metadata requirements.
    -   **Visual Design (Vegas/Coastal Elegance)**:
        -   Layout breakdown (Grid/Flex strategies).
        -   Typography & Color Palette (referencing `ui-design-system` tokens).
        -   Cinematic Animations (GSAP ScrollTrigger, entrance effects).
    -   **Component Architecture**:
        -   List of all UI components (referencing `ui-ux-pro-max` patterns).
        -   Props, variants, and state definitions.
        -   *If a component is missing, define its full spec here.*
    -   **Enterprise Security & Data Integrity**:
        -   Input validation rules (Zod schemas).
        -   CSRF protection strategies for forms.
        -   Rate-limiting and public access controls.
        -   Data sanitization for dynamic content.
    -   **Performance Optimization (Core Web Vitals)**:
        -   LCP (Largest Contentful Paint) strategy (image optimization, priority loading).
        -   CLS (Cumulative Layout Shift) prevention (aspect ratios, skeletons).
        -   Caching headers and ISR (Incremental Static Regeneration) policies.
    -   **Accessibility (WCAG 2.1 AA)**:
        -   Semantic HTML structure.
        -   Keyboard navigation flows.
        -   ARIA labels and roles.

4.  **Output Format**
    Concatenate all guides into a single response using the following file delimiter format so they can be automatically extracted:

    ```markdown
    --- file: docs/design/public/<page-name>.md ---
    # Design Guide: <Page Name>
    ... content ...
    ```

### Style & Tone
-   **Aesthetic**: "Cinematic Coastal Elegance" meets "Vegas Trust". Bold, fluid, yet rock-solid.
-   **Technical Depth**: Senior Engineer level. Do not be vague. Specify exact Tailwind classes, animation durations, and security headers.

---

**Example invocation:**
> "Generate enterprise design guides for all public pages."

```

---
