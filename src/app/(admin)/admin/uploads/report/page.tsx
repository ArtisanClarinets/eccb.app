'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SessionRecord {
  uploadSessionId: string;
  fileName: string;
  status: string;
  parseStatus: string;
  secondPassStatus: string;
  routingDecision: string;
  confidenceScore: number | null;
  requiresHumanReview: boolean;
  autoApproved: boolean;
  createdAt: string;
  updatedAt: string;
  extractedMetadata: {
    title?: string;
    composer?: string;
    cuttingInstructionsSource?: string;
    enforceOcrSplitting?: boolean;
  } | null;
}

interface ReportGroup {
  title: string;
  sessions: SessionRecord[];
}

function formatDate(dateStr: string) {
  const dt = new Date(dateStr);
  return dt.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

function statusBadge(status: string) {
  switch (status) {
    case 'AUTO_COMMITTED':
    case 'MANUALLY_APPROVED':
      return <Badge className="bg-green-100 text-green-700">{status}</Badge>;
    case 'REQUIRES_REVIEW':
      return <Badge className="bg-yellow-100 text-yellow-700">{status}</Badge>;
    case 'FAILED':
      return <Badge className="bg-red-100 text-red-700">{status}</Badge>;
    default:
      return <Badge className="bg-blue-100 text-blue-700">{status}</Badge>;
  }
}

export default function SmartUploadReportPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/uploads/report');
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || res.statusText || 'Failed to load report');
        }
        const data = await res.json();
        setSessions(data.sessions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
  }, []);

  const groups: ReportGroup[] = useMemo(() => {
    const map = new Map<string, SessionRecord[]>();
    for (const session of sessions) {
      const title = session.extractedMetadata?.title || session.fileName || 'Unknown';
      const key = title.trim() || 'Unknown';
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }

    return Array.from(map.entries())
      .map(([title, sessions]) => ({ title, sessions }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [sessions]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-[calc(100%-2rem)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Smart Upload Report</h1>
          <p className="text-muted-foreground mt-1">
            Aggregated view of all smart upload sessions, grouped by music piece name.
          </p>
        </div>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          className="w-full md:w-auto"
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-muted-foreground">Loading report…</div>
      ) : error ? (
        <div className="mt-8 text-sm text-red-600">{error}</div>
      ) : (
        <div className="mt-8 space-y-6">
          {groups.map((group) => (
            <Card key={group.title} className="border">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="text-base font-semibold">{group.title}</span>
                  <Badge className="bg-slate-100 text-slate-700">{group.sessions.length} sessions</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left">Session</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Parse</th>
                        <th className="px-3 py-2 text-left">2nd Pass</th>
                        <th className="px-3 py-2 text-left">Split Source</th>
                        <th className="px-3 py-2 text-left">OCR Enforced</th>
                        <th className="px-3 py-2 text-left">Confidence</th>
                        <th className="px-3 py-2 text-left">Updated</th>
                        <th className="px-3 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.sessions.map((session) => (
                        <tr key={session.uploadSessionId} className="border-b last:border-b-0">
                          <td className="px-3 py-2">
                            <div className="font-medium">{session.fileName}</div>
                            <div className="text-xs text-muted-foreground">{session.uploadSessionId}</div>
                          </td>
                          <td className="px-3 py-2">{statusBadge(session.status)}</td>
                          <td className="px-3 py-2">
                            <Badge className="bg-gray-100 text-gray-700">{session.parseStatus ?? 'N/A'}</Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge className="bg-gray-100 text-gray-700">{session.secondPassStatus ?? 'N/A'}</Badge>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-muted-foreground">
                              {session.extractedMetadata?.cuttingInstructionsSource ?? 'unknown'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              session.extractedMetadata?.enforceOcrSplitting
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                            )}>
                              {session.extractedMetadata?.enforceOcrSplitting ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="px-3 py-2">{session.confidenceScore ?? '-'}</td>
                          <td className="px-3 py-2">{formatDate(session.updatedAt)}</td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/admin/uploads/review/${session.uploadSessionId}`}
                              className="text-blue-600 hover:underline"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
