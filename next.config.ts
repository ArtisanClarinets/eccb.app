import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.s3.amazonaws.com' },
      { protocol: 'https', hostname: '**.storage.googleapis.com' },
    ],
  },

  // Native Node.js modules that cannot be bundled by webpack.
  // @napi-rs/canvas and pdfjs-dist are used server-side for PDF→image rendering.
  // sharp is used for image processing/resizing.
  serverExternalPackages: ['@napi-rs/canvas', 'sharp', 'pdfjs-dist'],

  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'gsap'],
    // Limit the number of worker threads used during `next build` so that
    // the total number of concurrent MariaDB connections stays within the
    // server's connection limit (each worker opens its own pool).
    cpus: 4,
    // Raise the body size limit for route handlers (e.g. /api/files/smart-upload).
    // Music PDFs can easily exceed the 10 MB default, causing FormData parsing failures.
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // Raise the proxy middleware body buffer limit to match.  Without this,
    // proxy.ts truncates request bodies at 10 MB before they even reach the
    // route handler, causing "Failed to parse body as FormData" errors for
    // large music PDFs.
    proxyClientMaxBodySize: '50mb',
  },

  // Security headers configuration
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';

    const securityHeaders = [
      // Prevent MIME type sniffing
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      // Prevent clickjacking
      {
        key: 'X-Frame-Options',
        value: 'SAMEORIGIN',
      },
      // Enable XSS filter in browsers
      {
        key: 'X-XSS-Protection',
        value: '1; mode=block',
      },
      // Control referrer information
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      // Restrict browser features
      {
        key: 'Permissions-Policy',
        value: [
          'camera=()',
          'microphone=(self)',
          'geolocation=()',
          'interest-cohort=()',
          'payment=()',
          'sync-xhr=(self)',
          'midi=(self)',
        ].join(', '),
      },
      // Content Security Policy
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "connect-src 'self' https://va.vercel-scripts.com",
          "worker-src 'self' blob:",
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
        ].join('; '),
      },
    ];

    // Add HSTS only in production (requires HTTPS)
    if (isProduction) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload',
      });
    }

    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Specific headers for API routes - more restrictive
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
