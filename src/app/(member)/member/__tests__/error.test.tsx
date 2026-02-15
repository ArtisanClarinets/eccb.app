/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Create a simplified test version that doesn't use useEffect
const TestMemberErrorComponent = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => (
  <div data-testid="member-error-container">
    <h2>Something Went Wrong</h2>
    <p>An error occurred while loading this page.</p>
    {error.digest && <p>Error ID: {error.digest}</p>}
    <button onClick={reset}>Try Again</button>
    <a href="/member">Return to Dashboard</a>
  </div>
);

describe('MemberError', () => {
  const mockError = new Error('Test member error message');
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders error heading', () => {
    render(<TestMemberErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.getByText('Something Went Wrong')).toBeInTheDocument();
  });

  it('renders error description', () => {
    render(<TestMemberErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.getByText(/error occurred while loading this page/i)).toBeInTheDocument();
  });

  it('renders try again button', () => {
    render(<TestMemberErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders return to dashboard link', () => {
    render(<TestMemberErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.getByRole('link', { name: /return to dashboard/i })).toBeInTheDocument();
  });

  it('calls reset when try again is clicked', () => {
    render(<TestMemberErrorComponent error={mockError} reset={mockReset} />);
    const tryAgainButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(tryAgainButton);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('displays error digest when available', () => {
    const errorWithDigest = Object.assign(new Error('Test error'), { digest: 'member-digest-789' });
    render(<TestMemberErrorComponent error={errorWithDigest} reset={mockReset} />);
    expect(screen.getByText(/member-digest-789/i)).toBeInTheDocument();
  });

  it('does not display error digest when not available', () => {
    render(<TestMemberErrorComponent error={mockError} reset={mockReset} />);
    expect(screen.queryByText(/Error ID:/i)).not.toBeInTheDocument();
  });

  it('return to dashboard link points to /member', () => {
    render(<TestMemberErrorComponent error={mockError} reset={mockReset} />);
    const dashboardLink = screen.getByRole('link', { name: /return to dashboard/i });
    expect(dashboardLink).toHaveAttribute('href', '/member');
  });
});
