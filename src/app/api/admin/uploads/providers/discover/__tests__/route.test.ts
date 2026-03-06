// src/app/api/admin/uploads/providers/discover/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// mocks
const mockGetSession = vi.hoisted(() => vi.fn());
const mockRequirePermission = vi.hoisted(() => vi.fn());
const mockPrismaFindMany = vi.hoisted(() => vi.fn());
const mockPrismaUpsert = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());
const mockValidateCSRF = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/guards', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/auth/permissions', () => ({ requirePermission: mockRequirePermission }));
vi.mock('@/lib/db', () => ({ prisma: { systemSetting: { findMany: mockPrismaFindMany, upsert: mockPrismaUpsert } } }));
vi.mock('@/lib/logger', () => ({ logger: { info: mockLoggerInfo, error: mockLoggerError } }));
vi.mock('@/lib/csrf', () => ({ validateCSRF: mockValidateCSRF }));

// import route after mocks so spies can be applied
import { POST } from '../route';

function createRequest() {
  return new NextRequest('http://localhost/api/admin/uploads/providers/discover', { method: 'POST' });
}

const TEST_USER = { user: { id: 'u1' } };

describe('provider discovery route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(TEST_USER);
    mockRequirePermission.mockResolvedValue(undefined);
    mockLoggerInfo.mockReturnValue(undefined);
    mockLoggerError.mockReturnValue(undefined);
    mockValidateCSRF.mockReturnValue({ valid: true });
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  it('should not write settings when no providers available', async () => {
    mockPrismaFindMany.mockResolvedValue([]);

    // simulate fetch failures for all endpoints
    mockFetch.mockResolvedValue({ ok: false });
    const response = await POST(createRequest());
    const data = await response.json();
    expect(data.discovered.every((r:any) => r.available === false)).toBe(true);
    expect(data.settingsWritten).toEqual([]);
  });

  it('should backfill per-step providers and default header label model when ollama found', async () => {
    mockPrismaFindMany.mockResolvedValue([]);
    // make fetch return valid model list when hitting ollama
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('localhost:11434')) {
        return Promise.resolve({ ok: true, json: async () => ({ models: [{ name: 'llava-2' }] }) });
      }
      // other endpoints return failure
      return Promise.resolve({ ok: false });
    });

    const res = await POST(createRequest());
    const data = await res.json();

    expect(data.settingsWritten.length).toBeGreaterThan(0);
    expect(data.settingsWritten).toContain('llm_provider');
    expect(data.settingsWritten).toContain('llm_default_provider');
    expect(data.settingsWritten).toContain('llm_vision_provider');
    expect(data.settingsWritten).toContain('llm_header_label_model');
    // header label model value should have been defaulted and included
    expect(data.settingsWritten).toContain('llm_header_label_model');
  });

  it('should preserve existing header_label_model when present', async () => {
    mockPrismaFindMany.mockResolvedValue([{ key: 'llm_header_label_model', value: 'preset' }]);
    // make ollama available but header model exists so upserts may skip
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('localhost:11434')) {
        return Promise.resolve({ ok: true, json: async () => ({ models: [{ name: 'choice' }] }) });
      }
      return Promise.resolve({ ok: false });
    });

    await POST(createRequest());
    const keys = mockPrismaUpsert.mock.calls.map((c) => c[0].where.key);
    expect(keys).not.toContain('llm_header_label_model');
  });
});
