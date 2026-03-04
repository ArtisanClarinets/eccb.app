# Quick Implementation Guide - Phase 1 Features

## Feature Comparison: Current vs. Enterprise

### 1. INVENTORY TRACKING

**Current State:**
```
✅ MusicPiece table with:
   - title, composer, difficulty, genre
   - files (digital PDFs)
   - assignments (who it's assigned to)

❌ NO:
   - Physical copy tracking
   - Condition assessment
   - Location management
   - Barcode/scanning support
   - Movement audit trail
```

**What to Add (4 hours planning + 8-10 hours coding):**

```typescript
// 1. Create migration
prisma migrate dev --name "add-inventory-tracking"

// 2. Add to schema.prisma
model MusicInventoryItem {
  id          String   @id @default(cuid())
  pieceId     String
  partId      String?
  
  // NEW fields
  quantity    Int      @default(1)
  condition   String   // PRISTINE, GOOD, FAIR, POOR, DAMAGED, MISSING
  location    String?  // "Shelf A3", "Storage Room B", "In Repair"
  barcode     String?  @unique
  receivedDate DateTime
  notes       String?
  
  // Relations
  piece       MusicPiece @relation(fields: [pieceId], references: [id], onDelete: Cascade)
  part        MusicPart?  @relation(fields: [partId], references: [id])
  movements   InventoryMovement[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([condition])
  @@index([location])
}

model InventoryMovement {
  id          String   @id @default(cuid())
  itemId      String
  type        String   // CHECKOUT, CHECKIN, CONDITION_CHANGE
  reason      String?
  
  fromState   String?  // JSON
  toState     String?  // JSON
  performedBy String
  performedAt DateTime @default(now())
  
  item        MusicInventoryItem @relation(fields: [itemId], references: [id])
}

// 3. Quick API
export async function postCheckout(itemId: string, memberId: string, dueDate: Date) {
  const item = await prisma.musicInventoryItem.findUnique({ where: { id: itemId } });
  
  // Record movement
  await prisma.inventoryMovement.create({
    data: {
      itemId,
      type: 'CHECKOUT',
      fromState: JSON.stringify({ status: 'available', condition: item.condition }),
      toState: JSON.stringify({ assignedTo: memberId, dueDate }),
      performedBy: session.user.id,
    },
  });
  
  // Update assignment status (you already have this)
  await prisma.musicAssignment.create({
    data: {
      pieceId: item.pieceId,
      memberId,
      dueDate,
      status: 'ASSIGNED',
    },
  });
  
  revalidatePath('/admin/inventory');
  return { success: true };
}
```

---

## 2. FULL-TEXT SEARCH

**Current State:**
```
✅ Basic search:
   - WHERE title LIKE '%query%'
   - Manual filter by genre/difficulty

❌ NO:
   - Full-text indexing
   - Multi-field search
   - Faceted results
   - Performance optimization
   - Search suggestions
```

**What to Add (3 hours planning + 6-8 hours coding):**

### For MariaDB/MySQL:

```typescript
// 1. Create migration
// Add to DOWN() in migration if rolling back:
// "ALTER TABLE `MusicPiece` DROP INDEX `ft_search`;"

migration.sql:
```sql
ALTER TABLE `MusicPiece` ADD FULLTEXT INDEX `ft_search` 
(title, genre, notes);
```

// 2. Simple search query
export async function searchMusic(query: string) {
  const results = await prisma.$queryRaw`
    SELECT * FROM MusicPiece 
    WHERE MATCH(title, genre, notes) AGAINST(${query} IN BOOLEAN MODE)
    LIMIT 50
  `;
  return results;
}

// 3. With facets
export async function searchMusicWithFacets(query: string) {
  const results = await prisma.$queryRaw`
    SELECT * FROM MusicPiece 
    WHERE MATCH(title, genre, notes) AGAINST(${query} IN BOOLEAN MODE)
    ORDER BY MATCH(title) AGAINST(${query}) DESC
    LIMIT 50
  `;
  
  // Facets: composer counts, genre counts, etc.
  const composers = await prisma.musicPiece.groupBy({
    by: ['composerId'],
    _count: true,
    where: {
      OR: [
        { title: { search: query } },
        { genre: { search: query } },
      ],
    },
  });
  
  return { results, facets: { composers } };
}
```

### For PostgreSQL (if you upgrade):

```sql
-- Add tsvector column
ALTER TABLE "MusicPiece" ADD COLUMN search_text tsvector;

-- Create trigger
CREATE OR REPLACE FUNCTION music_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_text := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.genre, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER music_search_update BEFORE INSERT OR UPDATE ON "MusicPiece"
FOR EACH ROW EXECUTE FUNCTION music_search_trigger();

-- Index it
CREATE INDEX music_search_idx ON "MusicPiece" USING GIN(search_text);

-- Query
SELECT * FROM "MusicPiece" WHERE search_text @@ to_tsquery('english', 'beethoven & symphony');
```

---

## 3. DATA QUALITY TOOLS

**Current State:**
```
✅ Audit logs (track what changes)
❌ NO:
   - Duplicate detection
   - Validation rules
   - Data health dashboard
   - Bulk fix tools
```

**What to Add (2 hours planning + 6 hours coding):**

```typescript
// 1. Duplicate detection
export async function detectDuplicates() {
  // Find exact matches
  const exactDupes = await prisma.musicPiece.groupBy({
    by: ['title', 'composerId'],
    where: { deletedAt: null },
    having: { id: { _count: { gt: 1 } } },
  });
  
  // Find fuzzy matches (same composer, similar title)
  const allPieces = await prisma.musicPiece.findMany();
  const fuzzyDupes = new Map();
  
  for (let i = 0; i < allPieces.length; i++) {
    for (let j = i + 1; j < allPieces.length; j++) {
      const score = calculateSimilarity(
        allPieces[i].title,
        allPieces[j].title
      );
      // Score > 0.8 = likely duplicate
      if (score > 0.8 && allPieces[i].composerId === allPieces[j].composerId) {
        fuzzyDupes.set(allPieces[i].id, {
          similar: allPieces[j],
          similarity: score,
        });
      }
    }
  }
  
  return { exactDupes, fuzzyDupes };
}

// Helper: String similarity (Levenshtein)
function calculateSimilarity(s1: string, s2: string): number {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1: string, s2: string): number {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// 2. Data health check
export async function getDataHealth() {
  const totalPieces = await prisma.musicPiece.count({ where: { deletedAt: null } });
  
  const piecesWithoutComposer = await prisma.musicPiece.count({
    where: { composerId: null, deletedAt: null },
  });
  
  const piecesWithoutGenre = await prisma.musicPiece.count({
    where: { genre: null, deletedAt: null },
  });
  
  const piecesWithoutFiles = await prisma.musicPiece.count({
    where: { files: { none: {} }, deletedAt: null },
  });
  
  const completenessScore =
    ((totalPieces - piecesWithoutComposer - piecesWithoutGenre - piecesWithoutFiles) /
      totalPieces) *
    100;
  
  return {
    completenessScore: Math.round(completenessScore),
    issues: {
      missingComposer: piecesWithoutComposer,
      missingGenre: piecesWithoutGenre,
      missingFiles: piecesWithoutFiles,
    },
    recommendations: [
      piecesWithoutComposer > 0
        ? `Add composers to ${piecesWithoutComposer} pieces`
        : null,
      piecesWithoutFiles > 0
        ? `Upload files for ${piecesWithoutFiles} pieces`
        : null,
    ].filter(Boolean),
  };
}

// 3. Merge duplicates
export async function mergePieces(primaryId: string, secondaryId: string) {
  const primary = await prisma.musicPiece.findUnique({
    where: { id: primaryId },
    include: { files: true, assignments: true },
  });
  const secondary = await prisma.musicPiece.findUnique({
    where: { id: secondaryId },
    include: { files: true, assignments: true },
  });
  
  // Merge in transaction
  return await prisma.$transaction([
    // Move secondary's files to primary
    ...secondary.files.map((f) =>
      prisma.musicFile.update({
        where: { id: f.id },
        data: { pieceId: primaryId },
      })
    ),
    // Move secondary's assignments to primary
    ...secondary.assignments.map((a) =>
      prisma.musicAssignment.update({
        where: { id: a.id },
        data: { pieceId: primaryId },
      })
    ),
    // Delete secondary
    prisma.musicPiece.delete({ where: { id: secondaryId } }),
    // Audit log
    auditLog({
      action: 'music.merge',
      entityType: 'MusicPiece',
      entityId: primaryId,
      oldValues: { mergedFrom: secondaryId },
    }),
  ]);
}
```

---

## 4. APPROVAL WORKFLOWS

**Current State:**
```
✅ Pieces can be archived/deleted
❌ NO:
   - Draft status
   - Multi-step approval
   - Notification system
   - Review queue for directors
```

**What to Add (3 hours planning + 8 hours coding):**

```typescript
// 1. Add status to schema
// In schema.prisma MusicPiece model:
status      String @default("DRAFT")  // DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED

// 2. Submit for approval
export async function submitForApproval(pieceId: string, directorIds: string[]) {
  const session = await requirePermission(MUSIC_EDIT);
  
  // Update status
  await prisma.musicPiece.update({
    where: { id: pieceId },
    data: { status: 'PENDING_APPROVAL' },
  });
  
  // Create approval record
  const approval = await prisma.musicApprovalFlow.create({
    data: {
      pieceId,
      requestedBy: session.user.id,
      assignedTo: directorIds, // JSON array
      status: 'PENDING',
    },
  });
  
  // Notify directors
  for (const directorId of directorIds) {
    await sendNotification(directorId, `New music awaits your review`);
  }
  
  revalidatePath(`/admin/music/${pieceId}`);
  return { success: true, approvalId: approval.id };
}

// 3. Approve
export async function approveMusicPiece(pieceId: string) {
  const session = await requirePermission('music:approve');
  
  await prisma.musicPiece.update({
    where: { id: pieceId },
    data: { status: 'ACTIVE' },
  });
  
  await prisma.musicApprovalFlow.update({
    where: { pieceId },
    data: {
      status: 'APPROVED',
      approvedBy: session.user.id,
      decidedAt: new Date(),
    },
  });
  
  // Notify librarian + members
  const piece = await prisma.musicPiece.findUnique({ where: { id: pieceId } });
  await sendNotificationToAll(`New music available: ${piece.title}`);
  
  revalidatePath('/member/music');
  return { success: true };
}

// 4. Reject
export async function rejectMusicPiece(pieceId: string, reason: string) {
  const session = await requirePermission('music:approve');
  
  await prisma.musicPiece.update({
    where: { id: pieceId },
    data: { status: 'DRAFT' },  // Back to draft for editing
  });
  
  await prisma.musicApprovalFlow.update({
    where: { pieceId },
    data: {
      status: 'REJECTED',
      rejectedBy: session.user.id,
      rejectionReason: reason,
    },
  });
  
  // Notify librarian
  const piece = await prisma.musicPiece.findUnique({
    where: { id: pieceId },
    include: { owner: true }, // or whoever added it
  });
  await sendNotification(
    piece.uploadedBy,
    `Your piece was rejected. Reason: ${reason}`
  );
  
  return { success: true };
}

// 5. Get approval queue (for directors)
export async function getApprovalQueue() {
  const session = await getSession();
  
  return await prisma.musicApprovalFlow.findMany({
    where: {
      status: 'PENDING',
      assignedTo: { hasSome: [session.user.id] },
    },
    include: { piece: true, requestedBy: true },
    orderBy: { createdAt: 'asc' },
  });
}
```

**UI Component (React):**

```tsx
// ApprovalQueuePage
export function ApprovalQueuePage() {
  const [queue, setQueue] = useState([]);
  const [selectedPiece, setSelectedPiece] = useState(null);
  
  useEffect(() => {
    fetchApprovalQueue().then(setQueue);
  }, []);
  
  return (
    <div className="space-y-6">
      <h1>Music Awaiting Approval ({queue.length})</h1>
      
      <div className="grid gap-4">
        {queue.map((approval) => (
          <Card key={approval.id}>
            <CardHeader>
              <h3>{approval.piece.title}</h3>
              <p className="text-sm text-muted-foreground">
                By {approval.piece.composer?.name}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Submitted by {approval.requestedBy.name}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(approval.createdAt).toLocaleDateString()}
              </p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button
                onClick={() => setSelectedPiece(approval)}
                variant="outline"
              >
                Review
              </Button>
              <Button
                onClick={() => approvePiece(approval.pieceId)}
                variant="default"
              >
                ✓ Approve
              </Button>
              <Button
                onClick={() => {
                  const reason = prompt("Rejection reason:");
                  if (reason) rejectPiece(approval.pieceId, reason);
                }}
                variant="destructive"
              >
                ✗ Reject
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      
      {selectedPiece && (
        <MusicDetailModal piece={selectedPiece.piece} onClose={() => setSelectedPiece(null)} />
      )}
    </div>
  );
}
```

---

## Implementation Checklist

### Week 1-2: Inventory Tracking
- [ ] Design schema (MusicInventoryItem, InventoryMovement)
- [ ] Migration: `prisma migrate dev`
- [ ] API: POST `/api/admin/music/{id}/inventory` (create item)
- [ ] API: POST `/api/admin/music/inventory/{id}/checkout`
- [ ] API: POST `/api/admin/music/inventory/{id}/checkin`
- [ ] UI: Inventory dashboard component
- [ ] Test: Full flow (create → checkout → checkin)
- [ ] Docs: Update API docs

### Week 3-4: Full-Text Search
- [ ] Add FULLTEXT index (MySQL) or tsvector (PostgreSQL)
- [ ] API: GET `/api/admin/music/search?q=query`
- [ ] UI: Advanced search form
- [ ] UI: Faceted results
- [ ] Test: Search performance
- [ ] Docs: Search syntax guide

### Week 5-6: Data Quality
- [ ] Implement duplicate detection algorithm
- [ ] API: POST `/api/admin/music/analyze/duplicates`
- [ ] API: POST `/api/admin/music/analyze/health`
- [ ] API: POST `/api/admin/music/merge/{id1}/{id2}`
- [ ] UI: Data health dashboard
- [ ] UI: Duplicate merger modal
- [ ] Test: Merge integrity

### Week 7-8: Approvals
- [ ] Add status field to MusicPiece
- [ ] Create MusicApprovalFlow table
- [ ] API: POST `/api/admin/music/{id}/submit-approval`
- [ ] API: POST `/api/admin/music/{id}/approve`
- [ ] API: POST `/api/admin/music/{id}/reject`
- [ ] API: GET `/api/admin/music/approvals/pending`
- [ ] UI: Approval queue page
- [ ] UI: Status badge on pieces
- [ ] Test: Full workflow

---

## Testing Commands

```bash
# After each feature, run:

# Type check
npm run type-check

# Lint
npm run lint

# Test (if you set up Vitest)
npm run test

# Build
npm run build

# Dev server
npm run dev
```

---

## Database Backup Before Changes

```bash
# MySQL backup
mysqldump -u user -p database > backup_$(date +%Y%m%d).sql

# Then apply migration
npm run db:generate
prisma migrate dev --name "phase-1-features"
```

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Forgetting `revalidatePath` after mutations | Use it after every update |
| N+1 queries (get pieces, then composers) | Use Prisma `include: { composer: true }` |
| Slow search with LIKE | Use FULLTEXT index |
| Race conditions in checkout | Use Prisma `$transaction` |
| Members seeing DRAFT pieces | Add status check in queries |
| Missing audit trail | Log every change |

---

## Success Metrics (After Phase 1)

```
BEFORE PHASE 1          AFTER PHASE 1
─────────────────────────────────────────
? Where is music?       → Inventory system shows location
? Is this a duplicate?  → Duplicate detector catches it
  Manual search (slow)  → Full-text search (<200ms)
  All pieces visible    → Approval workflow → quality gate
  ??? Data quality      → Data health dashboard (85% score)
```

---

## Next: Phase 2 Sneak Peek

Once Phase 1 is solid, Phase 2 adds:

```
- Analytics: Most used pieces, condition trends
- Reporting: Budget, diversity, utilization
- Automation: Retention scheduling, maintenance alerts
- Integrations: IMSLP lookup, calendar sync
```

See `ENTERPRISE_IMPLEMENTATION_ROADMAP.md` for Phase 2 details.
