// Temporary declaration to satisfy TypeScript when the package is absent.
// We treat `tesseract.js` as an optional dependency, so runtime code
// guards against its absence. In builds we just need a sane type so
// the dynamic import compiles.

declare module 'tesseract.js' {
  // minimal exports used by our code
  export function recognize(
    input: string | Buffer,
    lang?: string | string[],
    options?: Record<string, unknown>
  ): Promise<any>;
  export default { recognize };
}
