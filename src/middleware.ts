import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = [
  '/',
  '/about',
  '/events',
  '/contact',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email'
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets, API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  // Allow public routes
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // Check for session cookie
  // Note: This is a basic authentication check.
  // Full authorization (permissions) happens on the server (layouts/pages/actions)
  // because we cannot access the database (Prisma) in the Edge Runtime.
  const hasSession = request.cookies.has('better-auth.session_token') ||
                     request.cookies.has('__Secure-better-auth.session_token');

  if (!hasSession) {
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
