import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Menu, X, Music2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Join Us', href: '#join' },
  { label: 'Events', href: '#events' },
  { label: 'Contact', href: '#contact' },
];

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Entrance animation
    const ctx = gsap.context(() => {
      gsap.fromTo(
        logoRef.current,
        { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
        { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 0.6, ease: 'expo.out' }
      );

      gsap.fromTo(
        '.nav-link',
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, stagger: 0.1, ease: 'expo.out', delay: 0.1 }
      );

      gsap.fromTo(
        ctaRef.current,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)', delay: 0.4 }
      );
    });

    return () => ctx.revert();
  }, []);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <nav
      ref={navRef}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? 'glass shadow-lg backdrop-blur-xl bg-white/95'
          : 'bg-transparent'
      }`}
    >
      <div className="w-full h-full px-4 sm:px-6 lg:px-12 xl:px-20 flex items-center justify-between h-20">
        {/* Logo */}
        <div ref={logoRef} className="flex items-center gap-3 group cursor-pointer" onClick={() => scrollToSection('#home')}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
            isScrolled 
              ? 'bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30' 
              : 'bg-white/20 backdrop-blur-sm'
          } group-hover:scale-110 group-hover:rotate-3`}>
            <Music2 className={`w-6 h-6 transition-colors duration-300 ${isScrolled ? 'text-white' : 'text-white'}`} />
          </div>
          <span className={`font-display font-semibold text-lg tracking-tight transition-colors duration-300 ${
            isScrolled ? 'text-gray-800' : 'text-white'
          }`}>
            Emerald Coast Band
          </span>
        </div>

        {/* Desktop Navigation */}
        <div ref={linksRef} className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => scrollToSection(link.href)}
              className={`nav-link px-4 py-2 rounded-lg font-medium text-sm tracking-wide underline-draw transition-all duration-300 ${
                isScrolled 
                  ? 'text-gray-600 hover:text-teal-600 hover:bg-teal-50' 
                  : 'text-white/90 hover:text-teal-300 hover:bg-white/10'
              }`}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* CTA Button */}
        <div ref={ctaRef} className="hidden md:block">
          <Button
            onClick={() => scrollToSection('#join')}
            className={`font-semibold px-6 py-2.5 transition-all duration-300 hover:scale-105 ${
              isScrolled
                ? 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white shadow-lg shadow-teal-500/30'
                : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/30'
            }`}
          >
            Join The Band
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 rounded-lg transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? (
            <X className={`w-6 h-6 ${isScrolled ? 'text-gray-800' : 'text-white'}`} />
          ) : (
            <Menu className={`w-6 h-6 ${isScrolled ? 'text-gray-800' : 'text-white'}`} />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden absolute top-full left-0 right-0 transition-all duration-500 overflow-hidden ${
          isMobileMenuOpen 
            ? 'max-h-96 opacity-100' 
            : 'max-h-0 opacity-0'
        }`}
      >
        <div className={`px-4 py-4 space-y-1 ${
          isScrolled 
            ? 'glass shadow-lg' 
            : 'bg-black/80 backdrop-blur-xl'
        }`}>
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => scrollToSection(link.href)}
              className={`block w-full text-left py-3 px-4 rounded-lg transition-colors ${
                isScrolled 
                  ? 'text-gray-700 hover:text-teal-600 hover:bg-teal-50' 
                  : 'text-white/90 hover:text-teal-300 hover:bg-white/10'
              }`}
            >
              {link.label}
            </button>
          ))}
          <Button
            onClick={() => scrollToSection('#join')}
            className="w-full mt-3 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white"
          >
            Join The Band
          </Button>
        </div>
      </div>
    </nav>
  );
}
