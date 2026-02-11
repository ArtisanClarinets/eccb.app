# Community Band Management Platform - Visual Architecture

## System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT DEVICES                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │   Desktop    │  │   Tablet     │  │   Mobile     │  │     PWA      ││
│  │   Browser    │  │   Browser    │  │   Browser    │  │ (Offline)    ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘│
│         │                  │                  │                  │       │
└─────────┼──────────────────┼──────────────────┼──────────────────┼───────┘
          │                  │                  │                  │
          └──────────────────┴──────────────────┴──────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            EDGE LAYER (CDN)                              │
├─────────────────────────────────────────────────────────────────────────┤
│  • Static asset caching                                                  │
│  • Geographic distribution                                               │
│  • DDoS protection                                                       │
│  • SSL/TLS termination                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NEXT.JS APPLICATION LAYER                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      MIDDLEWARE                                     │ │
│  │  • Authentication check                                             │ │
│  │  • Authorization (route-based)                                      │ │
│  │  • Rate limiting                                                    │ │
│  │  • Request logging                                                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │   App Router     │  │  Server Actions  │  │   API Routes         │ │
│  │  (RSC Pages)     │  │  (Mutations)     │  │  (REST/Webhooks)     │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘ │
│           │                      │                       │              │
│           └──────────────────────┴───────────────────────┘              │
│                                  │                                       │
└──────────────────────────────────┼───────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │   Auth   │  │  Member  │  │  Music   │  │  Event   │  │   CMS    │ │
│  │ Service  │  │ Service  │  │ Library  │  │ Service  │  │ Service  │ │
│  │          │  │          │  │ Service  │  │          │  │          │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Notify  │  │  Search  │  │  Report  │  │  Audit   │  │ Storage  │ │
│  │ Service  │  │ Service  │  │ Service  │  │ Service  │  │ Service  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │   PostgreSQL     │  │      Redis       │  │ Free Blob Storage    │ │
│  │                  │  │                  │  │                      │ │
│  │  • Users/Auth    │  │  • Sessions      │  │  • Music PDFs        │ │
│  │  • Members       │  │  • Permissions   │  │  • Images            │ │
│  │  • Music Catalog │  │  • Rate limits   │  │  • Documents         │ │
│  │  • Events        │  │  • Query cache   │  │  • Backups           │ │
│  │  • CMS Content   │  │  • Pub/Sub       │  │                      │ │
│  │  • Audit Logs    │  │                  │  │  (Local or S3-Comp)  │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Domain Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER (Bounded Contexts)                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              PUBLIC CONTENT DOMAIN                                │  │
│  │  • Public pages (Home, About, Events, Contact)                   │  │
│  │  • CMS-driven content                                             │  │
│  │  • SEO optimization                                               │  │
│  │  • No authentication required                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │         AUTHENTICATION & IDENTITY DOMAIN                          │  │
│  │  • User accounts & sessions                                       │  │
│  │  • Roles & permissions                                            │  │
│  │  • OAuth providers                                                │  │
│  │  • Password management                                            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              MEMBER MANAGEMENT DOMAIN                             │  │
│  │  • Member profiles                                                │  │
│  │  • Instruments & sections                                         │  │
│  │  • Lifecycle (active, inactive, alumni)                           │  │
│  │  • Emergency contacts                                             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │          ⭐ MUSIC LIBRARY DOMAIN (CORE)                           │  │
│  │  • Music catalog & metadata                                       │  │
│  │  • Full scores & parts                                            │  │
│  │  • File management & storage                                      │  │
│  │  • Part assignment & distribution                                 │  │
│  │  • Advanced search & filtering                                    │  │
│  │  • Download tracking                                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │            EVENTS & REHEARSALS DOMAIN                             │  │
│  │  • Concert & rehearsal scheduling                                 │  │
│  │  • Attendance tracking                                            │  │
│  │  • Music assignment per event                                     │  │
│  │  • Venue management                                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │             COMMUNICATIONS DOMAIN                                 │  │
│  │  • Announcements                                                  │  │
│  │  • Notifications (in-app, email, push)                            │  │
│  │  • Messaging                                                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              ADMINISTRATION DOMAIN                                │  │
│  │  • Dashboard & analytics                                          │  │
│  │  • Reporting & exports                                            │  │
│  │  • System configuration                                           │  │
│  │  • Audit logs                                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└────────────────────────────────────────────────────────────────────────┘

         ┌────────────────────────────────────────────────┐
         │        CROSS-CUTTING CONCERNS                   │
         ├────────────────────────────────────────────────┤
         │  • Authorization (RBAC)                         │
         │  • Audit Logging                                │
         │  • Search (Full-text)                           │
         │  • File Storage                                 │
         │  • Notifications                                │
         │  • Caching                                      │
         │  • Rate Limiting                                │
         └────────────────────────────────────────────────┘
```

---

## Permission Hierarchy

```
                    ┌────────────────────┐
                    │   SUPER_ADMIN      │
                    │  (1-2 people)      │
                    │  • Everything      │
                    └─────────┬──────────┘
                              │
                              │ Full system access
                              ▼
                    ┌────────────────────┐
                    │      ADMIN         │
                    │  (Board members)   │
                    │  • Band ops mgmt   │
                    └─────────┬──────────┘
                              │
                              │ Band operations
                              ▼
                    ┌────────────────────┐
                    │  DIRECTOR/STAFF    │
                    │  (Music leaders)   │
                    │  • Rehearsals      │
                    │  • Attendance      │
                    │  • Music assign    │
                    └─────────┬──────────┘
                              │
                              │ Musical leadership
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
    ┌────────────┐   ┌────────────┐   ┌────────────┐
    │  SECTION   │   │ LIBRARIAN  │   │  MUSICIAN  │
    │  LEADER    │   │            │   │            │
    │            │   │            │   │            │
    │ • Section  │   │ • Music    │   │ • View     │
    │   mgmt     │   │   library  │   │   assigned │
    │ • Section  │   │ • Upload   │   │   music    │
    │   comms    │   │ • Assign   │   │ • Profile  │
    └────────────┘   └────────────┘   └────────────┘
             │                │                │
             └────────────────┴────────────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │      PUBLIC        │
                    │  (Visitors)        │
                    │  • View website    │
                    └────────────────────┘
```

---

## Database Schema Relationships

```
┌─────────────┐       ┌──────────────┐       ┌──────────────┐
│    User     │───────│   UserRole   │───────│     Role     │
│             │ 1   N │              │ N   1 │              │
│ • email     │       │ • assignedAt │       │ • name       │
│ • password  │       │ • expiresAt  │       │ • type       │
│ • name      │       └──────────────┘       └──────┬───────┘
└──────┬──────┘                                     │
       │ 1                                          │ N
       │                                            │
       │                                    ┌───────▼────────┐
       │ 1                            ┌─────│ RolePermission │
       │                              │     └────────────────┘
       ▼ 1                            │              │ N
┌─────────────┐                       │              │
│   Member    │                       │     ┌────────▼────────┐
│             │                       └─────│   Permission    │
│ • firstName │                       N   1 │                 │
│ • lastName  │                             │ • name          │
│ • status    │                             │ • resource      │
└──────┬──────┘                             │ • action        │
       │                                    │ • scope         │
       │ N                                  └─────────────────┘
       │
       ├──────┐
       │      │
       │ 1    │ 1
       ▼ N    ▼ N
┌──────────┐ ┌──────────┐
│ Member   │ │ Member   │
│Instrument│ │ Section  │
└────┬─────┘ └────┬─────┘
     │ N          │ N
     │ 1          │ 1
     ▼            ▼
┌──────────┐ ┌──────────┐
│Instrument│ │ Section  │
│          │ │          │
│ • name   │ │ • name   │
│ • family │ │          │
└──────────┘ └──────────┘


┌──────────────┐
│  MusicPiece  │
│              │
│ • title      │
│ • composer   │
│ • difficulty │
└──────┬───────┘
       │ 1
       ├────────────┬────────────┬────────────┐
       │ N          │ N          │ N          │
       ▼            ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│MusicFile │ │MusicPart │ │  Music   │ │  Event   │
│          │ │          │ │Assignment│ │  Music   │
│ • name   │ │ • part   │ │          │ │          │
│ • type   │ │ • inst.  │ │          │ │ • order  │
│ • size   │ │          │ │          │ │          │
│ • storage key│ │          │ │          │ │          │
└──────────┘ └──────────┘ └────┬─────┘ └────┬─────┘
                               │ N          │ N
                               │ 1          │ 1
                               ▼            ▼
                          ┌──────────┐ ┌──────────┐
                          │  Member  │ │  Event   │
                          └──────────┘ │          │
                                       │ • title  │
                                       │ • type   │
                                       │ • start  │
                                       └────┬─────┘
                                            │ 1
                                            │ N
                                            ▼
                                       ┌──────────┐
                                       │Attendance│
                                       │          │
                                       │ • status │
                                       │ • notes  │
                                       └──────────┘
```

---

## Data Flow: Downloading Music

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 1: User requests music download                                    │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 2: Middleware checks authentication                                │
│  • Is user logged in?                                                    │
│  • Session valid?                                                        │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ ✅ Authenticated
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 3: Server Action checks permissions                                │
│  • Query user's roles from DB                                            │
│  • Check permissions in Redis cache                                      │
│  • Does user have music.download.all or music.download.assigned?         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ ✅ Authorized
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 4: Check assignment (if music.download.assigned)                   │
│  • Query MusicAssignment table                                           │
│  • Is this piece assigned to this member?                                │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ ✅ Assigned
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 5: Generate signed URL                                             │
│  • Get file storage key from MusicFile table                             │
│  • Generate secure access URL (e.g., S3 signed URL)                      │
│  • Optional: Add watermark with member ID                                │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 6: Log download                                                    │
│  • Create FileDownload record                                            │
│  • Log user, timestamp, IP, file                                         │
│  • Update music usage statistics                                         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 7: Create audit log                                                │
│  • AuditLog entry                                                        │
│  • Action: DOWNLOAD, EntityType: MusicFile                               │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 8: Return secure URL to client                                     │
│  • Client redirects to Storage URL                                       │
│  • File downloaded directly from container                                │
│  • No application server load                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Caching Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           REQUEST FLOW                                   │
└─────────────────────────────────────────────────────────────────────────┘

  User Request
       │
       ▼
  ┌────────────────────┐
  │   EDGE CDN         │  Cache HIT? ──────────────► Return cached
  │   (Static assets,  │                              response
  │    public pages)   │                              (fastest)
  └─────────┬──────────┘
            │ Cache MISS
            ▼
  ┌────────────────────┐
  │   Next.js ISR      │  Cache HIT? ──────────────► Return cached
  │   (Public pages)   │                              page (fast)
  └─────────┬──────────┘
            │ Cache MISS / Revalidate
            ▼
  ┌────────────────────┐
  │   Redis Cache      │  Cache HIT? ──────────────► Return from
  │   (Query results,  │                              Redis (fast)
  │    user perms)     │
  └─────────┬──────────┘
            │ Cache MISS
            ▼
  ┌────────────────────┐
  │   PostgreSQL       │  Query database ─────────► Return from DB
  │   (Source of truth)│                              (slower)
  └────────────────────┘
            │
            └──────────► Cache result in Redis
                         for next request


TTL (Time To Live) Strategy:

┌─────────────────────┬──────────────┬──────────────────────────┐
│ Data Type           │ Cache Layer  │ TTL                      │
├─────────────────────┼──────────────┼──────────────────────────┤
│ Static assets       │ CDN          │ 1 year (immutable)       │
│ Public pages        │ CDN + ISR    │ 5-60 minutes             │
│ User permissions    │ Redis        │ 5 minutes                │
│ Music catalog       │ Redis        │ 1 hour                   │
│ Member list         │ Redis        │ 10 minutes               │
│ Event calendar      │ Redis        │ 5 minutes                │
│ Session data        │ Redis        │ 7 days                   │
└─────────────────────┴──────────────┴──────────────────────────┘

Invalidation Strategy:

┌─────────────────────┬──────────────────────────────────────┐
│ Event               │ Invalidation                         │
├─────────────────────┼──────────────────────────────────────┤
│ User role change    │ Delete permissions:${userId} key     │
│ Music updated       │ Delete music:${pieceId} key          │
│ Event created       │ Revalidate /events path              │
│ CMS page published  │ Revalidate specific page path        │
│ Member status       │ Delete member:list key               │
└─────────────────────┴──────────────────────────────────────┘
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION DEPLOYMENT                            │
└─────────────────────────────────────────────────────────────────────────┘

                         ┌────────────────┐
                         │   GitHub       │
                         │   Repository   │
                         └────────┬───────┘
                                  │
                      Push to main branch
                                  │
                                  ▼
                         ┌────────────────┐
                         │  GitHub        │
                         │  Actions       │
                         │  (CI/CD)       │
                         └────────┬───────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
            ┌──────────┐  ┌──────────┐  ┌──────────┐
            │   Lint   │  │   Test   │  │  Build   │
            │ ESLint   │  │  Vitest  │  │  Next.js │
            └──────────┘  └──────────┘  └──────────┘
                    │             │             │
                    └─────────────┼─────────────┘
                                  │ All pass ✅
                                  ▼
                         ┌────────────────┐
                         │   Deploy to    │
                         │    Vercel      │
                         └────────┬───────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
          ┌──────────────┐ ┌──────────┐ ┌──────────┐
          │   Run DB     │ │  Deploy  │ │  Notify  │
          │  Migrations  │ │   Edge   │ │   Team   │
          │   (Prisma)   │ │ Functions│ │  (Slack) │
          └──────────────┘ └──────────┘ └──────────┘
                                  │
                                  ▼
                         ┌────────────────┐
                         │   Health Check │
                         │   Smoke Tests  │
                         └────────┬───────┘
                                  │
                         ✅ Deployment Complete


Production Environment:

┌──────────────────────────────────────────────────────────────┐
│  Vercel                                                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Edge Functions                                        │  │
│  │  • Next.js App Router                                  │  │
│  │  • Server Components                                   │  │
│  │  • API Routes                                          │  │
│  │  • Middleware                                          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  PostgreSQL  │ │    Redis     │ │ Free Storage │
│  (Supabase)  │ │   (Upstash)  │ │(Local/S3-Comp)│
│              │ │              │ │              │
│ • Primary DB │ │ • Cache      │ │ • Music PDFs │
│ • Backups    │ │ • Sessions   │ │ • Images     │
│ • Replicas   │ │ • Pub/Sub    │ │ • Backups    │
└──────────────┘ └──────────────┘ └──────────────┘


Monitoring:

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Vercel     │ │    Sentry    │ │   Uptime     │
│  Analytics   │ │ Error Track  │ │   Monitor    │
│              │ │              │ │              │
│ • Requests   │ │ • Exceptions │ │ • Availability│
│ • Latency    │ │ • Stack trace│ │ • Response   │
│ • Bandwidth  │ │ • User impact│ │ • Alerts     │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## Security Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SECURITY DEFENSE IN DEPTH                         │
└─────────────────────────────────────────────────────────────────────────┘

Layer 1: Network Security
┌────────────────────────────────────────────────────────────────────────┐
│  • HTTPS/TLS 1.3 only                                                   │
│  • DDoS protection (Cloudflare/Vercel)                                  │
│  • Firewall rules                                                       │
│  • IP allowlisting (optional for admin)                                 │
└────────────────────────────────────────────────────────────────────────┘

Layer 2: Application Edge
┌────────────────────────────────────────────────────────────────────────┐
│  • Rate limiting (per IP, per user)                                     │
│  • Request validation                                                   │
│  • WAF rules                                                            │
│  • Bot detection                                                        │
└────────────────────────────────────────────────────────────────────────┘

Layer 3: Authentication
┌────────────────────────────────────────────────────────────────────────┐
│  • Better Auth session management                                       │
│  • Secure password hashing (bcrypt)                                     │
│  • OAuth 2.0 / OIDC                                                     │
│  • MFA (optional, role-based)                                           │
│  • Session expiration & rotation                                        │
└────────────────────────────────────────────────────────────────────────┘

Layer 4: Authorization (RBAC)
┌────────────────────────────────────────────────────────────────────────┐
│  • Role-based permissions                                               │
│  • Permission checks on EVERY action                                    │
│  • Scope-aware (all, assigned, own)                                     │
│  • No client-side trust                                                 │
└────────────────────────────────────────────────────────────────────────┘

Layer 5: Input Validation
┌────────────────────────────────────────────────────────────────────────┐
│  • Zod schemas for all inputs                                           │
│  • SQL injection prevention (Prisma)                                    │
│  • XSS prevention (React escaping)                                      │
│  • CSRF tokens (Next.js built-in)                                       │
│  • File upload validation                                               │
└────────────────────────────────────────────────────────────────────────┘

Layer 6: Data Protection
┌────────────────────────────────────────────────────────────────────────┐
│  • Encryption at rest (database, S3)                                    │
│  • Encryption in transit (TLS)                                          │
│  • Secure access URLs (signed) for file access                          │
│  • PII encryption (sensitive fields)                                    │
│  • Secure secrets management (env vars)                                 │
└────────────────────────────────────────────────────────────────────────┘

Layer 7: Audit & Monitoring
┌────────────────────────────────────────────────────────────────────────┐
│  • Comprehensive audit logging                                          │
│  • Failed login attempts tracked                                        │
│  • Permission changes logged                                            │
│  • File downloads tracked                                               │
│  • Security alerts                                                      │
└────────────────────────────────────────────────────────────────────────┘

Layer 8: Recovery
┌────────────────────────────────────────────────────────────────────────┐
│  • Automated database backups                                           │
│  • Point-in-time recovery                                               │
│  • Soft deletes (30-day recovery)                                       │
│  • Incident response plan                                               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Conclusion

These visual diagrams provide a clear understanding of:

1. **System architecture** - How components interact
2. **Domain boundaries** - What each area manages
3. **Permission hierarchy** - Who can do what
4. **Database relationships** - How data connects
5. **Data flow** - Example of secure file download
6. **Caching strategy** - Performance optimization
7. **Deployment** - Production environment
8. **Security layers** - Defense in depth

Use these diagrams in conjunction with the detailed documentation:
- `ARCHITECTURE.md` - Complete technical specifications
- `DATABASE_SCHEMA.md` - Full Prisma schema
- `PERMISSIONS.md` - RBAC implementation
- `IMPLEMENTATION_GUIDE.md` - Build instructions
- `PLATFORM_OVERVIEW.md` - Executive summary

**Status:** ✅ Ready for implementation
