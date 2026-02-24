'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, Moon, Sun, Pencil, Highlighter, Eraser, Square, Type, Stamp } from 'lucide-react';
import { useStandStore, Tool } from '@/store/standStore';
import { useFullscreen } from './useFullscreen';
import { PerformanceModeToggle } from './PerformanceModeToggle';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';

const TOOL_ICONS: Record<Tool, React.ReactNode> = {
  [Tool.PENCIL]: <Pencil className="h-4 w-4" />,
  [Tool.HIGHLIGHTER]: <Highlighter className="h-4 w-4" />,
  [Tool.ERASER]: <Eraser className="h-4 w-4" />,
  [Tool.WHITEOUT]: <Square className="h-4 w-4" />,
  [Tool.TEXT]: <Type className="h-4 w-4" />,
  [Tool.STAMP]: <Stamp className="h-4 w-4" />,
};

const TOOL_LABELS: Record<Tool, string> = {
  [Tool.PENCIL]: 'Pencil tool',
  [Tool.HIGHLIGHTER]: 'Highlighter tool',
  [Tool.ERASER]: 'Eraser tool',
  [Tool.WHITEOUT]: 'Whiteout tool',
  [Tool.TEXT]: 'Text tool',
  [Tool.STAMP]: 'Stamp tool',
};

const COLORS = [
  { value: '#ff0000', label: 'Red' },
  { value: '#ff6600', label: 'Orange' },
  { value: '#ffff00', label: 'Yellow' },
  { value: '#00ff00', label: 'Green' },
  { value: '#0000ff', label: 'Blue' },
  { value: '#800080', label: 'Purple' },
  { value: '#000000', label: 'Black' },
  { value: '#ffffff', label: 'White' },
];

export function Toolbar() {
  const {
    setIsFullscreen,
    isFullscreen,
    toggleNightMode,
    nightMode,
    selectedLayer,
    setLayer,
    editMode,
    toggleEditMode,
    currentTool,
    setCurrentTool,
    toolColor,
    setToolColor,
    strokeWidth,
    setStrokeWidth,
  } = useStandStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const { toggleFullscreen } = useFullscreen({
    onChange: (fullscreen) => {
      setIsFullscreen(fullscreen);
    },
  });

  const handleFullscreenToggle = () => {
    toggleFullscreen();
  };

  const handleNightModeToggle = async () => {
    toggleNightMode();
    setIsUpdating(true);
    try {
      const response = await fetch('/api/stand/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nightMode: !nightMode }),
      });

      if (!response.ok) {
        toggleNightMode();
        console.error('Failed to persist night mode preference');
      }
    } catch (error) {
      toggleNightMode();
      console.error('Error persisting night mode preference:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div 
      className="flex items-center gap-2" 
      role="toolbar" 
      aria-label="Music stand controls"
    >
      {/* Keyboard shortcuts help - visually hidden but accessible */}
      <div className="sr-only" aria-live="polite" id="toolbar-shortcuts-help">
        Keyboard shortcuts: Arrow keys or Page Up/Down to navigate pages, M for metronome, T for tuner, P for pitch pipe, A for audio player
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleNightModeToggle}
        disabled={isUpdating}
        title={nightMode ? 'Switch to Day Mode' : 'Switch to Night Mode'}
        aria-label={nightMode ? 'Switch to Day Mode' : 'Switch to Night Mode'}
        aria-pressed={nightMode}
        className="min-w-[44px] min-h-[44px]" // Ensure 44x44px touch target
      >
        {nightMode ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      </Button>

      {/* Layer selection */}
      <div className="flex items-center space-x-1" role="group" aria-label="Annotation layers">
        {(['PERSONAL', 'SECTION', 'DIRECTOR'] as const).map((layer) => (
          <Button
            key={layer}
            variant={selectedLayer === layer ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setLayer(layer)}
            title={`${layer.toLowerCase()} layer`}
            aria-label={`${layer.toLowerCase()} annotation layer`}
            aria-pressed={selectedLayer === layer}
            className="min-w-[44px] min-h-[44px]"
          >
            {layer.charAt(0)}
          </Button>
        ))}
      </div>

      {/* Edit mode toggle */}
      <Toggle
        pressed={editMode}
        onPressedChange={toggleEditMode}
        className="ml-2 min-w-[44px] min-h-[44px]"
        aria-label="Toggle edit mode for annotations"
      >
        Edit
      </Toggle>

      {/* Tool selection - only visible in edit mode */}
      {editMode && (
        <>
          <div className="flex items-center space-x-1 border-l pl-2 ml-2" role="group" aria-label="Annotation tools">
            {Object.values(Tool).map((tool) => (
              <Button
                key={tool}
                variant={currentTool === tool ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setCurrentTool(tool)}
                title={TOOL_LABELS[tool]}
                aria-label={TOOL_LABELS[tool]}
                aria-pressed={currentTool === tool}
                disabled={!editMode}
                className="min-w-[44px] min-h-[44px]"
              >
                {TOOL_ICONS[tool]}
              </Button>
            ))}
          </div>

          {/* Color picker */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="Select annotation color"
              aria-label={`Select annotation color, current: ${COLORS.find(c => c.value === toolColor)?.label || 'custom'}`}
              aria-expanded={showColorPicker}
              aria-haspopup="listbox"
              style={{ backgroundColor: toolColor }}
              className={cn('w-11 h-11 rounded-full border-2 min-w-[44px] min-h-[44px]', toolColor === '#ffffff' && 'border-gray-400')}
            />
            {showColorPicker && (
              <div 
                className="absolute top-full mt-1 p-2 bg-background border rounded-lg shadow-lg z-50 grid grid-cols-4 gap-1"
                role="listbox"
                aria-label="Color options"
              >
                {COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => {
                      setToolColor(color.value);
                      setShowColorPicker(false);
                    }}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 min-w-[44px] min-h-[44px] flex items-center justify-center',
                      color.value === '#ffffff' ? 'border-gray-400' : 'border-transparent',
                      toolColor === color.value && 'ring-2 ring-primary'
                    )}
                    style={{ backgroundColor: color.value }}
                    role="option"
                    aria-label={color.label}
                    aria-selected={toolColor === color.value}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Stroke width slider */}
          <div className="flex items-center gap-1">
            <label htmlFor="stroke-width" className="sr-only">
              Stroke width: {strokeWidth}px
            </label>
            <input
              id="stroke-width"
              type="range"
              min="1"
              max="20"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
              className="w-20 h-8 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              title={`Stroke width: ${strokeWidth}`}
              aria-valuemin={1}
              aria-valuemax={20}
              aria-valuenow={strokeWidth}
            />
            <span className="text-xs text-muted-foreground w-4" aria-hidden="true">{strokeWidth}</span>
          </div>
        </>
      )}

      <PerformanceModeToggle />
      
      {/* Utility toggles */}
      <div className="flex items-center space-x-1" role="group" aria-label="Rehearsal utilities">
        <Button
          variant="ghost"
          size="icon"
          onClick={useStandStore.getState().toggleMetronome}
          title="Toggle metronome (M)"
          aria-label="Toggle metronome"
          className="min-w-[44px] min-h-[44px]"
        >
          M
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={useStandStore.getState().toggleTuner}
          title="Toggle tuner (T)"
          aria-label="Toggle tuner"
          className="min-w-[44px] min-h-[44px]"
        >
          T
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={useStandStore.getState().toggleAudioPlayer}
          title="Toggle audio player (A)"
          aria-label="Toggle audio player"
          className="min-w-[44px] min-h-[44px]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><polygon points="10,8 16,12 10,16" fill="currentColor"/></svg>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={useStandStore.getState().togglePitchPipe}
          title="Toggle pitch pipe (P)"
          aria-label="Toggle pitch pipe"
          className="min-w-[44px] min-h-[44px]"
        >
          P
        </Button>
      </div>
      
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={handleFullscreenToggle}
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        className="min-w-[44px] min-h-[44px]"
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
      </Button>
    </div>
  );
}

Toolbar.displayName = 'Toolbar';
