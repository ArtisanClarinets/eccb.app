Now I have a clear picture. Let me create a comprehensive plan.

## Plan: Fix Smart Upload Hydration Error + Implement Real-time Updates

**TL;DR:** The hydration error stems from `requireRole()` throwing a raw `Error` instead of using `redirect()`. Meanwhile, the confidence score displays 0% because the worker's return value omits `confidenceScore` and `routingDecision`. The Review page lacks real-time update listeners. We'll: (1) fix the admin layout to use `redirect()` pattern, (2) update the SSE endpoint and worker return to include confidence/routing data, (3) add real-time WebSocket/polling listeners to both upload and review pages.

**Steps**

1. **Fix AdminLayout hydration error** → src/app/(admin)/admin/layout.tsx/admin/layout.tsx#L31)
   - Replace `requireRole('ADMIN')` with `redirect()` pattern from guards.ts
   - Eliminates server/client render mismatch by using Next.js navigation primitives

2. **Update smart-upload-processor return object** → smart-upload-processor.ts
   - Add `confidenceScore: extraction.confidenceScore` and `routingDecision` to the final return object
   - Ensures SSE `completed` event includes metadata needed for UI to update without refetching

3. **Update SSE route to pass complete metadata** → route.ts
   - Modify `completedHandler` to include full session metadata alongside `sessionId`
   - Allows client to display confidence, status, etc. immediately on completion

4. **Add real-time polling to upload page** → src/app/(admin)/admin/uploads/page.tsx/admin/uploads/page.tsx#L225-L280)
   - Hook SSE `completed` event to update local upload state with confidence & routing decision
   - Display updated confidence immediately

5. **Add real-time polling to review page** → src/app/(admin)/admin/uploads/review/page.tsx/admin/uploads/review/page.tsx#L200-250)
   - Implement interval-based polling for `api/admin/uploads/review` every 3 seconds or SSE listener
   - Refetch sessions after each worker completes to show updated confidence scores

6. **Optimize component rendering** → Both pages
   - Wrap intensive children in `Suspense` boundary to prevent hydration blocking
   - Use `memo` or `useCallback` to avoid unnecessary re-renders of table/card lists

7. **Run lint checks** → All modified files
   - Ensure no TypeScript errors, unused imports cleared

**Verification**
- Navigate to `/admin/uploads` → no hydration mismatch
- Upload PDF → confidence displays real value (not 0%), updates live via SSE
- Navigate to `/admin/uploads/review` → lists display confidence from latest session
- Pending queue refreshes in real-time without manual page refresh
- All four content boxes (Pending, Approved, Rejected, and Queue) reflect live data

**Decisions**
- Use `redirect()` from `next/navigation` instead of throwing errors (aligns with Next.js 16 best practices)
- SSE for real-time updates is already in place; we just need to include complete metadata
- Front-end polling as fallback; SSE is primary (resilient to connection drops)