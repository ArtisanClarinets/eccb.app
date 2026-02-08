import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Music2, Facebook, Instagram, Twitter, Send, CheckCircle, ArrowUp, Heart, Mail, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

gsap.registerPlugin(ScrollTrigger);

const footerLinks = {
  quickLinks: [
    { label: 'Home', href: '#home' },
    { label: 'About', href: '#about' },
    { label: 'Join Us', href: '#join' },
    { label: 'Events', href: '#events' },
    { label: 'Contact', href: '#contact' },
  ],
  social: [
    { icon: Facebook, label: 'Facebook', href: 'https://facebook.com', color: 'hover:bg-blue-600' },
    { icon: Instagram, label: 'Instagram', href: 'https://instagram.com', color: 'hover:bg-pink-600' },
    { icon: Twitter, label: 'Twitter', href: 'https://twitter.com', color: 'hover:bg-sky-600' },
  ],
};

export default function Footer() {
  const footerRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Wave decoration draw
      const wave = footerRef.current?.querySelector('.wave-path');
      if (wave) {
        gsap.fromTo(
          wave,
          { strokeDashoffset: 1000 },
          {
            strokeDashoffset: 0,
            duration: 1.5,
            ease: 'expo.out',
            scrollTrigger: {
              trigger: footerRef.current,
              start: 'top 90%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      }

      // Newsletter section
      gsap.fromTo(
        '.newsletter-section',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'expo.out',
          delay: 0.2,
          scrollTrigger: {
            trigger: footerRef.current,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Links columns
      gsap.fromTo(
        '.footer-column',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.1,
          ease: 'expo.out',
          delay: 0.3,
          scrollTrigger: {
            trigger: footerRef.current,
            start: 'top 70%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Social icons
      gsap.fromTo(
        '.social-icon',
        { scale: 0, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.4,
          stagger: 0.1,
          ease: 'elastic.out(1, 0.5)',
          delay: 0.5,
          scrollTrigger: {
            trigger: footerRef.current,
            start: 'top 70%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    });

    return () => ctx.revert();
  }, []);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setIsSubscribed(true);
      setTimeout(() => {
        setIsSubscribed(false);
        setEmail('');
      }, 3000);
    }
  };

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer
      ref={footerRef}
      className="relative bg-gradient-to-b from-teal-700 to-teal-800 text-white overflow-hidden"
    >
      {/* Wave decoration at top */}
      <div className="absolute top-0 left-0 right-0 h-20 -translate-y-full">
        <svg
          viewBox="0 0 1440 80"
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="footerWave" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0f766e" />
              <stop offset="50%" stopColor="#0d5d56" />
              <stop offset="100%" stopColor="#0f766e" />
            </linearGradient>
          </defs>
          <path
            className="wave-path"
            d="M0,40 C360,80 720,0 1080,40 C1260,60 1380,20 1440,40 L1440,80 L0,80 Z"
            fill="url(#footerWave)"
            stroke="none"
            strokeWidth="0"
            strokeDasharray="1000"
            strokeDashoffset="1000"
          />
        </svg>
      </div>

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-600/30 rounded-full blur-3xl" />
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20 py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Newsletter */}
          <div className="newsletter-section">
            <div className="flex items-center gap-3 mb-6">
              <Music2 className="w-8 h-8 text-teal-300" />
              <span className="font-display font-semibold text-xl">
                Emerald Coast Band
              </span>
            </div>

            <h3 className="font-display text-xl font-bold mb-2">
              Join Our Newsletter
            </h3>
            <p className="text-teal-100 text-sm mb-6 leading-relaxed">
              Stay updated with our latest news, events, and performance announcements. 
              Join over 500 subscribers!
            </p>

            <form onSubmit={handleSubscribe} className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-white/10 border-white/20 text-white placeholder:text-teal-200 focus:border-teal-300 focus:ring-teal-300 rounded-xl pr-12"
                />
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-300" />
              </div>
              <Button
                type="submit"
                disabled={isSubscribed}
                className={`px-4 rounded-xl transition-all duration-300 ${
                  isSubscribed
                    ? 'bg-green-500 hover:bg-green-500'
                    : 'bg-teal-300 hover:bg-teal-200 text-teal-800'
                }`}
              >
                {isSubscribed ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </form>

            {isSubscribed && (
              <p className="mt-3 text-sm text-teal-200">
                Thanks for subscribing! Check your inbox.
              </p>
            )}

            {/* Quick stats */}
            <div className="mt-8 flex gap-6">
              <div>
                <p className="text-2xl font-display font-bold">500+</p>
                <p className="text-xs text-teal-200">Subscribers</p>
              </div>
              <div className="w-px bg-white/20" />
              <div>
                <p className="text-2xl font-display font-bold">1K+</p>
                <p className="text-xs text-teal-200">Facebook Followers</p>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="footer-column">
            <h3 className="font-display text-xl font-bold mb-6">Quick Links</h3>
            <ul className="space-y-3">
              {footerLinks.quickLinks.map((link, index) => (
                <li key={index}>
                  <button
                    onClick={() => scrollToSection(link.href)}
                    className="text-teal-100 hover:text-white hover:translate-x-2 transition-all duration-300 inline-flex items-center gap-2 group"
                  >
                    <span className="w-0 h-px bg-teal-300 group-hover:w-4 transition-all duration-300" />
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>

            {/* Rehearsal info */}
            <div className="mt-8 p-4 bg-white/10 rounded-xl">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Music className="w-4 h-4 text-teal-300" />
                Weekly Rehearsals
              </h4>
              <p className="text-sm text-teal-200">Tuesdays at 7:00 PM</p>
              <p className="text-sm text-teal-200">Meigs Middle School</p>
              <p className="text-sm text-teal-200">Fort Walton Beach, FL</p>
            </div>
          </div>

          {/* Social Links */}
          <div className="footer-column">
            <h3 className="font-display text-xl font-bold mb-6">Connect With Us</h3>
            <p className="text-teal-100 text-sm mb-6 leading-relaxed">
              Follow us on social media for behind-the-scenes content, photos, and updates.
            </p>

            <div className="flex gap-4 mb-8">
              {footerLinks.social.map((social, index) => (
                <a
                  key={index}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`social-icon w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center ${social.color} transition-all duration-300 group`}
                  aria-label={social.label}
                >
                  <social.icon className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                </a>
              ))}
            </div>

            {/* Facebook highlight */}
            <div className="p-4 bg-white/10 rounded-xl border border-white/10">
              <div className="flex items-center gap-3 mb-2">
                <Facebook className="w-5 h-5 text-blue-400" />
                <span className="font-semibold">Facebook</span>
              </div>
              <p className="text-sm text-teal-200 mb-3">Emerald Coast Community Band</p>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-teal-300 hover:text-white transition-colors group"
              >
                Visit Page
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-teal-200">
            <span>Made with</span>
            <Heart className="w-4 h-4 text-red-400 fill-red-400" />
            <span>in Fort Walton Beach</span>
          </div>
          <p className="text-teal-200 text-sm">
            © {new Date().getFullYear()} Emerald Coast Community Band. All rights reserved.
          </p>
          <button
            onClick={scrollToTop}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label="Scroll to top"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        </div>
      </div>
    </footer>
  );
}
