'use client';

import React from 'react';

export function Logo({
  className = 'h-8 w-auto',
  title = 'Emerald Coast Community Band',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
    >
      <title>{title}</title>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor">
        {/* stylized musical note + wave mark (scales with currentColor) */}
        <path d="M18 12v24a6 6 0 1 0 4 0V20l20-6v18" />
        <path d="M10 44c8-3 16-3 24 0s16 3 24 0" strokeWidth="1.6" fill="none" />
      </g>
    </svg>
  );
}

export default Logo;
