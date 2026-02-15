/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from '../not-found';

describe('NotFound Page', () => {
  it('renders 404 heading', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders page not found title', () => {
    render(<NotFound />);
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<NotFound />);
    expect(screen.getByText(/couldn't find the page/i)).toBeInTheDocument();
  });

  it('renders return home button', () => {
    render(<NotFound />);
    expect(screen.getByRole('link', { name: /return home/i })).toBeInTheDocument();
  });

  it('renders contact support button', () => {
    render(<NotFound />);
    expect(screen.getByRole('link', { name: /contact support/i })).toBeInTheDocument();
  });

  it('return home button links to root', () => {
    render(<NotFound />);
    const homeLink = screen.getByRole('link', { name: /return home/i });
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('contact support button links to contact page', () => {
    render(<NotFound />);
    const contactLink = screen.getByRole('link', { name: /contact support/i });
    expect(contactLink).toHaveAttribute('href', '/contact');
  });
});
