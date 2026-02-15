'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Admin panel error:', error);
    
    // Track error with monitoring service
    fetch('/api/admin/monitoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client_error',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          digest: error.digest,
        },
        context: {
          component: 'AdminErrorBoundary',
          url: window.location.href,
          timestamp: new Date().toISOString(),
        },
      }),
    }).catch(() => {
      // Silently fail - don't cause infinite error loops
    });
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-neutral-dark mb-2">
          Admin Error
        </h2>
        <p className="text-neutral-dark/70 mb-6 max-w-md">
          An error occurred while loading the admin panel. Please try again or contact support if the problem persists.
        </p>
        {error.digest && (
          <p className="text-sm text-neutral-dark/50 mb-4">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset}>
            Try Again
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin">
              Return to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
