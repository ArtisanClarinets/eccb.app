import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/guards', () => ({
  requirePermission: vi.fn().mockResolvedValue({ user: { id: 'admin-user' } }),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    page: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/services/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/cache', () => ({
  invalidatePageCache: vi.fn(),
  invalidateAnnouncementCache: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { prisma } from '@/lib/db';
import { createPage, updatePage } from '../actions';

describe('admin pages actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates page using plain string content', async () => {
    vi.mocked(prisma.page.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.page.create).mockResolvedValue({ id: 'page-1', title: 'My Page', slug: 'my-page' } as never);

    const formData = new FormData();
    formData.set('title', 'My Page');
    formData.set('slug', 'my-page');
    formData.set('content', '## Markdown body');
    formData.set('status', 'DRAFT');

    const result = await createPage(formData);

    expect(result.success).toBe(true);
    expect(prisma.page.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: '## Markdown body' }),
      }),
    );
  });

  it('updates page using normalized legacy json-string content', async () => {
    vi.mocked(prisma.page.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.page.findUnique).mockResolvedValue({ id: 'page-1', slug: 'my-page', status: 'DRAFT' } as never);
    vi.mocked(prisma.page.update).mockResolvedValue({ id: 'page-1', slug: 'my-page' } as never);

    const formData = new FormData();
    formData.set('title', 'My Page');
    formData.set('slug', 'my-page');
    formData.set('content', '{"text":"Migrated body","type":"markdown"}');
    formData.set('status', 'DRAFT');

    const result = await updatePage('page-1', formData);

    expect(result.success).toBe(true);
    expect(prisma.page.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'Migrated body' }),
      }),
    );
  });
});
