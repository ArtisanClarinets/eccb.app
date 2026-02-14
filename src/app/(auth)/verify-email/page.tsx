import React, { Suspense } from 'react';
import Image from 'next/image';
import heroBg from '@/assets/hero_bg.jpg';
import Link from 'next/link';
import { Logo } from '@/components/icons/logo';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VerifyEmailContent } from '@/components/auth/verify-email-content';

export const metadata = {
  title: 'Verify Email',
  description: 'Verify your email address for ECCB Platform',
};

export default function VerifyEmailPage() {
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
              EMAIL <br /> <span className="text-primary italic">VERIFICATION</span>
            </h1>
            <p className="max-w-md text-lg text-gray-300">
              Please verify your email address to access all features of the platform.
            </p>
          </div>
          
          <div className="text-sm text-gray-400">
            &copy; {new Date().getFullYear()} Emerald Coast Community Band
          </div>
        </div>
      </div>

      {/* Right side: Content */}
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
              Verify Your Email
            </h3>
            <p className="mt-2 text-muted-foreground">
              Check your inbox for a verification link.
            </p>
          </div>

          <div className="glass-morphism rounded-3xl border border-border/50 p-8 shadow-sm">
            <Suspense fallback={<div className="flex justify-center p-8">Loading...</div>}>
              <VerifyEmailContent />
            </Suspense>
          </div>
          
          <p className="px-8 text-center text-sm text-muted-foreground">
            Need help?{' '}
            <Link href="/contact" className="underline underline-offset-4 hover:text-primary">
              Contact support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
