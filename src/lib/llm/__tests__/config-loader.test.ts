import { describe, it, expect, vi, beforeEach } from 'vitest';

import { loadLLMConfig } from '../config-loader';
import { prisma } from '@/lib/db';
import { getPrimaryApiKey } from '../api-key-service';

vi.mock('@/lib/db', () => ({
  prisma: {
    systemSetting: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../api-key-service', () => ({
  getPrimaryApiKey: vi.fn(),
}));

describe('loadLLMConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns enforceOcrSplitting based on DB setting', async () => {
    vi.mocked(prisma.systemSetting.findMany).mockResolvedValueOnce([
      { key: 'smart_upload_enforce_ocr_splitting', value: 'true' },
    ] as any);
    vi.mocked(getPrimaryApiKey).mockResolvedValue('');

    const config = await loadLLMConfig();

    expect(config.enforceOcrSplitting).toBe(true);
  });
});
