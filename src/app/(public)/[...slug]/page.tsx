import { notFound } from 'next/navigation';
import { CmsService } from '@/lib/services/cms.service';
import { formatDate } from '@/lib/date';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar } from 'lucide-react';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

// Reserved slugs that have their own dedicated pages
const RESERVED_SLUGS = [
  'about',
  'contact',
  'directors',
  'events',
  'gallery',
  'news',
  'policies',
  'sponsors',
  'admin',
  'member',
  'api',
  'login',
  'signup',
  'forgot-password',
  'reset-password',
  'verify-email',
  'forbidden',
  'offline',
];

export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join('/');

  const page = await CmsService.getPageMetaBySlug(slug);

  if (!page) {
    return {
      title: 'Page Not Found',
    };
  }

  return {
    title: page.metaTitle || `${page.title} | Emerald Coast Community Band`,
    description: page.metaDescription,
  };
}

export default async function DynamicPage({ params }: PageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join('/');

  // Check if this is a reserved slug
  if (RESERVED_SLUGS.includes(resolvedParams.slug[0])) {
    notFound();
  }

  const page = await CmsService.getPageBySlug(slug, true);

  if (!page || page.status !== 'PUBLISHED') {
    notFound();
  }

  // Check if the page is scheduled for the future
  if (page.scheduledFor && page.scheduledFor > new Date()) {
    notFound();
  }

  // Render content - supports both JSON content and raw markdown
  const renderContent = () => {
    if (page.rawMarkdown) {
      // For markdown content, we'd need a markdown renderer
      // For now, render as preformatted text or use a simple parser
      return (
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          {page.rawMarkdown.split('\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      );
    }

    if (page.content && typeof page.content === 'object') {
      // Handle JSON content structure
      const content = page.content as Record<string, unknown>;
      
      if (content.html) {
        // Sanitize HTML on server side before rendering
        const window = new JSDOM('').window;
        const purify = DOMPurify(window);
        const cleanHtml = purify.sanitize(content.html as string);

        // If content has HTML
        return (
          <div 
            className="prose prose-neutral dark:prose-invert max-w-none"
            // semgrep-ignore: react-dangerously-set-inner-html
            dangerouslySetInnerHTML={{ __html: cleanHtml }}
          />
        );
      }

      if (content.text) {
        // If content has plain text
        return (
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            {(content.text as string).split('\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        );
      }

      if (content.blocks && Array.isArray(content.blocks)) {
        // If content has blocks (block editor style)
        return (
          <div className="space-y-6">
            {(content.blocks as Record<string, unknown>[]).map((block, index: number) => {
              const blockType = block.type as string;
              
              switch (blockType) {
                case 'heading': {
                  const level = (block.level as string) || 'h2';
                  const headingContent = block.content as string;
                  if (level === 'h1') {
                    return <h1 key={index} className="font-bold text-3xl">{headingContent}</h1>;
                  } else if (level === 'h2') {
                    return <h2 key={index} className="font-bold text-2xl">{headingContent}</h2>;
                  } else if (level === 'h3') {
                    return <h3 key={index} className="font-bold text-xl">{headingContent}</h3>;
                  } else {
                    return <h4 key={index} className="font-bold text-lg">{headingContent}</h4>;
                  }
                }
                case 'paragraph':
                  return <p key={index}>{block.content as string}</p>;
                case 'image': {
                  const imgUrl = block.url as string;
                  const imgAlt = (block.alt as string) || '';
                  const imgCaption = block.caption as string | undefined;
                  return (
                    <figure key={index} className="my-6">
                      <img 
                        src={imgUrl} 
                        alt={imgAlt} 
                        className="rounded-lg"
                      />
                      {imgCaption && (
                        <figcaption className="text-sm text-muted-foreground text-center mt-2">
                          {imgCaption}
                        </figcaption>
                      )}
                    </figure>
                  );
                }
                case 'list': {
                  const items = block.items as string[];
                  const ordered = block.ordered as boolean;
                  if (ordered) {
                    return (
                      <ol key={index} className="list-decimal list-inside space-y-1">
                        {items.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ol>
                    );
                  }
                  return (
                    <ul key={index} className="list-disc list-inside space-y-1">
                      {items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  );
                }
                case 'quote':
                  return (
                    <blockquote key={index} className="border-l-4 border-primary pl-4 italic">
                      {block.content as string}
                    </blockquote>
                  );
                default:
                  return null;
              }
            })}
          </div>
        );
      }
    }

    return (
      <p className="text-muted-foreground">No content available.</p>
    );
  };

  return (
    <div className="w-full py-12 md:py-16">
      <article className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-4">{page.title}</h1>
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {page.publishedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(page.publishedAt)}
              </div>
            )}

            {page.description && (
              <Badge variant="outline">{page.description}</Badge>
            )}
          </div>
        </header>

        {/* Content */}
        <Card>
          <CardContent className="p-6 md:p-8">
            {renderContent()}
          </CardContent>
        </Card>

        {/* Footer */}
        {page.updatedAt && (
          <footer className="mt-8 text-sm text-muted-foreground text-center">
            Last updated on {formatDate(page.updatedAt)}
          </footer>
        )}
      </article>
    </div>
  );
}
