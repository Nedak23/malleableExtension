import { ValidationResult, CSSRule } from '../shared/types';
import { extractDomain } from '../shared/storage';
import { VALIDATION_INTERVAL_MS, VALIDATION_DEBOUNCE_MS } from '../shared/constants';

export class RuleValidator {
  private observer: MutationObserver | null = null;
  private validationInterval: number | null = null;
  private ruleSelectors: Map<string, string[]> = new Map();
  private lastValidation: Map<string, boolean> = new Map();
  private debounceTimer: number | null = null;

  async start(): Promise<void> {
    // Get rules for this domain
    const domain = extractDomain(window.location.hostname);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_RULES_FOR_DOMAIN',
        domain,
      });

      if (!response?.rules?.length) return;

      // Store selectors for validation
      for (const rule of response.rules as CSSRule[]) {
        if (rule.enabled && rule.status !== 'disabled') {
          this.ruleSelectors.set(rule.id, rule.selectors);
        }
      }

      if (this.ruleSelectors.size === 0) return;

      // Initial validation (after page loads)
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => this.validateAll(), 1000);
        });
      } else {
        setTimeout(() => this.validateAll(), 1000);
      }

      // Periodic validation
      this.validationInterval = window.setInterval(() => {
        this.validateAll();
      }, VALIDATION_INTERVAL_MS);

      // MutationObserver for dynamic content
      this.setupObserver();
    } catch (error) {
      console.debug('[MalleableWeb] Failed to start validator:', error);
    }
  }

  private setupObserver(): void {
    this.observer = new MutationObserver(mutations => {
      // Debounce to avoid excessive validation
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = window.setTimeout(() => {
        // Check if any mutations are relevant
        const relevantChange = mutations.some(
          m =>
            m.type === 'childList' ||
            (m.type === 'attributes' &&
              (m.attributeName === 'class' || m.attributeName === 'style'))
        );

        if (relevantChange) {
          this.validateAll();
        }
      }, VALIDATION_DEBOUNCE_MS);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }

  private validateAll(): void {
    const failures: string[] = [];

    for (const [ruleId, selectors] of this.ruleSelectors) {
      let ruleValid = false;

      for (const selector of selectors) {
        const result = this.validateSelector(ruleId, selector);

        // Track state changes
        const key = `${ruleId}:${selector}`;
        const wasValid = this.lastValidation.get(key);
        const isValid = result.status === 'valid';

        this.lastValidation.set(key, isValid);

        if (isValid) {
          ruleValid = true;
        }

        // Selector stopped working
        if (wasValid === true && !isValid) {
          console.debug(`[MalleableWeb] Selector failed: ${selector}`);
        }
      }

      // If no selectors work for this rule, it's broken
      if (!ruleValid && this.lastValidation.size > 0) {
        failures.push(ruleId);
      }
    }

    // Report failures to service worker
    if (failures.length > 0) {
      chrome.runtime.sendMessage({
        type: 'RULE_VALIDATION_FAILURE',
        domain: extractDomain(window.location.hostname),
        failedRuleIds: [...new Set(failures)],
        url: window.location.href,
      }).catch(() => {
        // Extension context may be invalidated
      });
    }
  }

  private validateSelector(ruleId: string, selector: string): ValidationResult {
    try {
      const elements = document.querySelectorAll(selector);
      const matchCount = elements.length;

      if (matchCount === 0) {
        return { ruleId, selector, status: 'invalid', matchCount: 0, hiddenCount: 0 };
      }

      // Count how many are actually hidden
      let hiddenCount = 0;
      elements.forEach(el => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') {
          hiddenCount++;
        }
      });

      // For hiding rules, all matches should be hidden
      if (hiddenCount === matchCount) {
        return { ruleId, selector, status: 'valid', matchCount, hiddenCount };
      } else if (hiddenCount > 0) {
        return { ruleId, selector, status: 'partial', matchCount, hiddenCount };
      } else {
        // Elements exist but aren't hidden - CSS might not be working
        return { ruleId, selector, status: 'invalid', matchCount, hiddenCount };
      }
    } catch {
      // Invalid selector syntax
      return { ruleId, selector, status: 'invalid', matchCount: 0, hiddenCount: 0 };
    }
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
