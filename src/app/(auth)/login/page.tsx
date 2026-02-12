import React, { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Music, ChevronLeft } from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Sign In',
  description: 'Sign in to your ECCB member account',
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left side: Dramatic Entry */}
      <div className="relative hidden w-1/2 overflow-hidden bg-[#0f172a] lg:block">
        <Image
          src="/images/hero_bg.jpg"
          alt="Emerald Coast"
          fill
          sizes="50vw"
          className="object-cover opacity-50"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent" />
        
        <div className="absolute inset-0 flex flex-col justify-between p-12 text-white">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
              <Music size={24} />
            </div>
            <span className="font-display text-2xl font-black tracking-widest text-white">
              ECCB
            </span>
          </Link>
          
          <div>
            <h1 className="mb-6 font-display text-6xl font-black leading-tight">
              WELCOME <br /> <span className="text-primary italic">BACK</span>
            </h1>
            <p className="max-w-md text-lg text-gray-300">
              Access the digital music library, update your profile, and check
              the latest rehearsal schedules.
            </p>
          </div>
          
          <div className="text-sm text-gray-400">
            &copy; {new Date().getFullYear()} Emerald Coast Community Band
          </div>
        </div>
      </div>

      {/* Right side: Auth Form */}
      <div className="flex w-full flex-col items-center justify-center bg-background px-6 lg:w-1/2">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center lg:items-start">
            <Button
              variant="ghost"
              asChild
              className="mb-8 -ml-4 text-muted-foreground hover:text-primary lg:flex hidden"
            >
              <Link href="/">
                <ChevronLeft className="mr-2 h-4 w-4" /> Back to Home
              </Link>
            </Button>
            
            <div className="mb-8 flex flex-col items-center lg:hidden">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-xl">
                <Music size={32} />
              </div>
              <h2 className="font-display text-3xl font-black tracking-widest text-foreground">
                ECCB
              </h2>
            </div>
            
            <h3 className="font-display text-4xl font-black text-foreground uppercase tracking-tight">
              Member Sign In
            </h3>
            <p className="mt-2 text-muted-foreground">
              Don't have an account?{' '}
              <Link href="/signup" className="font-medium text-primary hover:underline">
                Register as a Musician
              </Link>
            </p>
          </div>

          <div className="glass-morphism rounded-3xl border border-border/50 p-8 shadow-sm">
            <Suspense fallback={<div className="flex justify-center p-8">Loading...</div>}>
              <LoginForm />
            </Suspense>
          </div>
          
          <p className="px-8 text-center text-sm text-muted-foreground">
            By signing in, you agree to our{' '}
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
