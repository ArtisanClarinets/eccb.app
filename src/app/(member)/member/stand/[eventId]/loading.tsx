import { Loader2, Music } from 'lucide-react';

/**
 * Loading UI shown while the Digital Music Stand data is fetching.
 * Displayed automatically by Next.js App Router during the server render.
 */
export default function StandLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="relative">
        <Music className="h-16 w-16 text-teal-600/30" />
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <p className="text-muted-foreground animate-pulse">Opening music stand…</p>
    </div>
  );
}
