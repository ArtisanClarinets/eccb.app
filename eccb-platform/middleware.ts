import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Note: We removed the Better Auth middleware integration to strictly follow the "Proxy Pattern" requirement
// and avoid middleware complexity or Edge Runtime issues.
// Authentication is enforced in layouts/pages via `protectPage` and Server Actions via `protectAction`.

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
