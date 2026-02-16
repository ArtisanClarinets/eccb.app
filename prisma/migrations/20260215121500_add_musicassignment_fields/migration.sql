-- Add AssignmentStatus enum and new columns to MusicAssignment

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignmentstatus') THEN
    CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED','PICKED_UP','RETURNED','OVERDUE','LOST','DAMAGED');
  END IF;
END$$;

ALTER TABLE "MusicAssignment"
  ADD COLUMN IF NOT EXISTS "partId" TEXT,
  ADD COLUMN IF NOT EXISTS "copyNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  ADD COLUMN IF NOT EXISTS "pickedUpAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pickedUpBy" TEXT,
  ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "returnedTo" TEXT,
  ADD COLUMN IF NOT EXISTS "condition" TEXT,
  ADD COLUMN IF NOT EXISTS "missingSince" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "missingNotes" TEXT;

-- Index for status
CREATE INDEX IF NOT EXISTS "MusicAssignment_status_idx" ON "MusicAssignment" ("status");
