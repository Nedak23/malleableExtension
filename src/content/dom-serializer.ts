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

// Synonyms for common UI elements - helps match user intent to actual DOM
const KEYWORD_SYNONYMS: Record<string, string[]> = {
  'shorts': ['short', 'reel', 'reels', 'vertical-video', 'vertical_video'],
  'sidebar': ['side', 'rail', 'aside', 'complementary', 'sidenav', 'left-nav', 'right-nav'],
  'ad': ['ads', 'advertisement', 'advertisements', 'sponsored', 'promo', 'promotion', 'banner'],
  'comment': ['comments', 'replies', 'reply', 'discussion', 'feedback'],
  'video': ['videos', 'player', 'stream', 'media', 'watch'],
  'header': ['nav', 'navbar', 'navigation', 'topbar', 'top-bar', 'masthead'],
  'footer': ['bottom', 'bottombar', 'bottom-bar'],
  'popup': ['modal', 'dialog', 'overlay', 'lightbox', 'popover'],
  'button': ['btn', 'cta', 'action'],
  'menu': ['dropdown', 'submenu', 'menubar'],
  'notification': ['notifications', 'alert', 'alerts', 'toast', 'snackbar'],
  'search': ['searchbox', 'searchbar', 'search-box', 'search-bar', 'find'],
  'login': ['signin', 'sign-in', 'log-in', 'auth', 'authenticate'],
  'signup': ['register', 'sign-up', 'create-account', 'join'],
  'profile': ['account', 'user', 'avatar', 'settings'],
  'like': ['likes', 'upvote', 'thumbs-up', 'heart', 'favorite'],
  'share': ['sharing', 'social', 'repost', 'retweet'],
  'subscribe': ['subscription', 'follow', 'following'],
  'chat': ['messenger', 'message', 'messages', 'dm', 'inbox'],
  'story': ['stories', 'reel'],
  'feed': ['timeline', 'stream', 'home'],
  'trending': ['popular', 'explore', 'discover'],
  'recommended': ['suggestions', 'recommended', 'for-you', 'foryou'],
};

// Expand keywords with synonyms
function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set<string>();
  for (const kw of keywords) {
    expanded.add(kw);
    // Check if this keyword has synonyms
    const synonyms = KEYWORD_SYNONYMS[kw];
    if (synonyms) {
      synonyms.forEach(s => expanded.add(s));
    }
    // Also check if this keyword is a synonym of something
    for (const [key, values] of Object.entries(KEYWORD_SYNONYMS)) {
      if (values.includes(kw)) {
        expanded.add(key);
        values.forEach(s => expanded.add(s));
      }
    }
  }
  return Array.from(expanded);
}

// Find elements matching keywords (for focused serialization)
function findRelevantElements(hint: string): Element[] {
  const rawKeywords = hint.toLowerCase().split(/\s+/).filter(k => k.length > 2);
  const keywords = expandKeywords(rawKeywords);
  const matches: Element[] = [];
  const matchedPaths = new Set<string>();

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

  while (walker.nextNode()) {
    const el = walker.currentNode as Element;

    // Build searchable text from element attributes
    const text = [
      el.textContent?.toLowerCase() || '',
      el.className?.toLowerCase?.() || '',
      el.id?.toLowerCase() || '',
      el.tagName?.toLowerCase() || '',
      el.getAttribute('aria-label')?.toLowerCase() || '',
      el.getAttribute('role')?.toLowerCase() || '',
      el.getAttribute('title')?.toLowerCase() || '',
      el.getAttribute('placeholder')?.toLowerCase() || '',
      ...(Array.from(el.attributes)
        .filter(a => a.name.startsWith('data-'))
        .map(a => `${a.name} ${a.value}`.toLowerCase())),
    ].join(' ');

    if (keywords.some(kw => text.includes(kw))) {
      // Avoid duplicate paths (parent already matched = skip children)
      const path = getElementPath(el);
      const isChild = Array.from(matchedPaths).some(p => path.startsWith(p));
      if (!isChild) {
        matches.push(el);
        matchedPaths.add(path);
      }
    }
  }

  return matches;
}

// Get a simple path for deduplication
function getElementPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : '';
    parts.unshift(`${tag}${id}`);
    current = current.parentElement;
  }
  return parts.join('/');
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
  const serializedPaths = new Set<string>();

  // Serialize context around each match (up to 8)
  for (const el of matches.slice(0, 8)) {
    // Go up 2 levels for better context (grandparent if available)
    let contextRoot = el.parentElement;
    if (contextRoot?.parentElement &&
        contextRoot.parentElement.tagName.toLowerCase() !== 'body') {
      contextRoot = contextRoot.parentElement;
    }

    if (contextRoot) {
      const path = getElementPath(contextRoot);
      // Skip if we already serialized this or a parent
      if (serializedPaths.has(path) ||
          Array.from(serializedPaths).some(p => path.startsWith(p))) {
        continue;
      }

      const contextTree = serializeNode(contextRoot, 0, {
        ...DEFAULT_OPTIONS,
        maxDepth: 5, // Slightly deeper for better context
        maxChildren: 15, // Include more siblings
      });

      if (contextTree) {
        contexts.push(toCompactString(contextTree));
        serializedPaths.add(path);
      }
    }
  }

  return contexts.join('\n---\n');
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
