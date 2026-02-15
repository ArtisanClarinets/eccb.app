/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminNotFound from '../not-found';

describe('Admin NotFound Page', () => {
  it('renders 404 text', () => {
    render(<AdminNotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders page not found title', () => {
    render(<AdminNotFound />);
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders admin-specific description', () => {
    render(<AdminNotFound />);
    expect(screen.getByText(/admin page you're looking for/i)).toBeInTheDocument();
  });

  it('renders go to admin dashboard button', () => {
    render(<AdminNotFound />);
    expect(screen.getByRole('link', { name: /go to admin dashboard/i })).toBeInTheDocument();
  });

  it('renders back to member portal button', () => {
    render(<AdminNotFound />);
    expect(screen.getByRole('link', { name: /back to member portal/i })).toBeInTheDocument();
  });

  it('admin dashboard button links to /admin', () => {
    render(<AdminNotFound />);
    const adminLink = screen.getByRole('link', { name: /go to admin dashboard/i });
    expect(adminLink).toHaveAttribute('href', '/admin');
  });

  it('member portal button links to /member', () => {
    render(<AdminNotFound />);
    const memberLink = screen.getByRole('link', { name: /back to member portal/i });
    expect(memberLink).toHaveAttribute('href', '/member');
  });
});
