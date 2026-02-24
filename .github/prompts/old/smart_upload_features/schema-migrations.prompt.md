You are the *Stand Schema Designer*.
Implement the database schema expansions necessary to support annotations,
navigation links, sessions, audio attachments, and user preferences.

1. Open `prisma/schema.prisma` and append new model definitions:
   ```prisma
   model Annotation {
     id        String   @id @default(cuid())
     musicId   String
     page      Int
     layer     AnnotationLayer
     strokeData Json
     userId    String
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt
     // relations
     music     MusicPiece @relation(fields: [musicId], references: [id], onDelete: Cascade)
     user      User       @relation(fields: [userId], references: [id])
   }

   enum AnnotationLayer {
     PERSONAL
     SECTION
     DIRECTOR
   }

   model NavigationLink {
     id        String   @id @default(cuid())
     musicId   String
     fromX     Float
     fromY     Float
     toX       Float
     toY       Float
     label     String?
     createdAt DateTime @default(now())
     music     MusicPiece @relation(fields: [musicId], references: [id], onDelete: Cascade)
   }

   model StandSession {
     id         String   @id @default(cuid())
     eventId    String
     userId     String
     section    String?
     lastSeenAt DateTime @default(now())
     createdAt  DateTime @default(now())
     // optional presence data stored separately
   }

   model AudioLink {
     id          String   @id @default(cuid())
     pieceId     String
     fileKey     String
     url         String?
     description String?
     createdAt   DateTime @default(now())
     piece       MusicPiece @relation(fields: [pieceId], references: [id], onDelete: Cascade)
   }

   model UserPreferences {
     id                String   @id @default(cuid())
     userId            String   @unique
     nightMode         Boolean  @default(false)
     metronomeSettings Json?
     midiMappings      Json?
     otherSettings     Json?
     updatedAt         DateTime @updatedAt
     user              User @relation(fields: [userId], references: [id], onDelete: Cascade)
   }
   ```
2. Add any necessary indexes (e.g. `@@index([musicId])`) to frequently
   queried fields.
3. If helpful, modify `MusicPiece` or the `EventMusic` join model to expose a
   back‑reference to `annotations`, `navigationLinks`, or `audioLinks` using
   `@relation` attributes.
4. Save the file, then run `npx prisma migrate dev --name stand_features` to
   create a migration and apply it to the local database.
5. After the migration completes, execute `npx prisma generate` to refresh the
   client with the new types.
6. Update any generated TypeScript types in the code (imports) by running
   `npm run build` or using the editor’s auto‑import suggestions.

Return the diff output of the migration file(s) and a short note confirming
`prisma generate` was run. Provide any example import lines showing how the
new models are imported from `@/lib/db` or wherever the Prisma client
resides.