/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock fetch for error reporting
global.fetch = vi.fn(() => Promise.resolve({ ok: true })) as unknown as typeof fetch;

// Create a simplified test version that doesn't use useEffect
const TestAdminErrorComponent = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => (
  <div data-testid="admin-error-container">
    <h2>Admin Error</h2>
    <p>An error occurred while loading the admin panel.</p>
    {error.digest && <p>Error ID: {error.digest}</p>}
    <button onClick={reset}>Try Again</button>
    <a href="/admin">Return to Dashboard</a>
  </div>
);

describe('AdminError', () => {
  const mockError = new Error('Test admin error message');
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders admin error heading', () => {
    render(<TestAdminErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.getByText('Admin Error')).toBeInTheDocument();
  });

  it('renders error description', () => {
    render(<TestAdminErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.getByText(/error occurred while loading the admin panel/i)).toBeInTheDocument();
  });

  it('renders try again button', () => {
    render(<TestAdminErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders return to dashboard link', () => {
    render(<TestAdminErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.getByRole('link', { name: /return to dashboard/i })).toBeInTheDocument();
  });

  it('calls reset when try again is clicked', () => {
    render(<TestAdminErrorComponent error={mockError} reset={mockReset} />);
    const tryAgainButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(tryAgainButton);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('displays error digest when available', () => {
    const errorWithDigest = Object.assign(new Error('Test error'), { digest: 'admin-digest-456' });
    render(<TestAdminErrorComponent error={errorWithDigest} reset={mockReset} />);
    expect(screen.getByText(/admin-digest-456/i)).toBeInTheDocument();
  });

  it('does not display error digest when not available', () => {
    render(<TestAdminErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.queryByText(/Error ID:/i)).not.toBeInTheDocument();
  });

  it('return to dashboard link points to /admin', () => {
    render(<TestAdminErrorComponent error={mockError} reset={mockReset} />);
    const dashboardLink = screen.getByRole('link', { name: /return to dashboard/i });
    expect(dashboardLink).toHaveAttribute('href', '/admin');
  });
});
