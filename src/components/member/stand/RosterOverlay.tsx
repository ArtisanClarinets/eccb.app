'use client';

import React from 'react';
import { useStandStore, StandRosterMember } from '@/store/standStore';

export function RosterOverlay() {
  const roster = useStandStore((s) => s.roster);

  if (!roster || roster.length === 0) {
    return null;
  }

  // group by section
  const grouped: Record<string, StandRosterMember[]> = {};
  roster.forEach((m) => {
    const key = m.section || 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  /** Safe initials – returns "?" when name is missing */
  const initials = (name: string) => {
    if (!name || !name.trim()) return '?';
    const words = name.trim().split(/\s+/);
    return words
      .map((w) => (w[0] ?? '').toUpperCase())
      .slice(0, 2)
      .join('');
  };

  return (
    <div className="absolute bottom-4 right-4 z-50 bg-card bg-opacity-90 p-2 rounded shadow max-w-xs text-xs">
      {Object.entries(grouped).map(([section, members]) => (
        <div key={section} className="mb-1">
          <div className="font-semibold text-[0.65rem] text-muted-foreground">{section}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {members.map((m) => (
              <span
                key={m.userId}
                className="inline-flex items-center justify-center w-6 h-6 bg-primary text-white rounded-full"
                title={m.name || m.userId}
                aria-label={m.name || 'Member'}
              >
                {initials(m.name)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

RosterOverlay.displayName = 'RosterOverlay';
