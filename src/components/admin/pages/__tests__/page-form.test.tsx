import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageForm } from '@/components/admin/pages/page-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('PageForm', () => {
  it('loads legacy json-string content as canonical text body', () => {
    render(
      <PageForm
        initialData={{
          title: 'My page',
          slug: 'my-page',
          content: '{"text":"Legacy markdown","type":"markdown"}',
          status: 'DRAFT',
        }}
        onSubmit={async () => ({ success: true })}
      />,
    );

    const contentField = document.querySelector('textarea[name="content"]') as HTMLTextAreaElement | null;
    expect(contentField?.value).toBe('Legacy markdown');
  });
});
