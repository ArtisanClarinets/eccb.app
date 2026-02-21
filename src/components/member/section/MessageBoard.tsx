'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { postSectionMessage } from '@/app/actions/section-board';
import { useFormStatus } from 'react-dom';

interface Message {
  id: string;
  content: string;
  createdAt: string | Date;
  member: {
    firstName: string;
    lastName: string;
    profilePhoto: string | null;
  };
}

interface MessageBoardProps {
  sectionId: string;
  sectionName: string;
  initialMessages: Message[];
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Posting...' : 'Post Message'}
    </Button>
  );
}

export function MessageBoard({ sectionId, sectionName, initialMessages }: MessageBoardProps) {
  return (
    <div className="space-y-6">
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">{sectionName} Board</h2>

        <form action={postSectionMessage} className="space-y-4 mb-8">
          <input type="hidden" name="sectionId" value={sectionId} />
          <Textarea
            name="content"
            placeholder={`Message the ${sectionName} section...`}
            required
            className="min-h-[100px]"
          />
          <div className="flex justify-end">
            <SubmitButton />
          </div>
        </form>

        <div className="space-y-4">
          {initialMessages.map((msg) => (
            <div key={msg.id} className="flex gap-4 p-4 rounded-lg bg-muted/50">
              <Avatar>
                <AvatarImage src={msg.member.profilePhoto || undefined} />
                <AvatarFallback>{msg.member.firstName[0]}{msg.member.lastName[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold">{msg.member.firstName} {msg.member.lastName}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {initialMessages.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No messages yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
