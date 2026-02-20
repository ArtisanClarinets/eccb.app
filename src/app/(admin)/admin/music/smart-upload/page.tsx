import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';
import { formatDate } from '@/lib/date';
import { env } from '@/lib/env';
import { isSmartUploadEnabled } from '@/lib/services/smart-upload-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, ArrowLeft } from 'lucide-react';
import { SmartUploadClient } from './smart-upload-client';

export const metadata: Metadata = {
  title: 'Smart Upload',
};

interface SearchParams {
  page?: string;
}

export default async function SmartUploadPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Check permission
  await requirePermission('music:smart_upload:read');

  // Check feature flag from database (with fallback to env)
  const dbEnabled = await isSmartUploadEnabled();
  const isFeatureEnabled = dbEnabled ?? env.SMART_UPLOAD_ENABLED;

  if (!isFeatureEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Smart Upload</h1>
          <p className="text-muted-foreground">
            AI-powered music upload and metadata extraction
          </p>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-full w-fit mx-auto">
                <svg
                  className="h-8 w-8 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold">Feature Currently Disabled</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Smart Upload is not currently enabled. Please contact your administrator
                to enable this feature.
              </p>
              <div className="pt-4">
                <Button asChild>
                  <Link href="/admin/music/smart-upload/settings">
                    <Settings className="h-4 w-4 mr-2" />
                    Configure Smart Upload
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const page = parseInt(params.page || '1');
  const limit = 10;
  const offset = (page - 1) * limit;

  // Fetch recent batches for the current user
  const [batches, total] = await Promise.all([
    prisma.smartUploadBatch.findMany({
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        status: true,
        totalFiles: true,
        processedFiles: true,
        successFiles: true,
        failedFiles: true,
        createdAt: true,
        completedAt: true,
        errorSummary: true,
      },
    }),
    prisma.smartUploadBatch.count(),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      {/* Settings Link for Admins */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/music/smart-upload/settings">
            <Settings className="h-4 w-4 mr-2" />
            Smart Upload Settings
          </Link>
        </Button>
      </div>

      <SmartUploadClient
        batches={batches}
        total={total}
        page={page}
        totalPages={totalPages}
        isEnabled={isFeatureEnabled}
        maxFiles={env.SMART_UPLOAD_MAX_FILES}
        maxSize={env.SMART_UPLOAD_MAX_TOTAL_BYTES}
        aiProvider={env.AI_PROVIDER}
      />
    </>
  );
}