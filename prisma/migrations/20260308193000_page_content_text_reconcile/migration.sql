-- Reconcile CMS content storage with Prisma schema and app model.
-- Canonical model is string-based content for both Page and PageVersion.

ALTER TABLE `Page`
  MODIFY COLUMN `content` LONGTEXT NOT NULL,
  MODIFY COLUMN `rawMarkdown` LONGTEXT NULL,
  MODIFY COLUMN `metaKeywords` LONGTEXT NULL;

ALTER TABLE `PageVersion`
  MODIFY COLUMN `content` LONGTEXT NOT NULL;
