/**
 * Musical stamp definitions for the Digital Music Stand.
 * Each stamp is an inline SVG string rendered via Image + data URL on the AnnotationLayer canvas.
 * SVGs are 64×64 viewBox by default; they will be scaled to `size` px at draw time.
 */

export interface StampDefinition {
  /** Unique identifier used as stampId in StrokeData */
  id: string;
  /** Human-readable name shown in the palette */
  label: string;
  /** Inline SVG string (no XML declaration, no wrapper element needed) */
  svg: string;
}

/** Build a data: URL from an SVG string so it can be loaded into an HTMLImageElement. */
export function stampToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${svg}</svg>`
  );
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/** In-memory cache: stampId → HTMLImageElement promise */
const _imageCache = new Map<string, Promise<HTMLImageElement>>();

/** Load (and cache) the HTMLImageElement for a given stamp id. */
export function loadStampImage(stampId: string): Promise<HTMLImageElement> {
  const cached = _imageCache.get(stampId);
  if (cached) return cached;

  const stamp = STAMPS.find((s) => s.id === stampId);
  if (!stamp) return Promise.reject(new Error(`Unknown stamp id: ${stampId}`));

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = stampToDataUrl(stamp.svg);
  });

  _imageCache.set(stampId, promise);
  return promise;
}

// ─── Stamp library ────────────────────────────────────────────────────────────

export const STAMPS: StampDefinition[] = [
  {
    id: 'forte',
    label: 'f  (forte)',
    svg: `<text x="32" y="48" font-family="serif" font-size="52" font-style="italic"
               text-anchor="middle" fill="currentColor">f</text>`,
  },
  {
    id: 'piano',
    label: 'p  (piano)',
    svg: `<text x="32" y="48" font-family="serif" font-size="52" font-style="italic"
               text-anchor="middle" fill="currentColor">p</text>`,
  },
  {
    id: 'mezzo-forte',
    label: 'mf  (mezzo-forte)',
    svg: `<text x="32" y="48" font-family="serif" font-size="38" font-style="italic"
               text-anchor="middle" fill="currentColor">mf</text>`,
  },
  {
    id: 'mezzo-piano',
    label: 'mp  (mezzo-piano)',
    svg: `<text x="32" y="48" font-family="serif" font-size="38" font-style="italic"
               text-anchor="middle" fill="currentColor">mp</text>`,
  },
  {
    id: 'fortissimo',
    label: 'ff  (fortissimo)',
    svg: `<text x="32" y="48" font-family="serif" font-size="38" font-style="italic"
               text-anchor="middle" fill="currentColor">ff</text>`,
  },
  {
    id: 'pianissimo',
    label: 'pp  (pianissimo)',
    svg: `<text x="32" y="48" font-family="serif" font-size="38" font-style="italic"
               text-anchor="middle" fill="currentColor">pp</text>`,
  },
  {
    id: 'sforzando',
    label: 'sfz  (sforzando)',
    svg: `<text x="32" y="48" font-family="serif" font-size="30" font-style="italic"
               text-anchor="middle" fill="currentColor">sfz</text>`,
  },
  {
    id: 'accent',
    label: '>  (accent)',
    svg: `<polyline points="8,16 32,32 8,48" fill="none" stroke="currentColor"
                stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    id: 'tenuto',
    label: '—  (tenuto)',
    svg: `<line x1="12" y1="32" x2="52" y2="32" stroke="currentColor"
               stroke-width="5" stroke-linecap="round"/>`,
  },
  {
    id: 'staccato',
    label: '·  (staccato)',
    svg: `<circle cx="32" cy="32" r="7" fill="currentColor"/>`,
  },
  {
    id: 'fermata',
    label: '𝄐  (fermata)',
    svg: `<path d="M8,40 Q32,0 56,40" fill="none" stroke="currentColor"
               stroke-width="4" stroke-linecap="round"/>
          <circle cx="32" cy="40" r="5" fill="currentColor"/>`,
  },
  {
    id: 'crescendo',
    label: '< (crescendo)',
    svg: `<polyline points="8,16 56,32 8,48" fill="none" stroke="currentColor"
                stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    id: 'decrescendo',
    label: '> (decrescendo)',
    svg: `<polyline points="56,16 8,32 56,48" fill="none" stroke="currentColor"
                stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    id: 'breath-mark',
    label: ", (breath mark)",
    svg: `<path d="M30,12 Q38,26 30,40" fill="none" stroke="currentColor"
               stroke-width="4" stroke-linecap="round"/>`,
  },
  {
    id: 'rehearsal-a',
    label: '[A]  (rehearsal A)',
    svg: `<rect x="4" y="4" width="56" height="56" rx="6" fill="none"
               stroke="currentColor" stroke-width="4"/>
          <text x="32" y="46" font-family="sans-serif" font-size="36" font-weight="bold"
               text-anchor="middle" fill="currentColor">A</text>`,
  },
  {
    id: 'coda',
    label: '⊕  (coda)',
    svg: `<circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="4"/>
          <line x1="32" y1="4"  x2="32" y2="60" stroke="currentColor" stroke-width="4"/>
          <line x1="4"  y1="32" x2="60" y2="32" stroke="currentColor" stroke-width="4"/>`,
  },
  {
    id: 'segno',
    label: '𝄋  (segno)',
    svg: `<text x="32" y="50" font-family="serif" font-size="56" text-anchor="middle"
               fill="currentColor">𝄋</text>`,
  },
];
