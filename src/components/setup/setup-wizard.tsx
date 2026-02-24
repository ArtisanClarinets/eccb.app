/**
 * Setup Wizard Component
 *
 * Main multi-step wizard that orchestrates the setup flow:
 * Welcome -> Database Config -> Environment -> Progress -> Completion
 */

'use client';

import { useEffect, useState } from 'react';

import { ArrowLeft, ArrowRight, CheckCircle2, Database, Settings, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DatabaseConfigForm, type DatabaseConfig } from '@/components/setup/database-config-form';
import { ProgressIndicator } from '@/components/setup/progress-indicator';
import { StatusDisplay } from '@/components/setup/status-display';
import { cn } from '@/lib/utils';

type SetupStep = 'welcome' | 'database' | 'environment' | 'progress' | 'complete';

interface SetupStepData {
  id: SetupStep;
  name: string;
  description: string;
}

interface SetupWizardProps {
  repairMode?: boolean;
}

interface SetupStatus {
  phase: string;
  progress: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  message: string;
}

const steps: SetupStepData[] = [
  { id: 'welcome', name: 'Welcome', description: 'Get started with setup' },
  { id: 'database', name: 'Database', description: 'Configure your database' },
  { id: 'environment', name: 'Environment', description: 'Set up environment' },
  { id: 'progress', name: 'Progress', description: 'Running setup tasks' },
  { id: 'complete', name: 'Complete', description: 'Setup finished' },
];

export function SetupWizard({ repairMode = false }: SetupWizardProps): React.ReactElement {
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = steps.findIndex((s) => s.id === currentStep);
  const _progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  // Fetch initial status on mount
  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/setup/status');
        const data = await response.json();
        setSetupStatus(data);

        // If already completed, skip to complete
        if (data.status === 'completed') {
          setCurrentStep('complete');
        }
      } catch {
        // Ignore - will be handled in form submission
      }
    }

    fetchStatus();
  }, []);

  const handleDatabaseSubmit = async (config: DatabaseConfig): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      // Test database connection
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'init',
          config: {
            host: config.host,
            port: config.port,
            database: config.database,
            username: config.username,
            password: config.password,
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to connect to database');
      }

      setCurrentStep('environment');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnvironmentSetup = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setCurrentStep('progress');

    try {
      // Start the setup process
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'full' }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Setup failed');
      }

      setCurrentStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
      setCurrentStep('database');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = (): void => {
    setError(null);
    if (currentStep === 'database') {
      setCurrentStep('welcome');
    } else if (currentStep === 'progress') {
      handleEnvironmentSetup();
    }
  };

  const goToNextStep = (): void => {
    if (currentStep === 'welcome') {
      setCurrentStep('database');
    } else if (currentStep === 'database') {
      setCurrentStep('environment');
    } else if (currentStep === 'environment') {
      handleEnvironmentSetup();
    }
  };

  const goToPrevStep = (): void => {
    if (currentStep === 'database') {
      setCurrentStep('welcome');
    } else if (currentStep === 'environment') {
      setCurrentStep('database');
    } else if (currentStep === 'progress') {
      setCurrentStep('environment');
    }
  };

  const renderWelcomeStep = (): React.ReactElement => (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardContent className="pt-6">
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
            <Sparkles className="h-8 w-8 text-primary-light" />
          </div>
          <h2 className="text-2xl font-bold text-white">
            {repairMode ? 'Repair Your Setup' : 'Welcome to Setup'}
          </h2>
          <p className="text-slate-400 max-w-md mx-auto">
            {repairMode
              ? "We'll diagnose and fix any issues with your database connection and configuration."
              : 'This wizard will guide you through setting up your database and getting everything running.'}
          </p>
          <div className="pt-4">
            <Button
              onClick={goToNextStep}
              className="bg-primary hover:bg-primary/90 text-white gap-2"
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderDatabaseStep = (): React.ReactElement => (
    <div className="space-y-4">
      {error && (
        <StatusDisplay
          type="error"
          title="Connection Failed"
          message={error}
          action={{
            label: 'Start over',
            onClick: handleRetry,
          }}
        />
      )}
      <DatabaseConfigForm onSubmit={handleDatabaseSubmit} isLoading={isLoading} />
    </div>
  );

  const renderEnvironmentStep = (): React.ReactElement => (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardContent className="pt-6">
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
            <Settings className="h-8 w-8 text-primary-light" />
          </div>
          <h2 className="text-2xl font-bold text-white">Environment Ready</h2>
          <p className="text-slate-400 max-w-md mx-auto">
            Your database is connected. Click continue to run the setup tasks and seed your
            database with initial data.
          </p>

          {error && (
            <StatusDisplay type="error" title="Setup Error" message={error} className="mt-4" />
          )}

          <div className="pt-4 flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={goToPrevStep}
              disabled={isLoading}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <Button
              onClick={handleEnvironmentSetup}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-white gap-2"
            >
              {isLoading ? (
                <>Setting up...</>
              ) : (
                <>Continue <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderProgressStep = (): React.ReactElement => (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardContent className="pt-6">
        <StatusDisplay
          type="loading"
          title="Setting up your application..."
          message="This may take a few minutes. Please don't close this page."
          className="mb-6"
        />

        <ProgressIndicator
          currentStep={3}
          totalSteps={5}
          progress={setupStatus?.progress || 50}
          steps={[
            { id: '1', name: 'Checking database connection', status: 'completed', message: 'Connected' },
            { id: '2', name: 'Configuring environment', status: 'completed', message: 'Complete' },
            { id: '3', name: 'Running migrations', status: 'running', message: 'In progress...' },
            { id: '4', name: 'Seeding database', status: 'pending' },
            { id: '5', name: 'Verifying setup', status: 'pending' },
          ]}
        />
      </CardContent>
    </Card>
  );

  const renderCompleteStep = (): React.ReactElement => (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardContent className="pt-6">
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">Setup Complete!</h2>
          <p className="text-slate-400 max-w-md mx-auto">
            Your database has been set up successfully. You can now access the admin dashboard
            and manage your band content.
          </p>
          <div className="pt-4">
            <Button
              onClick={() => {
                window.location.href = '/admin';
              }}
              className="bg-primary hover:bg-primary/90 text-white gap-2"
            >
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep = (): React.ReactElement => {
    switch (currentStep) {
      case 'welcome':
        return renderWelcomeStep();
      case 'database':
        return renderDatabaseStep();
      case 'environment':
        return renderEnvironmentStep();
      case 'progress':
        return renderProgressStep();
      case 'complete':
        return renderCompleteStep();
      default:
        return <div>Unknown step</div>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Progress indicator for non-welcome steps */}
      {currentStep !== 'welcome' && currentStep !== 'complete' && (
        <div className="flex items-center justify-center gap-2">
          {steps.slice(0, -1).map((step, index) => (
            <div key={step.id} className="flex items-center">
              <button
                type="button"
                onClick={() => setCurrentStep(step.id)}
                disabled={index > stepIndex}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  index === stepIndex && 'bg-primary/20 text-primary-light',
                  index < stepIndex && 'text-green-400 hover:text-green-300',
                  index > stepIndex && 'text-slate-500 cursor-not-allowed',
                )}
              >
                {index < stepIndex ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                {step.name}
              </button>
              {index < steps.length - 2 && <span className="text-slate-600">/</span>}
            </div>
          ))}
        </div>
      )}

      {/* Current step content */}
      <div
        key={currentStep}
        className="animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        {renderStep()}
      </div>
    </div>
  );
}
