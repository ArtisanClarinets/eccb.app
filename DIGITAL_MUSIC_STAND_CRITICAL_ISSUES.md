# Digital Music Stand - Critical Issues & Action Items

**Generated:** February 25, 2026  
**Status:** REQUIRES IMMEDIATE ATTENTION BEFORE PRODUCTION

---

## 🔴 CRITICAL ISSUE #1: Missing Event Authorization

### Severity Level: **CRITICAL** (Data Breach Risk)

### Location
**File:** `/src/app/(member)/member/stand/[eventId]/page.tsx`  
**Lines:** 97-130

### The Problem
Three issues in one:

1. **No Membership Check** - Any authenticated user can access ANY event
2. **No Access Verification** - No check if user attended the event
3. **Data Exposure** - All sensitive data exposed (annotations, preferences, roster)

### Current Vulnerable Code
```tsx
export default async function StandPage({ params }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  
  if (!session?.user) {
    return notFound();  // ✅ Auth check exists
  }

  const { eventId } = await params;

  // ❌ NO AUTHORIZATION CHECK HERE - ANYONE CAN FETCH ANY EVENT
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      music: { include: { piece: { include: { files: true } } } }
    },
  });

  if (!event) {
    notFound();
  }
  
  // Returns ALL data without verification user should access it
  return <StandViewer data={loaderData} />;
}
```

### Attack Vector
```
1. Attacker logs in as any band member (or creates account)
2. Guesses or discovers event ID (UUID, so not directly guessable but leakable)
3. Navigates to /member/stand/[eventId]
4. Page loads with full access to:
   - All music annotations (including director-only)
   - All member roster data (section assignments visible)
   - All navigation links
   - Audio links with potential private URLs
   - All user preferences
```

### Required Fix
```tsx
export default async function StandPage({ params }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  
  if (!session?.user) {
    return notFound();
  }

  const { eventId } = await params;

  // ✅ FIX: Verify user is a member and attended this event
  const member = await prisma.member.findUnique({
    where: { userId: session.user.id },
  });
  
  if (!member) {
    return notFound();  // User is not a band member at all
  }

  // ✅ FIX: Check attendance for this event
  const attendance = await prisma.attendance.findUnique({
    where: {
      eventId_memberId: {
        eventId,
        memberId: member.id,
      },
    },
  });
  
  if (!attendance) {
    return notFound();  // User didn't attend this event
  }

  // Fetch event with data (now we know user has access)
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      music: { include: { piece: { include: { files: true } } } }
    },
  });

  if (!event) {
    notFound();
  }

  // ... continue with safe data loading
}
```

### Estimated Fix Time: **30-60 minutes**

### Testing Required
- [ ] Unauthorized user cannot access event
- [ ] User with no attendance cannot access event
- [ ] User with attendance CAN access event
- [ ] Director can access all events they conduct
- [ ] API endpoints verify event membership (cascade check)

---

## 🟡 HIGH PRIORITY ISSUE #2: No React Error Boundary

### Severity: **HIGH** (Service Availability)

### Location
**File:** `/src/components/member/stand/StandViewer.tsx`

### Problem
If ANY child component throws an error, entire page crashes with white screen. No graceful fallback.

### Solution
```tsx
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({error}: {error: Error}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h1 className="text-2xl font-bold">Oops! Something went wrong</h1>
      <p className="text-muted-foreground">{error.message}</p>
      <button 
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-primary text-white rounded"
      >
        Reload Page
      </button>
    </div>
  );
}

export function StandViewer({ data }: StandViewerProps) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      {/* existing content */}
    </ErrorBoundary>
  );
}
```

### Estimated Fix Time: **20-30 minutes**

---

## 🟡 DESIGN GAP #1: Section Layer Access Control Unclear

### Severity: **MEDIUM** (Security Design)

### Problem
The `SECTION` annotation layer access control is not specified:
- Who can WRITE to SECTION annotations?
- Only section members? All members? Directors only?
- Current code doesn't validate section membership

### Current Code Gap
```tsx
// In /src/app/api/stand/annotations/route.ts POST handler
if (validated.layer === 'DIRECTOR') {
  // Director-only check ✅
  const roles = await getUserRoles(session.user.id);
  if (!roles.includes('DIRECTOR')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
// ⚠️ NO EQUIVALENT CHECK FOR SECTION LAYER
```

### Recommended Design
```tsx
// SECTION layer: Restrict to users assigned to the same section as the piece
if (validated.layer === 'SECTION') {
  const userMember = await prisma.member.findUnique({
    where: { userId: session.user.id },
    include: { sections: true }
  });
  
  if (!userMember) {
    return NextResponse.json( { error: 'Forbidden' }, { status: 403 });
  }

  // Get sections assigned to this music piece
  const musicAssignment = await prisma.musicAssignment.findUnique({
    where: { id: validated.musicId },
    include: { section: true }
  });

  if (!musicAssignment?.section) {
    return NextResponse.json({ error: 'Music has no section' }, { status: 400 });
  }

  // Verify user is in that section
  const userInSection = userMember.sections.some(
    s => s.id === musicAssignment.section.id
  );

  if (!userInSection) {
    return NextResponse.json(
      { error: 'Forbidden: not in section for this piece' },
      { status: 403 }
    );
  }
}
```

### Estimated Fix Time: **1-2 hours**

---

## 🟠 DESIGN GAP #2: Audio Link Management APIs Incomplete

### Severity: **LOW-MEDIUM** (Functionality)

### Problem
No update/delete endpoints for audio links:
- Directors can CREATE audio links
- Directors CANNOT update them
- Directors CANNOT delete them
- Requires database access to fix mistakes

### Current Routes
```
GET  /api/stand/audio       ✅ List audio links
POST /api/stand/audio       ✅ Create audio link
PUT  /api/stand/audio/[id]  ❌ MISSING
DELETE /api/stand/audio/[id] ❌ MISSING
```

### Required Implementation
Add to `/src/app/api/stand/audio/route.ts`:

```tsx
// PUT endpoint to update audio link
export async function PUT(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Director/librarian only
    const roles = await getUserRoles(session.user.id);
    if (!roles.includes('DIRECTOR') && !roles.includes('LIBRARIAN') && !roles.includes('SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const body = await request.json();
    const audioLink = await prisma.audioLink.update({
      where: { id },
      data: {
        url: body.url,
        description: body.description,
      },
    });

    return NextResponse.json({ audioLink });
  } catch (error) {
    console.error('Error updating audio link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE endpoint to remove audio link  
export async function DELETE(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Director/librarian only
    const roles = await getUserRoles(session.user.id);
    if (!roles.includes('DIRECTOR') && !roles.includes('LIBRARIAN') && !roles.includes('SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    await prisma.audioLink.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Audio link not found' }, { status: 404 });
    }
    console.error('Error deleting audio link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Estimated Fix Time: **1-2 hours**

---

## Priority Action Plan

### Phase 1: CRITICAL (Do First - Before Any Production Deployment)
**Target:** Complete within 24 hours

- [ ] **Implement event authorization** (See Critical Issue #1)
- [ ] **Add error boundary** to StandViewer
- [ ] **Test authorization** with unauthorized user
- [ ] **Deploy** to staging for validation

**Time Estimate:** 2-3 hours  
**Prerequisites:** None

### Phase 2: HIGH (Do Before Initial Release)
**Target:** Complete within 1 week

- [ ] **Implement SECTION layer access control**
- [ ] **Add audio link update/delete APIs**
- [ ] **Comprehensive security testing** with multiple user roles
- [ ] **Accessibility audit** with screen reader
- [ ] **Performance testing** with large PDFs

**Time Estimate:** 5-7 hours  
**Prerequisites:** Phase 1 complete

### Phase 3: MEDIUM (Do Before Rollout)
**Target:** Complete within 2 weeks

- [ ] **Implement audit logging** for all annotation changes
- [ ] **Offline support** via Service Worker
- [ ] **Optimistic updates** for better UX
- [ ] **Comprehensive load testing**
- [ ] **User acceptance testing**

**Time Estimate:** 8-12 hours  
**Prerequisites:** Phase 2 complete

---

## Quick Reference: Files Needing Changes

| File | Issue | Change Type | Priority |
|------|-------|-------------|----------|
| `/src/app/(member)/member/stand/[eventId]/page.tsx` | Missing auth | Add 15 lines | 🔴 CRITICAL |
| `/src/components/member/stand/StandViewer.tsx` | No error boundary | Add 20 lines | 🟠 HIGH |
| `/src/app/api/stand/annotations/route.ts` | SECTION layer missing | Add 20 lines | 🟡 HIGH |
| `/src/app/api/stand/audio/route.ts` | Missing PUT/DELETE | Add 80 lines | 🟡 MEDIUM |

---

## Testing Verification Checklist

After implementing fixes, verify with these tests:

### Authorization Tests
- [ ] Logged-out user → 401 Unauthorized
- [ ] Logged-in, wrong event → 404 Not Found
- [ ] Logged-in, no attendance → 404 Not Found
- [ ] Logged-in, attending event → 200 OK with data

### Layer Access Tests
- [ ] Non-director writes to DIRECTOR → 403 Forbidden
- [ ] Director writes to DIRECTOR → 201 Created
- [ ] Non-section writes to SECTION → 403 Forbidden (when implemented)
- [ ] Section member writes to SECTION → 201 Created (when implemented)
- [ ] Everyone reads allowed layers → 200 OK

### API Tests
- [ ] Update audio link → 200 OK
- [ ] Delete audio link → 200 OK
- [ ] Unauthorized update → 403 Forbidden
- [ ] Update non-existent → 404 Not Found

---

## Success Criteria

✅ All users can ONLY access events they attended  
✅ Director-only layers properly restricted  
✅ Section annotations properly scoped  
✅ No crashes on component errors  
✅ All API tests pass  
✅ Security audit passes  
✅ Ready for production deployment

---

**Full audit report:** See `DIGITAL_MUSIC_STAND_AUDIT.md`
