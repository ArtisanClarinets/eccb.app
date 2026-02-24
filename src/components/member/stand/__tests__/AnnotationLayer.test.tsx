import React from 'react';
import { render, act } from '@testing-library/react';
import { AnnotationLayer } from '../AnnotationLayer';
import { useStandStore, Tool } from '@/store/standStore';

// helper to set up store state
function setupStore(opts: Partial<ReturnType<typeof useStandStore.getState>> = {}) {
  useStandStore.setState((state) => ({ ...state, ...opts }));
}

describe('AnnotationLayer component', () => {
  beforeEach(() => {
    useStandStore.getState().reset();
  });

  it('renders three canvas elements', () => {
    setupStore({ pieces: [{ id: 'p1', title: '', composer: '', pdfUrl: null, totalPages: 1 }], currentPieceIndex: 0, currentPage: 1 });
    const { container } = render(<div style={{ width: 100, height: 100 }}><AnnotationLayer /></div>);
    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBe(3);
  });

  it('all canvases have pointer-events none by default', () => {
    setupStore({ pieces: [{ id: 'p1', title: '', composer: '', pdfUrl: null, totalPages: 1 }], currentPieceIndex: 0, currentPage: 1, editMode: false, selectedLayer: 'PERSONAL' });
    const { container } = render(<div style={{ width: 100, height: 100 }}><AnnotationLayer /></div>);
    const canvases = container.querySelectorAll('canvas');
    canvases.forEach((c) => {
      expect(c).toHaveStyle('pointer-events: none');
    });
  });

  it('only selected layer canvas gets pointer-events auto when editMode true', () => {
    setupStore({ pieces: [{ id: 'p1', title: '', composer: '', pdfUrl: null, totalPages: 1 }], currentPieceIndex: 0, currentPage: 1, editMode: true, selectedLayer: 'SECTION' });
    const { container } = render(<div style={{ width: 100, height: 100 }}><AnnotationLayer /></div>);
    const canvases = Array.from(container.querySelectorAll('canvas'));
    // section is index 1
    expect(canvases[0]).toHaveStyle('pointer-events: none');
    expect(canvases[1]).toHaveStyle('pointer-events: auto');
    expect(canvases[2]).toHaveStyle('pointer-events: none');
  });

  // Tool interaction tests
  it('has correct default tool state', () => {
    setupStore({ pieces: [{ id: 'p1', title: '', composer: '', pdfUrl: null, totalPages: 1 }], currentPieceIndex: 0, currentPage: 1 });
    const state = useStandStore.getState();
    expect(state.currentTool).toBe(Tool.PENCIL);
    expect(state.toolColor).toBe('#ff0000');
    expect(state.strokeWidth).toBe(3);
  });

  it('updates tool state via store actions', () => {
    setupStore({ pieces: [{ id: 'p1', title: '', composer: '', pdfUrl: null, totalPages: 1 }], currentPieceIndex: 0, currentPage: 1 });
    
    act(() => {
      useStandStore.getState().setCurrentTool(Tool.HIGHLIGHTER);
    });
    expect(useStandStore.getState().currentTool).toBe(Tool.HIGHLIGHTER);

    act(() => {
      useStandStore.getState().setToolColor('#00ff00');
    });
    expect(useStandStore.getState().toolColor).toBe('#00ff00');

    act(() => {
      useStandStore.getState().setStrokeWidth(10);
    });
    expect(useStandStore.getState().strokeWidth).toBe(10);
  });

  it('renders tool icons in edit mode', () => {
    setupStore({ 
      pieces: [{ id: 'p1', title: '', composer: '', pdfUrl: null, totalPages: 1 }], 
      currentPieceIndex: 0, 
      currentPage: 1,
      editMode: true,
    });
    
    const { container } = render(<div style={{ width: 100, height: 100 }}><AnnotationLayer /></div>);
    const canvases = container.querySelectorAll('canvas');
    
    // In edit mode with PERSONAL layer selected, first canvas should be interactive
    expect(canvases[0]).toHaveStyle('pointer-events: auto');
  });

  it('does not respond to pointer events when not in edit mode', () => {
    setupStore({ 
      pieces: [{ id: 'p1', title: '', composer: '', pdfUrl: null, totalPages: 1 }], 
      currentPieceIndex: 0, 
      currentPage: 1,
      editMode: false,
      selectedLayer: 'PERSONAL',
    });
    
    const { container } = render(<div style={{ width: 100, height: 100 }}><AnnotationLayer /></div>);
    const canvas = container.querySelectorAll('canvas')[0];
    
    // Should not have pointer events when editMode is false
    expect(canvas).toHaveStyle('pointer-events: none');
  });
});

// Helper for act from React 18
function act(callback: () => void) {
  callback();
}
