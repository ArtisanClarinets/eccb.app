'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Eye,
  Clock,
  User,
  Globe,
  Monitor,
  Activity,
  FileText,
} from 'lucide-react';
import { formatDate } from '@/lib/date';
import type { AuditLogEntry } from './types';

interface AuditLogDetailDialogProps {
  log: AuditLogEntry;
}

// Get action badge color
function getActionBadgeVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action.includes('delete') || action.includes('ban')) return 'destructive';
  if (action.includes('create')) return 'default';
  if (action.includes('update')) return 'secondary';
  return 'outline';
}

// Format action for display
function formatAction(action: string): string {
  return action
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' → ');
}

export function AuditLogDetailDialog({ log }: AuditLogDetailDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Audit Log Details
          </DialogTitle>
          <DialogDescription>
            Full details for this audit log entry
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Timestamp
                </p>
                <p className="text-sm">
                  {formatDate(log.timestamp)} at {log.timestamp.toLocaleTimeString()}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Action
                </p>
                <Badge variant={getActionBadgeVariant(log.action)}>
                  {formatAction(log.action)}
                </Badge>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4" />
                  User
                </p>
                <div>
                  <p className="text-sm font-medium">{log.userName || 'System'}</p>
                  {log.userId && (
                    <p className="text-xs text-muted-foreground">
                      ID: {log.userId}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Entity
                </p>
                <div>
                  <p className="text-sm font-medium">{log.entityType}</p>
                  {log.entityId && (
                    <p className="text-xs text-muted-foreground">
                      ID: {log.entityId}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  IP Address
                </p>
                <p className="text-sm font-mono">
                  {log.ipAddress || 'N/A'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  User Agent
                </p>
                <p className="text-sm truncate" title={log.userAgent || 'N/A'}>
                  {log.userAgent || 'N/A'}
                </p>
              </div>
            </div>

            {/* Old Values */}
            {log.oldValues && Object.keys(log.oldValues as object).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Old Values</p>
                <div className="bg-muted/50 rounded-lg p-4">
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(log.oldValues, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* New Values */}
            {log.newValues && Object.keys(log.newValues as object).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">New Values</p>
                <div className="bg-muted/50 rounded-lg p-4">
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(log.newValues, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Raw Data */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Raw Data</p>
              <div className="bg-muted/50 rounded-lg p-4">
                <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(log, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
