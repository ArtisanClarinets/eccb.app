import React, { Suspense } from 'react';
import Image from 'next/image';
import heroBg from '@/assets/hero_bg.jpg';
import Link from 'next/link';
import { Logo } from '@/components/icons/logo';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata = {
  title: 'Reset Password',
  description: 'Set a new password for your ECCB account',
};

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left side: Dramatic Entry */}
      <div className="relative hidden w-1/2 overflow-hidden bg-[#0f172a] lg:block">
        <Image
          src={heroBg}
          alt="Emerald Coast"
          fill
          placeholder="blur"
          sizes="50vw"
          className="object-cover opacity-50"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent" />
        
        <div className="absolute inset-0 flex flex-col justify-between p-12 text-white">
          <Link href="/" className="flex items-center gap-3 p-1.5" aria-label="Emerald Coast Community Band">
            <Logo className="h-10 w-auto text-white" />
            <span className="sr-only">Emerald Coast Community Band</span>
          </Link>
          
          <div>
            <h1 className="mb-6 font-display text-6xl font-black leading-tight">
              CREATE NEW <br /> <span className="text-primary italic">PASSWORD</span>
            </h1>
            <p className="max-w-md text-lg text-gray-300">
              Your new password should be different from your previous passwords 
              and at least 8 characters long.
            </p>
          </div>
          
          <div className="text-sm text-gray-400">
            &copy; {new Date().getFullYear()} Emerald Coast Community Band
          </div>
        </div>
      </div>

      {/* Right side: Form */}
      <div className="flex w-full flex-col items-center justify-center bg-background px-6 lg:w-1/2">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center lg:items-start">
            <Button
              variant="ghost"
              asChild
              className="mb-8 -ml-4 text-muted-foreground hover:text-primary lg:flex hidden"
            >
              <Link href="/login">
                <ChevronLeft className="mr-2 h-4 w-4" /> Back to Sign In
              </Link>
            </Button>
            
            <div className="mb-8 flex flex-col items-center lg:hidden">
              <Logo className="mb-4 h-16 w-auto text-primary" />
              <h2 className="sr-only">Emerald Coast Community Band</h2>
            </div>
            
            <h3 className="font-display text-4xl font-black text-foreground uppercase tracking-tight">
              Reset Password
            </h3>
            <p className="mt-2 text-muted-foreground">
              Enter your new password below.
            </p>
          </div>

          <div className="glass-morphism rounded-3xl border border-border/50 p-8 shadow-sm">
            <Suspense fallback={<div className="flex justify-center p-8">Loading...</div>}>
              <ResetPasswordForm />
            </Suspense>
          </div>
          
          <p className="px-8 text-center text-sm text-muted-foreground">
            By resetting your password, you agree to our{' '}
            <Link href="/terms" className="underline underline-offset-4 hover:text-primary">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-primary">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
