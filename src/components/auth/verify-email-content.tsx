'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, CheckCircle2, XCircle, ArrowLeft, RefreshCw } from 'lucide-react';

function VerifyEmailContentInner() {
  const [email, setEmail] = useState('');
  const [_loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'pending'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const verifyEmail = useCallback(async (verificationToken: string) => {
    setStatus('verifying');
    setLoading(true);
    setErrorMessage(null);

    try {
      const { error } = await authClient.verifyEmail({
        query: {
          token: verificationToken,
        },
      });

      if (error) {
        setStatus('error');
        setErrorMessage(error.message || 'Email verification failed. The link may have expired.');
      } else {
        setStatus('success');
        toast.success('Email verified successfully!');
        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          router.push('/dashboard');
        }, 3000);
      }
    } catch (_err) {
      setStatus('error');
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    }
  }, [token, verifyEmail]);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    setResending(true);

    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: '/verify-email',
    });

    setResending(false);

    if (error) {
      toast.error(error.message || 'Failed to send verification email');
    } else {
      toast.success('Verification email sent! Check your inbox.');
      setCountdown(60); // 60 second cooldown
    }
  };

  // Verifying state
  if (status === 'verifying') {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <Loader2 className="h-16 w-16 text-primary animate-spin" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Verifying Email...</h3>
          <p className="text-muted-foreground">
            Please wait while we verify your email address.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Email Verified!</h3>
          <p className="text-muted-foreground">
            Your email has been successfully verified. Redirecting to your dashboard...
          </p>
        </div>
        <Button
          className="w-full bg-primary hover:bg-primary/90"
          onClick={() => router.push('/dashboard')}
        >
          Go to Dashboard
        </Button>
      </div>
    );
  }

  // Error state with token
  if (status === 'error' && token) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <XCircle className="h-16 w-16 text-destructive" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Verification Failed</h3>
          <p className="text-muted-foreground">
            {errorMessage || 'The verification link is invalid or has expired.'}
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter your email to receive a new verification link:
          </p>
          <form onSubmit={handleResendVerification} className="space-y-3">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={resending || countdown > 0}
            />
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90"
              disabled={resending || countdown > 0}
            >
              {resending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : countdown > 0 ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend in {countdown}s
                </>
              ) : (
                'Resend Verification Email'
              )}
            </Button>
          </form>
        </div>
        <Button
          variant="ghost"
          onClick={() => router.push('/login')}
          className="w-full"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sign In
        </Button>
      </div>
    );
  }

  // Default pending state - user can request verification
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <Mail className="h-12 w-12 text-primary" />
        </div>
        <p className="text-muted-foreground">
          Enter your email address to receive a verification link.
        </p>
      </div>

      <form onSubmit={handleResendVerification} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={resending || countdown > 0}
          />
        </div>

        <Button
          type="submit"
          className="w-full bg-primary hover:bg-primary/90"
          disabled={resending || countdown > 0}
        >
          {resending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : countdown > 0 ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Resend in {countdown}s
            </>
          ) : (
            'Send Verification Email'
          )}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        <p>Already verified?{' '}
          <Button variant="link" className="p-0 h-auto" onClick={() => router.push('/login')}>
            Sign in
          </Button>
        </p>
      </div>
    </div>
  );
}

export function VerifyEmailContent() {
  return (
    <Suspense fallback={<div className="flex justify-center p-8">Loading...</div>}>
      <VerifyEmailContentInner />
    </Suspense>
  );
}
