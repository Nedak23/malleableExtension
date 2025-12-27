import { STYLE_ELEMENT_ID } from '../shared/constants';
import { extractDomain } from '../shared/storage';

// Inject CSS into the page
export function injectCSS(css: string, ruleIds: string[]): void {
  // Remove existing styles first
  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (existing) existing.remove();

  if (!css.trim()) return;

  // Create style element
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.setAttribute('data-rule-ids', ruleIds.join(','));
  style.textContent = css;

  // Inject into head (or documentElement if head doesn't exist yet)
  const target = document.head || document.documentElement;
  target.appendChild(style);
}

// Request and inject stored CSS for current domain
export async function injectStoredCSS(): Promise<void> {
  const domain = extractDomain(window.location.hostname);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CSS_FOR_DOMAIN',
      domain,
    });

    if (response?.css) {
      injectCSS(response.css, response.ruleIds || []);
    }
  } catch (error) {
    // Extension context may be invalidated, ignore
    console.debug('[MalleableWeb] Failed to inject CSS:', error);
  }
}

// Listen for dynamic CSS updates from the service worker
export function setupCSSListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'INJECT_CSS') {
      injectCSS(message.css, message.ruleIds || []);
      sendResponse({ success: true });
    }
    return true;
  });
}
