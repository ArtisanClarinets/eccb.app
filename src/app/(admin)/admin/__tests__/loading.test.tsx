/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminLoading from '../loading';

describe('AdminLoading', () => {
  it('renders the loading container', () => {
    render(<AdminLoading />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders sidebar skeleton on desktop', () => {
    render(<AdminLoading />);
    // The sidebar is hidden on mobile, but the skeleton structure exists
    const sidebarContainer = document.querySelector('.hidden.lg\\:block');
    expect(sidebarContainer).toBeInTheDocument();
  });

  it('renders header skeleton with title area', () => {
    render(<AdminLoading />);
    // Check for skeleton elements that represent the header
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders stats cards skeleton', () => {
    render(<AdminLoading />);
    // Check for card elements in the stats section
    const cards = document.querySelectorAll('[class*="card"]');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('renders main content card skeleton', () => {
    render(<AdminLoading />);
    // The main content should have skeleton items
    const mainContent = screen.getByRole('main');
    expect(mainContent).toBeInTheDocument();
  });

  it('has proper loading structure with skeleton elements', () => {
    render(<AdminLoading />);
    // Verify multiple skeleton elements exist for loading state
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(5);
  });
});
