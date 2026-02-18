import { prisma } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { FileText, HelpCircle, Scale, Shield } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Policies & FAQ | Emerald Coast Community Band',
  description: 'Band policies, frequently asked questions, and important information for members and the public',
};

const faqs = [
  {
    question: 'How can I join the Emerald Coast Community Band?',
    answer: `We welcome musicians of all skill levels! To join, simply attend one of our rehearsals and speak with our membership coordinator. You'll need to complete a brief audition to help us place you in the appropriate section. There are no membership fees - we are a volunteer community organization.`,
  },
  {
    question: 'When and where do you rehearse?',
    answer: `We typically rehearse on Tuesday evenings from 7:00 PM to 9:00 PM. Please check our Events page for the current rehearsal location and any schedule changes. During concert seasons, we may add additional rehearsals.`,
  },
  {
    question: 'Do I need to bring my own instrument?',
    answer: `Most members bring their own instruments. However, we do have a limited number of percussion instruments and larger instruments (tubas, baritones) that may be available for use. Please contact us to inquire about instrument availability.`,
  },
  {
    question: 'Are your concerts free to attend?',
    answer: `Yes! All of our concerts are free and open to the public. We believe in making music accessible to everyone in our community. Donations are always welcome and help support our operations.`,
  },
  {
    question: 'Can I bring my children to concerts?',
    answer: `Absolutely! We encourage families to attend. Our concerts are family-friendly and a great way to introduce children to live music. We occasionally offer special performances geared toward younger audiences.`,
  },
  {
    question: 'How can I support the band if I don\'t play an instrument?',
    answer: `There are many ways to support us! You can attend our concerts, volunteer at events, become a sponsor, make a donation, or simply spread the word about our performances. We also welcome volunteers to help with administrative tasks and event logistics.`,
  },
  {
    question: 'What kind of music do you play?',
    answer: `We perform a wide variety of music including traditional band literature, marches, popular music arrangements, patriotic music, movie soundtracks, and seasonal selections. Our repertoire is designed to appeal to a broad audience while challenging our musicians.`,
  },
  {
    question: 'I haven\'t played in years. Can I still join?',
    answer: `Yes! Many of our members are returning musicians who haven't played since high school or college. Our supportive environment and varied repertoire make it a great place to dust off your instrument and rediscover your love of music.`,
  },
];

export default async function PoliciesPage() {
  // Get policy pages from CMS
  const policyPages = await prisma.page.findMany({
    where: {
      status: 'PUBLISHED',
      slug: { startsWith: 'policies/' },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      content: true,
    },
    orderBy: { title: 'asc' },
  });

  return (
    <div className="w-full py-12 md:py-16">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Policies & FAQ</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Find answers to common questions and learn about our band policies
        </p>
      </div>

      <div className="grid gap-12 lg:grid-cols-3">
        {/* FAQ Section */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-6 w-6 text-primary" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* Policies Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                Band Policies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {policyPages.length > 0 ? (
                policyPages.map((page) => (
                  <a
                    key={page.id}
                    href={`/${page.slug}`}
                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    {page.title}
                  </a>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  <p className="mb-4">Our general policies include:</p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Regular attendance at rehearsals is expected
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Members must arrive prepared with assigned music
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Concert dress code is all black attire
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Respectful and supportive behavior is required
                    </li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Privacy Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p className="mb-4">
                We respect your privacy and are committed to protecting your personal information.
              </p>
              <ul className="space-y-2">
                <li>• We only collect information necessary for band operations</li>
                <li>• Your contact information is never sold to third parties</li>
                <li>• Member directories are only shared with other members</li>
                <li>• Photos from events may be used for promotional purposes</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-6">
              <h3 className="font-bold mb-2">Have More Questions?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Don&apos;t see your question answered here? We&apos;re happy to help!
              </p>
              <a
                href="/contact"
                className="text-sm text-primary font-medium hover:underline"
              >
                Contact Us →
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
