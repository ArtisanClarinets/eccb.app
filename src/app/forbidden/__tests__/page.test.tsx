/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ForbiddenPage from '../page';

describe('Forbidden Page', () => {
  it('renders 403 heading', () => {
    render(<ForbiddenPage />);
    expect(screen.getByText(/403 - Access Denied/i)).toBeInTheDocument();
  });

  it('renders access denied message', () => {
    render(<ForbiddenPage />);
    expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
  });

  it('renders return home button', () => {
    render(<ForbiddenPage />);
    expect(screen.getByRole('link', { name: /return home/i })).toBeInTheDocument();
  });

  it('renders go to dashboard button', () => {
    render(<ForbiddenPage />);
    expect(screen.getByRole('link', { name: /go to dashboard/i })).toBeInTheDocument();
  });

  it('return home button links to root', () => {
    render(<ForbiddenPage />);
    const homeLink = screen.getByRole('link', { name: /return home/i });
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('dashboard button links to dashboard', () => {
    render(<ForbiddenPage />);
    const dashboardLink = screen.getByRole('link', { name: /go to dashboard/i });
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
  });

  it('renders shield alert icon', () => {
    render(<ForbiddenPage />);
    // The ShieldAlert icon should be present
    const icon = document.querySelector('.lucide-shield-alert');
    expect(icon).toBeInTheDocument();
  });
});
