# Enterprise Music Management System - Review & Roadmap

**Target Comparison:** New York Philharmonic Orchestra, Berlin Philharmonic, Chicago Symphony Orchestra

---

## Executive Summary

Your platform has a **solid foundation** with:
- ✅ Soft deletes + archive system
- ✅ File versioning & tracking
- ✅ Assignment management with status tracking  
- ✅ Role-based access control
- ✅ Audit logging
- ✅ Smart Upload with AI metadata extraction

**Critical gaps for enterprise orchestras:**
- ❌ No physical inventory management (tracking actual sheet music copies)
- ❌ No advanced search/analytics dashboard
- ❌ Limited reporting capabilities
- ❌ No workflow automation (approvals, retentions)
- ❌ No bulk import/export with data validation
- ❌ Missing performance analytics (utilization, costs)
- ❌ No condition tracking for physical materials
- ❌ Limited data quality & integrity tools
- ❌ No integration with external libraries (IMSLP, InformedBand)
- ❌ Weak conflict detection & duplicate prevention

---

## Part 1: Current Architecture Analysis 

### ✅ Strengths

| Feature | Status | Notes |
|---------|--------|-------|
| **Soft Delete/Archive** | ✅ | Pieces can be trashed, restored, archived |
| **File Versioning** | ✅ | Track file history with versions table |
| **Part Assignment** | ✅ | Assign by instrument/part type |
| **Assignment Tracking** | ✅ | Status, due dates, conditions |
| **CSV Export** | ✅ | Basic filtering support |
| **Audit Logs** | ✅ | All changes tracked with user context |
| **Real-time Updates** | ⚠️ | SSE heartbeat; not true real-time |
| **Smart Upload** | ✅ | OCR-first LLM extraction with review |

### ⚠️ Partially Implemented

| Feature | Status | Gap |
|---------|--------|-----|
| **Filtering** | ⚠️ | Genre, difficulty, status only; needs full-text search |
| **Pagination** | ⚠️ | Fixed 20 items/page; no cursor-based pagination |
| **Permissions** | ⚠️ | Basic RBAC; missing scoped permissions (view own section's music) |
| **Error Handling** | ⚠️ | Generic error messages; no user-friendly fallback UI |

### ❌ Missing Enterprise Features

See sections below.

---

## Part 2: Missing Enterprise Features by Category

### **A. Physical Inventory Management** [CRITICAL]

**Orchestra Reality:** Music directors care about ACTUAL SHEET MUSIC COPIES.

#### Current Gap:
- You track *digital files* and *assignments*
- You **don't track physical parts** (how many copies exist, condition, location)

#### What Orchestras Need:

```prisma
// NEW: Inventory & Condition Tracking
model MusicInventoryItem {
  id          String   @id @default(cuid())
  pieceId     String
  partId      String?  // Links to MusicPart if specified
  
  // Physical characteristics
  quantity    Int      @default(1)  // How many copies
  condition   InventoryCondition  // PRISTINE, GOOD, FAIR, POOR, DAMAGED, MISSING
  location    String?  // Shelf location, storage area, loaned to whom
  barcode     String?  @unique  // For scanning
  
  // Tracking
  receivedDate  DateTime
  retirementDate DateTime?  // When should this be refiled/retired
  notes         String?
  
  // Relationships
  piece       MusicPiece @relation(fields: [pieceId], references: [id], onDelete: Cascade)
  part        MusicPart?  @relation(fields: [partId], references: [id])
  movements   InventoryMovement[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([pieceId])
  @@index([partId])
  @@index([condition])
}

// Track every movement: checkout, checkin, condition change
model InventoryMovement {
  id          String   @id @default(cuid())
  itemId      String
  type        MovementType  // CHECKOUT, CHECKIN, CONDITION_CHANGE, REPAIR, RETIRE
  fromState   String?  // JSON: {location, condition, assignee}
  toState     String?  // JSON
  reason      String?  // "Section rehearsal 2025-03-10", "Damaged spine", etc.
  
  performedBy String
  performedAt DateTime @default(now())
  
  item        MusicInventoryItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  
  @@index([itemId])
  @@index([performedAt])
}

enum InventoryCondition {
  PRISTINE      // Like new
  GOOD          // Normal wear
  FAIR          // Visible wear but playable
  POOR          // Significant wear
  DAMAGED       // Needs repair
  MISSING       // Physically lost
  ARCHIVED      // Retired from use
}

enum MovementType {
  CHECKOUT       // Assigned to member/section
  CHECKIN        // Returned
  CONDITION_CHANGE
  REPAIR
  RETIRE        // No longer in active use
  TRANSFER      // Moved to different location
}
```

#### Implementation Priorities:
1. **API: Inventory tracking** - Check in/out, condition updates
2. **UI: Inventory dashboard** - Current state, low/missing alerts
3. **Reporting: Condition lifecycle** - Age, usage patterns, maintenance needs
4. **Integration: Barcode scanning** - Mobile/tablet checkout workflow

---

### **B. Advanced Search & Analytics** [CRITICAL]

**Orchestra Reality:** Librarians spend hours finding music by title, composer, date used, instrumentation, etc.

#### Current Gap:
- Only search by title/composer name with LIKE
- No full-text search
- No analytics dashboard
- No saved searches/filters

#### What's Needed:

```typescript
// 1. FULL-TEXT SEARCH API
// GET /api/admin/music/search
// Advanced query syntax: 
//   "Beethoven" + "Symphony" + "instrumentation:piccolo" + "difficulty:4+"
//   "used:2024" + "genre:classical" + "status:active"

// 2. ANALYTICS DASHBOARD
// Metrics orchestras track:
// - Most frequently used pieces (by season, section, date range)
// - Physical condition trends (how pieces degrade over time)
// - Assignment utilization rates
// - Parts per piece (are we missing copies?)
// - Composers/arrangers coverage
// - Instrumentation gaps (what parts are hardest to fill?)

// 3. SAVED SEARCHES / SMART COLLECTIONS
model MusicCollection {
  id        String   @id @default(cuid())
  name      String   // "2025 Spring Season", "Beginner Pieces", "Piccolo Parts"
  
  // One of these:
  pieceIds  String[] // Explicit list
  query     String?  // JSON serialized FilterQuery for dynamic collections
  
  createdBy String
  createdAt DateTime @default(now())
  
  // For quick access in UI
  isStarred Boolean @default(false)
}

// 4. SMART FILTERS / FACETS
// Return counts:
// {
//   composers: [{name: "Mozart", count: 12, link: "?composer=mozart"}, ...],
//   genres: [...],
//   difficulties: [...],
//   years: [{2024: 8, 2025: 5}],
//   hasAudioTrack: {true: 5, false: 7},
//   assignmentStatus: {assigned: 10, unassigned: 2},
// }
```

#### Implementation Roadmap:
1. **Search API v2** - Full-text search with PostgreSQL `tsvector` or Elasticsearch
2. **Analytics endpoint** - Aggregations by composer, genre, usage frequency
3. **Collections UI** - Save/organize search results
4. **Dashboard** - Charts (pie: genres, bar: difficulty distribution, heatmap: usage by month)

---

### **C. Workflow Automation** [HIGH]

**Orchestra Reality:** Processes are manual and error-prone (music approval, retention schedules, rotation policies).

#### Missing Workflows:

```typescript
// 1. MULTI-STEP APPROVAL WORKFLOW
model MusicApprovalFlow {
  id          String   @id @default(cuid())
  pieceId     String
  
  // Approval chain
  requestedBy String  // Usually librarian
  directors   String[] // JSON: list of director IDs who must approve
  approvedBy  String?
  rejectedBy  String?
  rejectionReason String?
  
  status      ApprovalStatus // PENDING, APPROVED, REJECTED, DRAFTED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([status])
  @@index([pieceId])
}

// 2. AUTOMATIC RETENTION POLICY
model RetentionPolicy {
  id          String   @id @default(cuid())
  name        String   // "Concert Archive", "Educational Only", "Rental"
  
  // Rules
  keepDuration  Int  // Months. null = forever
  maxCopies     Int? // Limit physical copies
  autoRetire    Boolean @default(true)
  
  createdAt   DateTime @default(now())
}

// Track compliance
model RetentionLog {
  id          String   @id @default(cuid())
  pieceId     String
  policyId    String
  action      String  // "marked_for_retirement", "archived", "purged"
  scheduledFor DateTime
  completedAt DateTime?
  
  createdAt   DateTime @default(now())
}

// 3. AUTOMATIC CONDITION ASSESSMENT
model MaintenanceSchedule {
  id          String   @id @default(cuid())
  itemId      String
  
  lastInspected DateTime?
  nextInspection DateTime
  
  condition   InventoryCondition
  notes       String?
  
  @@index([nextInspection])
}
```

#### Implementation:
1. **Approval step** - Before new pieces go live
2. **Retention scheduler** - Periodic review of old pieces
3. **Maintenance alerts** - Inspections due, condition tracking

---

### **D. Advanced Reporting & Compliance** [HIGH]

**Orchestras need to prove:**
- Budget allocation (how much do we spend on music annually?)
- Compliance (licensing, copyright tracking)
- Performance metrics (utilization, diversity of repertoire)

#### Missing Reports:

```typescript
// GET /api/admin/music/reports/[reportType]
// Types:
// - usage: How many times each piece was assigned (by season, by concert, by member)
// - inventory: Physical copies, condition distribution, missing items
// - budget: Estimated costs (per piece, per composer, per genre)
// - compliance: Licensing status, copyright warnings, ASCAP/BMI tracking
// - diversity: Composer gender/ethnicity/era distribution
// - instrumentation: Coverage of all instruments, missing parts
// - timeline: When pieces were added, retired, last used

type ReportType = 
  | 'usage'
  | 'inventory'
  | 'budget'
  | 'compliance'
  | 'diversity'
  | 'instrumentation'
  | 'timeline';

// Budget tracking
model MusicCost {
  id        String   @id @default(cuid())
  pieceId   String
  
  type      CostType  // PURCHASE, LICENSE, RENTAL, REPAIR, STORAGE
  amount    Decimal
  currency  String @default("USD")
  
  costDate  DateTime
  notes     String?
  
  piece     MusicPiece @relation(fields: [pieceId], references: [id])
  
  @@index([pieceId])
  @@index([costDate])
}

// Licensing compliance
model LicenseInfo {
  id        String   @id @default(cuid())
  pieceId   String
  
  publisher String?
  license   String?  // "ASCAP", "BMI", "SESAC", "Public Domain"
  notes     String?
  verified  Boolean @default(false)
  
  piece     MusicPiece @relation(fields: [pieceId], references: [id])
}
```

---

### **E. Data Quality & Integrity Tools** [HIGH]

#### What's Missing:
```typescript
// 1. DUPLICATE DETECTION
// API: POST /api/admin/music/find-duplicates
// Returns potential duplicates:
// - Exact title match
// - Similar titles (fuzzy match) + same composer
// - Same catalogNumber + publisher
// Smart merge tool

// 2. VALIDATION & CLEANUP UTILITY
type DataQualityIssue = 
  | 'missing_composer'     // No composer assigned
  | 'missing_title'        // No title
  | 'title_inconsistency'  // Title has weird spacing, casing
  | 'no_files'             // Piece has no files
  | 'orphaned_part'        // Part with no file reference
  | 'outdated_metadata'    // Not updated in 2+ years
  | 'assignment_inconsistency';  // Assigned but no files

// 3. BULK FIX OPERATIONS
// - Auto-fill missing composers (from IMSLP/OpenMusic API)
// - Normalize title casing
// - Merge duplicate pieces
// - Relink orphaned parts

// 4. DATA IMPORT VALIDATION
model ImportLog {
  id          String   @id @default(cuid())
  fileName    String
  totalRows   Int
  successCount Int
  errorCount  Int
  
  issues      String[] // JSON array of validation errors
  createdAt   DateTime @default(now())
  
  @@index([createdAt])
}
```

---

### **F. Integration Capabilities** [MEDIUM]

#### What's Missing:
```typescript
// 1. EXTERNAL LIBRARY SYNC
// - IMSLP (International Music Score Library Project) lookup
// - OpenMusic database
// - BandMix / InformedBand integration

// 2. EVENT CALENDAR SYNC
// When piece is assigned to concert, sync to:
// - Google Calendar
// - iCal feeds
// - Email reminders

// 3. MEMBER NOTIFICATION SYSTEM
// When new music is assigned:
// - Push notification in portal
// - Email digest
// - In-app messaging

model MusicLibraryIntegration {
  id          String   @id @default(cuid())
  type        IntegrationType  // IMSLP, OPENMUSIC, CALENDAR, EMAIL
  
  enabled     Boolean
  config      String  // JSON: API keys, endpoints
  
  lastSync    DateTime?
  nextSync    DateTime?
  
  createdAt   DateTime @default(now())
}
```

---

### **G. Performance & Optimization** [MEDIUM]

#### Issues with Current Implementation:
```typescript
// 1. SEARCH PERFORMANCE
// Current: SELECT * WHERE title LIKE '%search%' 
// Problem: Full table scan, slow with 10k+ pieces
// Solution: Full-text search index (PostgreSQL tsvector, MySQL FULLTEXT)

// 2. PAGINATION
// Current: SKIP/TAKE with fixed limit (20)
// Problem: Deep pagination slow (skip 10000)
// Solution: Cursor-based pagination

// 3. REAL-TIME UPDATES
// Current: SSE with 30-second heartbeat
// Problem: Not true real-time, waste of resources
// Solution: WebSocket with selective subscriptions, or trigger-based updates

// 4. QUERY OPTIMIZATION
// Current: N+1 queries (get pieces, then load composer for each)
// Solution: Use Prisma include() strategically, implement caching

// 5. CACHING STRATEGY
// Missing: Cache for:
// - Composer/arranger/publisher lists
// - Genre list (used in filters)
// - Difficulty counts
// - Collection stats
// Redis TTL: 5-10 minutes for collections, 1 hour for reference data
```

---

### **H. User Experience Improvements** [MEDIUM]

#### Missing:
```typescript
// 1. BULK OPERATIONS WITH CONFIRMATION
// Currently: Bulk delete is async, no confirmation preview
// Need: Show "You're about to delete 47 pieces. Are you sure?"
// Include: Which assignments will be affected

// 2. UNDO/REDO CAPABILITY
// Track recent actions, allow rollback within time window

// 3. RECENTLY USED / STARRED
// Quick access to favorite pieces

// 4. IMPORT WIZARD
// Step-by-step CSV/Excel import with preview & validation

// 5. MOBILE-RESPONSIVE ADMIN
// Librarians need tablet checkout interface
```

---

## Part 3: Priority Roadmap

### **Phase 1: Foundation (Months 1-2)** [CRITICAL]
**Impact: High** | **Effort: Medium**

- [ ] **Inventory tracking** - Add condition & location tracking
- [ ] **Full-text search** - Implement search API v2
- [ ] **Data quality tools** - Duplicate detection, validation
- [ ] **Approval workflow** - Basic 2-step approval before publication

### **Phase 2: Analytics & Automation (Months 3-4)** [HIGH]
**Impact: High** | **Effort: Medium-High**

- [ ] **Analytics dashboard** - Usage, conditions, utilization rates
- [ ] **Reporting suite** - Budget, compliance, diversity
- [ ] **Integration framework** - IMSLP lookup, event sync
- [ ] **Advanced filtering** - Saved searches, smart collections

### **Phase 3: Enterprise Polish (Months 5-6)** [MEDIUM]
**Impact: Medium** | **Effort: High**

- [ ] **Performance optimization** - Caching, query optimization
- [ ] **Bulk import wizard** - Excel → Music library
- [ ] **Retention scheduling** - Automatic lifecycle mgmt
- [ ] **Mobile interface** - Tablet-friendly checkout

### **Phase 4: Scale & Integration (Months 7+)** [ONGOING]
- [ ] External library APIs (IMSLP, OpenMusic)
- [ ] Advanced notifications & calendaring
- [ ] Custom reporting builder
- [ ] Multi-organization support

---

## Part 4: Detailed Implementation Guides

### **4.1: Inventory Tracking Implementation**

**API Endpoints Needed:**

```typescript
// POST /api/admin/music/{pieceId}/inventory
// Create physical inventory records per piece
interface CreateInventoryRequest {
  partId?: string;           // If specific part
  quantity: number;
  condition: InventoryCondition;
  location: string;
  notes?: string;
}

// POST /api/admin/music/inventory/{itemId}/checkout
// Check out to member/section
interface CheckoutRequest {
  assignedTo: string;        // Member or Section ID
  dueDate: Date;
  reason?: string;           // "Concert", "Rehearsal", "Solo prep"
}

// POST /api/admin/music/inventory/{itemId}/checkin
// Return item, update condition
interface CheckinRequest {
  condition: InventoryCondition;
  notes?: string;            // "Spine repaired", "Water damaged"
  reportedIssues?: string[];
}

// GET /api/admin/music/inventory/status
// Dashboard: What's checked out, overdue, missing, poor condition
```

**UI Components:**

```
┌─ Inventory Dashboard ─────────────────────────────┐
│ Status Cards:                                     │
│ • 847 items in inventory                          │
│ • 12 items checked out (2 overdue)               │
│ • 3 items in poor condition (need repair)         │
│ • 1 item missing (Flute 1 - March issue)         │
└───────────────────────────────────────────────────┘

Inventory Table:
┌────────────────────────────────────────────────┐
│ Piece | Part | Qty | Location | Condition | Status│
├────────────────────────────────────────────────┤
│ Beethoven... | Violin 1 | 12 | Shelf A3 | GOOD | ✓ |
│ Mozart... | Flute | 8 | Shelf B1 | FAIR | ⚠ |
│ Bach... | Full Score | 1 | Repair | DAMAGED | 🔧 |
└────────────────────────────────────────────────┘
```

### **4.2: Full-Text Search Implementation**

**For MariaDB/MySQL:**

```sql
-- Add FULLTEXT index
ALTER TABLE MusicPiece ADD FULLTEXT INDEX ft_search 
  (title, notes, genre);

-- Query
SELECT * FROM MusicPiece 
WHERE MATCH(title, notes, genre) AGAINST('+Beethoven +Symphony' IN BOOLEAN MODE)
ORDER BY MATCH(title) AGAINST('Beethoven') DESC;
```

**For PostgreSQL:**

```sql
-- Create tsvector column
ALTER TABLE "MusicPiece" ADD COLUMN search_text tsvector;

-- Index it
CREATE INDEX music_search_idx ON "MusicPiece" USING GIN(search_text);

-- Update trigger
CREATE OR REPLACE FUNCTION music_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_text := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.genre, '') || ' ' ||
    COALESCE(NEW.notes, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER music_search_update BEFORE INSERT OR UPDATE ON "MusicPiece"
FOR EACH ROW EXECUTE FUNCTION music_search_trigger();
```

**API Endpoint:**

```typescript
// GET /api/admin/music/search?q=beethoven+symphony&filters[genre]=classical&facets=true
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || '';
  const facets = request.nextUrl.searchParams.get('facets') === 'true';

  // Parse complex query: "beethoven" + "symphony" + "instrumentation:piccolo"
  const { terms, filters } = parseSearchQuery(query);

  const results = await prisma.musicPiece.findMany({
    where: {
      AND: [
        { search_text: { search: terms.join(' & ') } },
        // Apply filters
        filters.genre ? { genre: filters.genre } : {},
        filters.difficulty ? { difficulty: filters.difficulty } : {},
        filters.composer ? { composerId: filters.composer } : {},
      ],
    },
    take: 50,
  });

  if (facets) {
    // Return aggregated counts for UI
    const composers = await prisma.musicPiece.groupBy({
      by: ['composerId'],
      _count: true,
    });
    return { results, facets: { composers } };
  }

  return { results };
}
```

### **4.3: Analytics Dashboard API**

```typescript
// GET /api/admin/music/analytics/usage
// Returns: Most used pieces, by season/section
interface UsageAnalytics {
  mostUsedPieces: Array<{
    piece: MusicPiece;
    assignmentCount: number;
    lastUsed: Date;
    uniqueSections: number;
  }>;
  
  byComposer: Array<{
    composerId: string;
    composerName: string;
    pieceCount: number;
    assignmentCount: number;
  }>;
  
  byGenre: Record<string, number>;
  
  timeline: Array<{
    month: string;
    newPieces: number;
    assignedPieces: number;
    retiredPieces: number;
  }>;
}

// GET /api/admin/music/analytics/inventory-health
interface InventoryHealth {
  conditionDistribution: {
    PRISTINE: number;
    GOOD: number;
    FAIR: number;
    POOR: number;
    DAMAGED: number;
    MISSING: number;
  };
  
  averageAge: number; // in months
  itemsNeedingMaintenance: number;
  
  byPiece: Array<{
    piece: MusicPiece;
    totalCopies: number;
    conditionScore: number; // 0-100
    status: 'healthy' | 'at-risk' | 'critical';
  }>;
}

// GET /api/admin/music/analytics/completeness
// How complete is metadata? What's missing?
interface CompletenessAnalytics {
  completenessScore: number; // 0-100
  missingFields: {
    composer: number;
    genre: number;
    difficulty: number;
    files: number;
  };
  recommendations: string[];
}
```

---

## Part 5: Code Quality & Security Considerations

### **Security Enhancements Needed:**

```typescript
// 1. RATE LIMITING on CSV export (prevent abuse)
// - Max 10 exports per hour per user
// - Larger exports require admin approval

// 2. VALIDATION of imported data
// - Check for duplicate catalogNumbers
// - Validate file formats
// - Scan for suspicious metadata

// 3. AUDIT TRAIL for critical operations
// - Track who created/modified/deleted pieces
// - Archive deleted pieces in separate table
// - Alert on bulk operations (>100 pieces)

// 4. DATA RETENTION POLICY
// - Archive deleted pieces after 90 days
// - Purge audit logs after 2 years
// - Comply with GDPR for member data
```

### **Performance Targets:**

| Operation | Current | Target | Priority |
|-----------|---------|--------|----------|
| List 50 pieces | ~200ms | <100ms | HIGH |
| Search (10k pieces) | N/A (not tested) | <200ms | HIGH |
| Export CSV (all pieces) | ? | <5s | MEDIUM |
| Inventory status dashboard | ? | <300ms | HIGH |
| Approve bulk operation | ~5s | <2s | MEDIUM |

---

## Part 6: Comparative Analysis

### **How Enterprise Orchestras Do It:**

| Feature | NYPhil | Berlin Phil | Chicago Sym | ECCB Now | ECCB Target |
|---------|--------|------------|------------|----------|------------|
| **Soft Delete** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Physical Inventory** | ✅ | ✅ | ✅ | ❌ | ⚠️ Phase 1 |
| **Search** | Advanced FT | Platform-specific | SQL | Basic LIKE | ✅ Phase 1 |
| **Analytics** | Custom BI | Tableau/Power BI | In-house | ❌ | ✅ Phase 2 |
| **Approval Workflows** | ✅ | ✅ | ✅ | ❌ | ✅ Phase 1 |
| **Integration** | IMSLP, Licensor | Custom APIs | Licensing DB | ❌ | Phase 3 |
| **Mobile Checkout** | ✅ | ✅ | ✅ | ❌ | Phase 3 |
| **Licensing Tracking** | ✅ | ✅ | ✅ | ❌ | Phase 2 |

---

## Part 7: Implementation Checklist

### **Phase 1 Starter Tasks:**

**Week 1-2: Inventory Tracking**
- [ ] Design `MusicInventoryItem` schema
- [ ] Add Prisma migration
- [ ] Build checkout/checkin API endpoints
- [ ] Create inventory dashboard component
- [ ] Add barcode scanning support (via Barcode Scanner API)

**Week 3-4: Full-Text Search**
- [ ] Add FULLTEXT index to DB
- [ ] Build search API endpoint
- [ ] Add search form to UI
- [ ] Implement faceted search (composer, genre filters)
- [ ] Add saved searches feature

**Week 5-6: Data Quality**
- [ ] Build duplicate detection algorithm
- [ ] Create validation rules engine
- [ ] Add "Data Health" dashboard
- [ ] Build bulk fix tools

**Week 7-8: Approval Workflows**
- [ ] Add approval status to MusicPiece
- [ ] Build approval queue UI
- [ ] Implement approval notification
- [ ] Add rejection feedback system

---

## Part 8: Recommended Tech Stack Additions

```json
{
  "search": {
    "option1": "PostgreSQL full-text search (built-in)",
    "option2": "Elasticsearch (if MySQL) for advanced IR",
    "option3": "Meilisearch (self-hosted, simple setup)"
  },
  "analytics": {
    "charting": "Recharts (React) or Chart.js",
    "reporting": "Embedded Metabase or Superset",
    "OLAP": "DuckDB (for local analytics)"
  },
  "automation": {
    "workflows": "Temporal or Bull queuing (already have BullMQ!)",
    "scheduling": "node-cron or your existing scheduler"
  },
  "integration": {
    "IMSLP": "Custom HTTP client + caching",
    "Calendar": "google-calendar, ical-generator modules"
  }
}
```

---

## Summary: Why This Matters

Enterprise orchestras don't just manage files—they manage **physical assets, workflows, budgets, and compliance**. A professional music management system enables:

1. **Efficiency** - Librarians spend less time searching, more time organizing
2. **Accountability** - Know exactly where every copy is and what condition it's in
3. **Insight** - Data-driven decisions (which pieces should we keep? rotate? retire?)
4. **Compliance** - Track licensing, prove diversity, audit changes
5. **Risk Mitigation** - Catch duplicates, missing metadata, condition issues early

Your foundation is solid. These enhancements will transform ECCB from a "music management tool" to an **enterprise-grade digital-first orchestral operations platform**.

---

## Next Steps

1. **Review** this doc with your product leads
2. **Prioritize** based on your immediate pain points
3. **Start with Phase 1** - Inventory + Search are the highest ROI
4. **Plan sprints** - 2-3 week cycles for implementation
5. **Measure** - Track librarian time savings, data completeness, user satisfaction

Would you like me to:
- [ ] Create detailed implementation PRDs for any phase?
- [ ] Write sample code for specific features (e.g., inventory API)?
- [ ] Design the analytics dashboard UI mockups?
- [ ] Create database migrations for new tables?
