# Project Roadmap & TODOs

This document tracks the implementation progress of the Emerald Coast Community Band (ECCB) Management Platform. It is derived from the `IMPLEMENTATION_GUIDE.md` and the Master Feature List.

**Target Stack:** Next.js 16, React 19, PostgreSQL, Prisma, Better Auth, Redis, Local Disk or S3-Compatible (Free Tier).

---

  - [ ] **Project Initialization**
  - [X] Initialize Next.js 16 App Router project (`npx create-next-app@latest`)
  - [ ] Use the Next Devtools MCP Tool to ensure the app is next.js 16 compliant. (proxy.ts replaces middleware.ts)
  - [ ] Configure TypeScript (`tsconfig.json` strict mode)
  - [ ] Setup Tailwind CSS v4 & Shadcn UI
  - [ ] Configure ESLint & Prettier
  - [ ] Setup directory structure (`/app`, `/components`, `/lib`, `/types`)

  - [ ] **Database & Caching**
  - [ ] Provision PostgreSQL database (Local/Supabase/Neon)
  - [ ] Initialize Prisma ORM
  - [ ] Apply complete schema from `DATABASE_SCHEMA.md`
  - [ ] Run initial migration
  - [ ] Seed database with default Roles, Instruments, and Sections
  - [ ] Provision Redis instance (Upstash/Local)
  - [ ] Configure Redis client in `lib/redis.ts`

  - [ ] **File Storage**
  - [ ] Ensure Storage is configured for the project using a Locally Hosted Method
  - [ ] Configure CORS and Storage Policies
  - [ ] Implement `lib/storage.ts` service (Upload, Delete, Signed URLs)

  - [ ] **Better Auth Integration**
  - [ ] Install & configure Better Auth
  - [ ] Implement Email/Password login
  - [ ] Implement OAuth (Google)
  - [ ] Implement Magic Links
  - [ ] Implement Password Reset & Recovery flows
  - [ ] Configure Session Management (Redis-backed)

  - [ ] **RBAC Implementation**
  - [ ] Implement `requirePermission()` middleware/hook
  - [ ] Create Permission Matrix (Super Admin, Admin, Director, Section Leader, Librarian, Musician, Public)
  - [ ] Implement `proxy.ts` for route protection
  - [ ] Create "Forbidden" (403) page

  - [ ] **Security Hardening**
  - [ ] Implement Rate Limiting (API & Auth routes)
  - [ ] Configure CSRF protection
  - [ ] Set up Audit Logging service (`lib/audit.ts`)

  - [ ] **Music Catalog Management**
  - [ ] Create `MusicPiece` CRUD (Create, Read, Update, Delete)
  - [ ] Implement metadata fields (Composer, Arranger, Difficulty, Duration, Genre)
  - [ ] Implement "Library Tools" (Filtering, Sorting, Availability detection)

  - [ ] **File Management**
  - [ ] Implement File Upload UI (Drag & drop, progress bar)
  - [ ] Handle PDF uploads (Scores & Parts)
  - [ ] Handle Audio uploads (MP3/WAV)
  - [ ] Implement secure file download (Signed URLs)
  - [ ] **Feature:** Watermarking (Optional PDF manipulation on download)

  - [ ] **Assignments & Distribution**
  - [ ] Create Assignment UI (Assign to Section, Member, or Event)
  - [ ] Build "My Music" Dashboard for Musicians
  - [ ] Implement "What music do I need?" logic
  - [ ] Offline Access (Service Worker/PWA caching for PDFs)

  - [ ] **Member Profiles**
  - [ ] Create Member CRUD
  - [ ] Link `User` accounts to `Member` profiles
  - [ ] Implement Profile Fields (Instruments, Contact, Emergency Info)
  - [ ] Profile Photo upload

  - [ ] **Membership Lifecycle**
  - [ ] Implement Status tracking (Active, Inactive, Alumni, Leave of Absence)
  - [ ] Build New Member Onboarding Workflow
  - [ ] Build Audition Status tracking (Pending/Accepted/Declined)

  - [ ] **Self-Service Portal**
  - [ ] "My Profile" page for members to update own info
  - [ ] Availability preferences

---

  - [ ] **Event Management**
  - [ ] Create Event CRUD (Concerts, Rehearsals)
  - [ ] Implement Venue management
  - [ ] Call times & Dress code fields
  - [ ] **Feature:** Concert Program Order management

  - [ ] **Rehearsal Logistics**
  - [ ] Link Music pieces to Rehearsals (Repertoire list)
  - [ ] Rehearsal Notes (Section-specific & General)

  - [ ] **Attendance System**
  - [ ] Build Check-in Interface (Kiosk mode or Section Leader view)
  - [ ] Track Status (Present, Absent, Excused, Late)
  - [ ] Generate Attendance Reports & Analytics
  - [ ] Member participation analytics

  - [ ] **Announcements System**
  - [ ] Create Announcement CRUD
  - [ ] Implement Targeting (Global, Role-based, Section-based)
  - [ ] Dashboard "News Feed" widget

  - [ ] **Notifications**
  - [ ] Setup Email Provider (Resend/AWS SES)
  - [ ] Implement In-App Notification Center
  - [ ] Trigger emails for: New Music, Schedule Changes, Urgent Alerts
  - [ ] **Feature:** Push Notifications (PWA)

**Goal:** Replace legacy Vite app with Next.js CMS.

  - [ ] **CMS Architecture**
  - [ ] Implement `Page` and `PageVersion` logic
  - [ ] Build Block-based Page Builder (Hero, Text, Image, List)
  - [ ] Rich Text Editor (Markdown + WYSIWYG)

  - [ ] **Public Pages (Migration)**
  - [ ] Home Page (Hero, Announcements)
  - [ ] About the Band
  - [ ] Directors / Staff Bios
  - [ ] Concert & Event Listings
  - [ ] Contact Page (Form + Email trigger)
  - [ ] Join / Auditions Page

  - [ ] **Media Gallery**
  - [ ] Photo/Video Gallery component
  - [ ] Free storage integration for public media assets

  - [ ] **SEO & Publishing**
  - [ ] Metadata management per page
  - [ ] Draft / Preview / Publish workflow
  - [ ] Scheduled publishing

---

  - [ ] **Admin Dashboard**
  - [ ] High-level stats (Membership, Attendance, Library)
  - [ ] Recent Activity / Audit Log viewer

  - [ ] **Configuration**
  - [ ] Manage Instruments & Sections
  - [ ] Manage Roles & Permissions
  - [ ] System Settings (Global config)

  - [ ] **Search & Discovery**
  - [ ] Implement Global Search (Command Palette)
  - [ ] Advanced Music Search
  - [ ] Member Search

  - [ ] **Reporting**
  - [ ] Music Inventory Export (CSV/PDF)
  - [ ] Member Rosters (PDF)
  - [ ] Concert Programs generation
  - [ ] Licensing Compliance Reports

  - [ ] **Accessibility**
  - [ ] WCAG 2.1 AA Audit
  - [ ] Keyboard Navigation verification
  - [ ] Screen Reader testing
  - [ ] Large-print support for music parts (where applicable)

  - [ ] **UI Polish**
  - [ ] Dark Mode implementation
  - [ ] Mobile responsiveness check
  - [ ] Loading states (Skeletons) & Error Boundaries
  - [ ] GSAP Animations (Ported from legacy site)

  - [ ] **Testing**
  - [ ] Unit Tests (Vitest) for core logic
  - [ ] E2E Tests (Playwright) for critical flows
  - [ ] Load Testing (Music download concurrency)

  - [ ] **Migration**
  - [ ] Export data from any legacy systems
  - [ ] Import content into new CMS
  - [ ] Setup Redirects for old URLs

- [ ] **Infrastructure**
  - [ ] Configure Production Database (Backups, Point-in-time recovery)
  - [ ] Configure CDN / Edge Caching
  - [ ] Domain DNS setup
  - [ ] SSL Certificates

---

## 🔮 Future / Nice-to-Have (Feature 17)
**Goal:** Post-MVP enhancements. SKIP FOR NOW!!!

- [ ] Music playback with synced score
- [ ] Markup/annotation tools for PDF parts
- [ ] Practice tracking logs for musicians
- [ ] Donor management system
- [ ] Ticketing platform integration
- [ ] Music rental expiration alerts