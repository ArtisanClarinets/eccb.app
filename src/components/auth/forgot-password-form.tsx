'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Use the current origin for the redirect URL
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${baseUrl}/reset-password`,
    });

    setLoading(false);

    if (error) {
      // Don't reveal if email exists or not for security
      // Still show success to prevent email enumeration
      console.error('Password reset error:', error);
    }
    
    // Always show success message to prevent email enumeration
    setSuccess(true);
    toast.success('If an account exists with that email, you will receive a password reset link.');
  };

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Check Your Email</h3>
          <p className="text-muted-foreground">
            If an account with <span className="font-medium text-foreground">{email}</span> exists, 
            you will receive a password reset link shortly.
          </p>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Didn't receive the email?</p>
          <ul className="text-left space-y-1">
            <li>• Check your spam folder</li>
            <li>• Make sure you entered the correct email</li>
            <li>• The link expires in 15 minutes</li>
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/login')}
            className="w-full"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sign In
          </Button>
          <Button
            variant="ghost"
            onClick={() => setSuccess(false)}
            className="w-full"
          >
            Try another email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
            required
            disabled={loading}
          />
        </div>
      </div>

      <Button
        type="submit"
        className="w-full bg-primary hover:bg-primary/90"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending reset link...
          </>
        ) : (
          'Send Reset Link'
        )}
      </Button>
    </form>
  );
}
