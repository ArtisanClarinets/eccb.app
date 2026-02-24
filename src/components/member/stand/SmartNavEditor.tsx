'use client';

import React from 'react';
import { useStandStore } from '@/store/standStore';

export function SmartNavEditor() {
  const { navigationLinks: _navigationLinks, addNavigationLink: _addNavigationLink, removeNavigationLink: _removeNavigationLink } = useStandStore();

  return (
    <div>SmartNavEditor</div>
  );
}

SmartNavEditor.displayName = 'SmartNavEditor';
