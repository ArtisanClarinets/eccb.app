import { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { SmartUploadSettingsClient } from './smart-upload-settings-client';

export const metadata: Metadata = {
  title: 'Smart Upload Settings',
};

export default async function SmartUploadSettingsPage() {
  // Check permission - require system settings permission
  await requirePermission('system:settings:read');

  return <SmartUploadSettingsClient />;
}