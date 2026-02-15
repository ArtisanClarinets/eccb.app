/**
 * Tests for accessibility utility functions
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getFocusableElements,
  getFirstFocusable,
  getLastFocusable,
  getSkipToContentProps,
  getMainContentProps,
  getExpandableProps,
  getExpandablePanelProps,
  getRequiredFieldProps,
  getErrorMessageProps,
  getDialogProps,
  getTabProps,
  getTabPanelProps,
  getMenuItemProps,
  getPopupButtonProps,
  createKeyboardHandler,
  generateA11yId,
  combineAriaDescribedBy,
  isElementVisible,
  getAccessibleName,
  announce,
  clearAnnouncements,
} from '../a11y';

// Mock offsetParent for jsdom (not implemented)
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  get() {
    return document.body;
  },
  configurable: true,
});

// ============================================================================
// Focus Management Tests
// ============================================================================

describe('getFocusableElements', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return all focusable elements', () => {
    container.innerHTML = `
      <button>Button</button>
      <a href="#">Link</a>
      <input type="text" />
      <select><option>Option</option></select>
      <textarea></textarea>
      <div tabindex="0">Focusable div</div>
    `;

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(6);
  });

  it('should exclude disabled elements', () => {
    container.innerHTML = `
      <button>Enabled</button>
      <button disabled>Disabled</button>
      <input type="text" />
      <input type="text" disabled />
    `;

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(2);
  });

  it('should exclude elements with tabindex="-1"', () => {
    container.innerHTML = `
      <button>Button</button>
      <div tabindex="-1">Not focusable</div>
      <div tabindex="0">Focusable</div>
    `;

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(2);
  });

  it('should exclude hidden elements', () => {
    container.innerHTML = `
      <button>Visible</button>
      <button style="display: none;">Hidden</button>
      <button style="visibility: hidden;">Invisible</button>
    `;

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(1);
  });
});

describe('getFirstFocusable', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return the first focusable element', () => {
    container.innerHTML = `
      <button id="first">First</button>
      <button id="second">Second</button>
    `;

    const first = getFirstFocusable(container);
    expect(first?.id).toBe('first');
  });

  it('should return null when no focusable elements exist', () => {
    container.innerHTML = '<div>Not focusable</div>';

    const first = getFirstFocusable(container);
    expect(first).toBeNull();
  });
});

describe('getLastFocusable', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return the last focusable element', () => {
    container.innerHTML = `
      <button id="first">First</button>
      <button id="second">Second</button>
      <button id="third">Third</button>
    `;

    const last = getLastFocusable(container);
    expect(last?.id).toBe('third');
  });

  it('should return null when no focusable elements exist', () => {
    container.innerHTML = '<div>Not focusable</div>';

    const last = getLastFocusable(container);
    expect(last).toBeNull();
  });
});

// ============================================================================
// Skip-to-Content Tests
// ============================================================================

describe('getSkipToContentProps', () => {
  it('should return props with default target id', () => {
    const props = getSkipToContentProps();
    expect(props.href).toBe('#main-content');
  });

  it('should return props with custom target id', () => {
    const props = getSkipToContentProps('custom-id');
    expect(props.href).toBe('#custom-id');
  });

  it('should focus the target element on click', () => {
    const target = document.createElement('main');
    target.id = 'main-content';
    document.body.appendChild(target);

    const props = getSkipToContentProps();
    const event = {
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent<HTMLAnchorElement>;

    props.onClick(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(target);

    document.body.removeChild(target);
  });
});

describe('getMainContentProps', () => {
  it('should return props with default id', () => {
    const props = getMainContentProps();
    expect(props.id).toBe('main-content');
    expect(props.role).toBe('main');
    expect(props.tabIndex).toBe(-1);
  });

  it('should return props with custom id', () => {
    const props = getMainContentProps('custom-main');
    expect(props.id).toBe('custom-main');
  });
});

// ============================================================================
// ARIA Attribute Generator Tests
// ============================================================================

describe('getExpandableProps', () => {
  it('should return correct aria attributes', () => {
    const props = getExpandableProps('panel1', true);
    expect(props['aria-expanded']).toBe(true);
    expect(props['aria-controls']).toBe('panel1-content');
  });

  it('should use custom controls id', () => {
    const props = getExpandableProps('panel1', false, 'custom-panel');
    expect(props['aria-controls']).toBe('custom-panel');
  });
});

describe('getExpandablePanelProps', () => {
  it('should return correct attributes for visible panel', () => {
    const props = getExpandablePanelProps('panel1', true);
    expect(props.id).toBe('panel1-content');
    expect(props.role).toBe('region');
    expect(props['aria-hidden']).toBe(false);
    expect(props.hidden).toBe(false);
  });

  it('should return correct attributes for hidden panel', () => {
    const props = getExpandablePanelProps('panel1', false);
    expect(props['aria-hidden']).toBe(true);
    expect(props.hidden).toBe(true);
  });
});

describe('getRequiredFieldProps', () => {
  it('should return required attributes without error', () => {
    const props = getRequiredFieldProps('email');
    expect(props.id).toBe('email');
    expect(props.required).toBe(true);
    expect(props['aria-required']).toBe(true);
    expect(props['aria-invalid']).toBe(false);
    expect(props['aria-describedby']).toBeUndefined();
  });

  it('should return error attributes when hasError is true', () => {
    const props = getRequiredFieldProps('email', true, 'email-error');
    expect(props['aria-invalid']).toBe(true);
    expect(props['aria-describedby']).toBe('email-error');
  });
});

describe('getErrorMessageProps', () => {
  it('should return correct error message attributes', () => {
    const props = getErrorMessageProps('email-error');
    expect(props.id).toBe('email-error');
    expect(props.role).toBe('alert');
    expect(props['aria-live']).toBe('polite');
  });
});

describe('getDialogProps', () => {
  it('should return correct dialog attributes', () => {
    const props = getDialogProps('dialog1', true);
    expect(props.id).toBe('dialog1');
    expect(props.role).toBe('dialog');
    expect(props['aria-modal']).toBe(true);
    expect(props['aria-hidden']).toBe(false);
    expect(props['aria-labelledby']).toBe('dialog1-title');
  });

  it('should return hidden attributes when closed', () => {
    const props = getDialogProps('dialog1', false);
    expect(props['aria-hidden']).toBe(true);
  });

  it('should use custom label and description ids', () => {
    const props = getDialogProps('dialog1', true, 'custom-title', 'custom-desc');
    expect(props['aria-labelledby']).toBe('custom-title');
    expect(props['aria-describedby']).toBe('custom-desc');
  });
});

describe('getTabProps', () => {
  it('should return correct attributes for selected tab', () => {
    const props = getTabProps('tab1', 'panel1', true);
    expect(props.id).toBe('tab1');
    expect(props.role).toBe('tab');
    expect(props['aria-selected']).toBe(true);
    expect(props['aria-controls']).toBe('panel1');
    expect(props.tabIndex).toBe(0);
  });

  it('should return correct attributes for unselected tab', () => {
    const props = getTabProps('tab1', 'panel1', false);
    expect(props['aria-selected']).toBe(false);
    expect(props.tabIndex).toBe(-1);
  });
});

describe('getTabPanelProps', () => {
  it('should return correct attributes for visible panel', () => {
    const props = getTabPanelProps('panel1', 'tab1', true);
    expect(props.id).toBe('panel1');
    expect(props.role).toBe('tabpanel');
    expect(props['aria-labelledby']).toBe('tab1');
    expect(props['aria-hidden']).toBe(false);
    expect(props.tabIndex).toBe(0);
  });

  it('should return correct attributes for hidden panel', () => {
    const props = getTabPanelProps('panel1', 'tab1', false);
    expect(props['aria-hidden']).toBe(true);
  });
});

describe('getMenuItemProps', () => {
  it('should return basic menu item attributes', () => {
    const props = getMenuItemProps('item1');
    expect(props.id).toBe('item1');
    expect(props.role).toBe('menuitem');
    expect(props['aria-haspopup']).toBeUndefined();
  });

  it('should return popup attributes when hasPopup is true', () => {
    const props = getMenuItemProps('item1', true, false);
    expect(props['aria-haspopup']).toBe('menu');
    expect(props['aria-expanded']).toBe(false);
  });

  it('should return expanded attributes when expanded', () => {
    const props = getMenuItemProps('item1', true, true);
    expect(props['aria-expanded']).toBe(true);
  });
});

describe('getPopupButtonProps', () => {
  it('should return correct popup button attributes', () => {
    const props = getPopupButtonProps('btn1', 'menu', true, 'menu1');
    expect(props.id).toBe('btn1');
    expect(props['aria-haspopup']).toBe('menu');
    expect(props['aria-expanded']).toBe(true);
    expect(props['aria-controls']).toBe('menu1');
  });

  it('should support different popup types', () => {
    const dialogProps = getPopupButtonProps('btn1', 'dialog', false, 'dialog1');
    expect(dialogProps['aria-haspopup']).toBe('dialog');

    const listboxProps = getPopupButtonProps('btn1', 'listbox', false, 'listbox1');
    expect(listboxProps['aria-haspopup']).toBe('listbox');
  });
});

// ============================================================================
// Keyboard Handler Tests
// ============================================================================

describe('createKeyboardHandler', () => {
  it('should call onActivate for Enter key', () => {
    const onActivate = vi.fn();
    const handler = createKeyboardHandler({ onActivate });

    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;

    handler(event);

    expect(onActivate).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should call onActivate for Space key', () => {
    const onActivate = vi.fn();
    const handler = createKeyboardHandler({ onActivate });

    const event = {
      key: ' ',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;

    handler(event);

    expect(onActivate).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should call onEscape for Escape key', () => {
    const onEscape = vi.fn();
    const handler = createKeyboardHandler({ onEscape });

    const event = {
      key: 'Escape',
    } as unknown as React.KeyboardEvent;

    handler(event);

    expect(onEscape).toHaveBeenCalled();
  });

  it('should call arrow handlers', () => {
    const onArrowUp = vi.fn();
    const onArrowDown = vi.fn();
    const onArrowLeft = vi.fn();
    const onArrowRight = vi.fn();
    const handler = createKeyboardHandler({
      onArrowUp,
      onArrowDown,
      onArrowLeft,
      onArrowRight,
    });

    const upEvent = { key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
    handler(upEvent);
    expect(onArrowUp).toHaveBeenCalled();

    const downEvent = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
    handler(downEvent);
    expect(onArrowDown).toHaveBeenCalled();

    const leftEvent = { key: 'ArrowLeft', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
    handler(leftEvent);
    expect(onArrowLeft).toHaveBeenCalled();

    const rightEvent = { key: 'ArrowRight', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
    handler(rightEvent);
    expect(onArrowRight).toHaveBeenCalled();
  });

  it('should call Home and End handlers', () => {
    const onHome = vi.fn();
    const onEnd = vi.fn();
    const handler = createKeyboardHandler({ onHome, onEnd });

    const homeEvent = { key: 'Home', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
    handler(homeEvent);
    expect(onHome).toHaveBeenCalled();

    const endEvent = { key: 'End', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
    handler(endEvent);
    expect(onEnd).toHaveBeenCalled();
  });

  it('should call Tab handler without preventDefault', () => {
    const onTab = vi.fn();
    const handler = createKeyboardHandler({ onTab });

    const event = { key: 'Tab' } as unknown as React.KeyboardEvent;
    handler(event);

    expect(onTab).toHaveBeenCalledWith(event);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('generateA11yId', () => {
  it('should generate unique ids', () => {
    const id1 = generateA11yId();
    const id2 = generateA11yId();
    expect(id1).not.toBe(id2);
  });

  it('should use custom prefix', () => {
    const id = generateA11yId('custom');
    expect(id.startsWith('custom-')).toBe(true);
  });

  it('should use default prefix', () => {
    const id = generateA11yId();
    expect(id.startsWith('a11y-')).toBe(true);
  });
});

describe('combineAriaDescribedBy', () => {
  it('should combine multiple ids', () => {
    const result = combineAriaDescribedBy('error1', 'hint1', 'help1');
    expect(result).toBe('error1 hint1 help1');
  });

  it('should filter out undefined values', () => {
    const result = combineAriaDescribedBy('error1', undefined, 'help1');
    expect(result).toBe('error1 help1');
  });

  it('should return undefined when all values are undefined', () => {
    const result = combineAriaDescribedBy(undefined, undefined);
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty input', () => {
    const result = combineAriaDescribedBy();
    expect(result).toBeUndefined();
  });
});

describe('isElementVisible', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return true for visible elements', () => {
    container.innerHTML = '<button id="btn">Button</button>';
    const btn = container.querySelector('#btn') as HTMLElement;
    expect(isElementVisible(btn)).toBe(true);
  });

  it('should return false for display:none elements', () => {
    container.innerHTML = '<button id="btn" style="display: none;">Button</button>';
    const btn = container.querySelector('#btn') as HTMLElement;
    expect(isElementVisible(btn)).toBe(false);
  });

  it('should return false for visibility:hidden elements', () => {
    container.innerHTML = '<button id="btn" style="visibility: hidden;">Button</button>';
    const btn = container.querySelector('#btn') as HTMLElement;
    expect(isElementVisible(btn)).toBe(false);
  });
});

describe('getAccessibleName', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return aria-label value', () => {
    container.innerHTML = '<button aria-label="Close">X</button>';
    const btn = container.querySelector('button') as HTMLElement;
    expect(getAccessibleName(btn)).toBe('Close');
  });

  it('should return aria-labelledby element text', () => {
    container.innerHTML = `
      <span id="label-text">Submit Form</span>
      <button aria-labelledby="label-text">→</button>
    `;
    const btn = container.querySelector('button') as HTMLElement;
    expect(getAccessibleName(btn)).toBe('Submit Form');
  });

  it('should return associated label text', () => {
    container.innerHTML = `
      <label for="email">Email Address</label>
      <input id="email" type="email" />
    `;
    const input = container.querySelector('input') as HTMLElement;
    expect(getAccessibleName(input)).toBe('Email Address');
  });

  it('should return parent label text', () => {
    container.innerHTML = `
      <label>
        Username
        <input type="text" />
      </label>
    `;
    const input = container.querySelector('input') as HTMLElement;
    expect(getAccessibleName(input).trim()).toBe('Username');
  });

  it('should fall back to text content', () => {
    container.innerHTML = '<button>Click Me</button>';
    const btn = container.querySelector('button') as HTMLElement;
    expect(getAccessibleName(btn)).toBe('Click Me');
  });
});

// ============================================================================
// Screen Reader Announcement Tests
// ============================================================================

describe('announce', () => {
  // Note: The announce function uses a module-level liveRegionContainer
  // that persists across tests. Each test needs to ensure the live region exists.

  it('should create a live region and announce message', async () => {
    announce('Test message');

    // Wait for the announcement to be set
    await new Promise((resolve) => setTimeout(resolve, 150));

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.textContent).toBe('Test message');
  });

  it('should use assertive mode when specified', async () => {
    // First announce to ensure live region exists
    announce('First', { assertive: false });
    await new Promise((resolve) => setTimeout(resolve, 150));
    
    // Now test assertive mode
    announce('Urgent message', { assertive: true });

    await new Promise((resolve) => setTimeout(resolve, 150));

    // The announce function updates aria-live attribute on the existing region
    const liveRegion = document.querySelector('[aria-live]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute('aria-live')).toBe('assertive');
  });

  it('should clear message after specified time', async () => {
    announce('Temporary message', { clearAfter: 100 });

    await new Promise((resolve) => setTimeout(resolve, 150));
    const liveRegion = document.querySelector('[aria-live]');
    expect(liveRegion?.textContent).toBe('Temporary message');

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(liveRegion?.textContent).toBe('');
  });
});

describe('clearAnnouncements', () => {
  it('should clear the live region content', async () => {
    announce('Message to clear');

    await new Promise((resolve) => setTimeout(resolve, 150));

    clearAnnouncements();

    const liveRegion = document.querySelector('[aria-live]');
    // The live region exists but content is cleared
    expect(liveRegion?.textContent).toBe('');
  });
});
