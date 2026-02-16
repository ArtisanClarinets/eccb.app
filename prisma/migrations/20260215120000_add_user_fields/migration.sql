-- Add missing user columns and migrate emailVerified from timestamp -> boolean

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "role" TEXT,
  ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "banReason" TEXT,
  ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMP(3);

-- Add a new boolean column, backfill from existing timestamp-based column,
-- then drop the old column and rename the new one to match Prisma schema.
DO $$
BEGIN
  -- Only perform conversion if the existing column type is not boolean
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'emailVerified' AND data_type <> 'boolean'
  ) THEN
    -- Add temporary boolean column
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified_new" BOOLEAN NOT NULL DEFAULT false;

    -- Backfill: mark true where old timestamp is not null
    UPDATE "User" SET "emailVerified_new" = true WHERE "emailVerified" IS NOT NULL;

    -- Drop the old column and rename the new one
    ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerified";
    ALTER TABLE "User" RENAME COLUMN "emailVerified_new" TO "emailVerified";
  ELSE
    -- If column already boolean, ensure it exists and has a default
    ALTER TABLE "User" ALTER COLUMN "emailVerified" SET DEFAULT false;
    ALTER TABLE "User" ALTER COLUMN "emailVerified" SET NOT NULL;
  END IF;
END$$;
