import { prisma } from '@/lib/db';
import { ContentStatus, Prisma } from '@prisma/client';
import { auditLog } from './audit';
import {
  cacheGet,
  cacheSet,
  invalidatePageCache,
  invalidateAnnouncementCache,
  cacheKeys,
  CACHE_CONFIG,
} from '@/lib/cache';

export interface CreatePageData {
  slug: string;
  title: string;
  content: Prisma.InputJsonValue; // Block-based content (JSON)
  description?: string;
  isPublished?: boolean;
}

/**
 * Cached page data structure
 */
interface CachedPageData {
  id: string;
  slug: string;
  title: string;
  content: unknown;
  rawMarkdown: string | null;
  description: string | null;
  status: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  updatedAt: Date | null;
  createdAt: Date;
}

/**
 * Cached page metadata structure (lighter weight for metadata only)
 */
interface CachedPageMeta {
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

export class CmsService {
  /**
   * Get page by slug with caching
   * Uses Redis cache with 5-minute TTL for published pages
   */
  static async getPageBySlug(slug: string, onlyPublished: boolean = true): Promise<CachedPageData | null> {
    // Only cache published pages
    if (onlyPublished) {
      const cacheKey = cacheKeys.page(slug);
      
      const cached = await cacheGet<CachedPageData>(cacheKey);
      if (cached) {
        return cached;
      }
      
      // Fetch from database
      const page = await prisma.page.findFirst({
        where: {
          slug,
          status: ContentStatus.PUBLISHED,
        },
      });
      
      if (page) {
        const pageData: CachedPageData = {
          id: page.id,
          slug: page.slug,
          title: page.title,
          content: page.content,
          rawMarkdown: page.rawMarkdown,
          description: page.description,
          status: page.status,
          metaTitle: page.metaTitle,
          metaDescription: page.metaDescription,
          ogImage: page.ogImage,
          publishedAt: page.publishedAt,
          scheduledFor: page.scheduledFor,
          updatedAt: page.updatedAt,
          createdAt: page.createdAt,
        };
        
        // Cache for 5 minutes
        await cacheSet(cacheKey, pageData, CACHE_CONFIG.PAGE_TTL);
        return pageData;
      }
      
      return null;
    }
    
    // For unpublished pages (admin use), don't cache
    return prisma.page.findFirst({
      where: {
        slug,
      },
    }) as Promise<CachedPageData | null>;
  }

  /**
   * Get page metadata by slug (lighter weight, cached longer)
   */
  static async getPageMetaBySlug(slug: string): Promise<CachedPageMeta | null> {
    const cacheKey = cacheKeys.pageMeta(slug);
    
    const cached = await cacheGet<CachedPageMeta>(cacheKey);
    if (cached) {
      return cached;
    }
    
    const page = await prisma.page.findUnique({
      where: { slug },
      select: {
        title: true,
        metaTitle: true,
        metaDescription: true,
      },
    });
    
    if (page) {
      const metaData: CachedPageMeta = {
        title: page.title,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
      };
      
      // Cache metadata for 10 minutes
      await cacheSet(cacheKey, metaData, CACHE_CONFIG.PAGE_META_TTL);
      return metaData;
    }
    
    return null;
  }

  /**
   * Create or update page with cache invalidation
   */
  static async upsertPage(data: CreatePageData) {
    // Invalidate cache before update
    await invalidatePageCache(data.slug);
    
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

    // Invalidate cache after update
    await invalidatePageCache(page.slug);

    return page;
  }

  /**
   * Delete a page by ID with cache invalidation
   */
  static async deletePage(id: string) {
    const page = await prisma.page.findUnique({
      where: { id },
      select: { slug: true },
    });
    
    if (page) {
      await invalidatePageCache(page.slug);
    }
    
    const deleted = await prisma.page.delete({
      where: { id },
    });
    
    await auditLog({
      action: 'cms.page.delete',
      entityType: 'Page',
      entityId: id,
      newValues: { slug: page?.slug },
    });
    
    return deleted;
  }

  /**
   * Create an announcement with cache invalidation
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

    // Invalidate announcement cache
    await invalidateAnnouncementCache();

    return announcement;
  }

  /**
   * List announcements with caching
   */
  static async listAnnouncements(onlyActive: boolean = true) {
    const cacheKey = cacheKeys.announcementList(onlyActive);
    
    const cached = await cacheGet<Awaited<ReturnType<typeof prisma.announcement.findMany>>>(cacheKey);
    if (cached) {
      return cached;
    }
    
    const announcements = await prisma.announcement.findMany({
      where: onlyActive ? {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      } : {},
      orderBy: { createdAt: 'desc' },
    });
    
    // Cache for 2 minutes
    await cacheSet(cacheKey, announcements, CACHE_CONFIG.ANNOUNCEMENT_TTL);
    
    return announcements;
  }

  /**
   * Update announcement with cache invalidation
   */
  static async updateAnnouncement(id: string, data: {
    title?: string;
    content?: string;
    type?: 'INFO' | 'WARNING' | 'URGENT' | 'EVENT';
    expiresAt?: Date | null;
  }) {
    const announcement = await prisma.announcement.update({
      where: { id },
      data,
    });

    await auditLog({
      action: 'cms.announcement.update',
      entityType: 'Announcement',
      entityId: announcement.id,
      newValues: announcement,
    });

    // Invalidate announcement cache
    await invalidateAnnouncementCache();

    return announcement;
  }

  /**
   * Delete announcement with cache invalidation
   */
  static async deleteAnnouncement(id: string) {
    const announcement = await prisma.announcement.delete({
      where: { id },
    });

    await auditLog({
      action: 'cms.announcement.delete',
      entityType: 'Announcement',
      entityId: id,
      newValues: { title: announcement.title },
    });

    // Invalidate announcement cache
    await invalidateAnnouncementCache();

    return announcement;
  }
}
