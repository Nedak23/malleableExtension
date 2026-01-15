// Element picker for selecting DOM elements visually

import { SelectedElement } from '../shared/types';

// CSS styles for the picker overlay
const PICKER_STYLES = `
  .malleableweb-picker-overlay {
    position: fixed;
    pointer-events: none;
    border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    z-index: 2147483647;
    transition: all 0.1s ease;
    border-radius: 2px;
  }

  .malleableweb-picker-tooltip {
    position: fixed;
    background: #1f2937;
    color: #f3f4f6;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-family: ui-monospace, monospace;
    z-index: 2147483647;
    pointer-events: none;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  }

  .malleableweb-picker-active {
    cursor: crosshair !important;
  }

  .malleableweb-picker-active * {
    cursor: crosshair !important;
  }
`;

class ElementPicker {
  private isActive = false;
  private overlay: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private currentElement: Element | null = null;
  private onSelect: ((element: SelectedElement) => void) | null = null;
  private onCancel: (() => void) | null = null;

  start(
    onSelect: (element: SelectedElement) => void,
    onCancel: () => void
  ): void {
    if (this.isActive) return;

    this.isActive = true;
    this.onSelect = onSelect;
    this.onCancel = onCancel;

    this.injectStyles();
    this.createOverlay();
    this.createTooltip();
    this.attachListeners();
    document.body.classList.add('malleableweb-picker-active');
  }

  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.removeListeners();
    this.cleanup();
    document.body.classList.remove('malleableweb-picker-active');
  }

  private injectStyles(): void {
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = PICKER_STYLES;
    document.head.appendChild(this.styleElement);
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'malleableweb-picker-overlay';
    document.body.appendChild(this.overlay);
  }

  private createTooltip(): void {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'malleableweb-picker-tooltip';
    this.tooltip.style.display = 'none';
    document.body.appendChild(this.tooltip);
  }

  private attachListeners(): void {
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
  }

  private removeListeners(): void {
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
  }

  private cleanup(): void {
    this.overlay?.remove();
    this.tooltip?.remove();
    this.styleElement?.remove();
    this.overlay = null;
    this.tooltip = null;
    this.styleElement = null;
    this.currentElement = null;
    this.onSelect = null;
    this.onCancel = null;
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isActive) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);

    // Skip our own UI elements
    if (!target ||
        target.classList.contains('malleableweb-picker-overlay') ||
        target.classList.contains('malleableweb-picker-tooltip')) {
      return;
    }

    // Skip html, body, and script/style elements
    const tagName = target.tagName.toLowerCase();
    if (['html', 'body', 'script', 'style', 'head'].includes(tagName)) {
      this.hideOverlay();
      return;
    }

    this.currentElement = target;
    this.updateOverlay(target);
    this.updateTooltip(target, e.clientX, e.clientY);
  };

  private handleClick = (e: MouseEvent): void => {
    if (!this.isActive || !this.currentElement) return;

    e.preventDefault();
    e.stopPropagation();

    const selectedElement = this.extractElementInfo(this.currentElement);
    this.stop();
    this.onSelect?.(selectedElement);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.isActive) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.stop();
      this.onCancel?.();
    }
  };

  private hideOverlay(): void {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
    this.currentElement = null;
  }

  private updateOverlay(element: Element): void {
    if (!this.overlay) return;

    const rect = element.getBoundingClientRect();
    this.overlay.style.display = 'block';
    this.overlay.style.top = `${rect.top}px`;
    this.overlay.style.left = `${rect.left}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;
  }

  private updateTooltip(element: Element, mouseX: number, mouseY: number): void {
    if (!this.tooltip) return;

    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = Array.from(element.classList)
      .filter(c => !c.startsWith('malleableweb-'))
      .slice(0, 2)
      .map(c => `.${c}`)
      .join('');

    this.tooltip.textContent = `${tagName}${id}${classes}`;
    this.tooltip.style.display = 'block';

    // Position tooltip near mouse but avoid going off screen
    const tooltipRect = this.tooltip.getBoundingClientRect();
    let x = mouseX + 15;
    let y = mouseY + 15;

    if (x + tooltipRect.width > window.innerWidth) {
      x = mouseX - tooltipRect.width - 10;
    }
    if (y + tooltipRect.height > window.innerHeight) {
      y = mouseY - tooltipRect.height - 10;
    }

    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  private extractElementInfo(element: Element): SelectedElement {
    const tagName = element.tagName.toLowerCase();
    const id = element.id || undefined;
    const classes = Array.from(element.classList).filter(c => !c.startsWith('malleableweb-'));

    // Get direct text content (not from children)
    let text: string | undefined;
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const trimmed = node.textContent?.trim();
        if (trimmed) {
          text = trimmed.slice(0, 50);
          break;
        }
      }
    }

    // Build the best selector
    const selector = this.buildSelector(element);

    // Get parent selector for context
    const parentSelector = element.parentElement ?
      this.buildSelector(element.parentElement) : undefined;

    // Get truncated outer HTML for context
    const outerHTML = element.outerHTML.slice(0, 500);

    return {
      selector,
      tagName,
      id,
      classes,
      text,
      outerHTML,
      parentSelector,
    };
  }

  private buildSelector(element: Element): string {
    const tagName = element.tagName.toLowerCase();

    // Priority 1: ID (most specific)
    if (element.id) {
      return `#${element.id}`;
    }

    // Priority 2: data-* attribute
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-') &&
          !attr.name.includes('reactid') &&
          !attr.name.includes('uuid')) {
        return `[${attr.name}="${attr.value}"]`;
      }
    }

    // Priority 3: aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return `[aria-label="${ariaLabel}"]`;
    }

    // Priority 4: role attribute
    const role = element.getAttribute('role');
    if (role) {
      return `${tagName}[role="${role}"]`;
    }

    // Priority 5: Semantic classes (non-generated)
    const semanticClasses = Array.from(element.classList)
      .filter(c => !this.isGeneratedClass(c))
      .slice(0, 2);

    if (semanticClasses.length) {
      return `${tagName}.${semanticClasses.join('.')}`;
    }

    // Priority 6: href pattern for links
    if (tagName === 'a') {
      const href = element.getAttribute('href');
      if (href && !href.startsWith('javascript:')) {
        // Extract path pattern
        const path = href.split('?')[0];
        if (path.length < 50) {
          return `a[href="${path}"]`;
        }
        // Use partial match for longer paths
        const pathPart = path.split('/').slice(-2).join('/');
        return `a[href*="${pathPart}"]`;
      }
    }

    // Fallback: tag name with parent context
    return tagName;
  }

  private isGeneratedClass(className: string): boolean {
    // Common patterns for auto-generated CSS-in-JS classes
    const patterns = [
      /^css-[a-z0-9]+$/i,           // Emotion
      /^sc-[a-zA-Z]+-[a-zA-Z0-9]+$/, // styled-components
      /^[a-zA-Z]+__[a-zA-Z]+-[a-zA-Z0-9]+$/, // CSS modules
      /^_[a-zA-Z0-9]{5,}$/,          // Various bundlers
      /^[a-z]{1,2}\d{3,}$/i,         // Minified classes
      /^jsx-[a-z0-9]+$/i,            // styled-jsx
    ];
    return patterns.some(p => p.test(className));
  }
}

// Singleton instance
export const elementPicker = new ElementPicker();

// Message handler for picker commands
export function handlePickerMessage(
  message: { type: string },
  sendResponse: (response: unknown) => void
): boolean {
  if (message.type === 'START_ELEMENT_PICKER') {
    elementPicker.start(
      (selected) => {
        // Store selection and notify popup to reopen
        chrome.storage.session.set({ selectedElement: selected }, () => {
          // Open popup - this will fail silently if not supported
          chrome.runtime.sendMessage({ type: 'ELEMENT_SELECTED', element: selected });
        });
      },
      () => {
        // User cancelled
        chrome.runtime.sendMessage({ type: 'PICKER_CANCELLED' });
      }
    );
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'STOP_ELEMENT_PICKER') {
    elementPicker.stop();
    sendResponse({ success: true });
    return true;
  }

  return false;
}
