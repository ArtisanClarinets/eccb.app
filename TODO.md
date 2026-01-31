# Project Roadmap & TODOs

This document tracks the implementation progress of the Emerald Coast Community Band (ECCB) Management Platform. It is derived from the `IMPLEMENTATION_GUIDE.md` and the Master Feature List.

**Target Stack:** Next.js 16, React 19, PostgreSQL, Prisma, Better Auth, Redis, S3/R2.

---

## 🏗️ Phase 1: Foundation & Infrastructure
**Goal:** Initialize the Next.js 16 platform and core backend services.

- [ ] **Project Initialization**
  - [ ] Initialize Next.js 16 App Router project (`npx create-next-app@latest`)
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
  - [ ] Provision S3 Bucket (AWS or Cloudflare R2)
  - [ ] Configure CORS and Bucket Policies
  - [ ] Implement `lib/storage.ts` service (Upload, Delete, Signed URLs)

---

## 🔐 Phase 2: Authentication & Security (Feature 2, 16)
**Goal:** Secure user access with Role-Based Access Control (RBAC).

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
  - [ ] Implement `middleware.ts` for route protection
  - [ ] Create "Forbidden" (403) page

- [ ] **Security Hardening**
  - [ ] Implement Rate Limiting (API & Auth routes)
  - [ ] Configure CSRF protection
  - [ ] Set up Audit Logging service (`lib/audit.ts`)

---

## 🎼 Phase 3: Music Library - Core Feature (Feature 5, 6, 11)
**Goal:** Digital music catalog, file management, and assignments.

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

---

## 👥 Phase 4: Member Management (Feature 3)
**Goal:** Manage band personnel and lifecycle.

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

## 📅 Phase 5: Events & Rehearsals (Feature 4, 7)
**Goal:** Schedule management and attendance tracking.

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

---

## 📢 Phase 6: Communications (Feature 8)
**Goal:** Internal messaging and notifications.

- [ ] **Announcements System**
  - [ ] Create Announcement CRUD
  - [ ] Implement Targeting (Global, Role-based, Section-based)
  - [ ] Dashboard "News Feed" widget

- [ ] **Notifications**
  - [ ] Setup Email Provider (Resend/AWS SES)
  - [ ] Implement In-App Notification Center
  - [ ] Trigger emails for: New Music, Schedule Changes, Urgent Alerts
  - [ ] **Feature:** Push Notifications (PWA)

---

## 🖥️ Phase 7: Public Website & CMS (Feature 1, 10)
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
  - [ ] S3 integration for public media assets

- [ ] **SEO & Publishing**
  - [ ] Metadata management per page
  - [ ] Draft / Preview / Publish workflow
  - [ ] Scheduled publishing

---

## 🛠️ Phase 8: Admin Tools & Reporting (Feature 9, 12, 13)
**Goal:** System administration and data insights.

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

---

## 🎨 Phase 9: UX & Accessibility (Feature 14)
**Goal:** Ensure the platform is usable by everyone.

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

---

## 🚀 Phase 10: Deployment & Launch
**Goal:** Production release.

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
**Goal:** Post-MVP enhancements.

- [ ] Music playback with synced score
- [ ] Markup/annotation tools for PDF parts
- [ ] Practice tracking logs for musicians
- [ ] Donor management system
- [ ] Ticketing platform integration
- [ ] Music rental expiration alerts