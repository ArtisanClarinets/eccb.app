/**
 * Setup Page
 *
 * Main setup wizard page that guides non-technical users through
 * the database setup process.
 */

import { redirect } from 'next/navigation';
import { SetupWizard } from '@/components/setup/setup-wizard';
import { getSetupState } from '@/lib/setup/state';

export const metadata = {
  title: 'Setup | Emerald Coast Community Band',
  description: 'Set up your database and get started with the application',
};

interface SetupPageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function SetupPage({ searchParams }: SetupPageProps): Promise<React.ReactNode> {
  const params = await searchParams;
  const isRepairMode = params.mode === 'repair';

  // If system is already fully configured, redirect to login (unless in repair mode)
  if (!isRepairMode) {
    const setupState = await getSetupState().catch(() => null);
    if (setupState?.readyForLogin) {
      // System is ready - redirect to login
      redirect('/login');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-2xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-4xl font-bold text-white">
              {isRepairMode ? 'Repair Database' : 'Welcome to Setup'}
            </h1>
            <p className="text-lg text-slate-300">
              {isRepairMode
                ? "Let's fix your database connection and get everything working again."
                : "Let's set up your database and get everything running."}
            </p>
          </div>

          {/* Setup Wizard */}
          <SetupWizard repairMode={isRepairMode} />

          {/* Post-setup instructions (shown in dev) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-8 p-4 bg-blue-900/30 border border-blue-700 rounded-lg text-center">
              <p className="text-sm text-blue-200">
                <strong>After setup completes:</strong> Set <code className="bg-blue-950 px-2 py-1 rounded">SETUP_MODE=false</code> in your .env file and restart the app.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
}
