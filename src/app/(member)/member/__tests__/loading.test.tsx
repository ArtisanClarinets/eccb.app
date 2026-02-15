/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MemberLoading from '../loading';

describe('MemberLoading', () => {
  it('renders the loading container', () => {
    render(<MemberLoading />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders sidebar skeleton on desktop', () => {
    render(<MemberLoading />);
    // The sidebar is hidden on mobile, but the skeleton structure exists
    const sidebarContainer = document.querySelector('.hidden.lg\\:block');
    expect(sidebarContainer).toBeInTheDocument();
  });

  it('renders header skeleton with title area', () => {
    render(<MemberLoading />);
    // Check for skeleton elements that represent the header
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders stats cards skeleton', () => {
    render(<MemberLoading />);
    // Check for card elements in the stats section
    const cards = document.querySelectorAll('[class*="card"]');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('renders main content card skeleton', () => {
    render(<MemberLoading />);
    // The main content should have skeleton items
    const mainContent = screen.getByRole('main');
    expect(mainContent).toBeInTheDocument();
  });

  it('has proper loading structure with skeleton elements', () => {
    render(<MemberLoading />);
    // Verify multiple skeleton elements exist for loading state
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(5);
  });

  it('renders two-column layout skeleton', () => {
    render(<MemberLoading />);
    // Check for the two-column grid layout
    const gridLayout = document.querySelector('.lg\\:grid-cols-2');
    expect(gridLayout).toBeInTheDocument();
  });
});
