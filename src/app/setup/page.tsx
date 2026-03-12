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
        </div>
      </div>
    </div>
  );
}
