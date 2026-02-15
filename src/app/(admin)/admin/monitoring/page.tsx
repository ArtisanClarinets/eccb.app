'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  Trash2,
  XCircle,
  CheckCircle,
  Clock,
  Cpu,
  MemoryStick,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// Types matching the API response
interface HealthStatus {
  database: 'healthy' | 'degraded' | 'unhealthy';
  redis: 'healthy' | 'degraded' | 'unhealthy';
  storage: 'healthy' | 'degraded' | 'unhealthy';
  overall: 'healthy' | 'degraded' | 'unhealthy';
}

interface RequestMetrics {
  total: number;
  successful: number;
  failed: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
}

interface ErrorMetrics {
  total: number;
  byCode: Record<string, number>;
  byEndpoint: Record<string, number>;
  rate: number;
}

interface DatabaseMetrics {
  totalQueries: number;
  avgDuration: number;
  slowQueries: number;
  failedQueries: number;
  byOperation: Record<string, { count: number; avgDuration: number }>;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  size: number;
}

interface SystemMetrics {
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  uptime: number;
  nodeVersion: string;
  platform: string;
}

interface DatabaseStats {
  members: { total: number; active: number; pending: number };
  events: { total: number; upcoming: number; past: number };
  music: { total: number; inCatalog: number };
  users: { total: number; active: number };
  storage: { totalFiles: number; totalSize: number };
}

interface AggregatedError {
  fingerprint: string;
  message: string;
  stack?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  contexts: Array<{
    userId?: string;
    requestId?: string;
    endpoint?: string;
    method?: string;
    component?: string;
    action?: string;
    metadata?: Record<string, unknown>;
  }>;
}

interface MonitoringResponse {
  timestamp: string;
  health: HealthStatus;
  metrics: {
    requests: RequestMetrics;
    errors: ErrorMetrics;
    database: DatabaseMetrics;
    cache: CacheMetrics;
    system: SystemMetrics;
  };
  databaseStats: DatabaseStats;
  aggregatedErrors: AggregatedError[];
}

// Helper functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(' ') || '< 1m';
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'text-green-600 bg-green-100';
    case 'degraded':
      return 'text-yellow-600 bg-yellow-100';
    case 'unhealthy':
      return 'text-red-600 bg-red-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'healthy':
      return <CheckCircle className="h-4 w-4" />;
    case 'degraded':
      return <AlertTriangle className="h-4 w-4" />;
    case 'unhealthy':
      return <XCircle className="h-4 w-4" />;
    default:
      return <AlertTriangle className="h-4 w-4" />;
  }
}

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/admin/monitoring');
      if (!response.ok) {
        throw new Error(`Failed to fetch monitoring data: ${response.statusText}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const clearMetrics = async (type: 'metrics' | 'errors' | 'all') => {
    if (!confirm(`Are you sure you want to clear ${type}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/monitoring?type=${type}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to clear data');
      }
      fetchData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear data');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <p className="text-lg font-medium text-red-600">{error}</p>
        <Button onClick={() => fetchData()}>Retry</Button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { health, metrics, databaseStats, aggregatedErrors } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-4xl font-black text-foreground uppercase tracking-tight">
            System Monitoring
          </h1>
          <p className="text-muted-foreground italic">
            Real-time system health and performance metrics
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Health Status */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge className={getStatusColor(health.overall)}>
                {getStatusIcon(health.overall)}
                <span className="ml-1 capitalize">{health.overall}</span>
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" /> Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getStatusColor(health.database)}>
              {getStatusIcon(health.database)}
              <span className="ml-1 capitalize">{health.database}</span>
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" /> Redis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getStatusColor(health.redis)}>
              {getStatusIcon(health.redis)}
              <span className="ml-1 capitalize">{health.redis}</span>
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" /> Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getStatusColor(health.storage)}>
              {getStatusIcon(health.storage)}
              <span className="ml-1 capitalize">{health.storage}</span>
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* System Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Cpu className="h-4 w-4" /> System
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-medium">{formatUptime(metrics.system.uptime)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Node Version</span>
                  <span className="font-medium">{metrics.system.nodeVersion}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform</span>
                  <span className="font-medium capitalize">{metrics.system.platform}</span>
                </div>
              </CardContent>
            </Card>

            {/* Memory Usage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MemoryStick className="h-4 w-4" /> Memory
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Heap Used</span>
                    <span className="font-medium">
                      {formatBytes(metrics.system.memoryUsage.heapUsed)} / {formatBytes(metrics.system.memoryUsage.heapTotal)}
                    </span>
                  </div>
                  <Progress
                    value={(metrics.system.memoryUsage.heapUsed / metrics.system.memoryUsage.heapTotal) * 100}
                    className="h-2"
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">RSS</span>
                  <span className="font-medium">{formatBytes(metrics.system.memoryUsage.rss)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Request Stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Requests
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-medium">{metrics.requests.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Successful</span>
                  <span className="font-medium text-green-600">{metrics.requests.successful}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Failed</span>
                  <span className="font-medium text-red-600">{metrics.requests.failed}</span>
                </div>
              </CardContent>
            </Card>

            {/* Cache Stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Server className="h-4 w-4" /> Cache
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hit Rate</span>
                    <span className="font-medium">{(metrics.cache.hitRate * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={metrics.cache.hitRate * 100} className="h-2" />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Hits / Misses</span>
                  <span className="font-medium">{metrics.cache.hits} / {metrics.cache.misses}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Database Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Database Statistics</CardTitle>
              <CardDescription>Overview of data in the database</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-5">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Members</p>
                  <p className="text-2xl font-bold">{databaseStats.members.total}</p>
                  <p className="text-xs text-muted-foreground">
                    {databaseStats.members.active} active, {databaseStats.members.pending} pending
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Events</p>
                  <p className="text-2xl font-bold">{databaseStats.events.total}</p>
                  <p className="text-xs text-muted-foreground">
                    {databaseStats.events.upcoming} upcoming
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Music Catalog</p>
                  <p className="text-2xl font-bold">{databaseStats.music.total}</p>
                  <p className="text-xs text-muted-foreground">
                    {databaseStats.music.inCatalog} available
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Users</p>
                  <p className="text-2xl font-bold">{databaseStats.users.total}</p>
                  <p className="text-xs text-muted-foreground">
                    {databaseStats.users.active} verified
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Storage</p>
                  <p className="text-2xl font-bold">{databaseStats.storage.totalFiles}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(databaseStats.storage.totalSize)} total
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Request Duration */}
            <Card>
              <CardHeader>
                <CardTitle>Request Duration</CardTitle>
                <CardDescription>Response time percentiles</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Average</span>
                  <span className="font-medium">{formatDuration(metrics.requests.avgDuration)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">P50 (Median)</span>
                  <span className="font-medium">{formatDuration(metrics.requests.p50Duration)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">P95</span>
                  <span className="font-medium text-yellow-600">{formatDuration(metrics.requests.p95Duration)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">P99</span>
                  <span className="font-medium text-red-600">{formatDuration(metrics.requests.p99Duration)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Database Performance */}
            <Card>
              <CardHeader>
                <CardTitle>Database Performance</CardTitle>
                <CardDescription>Query execution metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Queries</span>
                  <span className="font-medium">{metrics.database.totalQueries}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Average Duration</span>
                  <span className="font-medium">{formatDuration(metrics.database.avgDuration)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Slow Queries (&gt;500ms)</span>
                  <span className="font-medium text-yellow-600">{metrics.database.slowQueries}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Failed Queries</span>
                  <span className="font-medium text-red-600">{metrics.database.failedQueries}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Query Operations */}
          <Card>
            <CardHeader>
              <CardTitle>Query Operations</CardTitle>
              <CardDescription>Breakdown by operation type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                {Object.entries(metrics.database.byOperation).map(([op, stats]) => (
                  <div key={op} className="rounded-lg border p-4">
                    <p className="text-sm font-medium capitalize">{op}</p>
                    <p className="text-2xl font-bold">{stats.count}</p>
                    <p className="text-xs text-muted-foreground">
                      Avg: {formatDuration(stats.avgDuration)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Error Tracking</h3>
              <p className="text-sm text-muted-foreground">
                {metrics.errors.total} total errors • {metrics.errors.rate} errors/min
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearMetrics('errors')}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Errors
            </Button>
          </div>

          {/* Error Codes */}
          <Card>
            <CardHeader>
              <CardTitle>Errors by Status Code</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-8">
                {Object.entries(metrics.errors.byCode).map(([code, count]) => (
                  <div key={code} className="text-center">
                    <p className="text-2xl font-bold">{count}</p>
                    <Badge
                      variant={parseInt(code) >= 500 ? 'destructive' : parseInt(code) >= 400 ? 'default' : 'secondary'}
                    >
                      {code}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Aggregated Errors */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Errors</CardTitle>
              <CardDescription>Grouped by similarity</CardDescription>
            </CardHeader>
            <CardContent>
              {aggregatedErrors.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No errors recorded</p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {aggregatedErrors.map((err) => (
                      <div
                        key={err.fingerprint}
                        className="rounded-lg border p-4 space-y-2"
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <p className="font-medium text-sm">{err.message}</p>
                            <p className="text-xs text-muted-foreground">
                              First: {new Date(err.firstSeen).toLocaleString()} • 
                              Last: {new Date(err.lastSeen).toLocaleString()}
                            </p>
                          </div>
                          <Badge variant="destructive">{err.count}</Badge>
                        </div>
                        {err.stack && (
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {err.stack.split('\n').slice(0, 3).join('\n')}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Database Tab */}
        <TabsContent value="database" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Database Metrics</CardTitle>
              <CardDescription>Real-time database performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="font-medium">Query Statistics</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Queries</span>
                      <span className="font-medium">{metrics.database.totalQueries}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Average Duration</span>
                      <span className="font-medium">{formatDuration(metrics.database.avgDuration)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Slow Queries</span>
                      <span className="font-medium text-yellow-600">{metrics.database.slowQueries}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Failed Queries</span>
                      <span className="font-medium text-red-600">{metrics.database.failedQueries}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Cache Performance</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Hit Rate</span>
                      <span className="font-medium">{(metrics.cache.hitRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cache Hits</span>
                      <span className="font-medium text-green-600">{metrics.cache.hits}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cache Misses</span>
                      <span className="font-medium text-yellow-600">{metrics.cache.misses}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Evictions</span>
                      <span className="font-medium">{metrics.cache.evictions}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Data Summary</CardTitle>
              <CardDescription>Current state of the database</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Members
                  </h4>
                  <div className="text-3xl font-bold">{databaseStats.members.total}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="text-green-600">{databaseStats.members.active}</span> active •{' '}
                    <span className="text-yellow-600">{databaseStats.members.pending}</span> pending
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Events
                  </h4>
                  <div className="text-3xl font-bold">{databaseStats.events.total}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="text-primary">{databaseStats.events.upcoming}</span> upcoming
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Server className="h-4 w-4" /> Music
                  </h4>
                  <div className="text-3xl font-bold">{databaseStats.music.total}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="text-primary">{databaseStats.music.inCatalog}</span> in catalog
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Cpu className="h-4 w-4" /> Users
                  </h4>
                  <div className="text-3xl font-bold">{databaseStats.users.total}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="text-green-600">{databaseStats.users.active}</span> verified
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <HardDrive className="h-4 w-4" /> Storage
                  </h4>
                  <div className="text-3xl font-bold">{databaseStats.storage.totalFiles}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatBytes(databaseStats.storage.totalSize)} total
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Last Updated */}
      <div className="text-center text-sm text-muted-foreground">
        Last updated: {new Date(data.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
