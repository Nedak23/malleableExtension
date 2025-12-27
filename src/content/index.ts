import { injectStoredCSS, setupCSSListener } from './css-injector';
import { RuleValidator } from './rule-validator';
import { serializeForLLM } from './dom-serializer';

// Inject CSS immediately (runs at document_start)
injectStoredCSS();

// Set up listener for dynamic CSS updates
setupCSSListener();

// Start rule validation after page loads
const validator = new RuleValidator();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    validator.start();
  });
} else {
  validator.start();
}

// Listen for DOM serialization requests from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SERIALIZE_DOM') {
    const serialized = serializeForLLM(message.userRequest || '');
    sendResponse({ serializedDOM: serialized });
  }
  return true;
});
