import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/next-js';

const publicRoutes = ['/', '/about', '/events', '/contact', '/login', '/signup', '/forbidden'];
const adminRoutes = ['/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public routes
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // 2. Allow API routes (they should handle their own auth)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 3. Check for session cookie
  const sessionCookie = getSessionCookie(request);
  
  if (!sessionCookie) {
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // 4. RBAC for admin routes
  // Note: In middleware, we can't easily check permissions from DB/Redis without making it slow.
  // Better Auth can include roles in the session token/cookie if configured.
  // For now, we'll let the page/layout handle detailed permission checks, 
  // but we could do a basic check if we had the role in the session.
  
  if (pathname.startsWith('/admin')) {
    // Detailed check will happen in the layout/page using requirePermission
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
