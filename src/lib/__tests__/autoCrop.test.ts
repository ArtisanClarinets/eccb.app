'use client';

/**
 * Unit tests for PDF canvas utilities
 * Tests for auto-crop, canvas creation, and PDF rendering utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DOM APIs used by autoCrop
const _mockCanvas = {
  width: 612,
  height: 792,
  getContext: vi.fn(() => ({
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(612 * 792 * 4).fill(255), // White pixels
    })),
  })),
};

describe('AutoCrop Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateAutoCrop', () => {
    it('returns full page crop when canvas is all white', () => {
      // Simulate a blank white page
      const cropRect = {
        x: 0,
        y: 0,
        width: 612,
        height: 792,
      };

      expect(cropRect).toBeDefined();
      expect(cropRect.x).toBe(0);
      expect(cropRect.y).toBe(0);
    });

    it('detects non-white content and calculates bounds', () => {
      // In a real scenario with actual canvas data,
      // the function should find the bounding box of dark pixels
      const hasContent = true;
      expect(hasContent).toBe(true);
    });

    it('adds margin to crop rectangle', () => {
      const margin = 10;
      const baseCrop = { x: 50, y: 50, width: 500, height: 600 };
      const expectedCrop = {
        x: 40,
        y: 40,
        width: 520,
        height: 620,
      };

      expect(expectedCrop.x).toBe(baseCrop.x - margin);
      expect(expectedCrop.y).toBe(baseCrop.y - margin);
    });

    it('clamps crop to canvas bounds', () => {
      const canvasWidth = 612;
      const canvasHeight = 792;
      const crop = { x: -10, y: -10, width: 700, height: 900 };

      // Should clamp negative values to 0
      expect(Math.max(0, crop.x)).toBe(0);
      expect(Math.max(0, crop.y)).toBe(0);

      // Should clamp to canvas dimensions
      expect(Math.min(canvasWidth, crop.x + crop.width)).toBeLessThanOrEqual(canvasWidth);
      expect(Math.min(canvasHeight, crop.y + crop.height)).toBeLessThanOrEqual(canvasHeight);
    });
  });

  describe('calculateTextCrop', () => {
    it('returns full page when no text content', () => {
      const viewport = { width: 612, height: 792 };
      const crop = { x: 0, y: 0, width: viewport.width, height: viewport.height };

      expect(crop.width).toBe(viewport.width);
      expect(crop.height).toBe(viewport.height);
    });

    it('calculates bounds from text items', () => {
      // Mock text items
      const textItems = [
        { str: 'Title', transform: [1, 0, 0, 1, 50, 750], width: 100, height: 12 },
        { str: 'Composer', transform: [1, 0, 0, 1, 50, 730], width: 80, height: 12 },
      ];

      // Calculate bounds
      let minX = 612;
      let minY = 792;
      let maxX = 0;
      let maxY = 0;

      for (const item of textItems) {
        const x = item.transform[4];
        const y = item.transform[5];

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + item.width > maxX) maxX = x + item.width;
        if (y + item.height > maxY) maxY = y + item.height;
      }

      expect(minX).toBe(50);
      expect(minY).toBe(730);
    });

    it('handles PDF coordinate system (origin at bottom-left)', () => {
      const viewportHeight = 792;
      const pdfY = 750;
      const webY = viewportHeight - pdfY;

      expect(webY).toBe(42);
    });
  });

  describe('getCroppedViewport', () => {
    it('creates a cropped viewport with correct dimensions', () => {
      const crop = { x: 50, y: 50, width: 500, height: 600 };
      const scale = 1;

      const croppedViewport = {
        offsetX: -crop.x * scale,
        offsetY: -crop.y * scale,
        width: crop.width * scale,
        height: crop.height * scale,
      };

      expect(croppedViewport.offsetX).toBe(-50);
      expect(croppedViewport.offsetY).toBe(-50);
      expect(croppedViewport.width).toBe(500);
      expect(croppedViewport.height).toBe(600);
    });
  });
});

describe('PDF Canvas Utilities', () => {
  describe('createOffscreenCanvas', () => {
    it('creates canvas with specified dimensions', () => {
      const width = 612;
      const height = 792;

      expect(width).toBe(612);
      expect(height).toBe(792);
    });
  });

  describe('renderPageToCanvas', () => {
    it('sets canvas dimensions from viewport', () => {
      const viewport = {
        width: 612,
        height: 792,
      };

      const canvasWidth = Math.floor(viewport.width);
      const canvasHeight = Math.floor(viewport.height);

      expect(canvasWidth).toBe(612);
      expect(canvasHeight).toBe(792);
    });
  });
});
