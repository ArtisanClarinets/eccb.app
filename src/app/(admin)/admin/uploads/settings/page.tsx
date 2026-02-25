'use client';

import { useEffect, useState } from 'react';
import { SmartUploadSettingsForm } from '@/components/admin/music/smart-upload-settings-form';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

function LoadingState() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SmartUploadSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch('/api/admin/uploads/settings');
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Unauthorized - Please sign in');
          }
          if (response.status === 403) {
            throw new Error('Forbidden - You do not have permission to view these settings');
          }
          throw new Error(`Failed to load settings: ${response.statusText}`);
        }
        const data = await response.json();
        
        // Convert array of settings to record
        const settingsRecord: Record<string, string> = {};
        data.settings.forEach((setting: SystemSetting) => {
          settingsRecord[setting.key] = setting.value;
        });
        
        setSettings(settingsRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Smart Upload Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure the AI/LLM models used for automatic metadata extraction from music PDFs.
          </p>
        </div>

        <SmartUploadSettingsForm settings={settings} />
      </div>
    </div>
  );
}
