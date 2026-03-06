// =============================================================================
// src/lib/review-preview/render-params.ts
//
// Shared helper for parsing and clamping preview render parameters from
// request URLs. Used by both the original-preview and part-preview routes so
// they always behave identically.
// =============================================================================

export interface RenderParams {
  pageIndex: number;
  scale: number;
  maxWidth: number;
  format: 'png' | 'jpeg';
  quality: number;
}

const DEFAULTS: RenderParams = {
  pageIndex: 0,
  scale: 3,
  maxWidth: 2000,
  format: 'png',
  quality: 92,
};

// Clamp bounds
const SCALE_MIN = 1;
const SCALE_MAX = 6;
const MAX_WIDTH_MIN = 800;
const MAX_WIDTH_MAX = 4000;
const QUALITY_MIN = 60;
const QUALITY_MAX = 100;

/**
 * Parse and clamp render parameters from a request URL.
 *
 * All params are optional and backwards-compatible:
 *   - page       (0-indexed integer, default 0)
 *   - scale      (float, clamped [1..6], default 3)
 *   - maxWidth   (integer, clamped [800..4000], default 2000)
 *   - format     ('png' | 'jpeg', default 'png')
 *   - quality    (integer, clamped [60..100], default 92 — only used when format='jpeg')
 */
export function parseRenderParams(url: URL): RenderParams {
  const pageRaw    = url.searchParams.get('page');
  const scaleRaw   = url.searchParams.get('scale');
  const widthRaw   = url.searchParams.get('maxWidth');
  const formatRaw  = url.searchParams.get('format');
  const qualityRaw = url.searchParams.get('quality');

  // page — non-negative integer
  let pageIndex = DEFAULTS.pageIndex;
  if (pageRaw !== null) {
    const n = parseInt(pageRaw, 10);
    if (Number.isFinite(n) && n >= 0) pageIndex = n;
  }

  // scale — float, clamped [SCALE_MIN..SCALE_MAX]
  let scale = DEFAULTS.scale;
  if (scaleRaw !== null) {
    const n = parseFloat(scaleRaw);
    if (Number.isFinite(n)) scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, n));
  }

  // maxWidth — integer, clamped [MAX_WIDTH_MIN..MAX_WIDTH_MAX]
  let maxWidth = DEFAULTS.maxWidth;
  if (widthRaw !== null) {
    const n = parseInt(widthRaw, 10);
    if (Number.isFinite(n)) maxWidth = Math.min(MAX_WIDTH_MAX, Math.max(MAX_WIDTH_MIN, n));
  }

  // format — only 'png' or 'jpeg'; any other value → 'png'
  const format: 'png' | 'jpeg' = formatRaw === 'jpeg' ? 'jpeg' : 'png';

  // quality — integer, clamped [QUALITY_MIN..QUALITY_MAX]
  let quality = DEFAULTS.quality;
  if (qualityRaw !== null) {
    const n = parseInt(qualityRaw, 10);
    if (Number.isFinite(n)) quality = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, n));
  }

  return { pageIndex, scale, maxWidth, format, quality };
}
