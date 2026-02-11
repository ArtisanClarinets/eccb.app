# Community Band Management Platform - Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the Community Band Management Platform. It's designed for a development team to follow systematically, building the application incrementally with testing and validation at each step.

**Timeline Estimate:**
- Phase 1-2 (Foundation): 4-6 weeks
- Phase 3-5 (Core Features): 8-12 weeks  
- Phase 6-8 (Member/Admin Features): 6-8 weeks
- Phase 9-10 (Communications/Search): 4-6 weeks
- Phase 11 (Migration): 2-3 weeks
- Phase 12-13 (Security/Testing): 3-4 weeks
- **Total: 6-9 months** (with 2-3 developers)

---

## Phase 1: Project Foundation (Week 1-2)

### 1.1 Initialize Next.js 16 Project

```bash
# Create new Next.js project
npx create-next-app@latest eccb-platform --typescript --tailwind --app --no-src-dir --import-alias "@/*"

cd eccb-platform

# Install core dependencies
npm install @prisma/client prisma
npm install better-auth
npm install zod react-hook-form @hookform/resolvers
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select
npm install lucide-react
npm install date-fns
npm install redis ioredis
npm install sonner # for toast notifications

# Install dev dependencies
npm install -D @types/node
npm install -D vitest @vitejs/plugin-react
npm install -D playwright @playwright/test
```

### 1.2 Project Structure

Create the following directory structure:

```
eccb-platform/
├── app/
│   ├── (public)/          # Public-facing pages
│   │   ├── layout.tsx
│   │   ├── page.tsx       # Home
│   │   ├── about/
│   │   ├── events/
│   │   └── contact/
│   ├── (member)/          # Member portal
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   ├── music/
│   │   └── profile/
│   ├── (admin)/           # Admin dashboard
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   ├── members/
│   │   ├── music/
│   │   └── settings/
│   ├── api/               # API routes
│   │   ├── auth/
│   │   └── webhooks/
│   ├── login/
│   ├── signup/
│   └── forbidden/
├── components/
│   ├── ui/                # Shadcn/ui components
│   ├── forms/             # Form components
│   ├── layouts/           # Layout components
│   └── providers/         # Context providers
├── lib/
│   ├── auth/              # Authentication
│   ├── db/                # Database utilities
│   ├── services/          # Business logic
│   ├── utils/             # Helpers
│   └── constants/         # Constants
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── types/                 # TypeScript types
├── middleware.ts
└── instrumentation.ts
```

### 1.3 Environment Setup

Create `.env` file:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/eccb_dev"
DIRECT_URL="postgresql://user:password@localhost:5432/eccb_dev"

# Redis
REDIS_URL="redis://localhost:6379"

# Better Auth
AUTH_SECRET="generate-with-openssl-rand-base64-32"
AUTH_URL="http://localhost:3000"

# Storage Configuration (Local Disk or S3-Compatible)
STORAGE_DRIVER="LOCAL" # or "S3"
LOCAL_STORAGE_PATH="/var/lib/eccb/music"

# S3 Configuration (if STORAGE_DRIVER="S3")
# Use Free Tiers (e.g., Backblaze B2, Cloudflare R2)
S3_BUCKET_NAME="eccb-music"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="your-access-key"
S3_SECRET_ACCESS_KEY="your-secret-key"
S3_ENDPOINT="https://s3.us-east-1.backblaze.com" # Example
S3_FORCE_PATH_STYLE="true"

# Email (for notifications)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-password"

# App Config
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Emerald Coast Community Band"
```

### 1.4 TypeScript Configuration

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 1.5 Tailwind Configuration

Update `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0f766e',
          light: '#5eead4',
        },
        neutral: {
          dark: '#1f2937',
          light: '#f9fafb',
        },
        accent: '#f59e0b',
      },
      fontFamily: {
        display: ['Oswald', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

---

## Phase 2: Database Setup (Week 2-3)

### 2.1 Initialize Prisma

```bash
# Initialize Prisma
npx prisma init

# This creates:
# - prisma/schema.prisma
# - .env with DATABASE_URL
```

### 2.2 Define Schema

Copy the complete schema from `DATABASE_SCHEMA.md` into `prisma/schema.prisma`. Start with core models:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// Add all models from DATABASE_SCHEMA.md
```

### 2.3 Create Initial Migration

```bash
# Create migration
npx prisma migrate dev --name init

# Generate Prisma Client
npx prisma generate
```

### 2.4 Seed Database

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create roles
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: {
        name: 'SUPER_ADMIN',
        displayName: 'Super Administrator',
        type: 'SUPER_ADMIN',
        description: 'Full system access',
      },
    }),
    prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: {
        name: 'ADMIN',
        displayName: 'Administrator',
        type: 'ADMIN',
        description: 'Band operations management',
      },
    }),
    prisma.role.upsert({
      where: { name: 'DIRECTOR' },
      update: {},
      create: {
        name: 'DIRECTOR',
        displayName: 'Director/Staff',
        type: 'DIRECTOR',
        description: 'Musical and operational leadership',
      },
    }),
    prisma.role.upsert({
      where: { name: 'LIBRARIAN' },
      update: {},
      create: {
        name: 'LIBRARIAN',
        displayName: 'Librarian',
        type: 'LIBRARIAN',
        description: 'Music library management',
      },
    }),
    prisma.role.upsert({
      where: { name: 'MUSICIAN' },
      update: {},
      create: {
        name: 'MUSICIAN',
        displayName: 'Musician',
        type: 'MUSICIAN',
        description: 'Band member',
      },
    }),
  ]);

  console.log(`✅ Created ${roles.length} roles`);

  // Create permissions
  const permissions = [
    // Music
    { name: 'music.view.all', resource: 'music', action: 'view', scope: 'all' },
    { name: 'music.view.assigned', resource: 'music', action: 'view', scope: 'assigned' },
    { name: 'music.create', resource: 'music', action: 'create', scope: null },
    { name: 'music.edit', resource: 'music', action: 'edit', scope: null },
    { name: 'music.delete', resource: 'music', action: 'delete', scope: null },
    { name: 'music.upload', resource: 'music', action: 'upload', scope: null },
    { name: 'music.download.all', resource: 'music', action: 'download', scope: 'all' },
    { name: 'music.download.assigned', resource: 'music', action: 'download', scope: 'assigned' },
    
    // Members
    { name: 'member.view.all', resource: 'member', action: 'view', scope: 'all' },
    { name: 'member.view.own', resource: 'member', action: 'view', scope: 'own' },
    { name: 'member.edit.all', resource: 'member', action: 'edit', scope: 'all' },
    { name: 'member.edit.own', resource: 'member', action: 'edit', scope: 'own' },
    { name: 'member.create', resource: 'member', action: 'create', scope: null },
    { name: 'member.delete', resource: 'member', action: 'delete', scope: null },
    
    // Events
    { name: 'event.view.all', resource: 'event', action: 'view', scope: 'all' },
    { name: 'event.create', resource: 'event', action: 'create', scope: null },
    { name: 'event.edit', resource: 'event', action: 'edit', scope: null },
    { name: 'event.delete', resource: 'event', action: 'delete', scope: null },
    
    // Attendance
    { name: 'attendance.view.all', resource: 'attendance', action: 'view', scope: 'all' },
    { name: 'attendance.mark.all', resource: 'attendance', action: 'mark', scope: 'all' },
    { name: 'attendance.mark.own', resource: 'attendance', action: 'mark', scope: 'own' },
    
    // CMS
    { name: 'cms.edit', resource: 'cms', action: 'edit', scope: null },
    { name: 'cms.publish', resource: 'cms', action: 'publish', scope: null },
    
    // System
    { name: 'system.config', resource: 'system', action: 'config', scope: null },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
  }

  console.log(`✅ Created ${permissions.length} permissions`);

  // Assign permissions to roles
  const superAdminRole = roles.find((r) => r.name === 'SUPER_ADMIN')!;
  const librarianRole = roles.find((r) => r.name === 'LIBRARIAN')!;
  const musicianRole = roles.find((r) => r.name === 'MUSICIAN')!;

  // Super admin gets all permissions
  for (const perm of permissions) {
    const permission = await prisma.permission.findUnique({ where: { name: perm.name } });
    if (permission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdminRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // Librarian music permissions
  const librarianPerms = permissions.filter((p) => p.resource === 'music');
  for (const perm of librarianPerms) {
    const permission = await prisma.permission.findUnique({ where: { name: perm.name } });
    if (permission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: librarianRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: librarianRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // Musician limited permissions
  const musicianPerms = ['music.view.assigned', 'music.download.assigned', 'member.view.own', 'member.edit.own'];
  for (const permName of musicianPerms) {
    const permission = await prisma.permission.findUnique({ where: { name: permName } });
    if (permission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: musicianRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: musicianRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // Create instruments
  const instruments = [
    // Woodwinds
    { name: 'Piccolo', family: 'Woodwind', sortOrder: 1 },
    { name: 'Flute', family: 'Woodwind', sortOrder: 2 },
    { name: 'Oboe', family: 'Woodwind', sortOrder: 3 },
    { name: 'Bassoon', family: 'Woodwind', sortOrder: 4 },
    { name: 'Eb Clarinet', family: 'Woodwind', sortOrder: 5 },
    { name: 'Bb Clarinet', family: 'Woodwind', sortOrder: 6 },
    { name: 'Bass Clarinet', family: 'Woodwind', sortOrder: 7 },
    { name: 'Alto Saxophone', family: 'Woodwind', sortOrder: 8 },
    { name: 'Tenor Saxophone', family: 'Woodwind', sortOrder: 9 },
    { name: 'Baritone Saxophone', family: 'Woodwind', sortOrder: 10 },
    
    // Brass
    { name: 'Trumpet', family: 'Brass', sortOrder: 20 },
    { name: 'Cornet', family: 'Brass', sortOrder: 21 },
    { name: 'French Horn', family: 'Brass', sortOrder: 22 },
    { name: 'Trombone', family: 'Brass', sortOrder: 23 },
    { name: 'Euphonium', family: 'Brass', sortOrder: 24 },
    { name: 'Tuba', family: 'Brass', sortOrder: 25 },
    
    // Percussion
    { name: 'Percussion', family: 'Percussion', sortOrder: 30 },
    { name: 'Timpani', family: 'Percussion', sortOrder: 31 },
  ];

  for (const inst of instruments) {
    await prisma.instrument.upsert({
      where: { name: inst.name },
      update: {},
      create: inst,
    });
  }

  console.log(`✅ Created ${instruments.length} instruments`);

  // Create sections
  const sections = [
    { name: 'Woodwinds', sortOrder: 1 },
    { name: 'Brass', sortOrder: 2 },
    { name: 'Percussion', sortOrder: 3 },
  ];

  for (const section of sections) {
    await prisma.section.upsert({
      where: { name: section.name },
      update: {},
      create: section,
    });
  }

  console.log(`✅ Created ${sections.length} sections`);

  // Create demo admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@eccb.org' },
    update: {},
    create: {
      email: 'admin@eccb.org',
      name: 'System Administrator',
      password: hashedPassword,
      emailVerified: new Date(),
    },
  });

  // Assign super admin role
  await prisma.userRole.create({
    data: {
      userId: adminUser.id,
      roleId: superAdminRole.id,
    },
  });

  console.log('✅ Created demo admin user: admin@eccb.org / admin123');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Update `package.json`:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "scripts": {
    "db:seed": "prisma db seed"
  }
}
```

Run seed:

```bash
npm install -D tsx
npm run db:seed
```

### 2.5 Database Client Utility

Create `lib/db/index.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
```

---

## Phase 3: Authentication Setup (Week 3-4)

### 3.1 Install Better Auth

```bash
npm install better-auth @better-auth/react
```

### 3.2 Configure Better Auth

Create `lib/auth/config.ts`:

```typescript
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/db';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});

export type Session = typeof auth.$Infer.Session;
```

### 3.3 Create Auth API Route

Create `app/api/auth/[...all]/route.ts`:

```typescript
import { auth } from '@/lib/auth/config';

export const { GET, POST } = auth.handler;
```

### 3.4 Create Permission Utilities

Create `lib/auth/permissions.ts`:

```typescript
import { auth } from './config';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { headers } from 'next/headers';

export async function requirePermission(permission: string): Promise<void> {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const hasPermission = await checkUserPermission(session.user.id, permission);

  if (!hasPermission) {
    throw new Error(`Forbidden: Missing permission ${permission}`);
  }
}

export async function checkUserPermission(
  userId: string,
  permission: string
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId);
  return userPermissions.includes(permission);
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  // Check cache first
  const cached = await redis.get(`permissions:${userId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Query from database
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const permissions = userRoles.flatMap((ur) =>
    ur.role.permissions.map((rp) => rp.permission.name)
  );

  // Remove duplicates
  const uniquePermissions = [...new Set(permissions)];

  // Cache for 5 minutes
  await redis.setex(`permissions:${userId}`, 300, JSON.stringify(uniquePermissions));

  return uniquePermissions;
}
```

### 3.5 Create Middleware

Create `middleware.ts`:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = ['/', '/about', '/events', '/contact', '/login', '/signup'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Protected routes - auth check handled by Better Auth
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## Phase 4: Core Services (Week 4-6)

### 4.1 File Storage Service (Local or S3)
Implement a provider-agnostic storage service that handles both Local Disk and S3.

Create `lib/services/storage.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.S3_REGION!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  // endpoint for non-AWS S3 providers (e.g., Backblaze B2, DigitalOcean)
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

// Implementation should switch based on process.env.STORAGE_DRIVER ('LOCAL' or 'S3')
export async function getDownloadUrl(key: string) {
  if (process.env.STORAGE_DRIVER === 'LOCAL') {
    return `/api/storage/local?key=${key}`; 
  }
  // S3 implementation...
}

export async function uploadFile(
  file: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  );

  return key;
}

export async function getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

export async function deleteFile(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
    })
  );
}
```

### 4.2 Audit Service

Create `lib/services/audit.ts`:

```typescript
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';

export async function auditLog(data: {
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
}): Promise<void> {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  await prisma.auditLog.create({
    data: {
      userId: session?.user?.id,
      userName: session?.user?.name || 'Anonymous',
      ipAddress: headersList.get('x-forwarded-for') || headersList.get('x-real-ip'),
      userAgent: headersList.get('user-agent'),
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      oldValues: data.oldValues || null,
      newValues: data.newValues || null,
    },
  });
}
```

---

## Phase 5: Music Library Implementation (Week 6-10)

This is the core feature. Implement in this order:

### 5.1 Music Catalog Service

Create `lib/services/music.ts`:

```typescript
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/permissions';
import { auditLog } from './audit';
import { uploadFile } from './storage';

export async function createMusicPiece(data: any) {
  await requirePermission('music.create');

  const piece = await prisma.musicPiece.create({
    data,
  });

  await auditLog({
    action: 'CREATE',
    entityType: 'MusicPiece',
    entityId: piece.id,
    newValues: piece,
  });

  return piece;
}

export async function uploadMusicFile(
  pieceId: string,
  file: Buffer,
  fileName: string,
  fileType: string
) {
  await requirePermission('music.upload');

  const storageKey = `music/${pieceId}/${Date.now()}-${fileName}`;
  await uploadFile(file, storageKey, 'application/pdf');

  const musicFile = await prisma.musicFile.create({
    data: {
      pieceId,
      fileName,
      fileType,
      fileSize: file.length,
      mimeType: 'application/pdf',
      storageKey,
    },
  });

  return musicFile;
}

// Add more functions: searchMusic, assignMusic, etc.
```

### 5.2 Music API Routes

Create `app/api/music/route.ts`, `app/api/music/[id]/route.ts`, etc.

### 5.3 Music UI Components

Create member and admin views for music library.

---

## Testing Strategy

### Run Tests at Each Phase

```bash
# Unit tests
npm run test

# E2E tests
npx playwright test

# Lint
npm run lint

# Type check
npx tsc --noEmit
```

---

## Deployment

### Production Checklist

- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] Redis configured
- [ ] S3 buckets created
- [ ] Email provider configured
- [ ] Domain configured
- [ ] SSL certificate
- [ ] Backup strategy in place
- [ ] Monitoring configured

```bash
# Build
npm run build

# Deploy to Vercel
vercel --prod

# Or self-host
docker-compose up -d
```

---

## Conclusion

