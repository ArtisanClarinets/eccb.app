'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for the Digital Music Stand.
 * Prevents a white screen when the stand page throws.
 */
export default function StandError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[StandPage Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <AlertTriangle className="h-14 w-14 text-destructive" />
      <div>
        <h1 className="text-2xl font-bold">Music Stand Error</h1>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Something went wrong loading the music stand. You can try again or go back.
        </p>
        {error.message && (
          <p className="mt-2 text-xs text-muted-foreground/70 font-mono">
            {error.message}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} variant="default">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
        <Button asChild variant="outline">
          <Link href="/member/stand">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Stand
          </Link>
        </Button>
      </div>
    </div>
  );
}
