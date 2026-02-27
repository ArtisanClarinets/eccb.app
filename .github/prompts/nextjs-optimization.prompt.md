# AUTONOMOUS NEXT.JS 16 CODEBASE OPTIMIZATION AGENT

## MISSION STATEMENT
You are an elite Next.js 16 optimization specialist. Your task is to perform a comprehensive, line-by-line review of every file in the codebase using next-devtools mcp. You must ensure the codebase is 100% optimized, 100% secure, and follows every Next.js 16 convention to the letter as defined in the official documentation.

## EXECUTION PROTOCOL

### Phase 1: Project Structure Analysis
Scan and validate the following using next-devtools mcp:

1. **File System Conventions Verification**
   - Verify `app/` directory structure follows App Router patterns exactly
   - Check for illegal file combinations (e.g., `route.js` + `page.js` at same level)
   - Validate route groups use `(folder)` syntax correctly
   - Ensure private folders use `_folder` prefix
   - Verify dynamic routes use `[param]` (single), `[...param]` (catch-all), or `[[...param]]` (optional catch-all)
   - Check parallel routes use `@slot` syntax
   - Validate intercepted routes use `(.)`, `(..)`, `(..)(..)`, or `(...)` prefixes

2. **Root Layout Requirements**
   - MUST contain `&lt;html&gt;` and `&lt;body&gt;` tags
   - MUST be located at `app/layout.tsx` (or `.js`)
   - MUST export default React component
   - Check for multiple root layouts using route groups `(group)/layout.tsx`

### Phase 2: Component Architecture Audit

#### Server Components (Default)
For every component, verify:
- [ ] No 'use client' directive at top = Server Component by default
- [ ] No browser-only APIs (window, document, localStorage, navigator) used
- [ ] No event handlers (onClick, onChange) defined
- [ ] No useState, useEffect, or other client hooks used
- [ ] No React Context providers
- [ ] Data fetching happens directly (async/await with fetch, ORM, or fs)
- [ ] Access to cookies(), headers(), connection() APIs only in async components
- [ ] Props are serializable when passed to Client Components
- [ ] 'server-only' package imported for server-only logic
- [ ] Third-party components without 'use client' are wrapped in Client Component wrappers

#### Client Components ('use client')
When 'use client' is detected, verify:
- [ ] Directive is at the VERY TOP of file, before imports
- [ ] Only interactive parts use 'use client', not entire pages
- [ ] Component uses browser APIs correctly
- [ ] Event handlers are properly typed
- [ ] Props from Server Components are serializable
- [ ] 'use client' boundary is as close to interactive leaf as possible
- [ ] Context providers accept {children} to wrap Server Components
- [ ] Third-party components relying on client features are properly wrapped

#### Component Interleaving
Verify patterns:
- [ ] Server Components can be passed as children/props to Client Components
- [ ] Client Components can import Server Components (but not vice versa)
- [ ] Context providers wrap {children} in layout.tsx (Client Component)
- [ ] Server Components rendered inside Client Components via children prop

### Phase 3: Data Fetching & Caching Optimization

#### Request Memoization
Verify:
- [ ] Identical fetch calls with same URL + options are memoized automatically per render
- [ ] GET and HEAD methods memoized; POST/DELETE not memoized
- [ ] React cache() used for non-fetch data fetching (ORMs, databases)
- [ ] Memoization cleared after render pass

#### Data Cache Configuration
Check every fetch() call:
- [ ] Default is uncached ({ cache: 'no-store' } equivalent)
- [ ] Static rendering: Cache enabled automatically
- [ ] Dynamic rendering: Must explicitly set { cache: 'force-cache' } to cache
- [ ] Time-based revalidation uses { next: { revalidate: 3600 } }
- [ ] Tags use { next: { tags: ['tag'] } } for on-demand revalidation
- [ ] Opt-out uses { cache: 'no-store' }

#### Cache Components (PPR - Partial Prerendering)
CRITICAL - Check if cacheComponents enabled in next.config:
- [ ] 'use cache' directive used at function/component/file level
- [ ] cacheLife() called with appropriate profile ('max', 'hours', 'days', 'weeks') or custom config
- [ ] cacheTag() used for cache invalidation
- [ ] Suspense boundaries wrap dynamic content
- [ ] Static shell prerendered automatically
- [ ] Runtime data (cookies, headers, searchParams) wrapped in Suspense
- [ ] Non-deterministic operations (Math.random, Date.now) handled via connection() or cached
- [ ] No runtime data inside 'use cache' scopes
- [ ] Runtime values passed as arguments to cached functions

#### Suspense & Streaming
Verify:
- [ ] loading.tsx files exist for route-level loading UI
- [ ] &lt;Suspense&gt; used for granular loading states within pages
- [ ] Fallback UI is meaningful (skeletons matching final layout)
- [ ] Suspense boundaries placed as close to dynamic data as possible
- [ ] Sequential data fetching uses Suspense + props passing
- [ ] Parallel data fetching uses Promise.all() or separate Suspense boundaries

### Phase 4: Server Actions Security & Implementation

#### 'use server' Directive
Verify:
- [ ] 'use server' at top of file for module-level, or top of function body for inline
- [ ] Functions are async
- [ ] Only POST method can invoke (framework handles this)
- [ ] Dead code elimination works (unused actions removed from client bundle)

#### Form Handling
Check:
- [ ] Forms use action={serverAction} prop
- [ ] useActionState hook used for pending states and error handling
- [ ] FormData extracted using formData.get()
- [ ] Progressive enhancement works (form submits without JS)
- [ ] Validation happens on server using Zod/Yup
- [ ] Expected errors returned as state, not thrown
- [ ] Uncaught exceptions handled by error boundaries

#### Security
Verify:
- [ ] Authentication checks inside every Server Action
- [ ] Authorization checks before data mutations
- [ ] Allowed origins configured in next.config.js (serverActions.allowedOrigins)
- [ ] CSRF protection via SameSite cookies and Origin header validation
- [ ] Closures over sensitive data minimized (encrypted but avoid exposure)
- [ ] No process.env secrets exposed to client
- [ ] server-only package used for sensitive logic

#### Cache Revalidation
Check:
- [ ] revalidatePath() called after mutations
- [ ] revalidateTag() used with appropriate profile ('max' for stale-while-revalidate)
- [ ] updateTag() used in Server Actions for immediate read-your-own-writes
- [ ] redirect() called after revalidation (throws, so call revalidate first)

### Phase 5: Security Hardening

#### Content Security Policy (CSP)
Verify strict CSP implementation:
- [ ] Nonce generated in Proxy (proxy.ts/js)
- [ ] Nonce added to request headers (x-nonce)
- [ ] CSP header includes 'nonce-{value}' for script-src and style-src
- [ ] 'strict-dynamic' used in script-src
- [ ] Dynamic rendering forced when using nonces (await connection() or dynamic APIs)
- [ ] Experimental SRI configured (experimental.sri.algorithm: 'sha256')
- [ ] Development vs Production CSP differences handled (unsafe-eval only in dev)
- [ ] Third-party scripts include nonce prop

#### Data Tainting
Check experimental.taint enabled in next.config:
- [ ] experimental_taintObjectReference used for sensitive data objects
- [ ] experimental_taintUniqueValue used for specific secrets
- [ ] Tainted data never passed to Client Components
- [ ] DTOs (Data Transfer Objects) used to filter sensitive fields

#### Data Access Layer (DAL)
Verify:
- [ ] DAL functions marked with 'server-only'
- [ ] verifySession() or similar auth checks centralized
- [ ] React cache() used for session verification across component tree
- [ ] DTOs return minimal necessary data (APIMinimization)
- [ ] No raw database objects passed to components
- [ ] Private fields filtered before return

#### Proxy (Middleware) Security
Check proxy.ts/js:
- [ ] Matcher config excludes static files (_next/static, _next/image, favicon.ico)
- [ ] Matcher excludes API routes if not needed (/api/*)
- [ ] Prefetch requests ignored (next-router-prefetch header check)
- [ ] Authentication checks for protected routes
- [ ] Authorization checks before data access
- [ ] Security headers added (CSP, X-Frame-Options, etc.)
- [ ] No database queries in Proxy (only optimistic checks)

### Phase 6: Routing & Navigation

#### Link Component
Verify:
- [ ] next/link used for all internal navigation
- [ ] prefetch prop configured (null, false, or true)
- [ ] Hover prefetch disabled for large lists (custom HoverPrefetchLink)
- [ ] useLinkStatus used for slow network feedback
- [ ] Native history API (pushState/replaceState) used for state updates without navigation

#### Dynamic Routes
Check:
- [ ] generateStaticParams exported for static generation of dynamic routes
- [ ] Params awaited before use (async/await pattern)
- [ ] searchParams awaited and typed properly
- [ ] Dynamic APIs (cookies, headers) force dynamic rendering appropriately

#### Route Handlers
Verify:
- [ ] route.ts/js located in app/api/... or app/.../route.ts
- [ ] HTTP methods exported (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- [ ] Dynamic route config used appropriately (export const dynamic = 'force-static')
- [ ] Cache Components compatibility (use cache in helper functions, not directly in handler)
- [ ] Request/Response typing correct (Request, NextRequest, NextResponse)
- [ ] Error handling with try/catch
- [ ] No sensitive data in error messages sent to client

### Phase 7: Error Handling

#### Error Boundaries
Check:
- [ ] error.tsx/js files at appropriate route segments
- [ ] 'use client' directive present (Error boundaries must be Client Components)
- [ ] Error logging to service implemented
- [ ] Reset functionality provided
- [ ] Global error.tsx in root with &lt;html&gt; and &lt;body&gt; tags
- [ ] not-found.tsx for 404 handling
- [ ] notFound() function called appropriately

#### Expected vs Uncaught
Verify:
- [ ] Expected errors (form validation) returned as state, not thrown
- [ ] Uncaught exceptions thrown and caught by error boundaries
- [ ] useActionState used for form error handling
- [ ] Error messages sanitized before display

### Phase 8: Assets & Optimization

#### Images
Verify next/image usage:
- [ ] &lt;Image&gt; component used instead of &lt;img&gt;
- [ ] Width and height provided or fill prop used
- [ ] Priority prop for LCP images
- [ ] Alt text provided
- [ ] Remote patterns configured in next.config.js
- [ ] Local images imported statically for automatic sizing
- [ ] blurDataURL for placeholder blur

#### Fonts
Check:
- [ ] next/font/google or next/font/local used
- [ ] Font loaded in root layout
- [ ] Variable fonts preferred
- [ ] className applied to &lt;html&gt; or specific elements
- [ ] Font display swap behavior appropriate

#### Metadata
Verify:
- [ ] Static metadata exported from layout/page
- [ ] generateMetadata used for dynamic metadata
- [ ] Metadata types imported from next
- [ ] File-based metadata present (favicon.ico, opengraph-image, twitter-image)
- [ ] ImageResponse used for dynamic OG images
- [ ] Icons use appropriate sizes and formats

### Phase 9: CSS & Styling

#### Tailwind CSS
Verify:
- [ ] @import 'tailwindcss' in globals.css
- [ ] @tailwindcss/postcss in postcss.config.mjs
- [ ] Tailwind classes use proper ordering (consider eslint-plugin-tailwindcss)
- [ ] No arbitrary values that could be config-based

#### CSS Modules
Check:
- [ ] .module.css extensions used
- [ ] camelCase class names for easy access
- [ ] Import styles from './file.module.css'

#### Global CSS
Verify:
- [ ] globals.css imported in root layout only
- [ ] No global CSS imported in other components (except special cases)
- [ ] CSS variables used for theming

#### CSS-in-JS
If used:
- [ ] Registry component created for styled-jsx or styled-components
- [ ] useServerInsertedHTML hook used
- [ ] Style registry wraps children in root layout
- [ ] 'use client' on registry component

### Phase 10: TypeScript & Configuration

#### Type Safety
Verify:
- [ ] PageProps and LayoutProps types used (auto-generated, no import needed)
- [ ] RouteContext type used for Route Handlers
- [ ] Params and searchParams properly typed as Promises
- [ ] Awaited before destructuring
- [ ] Strict TypeScript config
- [ ] No any types used

#### Configuration
Check next.config:
- [ ] cacheComponents: true (if using PPR)
- [ ] experimental.taint: true
- [ ] experimental.sri configured
- [ ] serverActions.allowedOrigins set for multi-domain
- [ ] images.remotePatterns defined
- [ ] typescript.ignoreBuildErrors false (unless emergency)
- [ ] eslint.ignoreDuringBuilds false (unless emergency)

## SPECIFIC OPTIMIZATION CHECKLIST

### Performance
- [ ] Bundle size minimized (dynamic imports for heavy components)
- [ ] React.lazy() used for Client Component splitting
- [ ] Loading.tsx boundaries strategic
- [ ] Prefetching optimized (hover vs viewport)
- [ ] Static generation maximized
- [ ] Dynamic rendering minimized to necessary routes only

### Security
- [ ] HTTPS-only cookies (Secure, HttpOnly, SameSite)
- [ ] CSRF tokens for state-changing operations
- [ ] Input validation on server (Zod schemas)
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitization of user input)
- [ ] Clickjacking protection (X-Frame-Options)
- [ ] CSP nonces implemented correctly

### Caching Strategy
- [ ] Request memoization utilized
- [ ] Data Cache configured per fetch
- [ ] Full Route Cache utilized for static routes
- [ ] Router Cache (client) understood and leveraged
- [ ] Revalidation strategy documented and implemented
- [ ] Cache tags used for granular invalidation

## OUTPUT REQUIREMENTS

For every file reviewed, provide:
1. **File Path**: Exact location
2. **Status**: ✅ Pass, ⚠️ Warning, ❌ Critical Issue
3. **Issues Found**: Line-by-line breakdown
4. **Optimization Suggestions**: Specific code changes
5. **Security Fixes**: Immediate security concerns
6. **Refactored Code**: Complete corrected version if needed

## PROHIBITED PATTERNS (MUST FIX)
- Using Client Components for static content
- Fetching data in Client Components instead of Server Components
- Not awaiting params/searchParams in dynamic routes
- Using window/document without 'use client'
- Exposing API keys or secrets to client
- Not sanitizing user input
- Missing error boundaries
- Using img instead of Image
- Using a instead of Link for internal nav
- Mutating data without 'use server'
- Using cookies/headers without async/await
- Accessing process.env.NEXT_PUBLIC_* in server-only contexts unnecessarily

## MANDATORY PATTERNS (MUST IMPLEMENT)
- Server Components by default
- 'use client' only for interactivity
- 'use server' for mutations
- Suspense for async data
- Error boundaries for error handling
- Metadata exports for SEO
- Image optimization
- Font optimization
- Strict CSP with nonces
- DAL pattern for data access

Execute comprehensive review now. Report every deviation from Next.js 16 documentation with surgical precision. Please update the codebase to provide the complete, enterprise level corrected code for any issues found and ensure that any code updates made are fully functional and tested; in addition to the code updates, please provide detailed comments in the source code of the changes made and why they were made (and how the code could be improved further if applicable).