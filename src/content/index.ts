import { injectStoredCSS, setupCSSListener } from './css-injector';
import { RuleValidator } from './rule-validator';
import { serializeForLLM } from './dom-serializer';
import { handlePickerMessage } from './element-picker';

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

// Listen for messages from popup and service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // DOM serialization request
  if (message.type === 'SERIALIZE_DOM') {
    const serialized = serializeForLLM(message.userRequest || '');
    sendResponse({ serializedDOM: serialized });
    return true;
  }

  // Element picker messages
  if (handlePickerMessage(message, sendResponse)) {
    return true;
  }

  return true;
});
