import { SerializedNode } from '../shared/types';
import {
  SKIP_TAGS,
  STRIP_CLASS_PATTERNS,
  DOM_MAX_DEPTH,
  DOM_MAX_CHILDREN,
  DOM_MAX_TEXT_LENGTH,
} from '../shared/constants';

interface SerializationOptions {
  maxDepth: number;
  maxChildren: number;
  maxTextLength: number;
  includeHidden: boolean;
  focusKeywords?: string[];
}

const DEFAULT_OPTIONS: SerializationOptions = {
  maxDepth: DOM_MAX_DEPTH,
  maxChildren: DOM_MAX_CHILDREN,
  maxTextLength: DOM_MAX_TEXT_LENGTH,
  includeHidden: false,
};

// Filter class names - keep semantic ones, remove auto-generated
function filterClasses(classList: DOMTokenList): string[] {
  return Array.from(classList)
    .filter(c => !STRIP_CLASS_PATTERNS.some(pattern => pattern.test(c)))
    .slice(0, 5); // Max 5 classes per element
}

// Get only direct text content (not from children)
function getDirectText(el: Element): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent?.trim() || '';
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

// Check if element is visible
function isVisible(el: Element): boolean {
  const style = getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity) > 0
  );
}

// Serialize a single DOM node
function serializeNode(
  el: Element,
  depth: number,
  options: SerializationOptions
): SerializedNode | null {
  if (depth > options.maxDepth) return null;

  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;

  // Check visibility
  if (!options.includeHidden && !isVisible(el)) return null;

  const node: SerializedNode = { tag };

  // Extract stable identifiers (prioritized)
  if (el.id) node.id = el.id;

  // Filter classes
  const classes = filterClasses(el.classList);
  if (classes.length) node.classes = classes;

  // Data attributes (very stable for scraping)
  const dataAttrs: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (
      attr.name.startsWith('data-') &&
      !attr.name.includes('reactid') &&
      !attr.name.includes('uuid') &&
      !attr.name.includes('gtm')
    ) {
      // Truncate long values
      dataAttrs[attr.name] = attr.value.slice(0, 30);
    }
  }
  if (Object.keys(dataAttrs).length) node.dataAttrs = dataAttrs;

  // ARIA labels (semantic, stable)
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) node.ariaLabel = ariaLabel.slice(0, 50);

  const role = el.getAttribute('role');
  if (role) node.role = role;

  // Links (URL patterns are very stable)
  if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href && !href.startsWith('javascript:')) {
      node.href = href.slice(0, 100);
    }
  }

  // Visible text (truncated)
  const textContent = getDirectText(el);
  if (textContent) {
    node.text = textContent.slice(0, options.maxTextLength);
  }

  // Serialize children
  const children = Array.from(el.children);
  if (children.length) {
    const serializedChildren: SerializedNode[] = [];

    for (let i = 0; i < Math.min(children.length, options.maxChildren); i++) {
      const child = serializeNode(children[i], depth + 1, options);
      if (child) serializedChildren.push(child);
    }

    if (serializedChildren.length) {
      node.children = serializedChildren;
    }
  }

  return node;
}

// Convert serialized tree to compact string format
function toCompactString(node: SerializedNode | null, indent = 0): string {
  if (!node) return '';

  const parts: string[] = [];
  const prefix = '  '.repeat(indent);

  // Build selector-like representation
  let line = `${prefix}<${node.tag}`;
  if (node.id) line += `#${node.id}`;
  if (node.classes?.length) line += `.${node.classes.join('.')}`;
  if (node.dataAttrs) {
    for (const [k, v] of Object.entries(node.dataAttrs)) {
      line += ` ${k}="${v}"`;
    }
  }
  if (node.ariaLabel) line += ` aria="${node.ariaLabel}"`;
  if (node.role) line += ` role="${node.role}"`;
  if (node.href) line += ` href="${node.href}"`;
  line += '>';

  if (node.text) line += ` "${node.text}"`;

  parts.push(line);

  if (node.children) {
    for (const child of node.children) {
      parts.push(toCompactString(child, indent + 1));
    }
  }

  return parts.filter(Boolean).join('\n');
}

// Find elements matching keywords (for focused serialization)
function findRelevantElements(hint: string): Element[] {
  const keywords = hint.toLowerCase().split(/\s+/);
  const matches: Element[] = [];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    const text = [
      el.textContent?.toLowerCase() || '',
      el.className?.toLowerCase?.() || '',
      el.id?.toLowerCase() || '',
      el.getAttribute('aria-label')?.toLowerCase() || '',
      ...(Array.from(el.attributes)
        .filter(a => a.name.startsWith('data-'))
        .map(a => a.value.toLowerCase())),
    ].join(' ');

    if (keywords.some(kw => text.includes(kw))) {
      matches.push(el);
    }
  }

  return matches;
}

// Main serialization function
export function serializeDOM(options: Partial<SerializationOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tree = serializeNode(document.body, 0, opts);
  return toCompactString(tree);
}

// Focused serialization around potential target elements
export function serializeFocused(hint: string): string {
  const matches = findRelevantElements(hint);
  const contexts: string[] = [];

  // Serialize context around each match (up to 5)
  for (const el of matches.slice(0, 5)) {
    // Go up to parent for context
    const parent = el.parentElement;
    if (parent) {
      const contextTree = serializeNode(parent, 0, {
        ...DEFAULT_OPTIONS,
        maxDepth: 4, // Shallower for focused
        maxChildren: 10,
      });
      if (contextTree) {
        contexts.push(toCompactString(contextTree));
      }
    }
  }

  // Remove duplicates and join
  const uniqueContexts = [...new Set(contexts)];
  return uniqueContexts.join('\n---\n');
}

// Combined serialization: focused first, then full if needed
export function serializeForLLM(userRequest: string): string {
  // First try focused serialization based on user request
  const focused = serializeFocused(userRequest);

  if (focused.length > 500) {
    // Good focused context found
    return `## Relevant sections (matching "${userRequest}"):\n${focused}`;
  }

  // Fall back to full page serialization
  const full = serializeDOM();

  // If full is too large, truncate
  const maxLength = 8000; // ~2000 tokens
  if (full.length > maxLength) {
    return `## Page structure (truncated):\n${full.slice(0, maxLength)}\n...[truncated]`;
  }

  return `## Page structure:\n${full}`;
}
