/**
 * Part Boundary Detector Service
 *
 * Deterministically segments a multi-part PDF into per-instrument parts
 * by analysing page header labels.
 *
 * Algorithm:
 *  1. Normalise header text → canonical instrument label
 *  2. Smooth "blips" (single-page label changes likely due to OCR artifacts)
 *  3. Group consecutive pages with the same label into segments
 *  4. Return 0-indexed CuttingInstructions ready for the splitter
 */

import { logger } from '@/lib/logger';
import type { CuttingInstruction } from '@/types/smart-upload';
import type { PageHeader } from './pdf-text-extractor';
import { normalizeInstrumentLabel } from '@/lib/smart-upload/part-naming';

// =============================================================================
// Types
// =============================================================================

export interface PageLabel {
  /** 0-based page index */
  pageIndex: number;
  /** Normalised instrument/part label */
  label: string;
  /** Raw header text before normalisation */
  rawHeader: string;
  /** Confidence in this label (0–100) */
  confidence: number;
}

export interface PartSegment {
  /** Part/instrument label */
  label: string;
  /** 0-indexed start page */
  pageStart: number;
  /** 0-indexed end page (inclusive) */
  pageEnd: number;
  /** Number of pages in this segment */
  pageCount: number;
}

export interface SegmentationResult {
  /** Per-page labels */
  pageLabels: PageLabel[];
  /** Grouped segments */
  segments: PartSegment[];
  /** Derived cutting instructions (0-indexed, ready for splitPdfByCuttingInstructions) */
  cuttingInstructions: CuttingInstruction[];
  /** Overall confidence in the segmentation (0–100) */
  segmentationConfidence: number;
  /** Whether this segmentation was done from text layer (true) or header OCR (false) */
  fromTextLayer: boolean;
  /** Useful for debugging cut boundaries */
  segmentBoundaries: Array<{ label: string; start: number; end: number }>;
  /** Per-page confidence diagnostics */
  perPageConfidence: Array<{ pageIndex: number; confidence: number; label: string }>;
}

// =============================================================================
// Label Patterns
// =============================================================================

/** Patterns to identify part-change boundaries in header text */
const PART_PATTERNS: Array<{ pattern: RegExp; template: string }> = [
  // "1st Bb Clarinet" / "First Clarinet" / "Clarinet 1"
  { pattern: /\b(1st|first|1)\b.{0,20}(clarinet|cl\.?)\b/i, template: '1st Bb Clarinet' },
  { pattern: /\b(2nd|second|2)\b.{0,20}(clarinet|cl\.?)\b/i, template: '2nd Bb Clarinet' },
  { pattern: /\b(3rd|third|3)\b.{0,20}(clarinet|cl\.?)\b/i, template: '3rd Bb Clarinet' },
  { pattern: /\b(solo|solo\s+bb?)\b.{0,10}(clarinet|cl\.?)\b/i, template: 'Solo Bb Clarinet' },
  { pattern: /\beb?\s+(clarinet|cl\.?)\b/i, template: 'Eb Clarinet' },
  { pattern: /\bclarinet\b/i, template: 'Bb Clarinet' },
  { pattern: /\bpicco?lo\b/i, template: 'Piccolo' },
  { pattern: /\b(1st|first|1)\b.{0,20}flute\b/i, template: '1st Flute' },
  { pattern: /\b(2nd|second|2)\b.{0,20}flute\b/i, template: '2nd Flute' },
  { pattern: /\bflute\b/i, template: 'Flute' },
  { pattern: /\boboe\b/i, template: 'Oboe' },
  { pattern: /\bbassoon\b/i, template: 'Bassoon' },
  { pattern: /\b(1st|first|1)\b.{0,20}(alto|a\.?\s*sax)/i, template: '1st Eb Alto Saxophone' },
  { pattern: /\b(2nd|second|2)\b.{0,20}(alto|a\.?\s*sax)/i, template: '2nd Eb Alto Saxophone' },
  { pattern: /\balto\s+sax/i, template: 'Eb Alto Saxophone' },
  { pattern: /\btenor\s+sax/i, template: 'Bb Tenor Saxophone' },
  { pattern: /\bbari(tone)?\s+sax/i, template: 'Eb Baritone Saxophone' },
  { pattern: /\bsax(ophone)?\b/i, template: 'Saxophone' },
  { pattern: /\b(1st|first|1)\b.{0,20}trumpet/i, template: '1st Bb Trumpet' },
  { pattern: /\b(2nd|second|2)\b.{0,20}trumpet/i, template: '2nd Bb Trumpet' },
  { pattern: /\b(3rd|third|3)\b.{0,20}trumpet/i, template: '3rd Bb Trumpet' },
  { pattern: /\btrumpet\b/i, template: 'Bb Trumpet' },
  { pattern: /\bcornet\b/i, template: 'Bb Cornet' },
  { pattern: /\b(1st|first|1)\b.{0,20}(f\s*)?horn/i, template: '1st F Horn' },
  { pattern: /\b(2nd|second|2)\b.{0,20}(f\s*)?horn/i, template: '2nd F Horn' },
  { pattern: /\b(3rd|third|3)\b.{0,20}(f\s*)?horn/i, template: '3rd F Horn' },
  { pattern: /\b(4th|fourth|4)\b.{0,20}(f\s*)?horn/i, template: '4th F Horn' },
  { pattern: /\b(french\s+)?horn\b/i, template: 'F Horn' },
  { pattern: /\b(1st|first|1)\b.{0,20}trombone/i, template: '1st Trombone' },
  { pattern: /\b(2nd|second|2)\b.{0,20}trombone/i, template: '2nd Trombone' },
  { pattern: /\b(3rd|third|3)\b.{0,20}trombone/i, template: '3rd Trombone' },
  { pattern: /\bbass\s+trombone/i, template: 'Bass Trombone' },
  { pattern: /\btrombone\b/i, template: 'Trombone' },
  { pattern: /\beuphonium\b/i, template: 'Euphonium' },
  { pattern: /\btuba\b/i, template: 'Tuba' },
  { pattern: /\bbaritone\b/i, template: 'Baritone' },
  { pattern: /\bbass\b/i, template: 'String Bass' },
  { pattern: /\btimpani\b/i, template: 'Timpani' },
  { pattern: /\bpercussion\b/i, template: 'Percussion' },
  { pattern: /\bsnare\b/i, template: 'Snare Drum' },
  { pattern: /\bbass\s+drum\b/i, template: 'Bass Drum' },
  { pattern: /\bmarimba\b/i, template: 'Marimba' },
  { pattern: /\bxyloph\b/i, template: 'Xylophone' },
  { pattern: /\bvibraphone\b/i, template: 'Vibraphone' },
  { pattern: /\bmallet/i, template: 'Mallet Percussion' },
  { pattern: /\bpiano\b/i, template: 'Piano' },
  { pattern: /\bharp\b/i, template: 'Harp' },
  { pattern: /\bconductor\b/i, template: 'Conductor Score' },
  { pattern: /\bfull\s+score\b/i, template: 'Full Score' },
  { pattern: /\bcondensed\s+score\b/i, template: 'Condensed Score' },
];

// =============================================================================
// Label Normalisation
// =============================================================================

/**
 * Normalise a raw header text string into a canonical instrument label.
 * Returns null if no recognisable instrument is found.
 */
export function normaliseLabelFromHeader(headerText: string): { label: string; confidence: number } | null {
  const text = headerText.trim();
  if (!text || text.length < 3) return null;

  for (const { pattern, template } of PART_PATTERNS) {
    if (pattern.test(text)) {
      // Higher confidence for longer matches (more specific patterns appear first)
      const confidence = 80;
      return { label: template, confidence };
    }
  }

  const normalized = normalizeInstrumentLabel(text);
  if (normalized.instrument && normalized.instrument.toLowerCase() !== 'unknown') {
    return { label: normalized.instrument, confidence: 65 };
  }

  return null;
}

// =============================================================================
// Blip Smoothing
// =============================================================================

/**
 * Smooth "blips" — single-page label changes likely caused by OCR artifacts
 * or title page spillover. A blip is a different label for exactly 1 page
 * surrounded by the same label on both sides.
 */
function smoothBlips(labels: PageLabel[]): PageLabel[] {
  if (labels.length <= 2) return labels;

  const smoothed = [...labels];
  for (let i = 1; i < smoothed.length - 1; i++) {
    const prev = smoothed[i - 1];
    const curr = smoothed[i];
    const next = smoothed[i + 1];

    if (prev.label === next.label && curr.label !== prev.label) {
      smoothed[i] = { ...curr, label: prev.label, confidence: Math.min(curr.confidence, 60) };
    }
  }
  return smoothed;
}

// =============================================================================
// Core Segmentation
// =============================================================================

/**
 * Segment pages into parts from page header labels.
 * Input comes from either PDF text extraction or LLM header OCR.
 */
export function detectPartBoundaries(
  pageHeaders: PageHeader[],
  totalPages: number,
  fromTextLayer: boolean
): SegmentationResult {
  if (pageHeaders.length === 0) {
    return {
      pageLabels: [],
      segments: [],
      cuttingInstructions: [],
      segmentationConfidence: 0,
      fromTextLayer,
      segmentBoundaries: [],
      perPageConfidence: [],
    };
  }

  // Step 1: Assign labels to each page
  let pageLabels: PageLabel[] = pageHeaders.map((header) => {
    const result = normaliseLabelFromHeader(header.headerText || header.fullText);
    return {
      pageIndex: header.pageIndex,
      label: result?.label ?? '',
      rawHeader: header.headerText,
      confidence: result?.confidence ?? 0,
    };
  });

  // Step 2: Fill unlabelled pages by propagating from previous labelled pages
  let lastLabel = '';
  for (let i = 0; i < pageLabels.length; i++) {
    if (pageLabels[i].label) {
      lastLabel = pageLabels[i].label;
    } else if (lastLabel) {
      pageLabels[i] = { ...pageLabels[i], label: lastLabel, confidence: 40 };
    }
  }

  // Step 3: Smooth blips
  pageLabels = smoothBlips(pageLabels);

  // Step 4: Fill any remaining unlabelled pages (before first label)
  const firstLabelled = pageLabels.find((p) => p.label);
  if (firstLabelled) {
    for (let i = 0; i < pageLabels.length; i++) {
      if (!pageLabels[i].label) {
        pageLabels[i] = { ...pageLabels[i], label: firstLabelled.label, confidence: 30 };
      } else {
        break;
      }
    }
  }

  // Step 5: Add any pages not in pageHeaders with unknown labels.
  // Do not propagate labels into pages that were never analyzed.
  const coveredIndices = new Set(pageLabels.map((p) => p.pageIndex));
  if (totalPages > pageHeaders.length) {
    for (let i = 0; i < totalPages; i++) {
      if (!coveredIndices.has(i)) {
        pageLabels.push({
          pageIndex: i,
          label: 'Unknown Part',
          rawHeader: '',
          confidence: 0,
        });
      }
    }

    pageLabels = pageLabels.sort((a, b) => a.pageIndex - b.pageIndex);
  }

  // Step 6: Group consecutive pages with the same label into segments
  const segments: PartSegment[] = [];
  if (pageLabels.length > 0) {
    let segStart = 0;
    let currentLabel = pageLabels[0].label || 'Unknown Part';

    for (let i = 1; i <= pageLabels.length; i++) {
      const nextLabel = i < pageLabels.length ? pageLabels[i].label : null;
      if (nextLabel !== currentLabel || i === pageLabels.length) {
        segments.push({
          label: currentLabel,
          pageStart: pageLabels[segStart].pageIndex,
          pageEnd: pageLabels[i - 1].pageIndex,
          pageCount: i - segStart,
        });
        segStart = i;
        currentLabel = nextLabel ?? '';
      }
    }
  }

  // Step 7: Build 0-indexed cutting instructions
  const cuttingInstructions: CuttingInstruction[] = segments.map((seg, idx) => ({
    partName: seg.label,
    instrument: seg.label,
    section: normalizeInstrumentLabel(seg.label).section,
    transposition: normalizeInstrumentLabel(seg.label).transposition,
    partNumber: idx + 1,
    pageRange: [seg.pageStart, seg.pageEnd] as [number, number],
  }));

  // Step 8: Calculate overall confidence
  const labelledPages = pageLabels.filter((p) => p.confidence >= 70).length;
  const segmentationConfidence = pageLabels.length > 0
    ? Math.round((labelledPages / pageLabels.length) * 100)
    : 0;

  logger.info('Part boundary detection complete', {
    totalPages,
    segments: segments.length,
    segmentationConfidence,
    fromTextLayer,
  });

  const segmentBoundaries = segments.map((segment) => ({
    label: segment.label,
    start: segment.pageStart,
    end: segment.pageEnd,
  }));

  const perPageConfidence = pageLabels.map((label) => ({
    pageIndex: label.pageIndex,
    confidence: label.confidence,
    label: label.label,
  }));

  return {
    pageLabels,
    segments,
    cuttingInstructions,
    segmentationConfidence,
    fromTextLayer,
    segmentBoundaries,
    perPageConfidence,
  };
}
