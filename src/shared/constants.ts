export const STORAGE_KEY = 'malleableweb_data';
export const API_KEY_STORAGE_KEY = 'malleableweb_apikey';
export const CRYPTO_KEY_SESSION_KEY = 'malleableweb_crypto_key';

export const STYLE_ELEMENT_ID = 'malleableweb-injected-styles';

export const DEFAULT_SETTINGS = {
  llmProvider: 'anthropic' as const,
  notifyOnFailure: true,
  theme: 'system' as const,
};

// Failure thresholds
export const WARNING_THRESHOLD = 1;
export const BROKEN_THRESHOLD = 3;

// DOM serialization limits
export const DOM_MAX_DEPTH = 10;
export const DOM_MAX_CHILDREN = 20;
export const DOM_MAX_TEXT_LENGTH = 50;

// Validation intervals
export const VALIDATION_INTERVAL_MS = 30000; // 30 seconds
export const VALIDATION_DEBOUNCE_MS = 1000;

// Class name patterns to strip (auto-generated)
export const STRIP_CLASS_PATTERNS = [
  /^css-[a-z0-9]+$/i,      // CSS-in-JS: css-1a2b3c
  /^sc-[a-z]+$/i,          // styled-components: sc-bdnylx
  /^jsx-[0-9]+$/,          // JSX: jsx-12345
  /^_[a-zA-Z0-9]{5,}$/,    // Hashed: _a1B2c3D4
  /^[a-z]{1,2}[0-9]{2,}$/i, // Minified: a123, AB45
  /^emotion-/,             // Emotion CSS
  /^mui-/,                 // MUI internal
];

// Tags to skip during DOM serialization
export const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'svg',
  'path',
  'meta',
  'link',
  'br',
  'hr',
  'wbr',
  'template',
  'iframe',
]);

// Tags that are semantic and should be kept
export const SEMANTIC_TAGS = new Set([
  'header',
  'footer',
  'nav',
  'main',
  'article',
  'section',
  'aside',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'a',
  'img',
  'video',
  'audio',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]);
