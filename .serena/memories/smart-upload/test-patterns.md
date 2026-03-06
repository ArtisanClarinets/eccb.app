## Smart Upload Test Patterns

### Fingerprint Normalization
- Uses `normalizeForFingerprint()` which: lowercases, trims, strips punctuation, collapses whitespace
- Punctuation regex: `/[^\w\s]/g` - removes all non-word, non-space characters
- Whitespace regex: `/\s+/g` - collapses multiple spaces to single space

### Work Fingerprint V2
- Format: `${normalizedTitle}::${normalizedComposer}::${normalizedArranger}`
- Null/undefined arranger treated as empty string
- SHA-256 hash of combined string

### Part Identity Fingerprint
- Format: `${pieceId}::${normalizedInstrument}::${normalizedPartName}::${normalizedChair}::${normalizedTransposition}`
- Used for DB-level deduplication across retries
- Stable across re-segmentation of same part

### Duplicate Detection Policies
- NEW_PIECE: No duplicates found
- SKIP_DUPLICATE: Exact source file match (highest priority)
- EXCEPTION_REVIEW: Work-level match (needs human review)
- VERSION_UPDATE: New version of existing work (not implemented in pure functions)

### Version Bumping Logic (from commit.ts)
- When piece exists: create MusicFileVersion snapshot before updating
- Version count query + 1 for new version number
- Updates existing MusicFile record instead of creating new

### Merge Behavior
- Work-level merge: Reuses existing MusicPiece, updates only null fields
- Part-level merge: Upserts MusicPart by fingerprint, creates/updates MusicFile for part
