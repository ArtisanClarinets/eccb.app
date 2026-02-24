'use client';

import React from 'react';
import { useStandStore } from '@/store/standStore';

export function NightModeToggle() {
  const { nightMode: _nightMode, toggleNightMode: _toggleNightMode } = useStandStore();

  return (
    <div>NightModeToggle</div>
  );
}

NightModeToggle.displayName = 'NightModeToggle';
