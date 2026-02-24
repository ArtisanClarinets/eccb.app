'use client';

import React from 'react';
import { useStandStore } from '@/store/standStore';

export function SetlistManager() {
  const { pieces: _pieces, currentPieceIndex: _currentPieceIndex, setCurrentPieceIndex: _setCurrentPieceIndex } = useStandStore();

  return (
    <div>SetlistManager</div>
  );
}

SetlistManager.displayName = 'SetlistManager';
