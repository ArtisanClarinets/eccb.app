'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, HelpCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RSVPButtonsProps {
  eventId: string;
  memberId: string;
  currentStatus: string | null;
}

export function RSVPButtons({ eventId, memberId, currentStatus }: RSVPButtonsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  async function handleRSVP(status: 'YES' | 'NO' | 'MAYBE') {
    setIsLoading(status);
    try {
      const response = await fetch('/api/events/rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId,
          memberId,
          status,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update RSVP');
      }

      toast.success('RSVP updated');
      router.refresh();
    } catch (error) {
      console.error('Error updating RSVP:', error);
      toast.error('Failed to update RSVP');
    } finally {
      setIsLoading(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        variant={currentStatus === 'YES' ? 'default' : 'outline'}
        className={cn(
          'flex-1',
          currentStatus === 'YES' && 'bg-green-600 hover:bg-green-700'
        )}
        onClick={() => handleRSVP('YES')}
        disabled={isLoading !== null}
      >
        {isLoading === 'YES' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="mr-2 h-4 w-4" />
        )}
        Yes
      </Button>
      <Button
        variant={currentStatus === 'MAYBE' ? 'default' : 'outline'}
        className={cn(
          'flex-1',
          currentStatus === 'MAYBE' && 'bg-amber-600 hover:bg-amber-700'
        )}
        onClick={() => handleRSVP('MAYBE')}
        disabled={isLoading !== null}
      >
        {isLoading === 'MAYBE' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <HelpCircle className="mr-2 h-4 w-4" />
        )}
        Maybe
      </Button>
      <Button
        variant={currentStatus === 'NO' ? 'default' : 'outline'}
        className={cn(
          'flex-1',
          currentStatus === 'NO' && 'bg-red-600 hover:bg-red-700'
        )}
        onClick={() => handleRSVP('NO')}
        disabled={isLoading !== null}
      >
        {isLoading === 'NO' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <XCircle className="mr-2 h-4 w-4" />
        )}
        No
      </Button>
    </div>
  );
}
