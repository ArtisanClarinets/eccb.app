'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WifiOff, Home, RefreshCw } from 'lucide-react';

export function OfflineContent() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-6 flex items-center justify-center">
            <WifiOff className="h-8 w-8 text-muted-foreground" />
          </div>
          
          <h1 className="text-2xl font-bold mb-2">You&apos;re Offline</h1>
          
          <p className="text-muted-foreground mb-6">
            It looks like you&apos;ve lost your internet connection. 
            Some features may not be available until you&apos;re back online.
          </p>

          <div className="space-y-3">
            <Button
              variant="default"
              className="w-full"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            
            <Button variant="outline" className="w-full" asChild>
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            Don&apos;t worry! Any actions you took while offline will be 
            synced automatically when you reconnect.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
