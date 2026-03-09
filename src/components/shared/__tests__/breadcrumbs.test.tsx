import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/pages/new',
}));

describe('Breadcrumbs', () => {
  it('renders valid list markup without li nested in li', () => {
    const { container } = render(
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Pages', href: '/admin/pages' },
          { label: 'New Page' },
        ]}
      />,
    );

    const nestedLi = container.querySelector('li li');
    expect(nestedLi).toBeNull();
  });
});
