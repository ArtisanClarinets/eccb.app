import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Facebook, Mail, Phone, MapPin, Send, CheckCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

gsap.registerPlugin(ScrollTrigger);

const contactInfo = [
  {
    icon: Mail,
    label: 'Email',
    value: 'info@emeraldcoastband.org',
    href: 'mailto:info@emeraldcoastband.org',
    color: 'from-blue-500 to-blue-600',
  },
  {
    icon: Phone,
    label: 'Phone',
    value: '(850) 555-BAND',
    href: 'tel:8505552263',
    color: 'from-green-500 to-green-600',
  },
  {
    icon: MapPin,
    label: 'Rehearsal Location',
    value: 'Meigs Middle School',
    detail: 'Fort Walton Beach, FL',
    color: 'from-purple-500 to-purple-600',
  },
];

export default function Contact() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Section headline
      gsap.fromTo(
        '.contact-headline',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 70%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Contact info cards
      gsap.fromTo(
        '.contact-info-card',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.12,
          ease: 'expo.out',
          delay: 0.2,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 60%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Facebook CTA
      gsap.fromTo(
        '.facebook-cta',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'expo.out',
          delay: 0.4,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 50%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Form
      gsap.fromTo(
        '.contact-form',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'expo.out',
          delay: 0.3,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 50%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    });

    return () => ctx.revert();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formState.name && formState.email && formState.message) {
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        setFormState({ name: '', email: '', message: '' });
      }, 3000);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormState((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <section
      id="contact"
      ref={sectionRef}
      className="relative py-24 sm:py-32 bg-white overflow-hidden"
    >
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-teal-50 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-amber-50 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium mb-6">
            <Mail className="w-4 h-4" />
            Get In Touch
          </div>
          
          <h2 className="contact-headline font-display text-4xl sm:text-5xl font-bold text-gray-800 mb-4">
            Get In{' '}
            <span className="text-gradient">Touch</span>
          </h2>
          <p className="text-gray-600 text-lg">
            Have questions about joining or our performances? We'd love to hear from you!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 max-w-6xl mx-auto">
          {/* Contact Info */}
          <div>
            <h3 className="font-display text-2xl font-bold text-gray-800 mb-8">
              Contact Information
            </h3>

            <div className="space-y-4 mb-8">
              {contactInfo.map((info, index) => (
                <a
                  key={index}
                  href={info.href}
                  className="contact-info-card group flex items-center gap-4 p-5 rounded-2xl bg-gray-50 hover:bg-white hover:shadow-lg transition-all duration-300 border border-gray-100"
                >
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${info.color} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
                    <info.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{info.label}</p>
                    <p className="font-semibold text-gray-800 text-lg group-hover:text-teal-600 transition-colors">{info.value}</p>
                    {info.detail && <p className="text-sm text-gray-500">{info.detail}</p>}
                  </div>
                  <ExternalLink className="w-5 h-5 text-gray-300 group-hover:text-teal-500 transition-colors" />
                </a>
              ))}
            </div>

            {/* Facebook CTA */}
            <div className="facebook-cta relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-8 text-white shadow-xl">
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Facebook className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-display text-xl font-bold">Follow Us on Facebook</h4>
                    <p className="text-blue-200 text-sm">@EmeraldCoastCommunityBand</p>
                  </div>
                </div>
                
                <p className="text-blue-100 mb-6 leading-relaxed">
                  Stay updated with our latest news, events, and behind-the-scenes content. 
                  Join our community of over 1,000 followers!
                </p>
                
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-white text-blue-600 px-6 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-all duration-300 hover:scale-105 group"
                >
                  Visit Our Page
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="contact-form">
            <h3 className="font-display text-2xl font-bold text-gray-800 mb-8">
              Send Us a Message
            </h3>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name field */}
              <div className="relative">
                <label 
                  htmlFor="name" 
                  className={`absolute left-4 transition-all duration-300 pointer-events-none ${
                    focusedField === 'name' || formState.name 
                      ? 'top-1 text-xs text-teal-600' 
                      : 'top-4 text-gray-400'
                  }`}
                >
                  Your Name
                </label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  value={formState.name}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  required
                  className={`w-full px-4 pt-6 pb-2 rounded-xl border-2 transition-all duration-300 ${
                    focusedField === 'name' 
                      ? 'border-teal-500 shadow-lg shadow-teal-500/10' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                />
              </div>

              {/* Email field */}
              <div className="relative">
                <label 
                  htmlFor="email" 
                  className={`absolute left-4 transition-all duration-300 pointer-events-none ${
                    focusedField === 'email' || formState.email 
                      ? 'top-1 text-xs text-teal-600' 
                      : 'top-4 text-gray-400'
                  }`}
                >
                  Email Address
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formState.email}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  required
                  className={`w-full px-4 pt-6 pb-2 rounded-xl border-2 transition-all duration-300 ${
                    focusedField === 'email' 
                      ? 'border-teal-500 shadow-lg shadow-teal-500/10' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                />
              </div>

              {/* Message field */}
              <div className="relative">
                <label 
                  htmlFor="message" 
                  className={`absolute left-4 transition-all duration-300 pointer-events-none ${
                    focusedField === 'message' || formState.message 
                      ? 'top-1 text-xs text-teal-600' 
                      : 'top-4 text-gray-400'
                  }`}
                >
                  Your Message
                </label>
                <Textarea
                  id="message"
                  name="message"
                  value={formState.message}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('message')}
                  onBlur={() => setFocusedField(null)}
                  required
                  rows={5}
                  className={`w-full px-4 pt-6 pb-2 rounded-xl border-2 transition-all duration-300 resize-none ${
                    focusedField === 'message' 
                      ? 'border-teal-500 shadow-lg shadow-teal-500/10' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitted}
                className={`w-full py-6 text-lg font-semibold transition-all duration-300 ${
                  isSubmitted
                    ? 'bg-green-600 hover:bg-green-600'
                    : 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600'
                } text-white hover:shadow-xl hover:shadow-teal-500/30`}
              >
                {isSubmitted ? (
                  <>
                    <CheckCircle className="mr-2 w-5 h-5" />
                    Message Sent Successfully!
                  </>
                ) : (
                  <>
                    <Send className="mr-2 w-5 h-5" />
                    Send Message
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
