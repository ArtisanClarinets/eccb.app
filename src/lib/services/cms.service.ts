import { prisma } from '@/lib/db';
import { ContentStatus } from '@prisma/client';
import { auditLog } from './audit';

export interface CreatePageData {
  slug: string;
  title: string;
  content: any; // Block-based content (JSON)
  description?: string;
  isPublished?: boolean;
}

export class CmsService {
  /**
   * Get page by slug
   */
  static async getPageBySlug(slug: string, onlyPublished: boolean = true) {
    return prisma.page.findFirst({
      where: {
        slug,
        ...(onlyPublished ? { status: ContentStatus.PUBLISHED } : {}),
      },
    });
  }

  /**
   * Create or update page
   */
  static async upsertPage(data: CreatePageData) {
    const page = await prisma.page.upsert({
      where: { slug: data.slug },
      update: {
        title: data.title,
        content: data.content,
        description: data.description,
        status: data.isPublished ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
        publishedAt: data.isPublished ? new Date() : undefined,
      },
      create: {
        slug: data.slug,
        title: data.title,
        content: data.content,
        description: data.description,
        status: data.isPublished ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
        publishedAt: data.isPublished ? new Date() : undefined,
      },
    });

    await auditLog({
      action: 'cms.page.upsert',
      entityType: 'Page',
      entityId: page.id,
      newValues: page,
    });

    return page;
  }

  /**
   * Create an announcement
   */
  static async createAnnouncement(data: {
    title: string;
    content: string;
    type: 'INFO' | 'WARNING' | 'URGENT' | 'EVENT';
    expiresAt?: Date;
  }) {
    const announcement = await prisma.announcement.create({
      data: {
        ...data,
      },
    });

    await auditLog({
      action: 'cms.announcement.create',
      entityType: 'Announcement',
      entityId: announcement.id,
      newValues: announcement,
    });

    return announcement;
  }

  /**
   * List announcements
   */
  static async listAnnouncements(onlyActive: boolean = true) {
    return prisma.announcement.findMany({
      where: onlyActive ? {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      } : {},
      orderBy: { createdAt: 'desc' },
    });
  }
}
