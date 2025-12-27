import { Message, CSSRule, LLMResponse, ChatMessage } from '../shared/types';
import { llmClient } from './llm-client';
import {
  getCSSForDomain,
  getRulesForDomain,
  getAllRules,
  saveRule,
  deleteRule,
  updateRule,
  getRule,
  hasApiKey,
  saveApiKey,
  getSettings,
  saveSettings,
  generateId,
  extractDomain,
  getChatMessages,
  saveChatMessages,
  clearChatMessages,
} from '../shared/storage';
import { WARNING_THRESHOLD, BROKEN_THRESHOLD } from '../shared/constants';

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'GET_CSS_FOR_DOMAIN': {
      const domain = message.domain as string;
      return await getCSSForDomain(domain);
    }

    case 'GET_RULES_FOR_DOMAIN': {
      const domain = message.domain as string;
      const rules = await getRulesForDomain(domain);
      return { rules };
    }

    case 'GET_ALL_RULES': {
      const domains = await getAllRules();
      return { domains };
    }

    case 'GENERATE_CSS': {
      return await handleGenerateCSS(message);
    }

    case 'REGENERATE_RULE': {
      return await handleRegenerateRule(message);
    }

    case 'UPDATE_RULE': {
      const domain = message.domain as string;
      const ruleId = message.ruleId as string;
      const updates = message.updates as Partial<CSSRule>;
      await updateRule(domain, ruleId, updates);
      await notifyTabsOfUpdate(domain);
      return { success: true };
    }

    case 'DELETE_RULE': {
      const domain = message.domain as string;
      const ruleId = message.ruleId as string;
      await deleteRule(domain, ruleId);
      await notifyTabsOfUpdate(domain);
      return { success: true };
    }

    case 'RULE_VALIDATION_FAILURE': {
      await handleValidationFailure(message);
      return { success: true };
    }

    case 'CHECK_API_KEY': {
      const hasKey = await hasApiKey();
      return { hasKey };
    }

    case 'SAVE_API_KEY': {
      const apiKey = message.apiKey as string;
      await saveApiKey(apiKey);
      return { success: true };
    }

    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { settings };
    }

    case 'SAVE_SETTINGS': {
      const settings = message.settings as Partial<typeof message.settings>;
      await saveSettings(settings);
      return { success: true };
    }

    case 'GET_CHAT_MESSAGES': {
      const domain = message.domain as string;
      const ruleId = message.ruleId as string;
      const messages = await getChatMessages(domain, ruleId);
      return { messages };
    }

    case 'SAVE_CHAT_MESSAGES': {
      const domain = message.domain as string;
      const ruleId = message.ruleId as string;
      const messages = (message.messages as ChatMessage[]) ?? [];
      await saveChatMessages(domain, ruleId, messages);
      return { success: true };
    }

    case 'CLEAR_CHAT_MESSAGES': {
      const domain = message.domain as string;
      const ruleId = message.ruleId as string;
      await clearChatMessages(domain, ruleId);
      return { success: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

async function handleGenerateCSS(message: Message): Promise<{
  success: boolean;
  ruleId?: string;
  explanation?: string;
  error?: string;
}> {
  const request = message.request as string;
  const domain = message.domain as string;
  const url = message.url as string;
  const title = message.title as string;
  const tabId = message.tabId as number;
  const initialMessages = message.initialMessages as ChatMessage[] | undefined;

  try {
    // Get serialized DOM from content script
    let domResponse;
    try {
      domResponse = await chrome.tabs.sendMessage(tabId, {
        type: 'SERIALIZE_DOM',
        userRequest: request,
      });
    } catch (err) {
      // Content script not loaded - user needs to refresh the page
      return {
        success: false,
        error: 'Please refresh the page and try again. The extension needs to load first.',
      };
    }

    if (!domResponse?.serializedDOM) {
      return { success: false, error: 'Failed to serialize page DOM' };
    }

    // Call LLM to generate CSS
    const llmResponse: LLMResponse = await llmClient.generateCSS(
      request,
      url,
      title,
      domResponse.serializedDOM
    );

    if (!llmResponse.success || !llmResponse.css) {
      return {
        success: false,
        error: llmResponse.error || 'Failed to generate CSS',
      };
    }

    // Create the rule ID first so we can include it in the assistant message
    const ruleId = generateId();
    const explanation = llmResponse.explanation || 'CSS applied successfully';

    // Build chat messages including the assistant response
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      type: 'assistant',
      content: explanation,
      timestamp: Date.now(),
      ruleId: ruleId,
    };

    const chatMessages = initialMessages
      ? [...initialMessages, assistantMessage]
      : [assistantMessage];

    // Create and save the rule
    const rule: CSSRule = {
      id: ruleId,
      userRequest: request,
      generatedCSS: llmResponse.css,
      selectors: llmResponse.selectors || [],
      selectorStrategies: [], // Could be extracted from selectors
      enabled: true,
      status: 'active',
      failureCount: 0,
      confidence: llmResponse.confidence || 0.8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastValidated: null,
      chatMessages: chatMessages,
    };

    await saveRule(domain, rule);

    // Inject CSS into the current tab
    await notifyTabsOfUpdate(domain);

    return {
      success: true,
      ruleId: rule.id,
      explanation: explanation,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleRegenerateRule(message: Message): Promise<{
  success: boolean;
  error?: string;
}> {
  const domain = message.domain as string;
  const ruleId = message.ruleId as string;
  const tabId = message.tabId as number;

  try {
    const rule = await getRule(domain, ruleId);
    if (!rule) {
      return { success: false, error: 'Rule not found' };
    }

    // Get fresh DOM from content script
    const domResponse = await chrome.tabs.sendMessage(tabId, {
      type: 'SERIALIZE_DOM',
      userRequest: rule.userRequest,
    });

    if (!domResponse?.serializedDOM) {
      return { success: false, error: 'Failed to serialize page DOM' };
    }

    // Get tab info
    const tab = await chrome.tabs.get(tabId);

    // Call LLM to regenerate CSS
    const llmResponse: LLMResponse = await llmClient.generateCSS(
      rule.userRequest,
      tab.url || '',
      tab.title || '',
      domResponse.serializedDOM
    );

    if (!llmResponse.success || !llmResponse.css) {
      return {
        success: false,
        error: llmResponse.error || 'Failed to regenerate CSS',
      };
    }

    // Update the rule
    await updateRule(domain, ruleId, {
      generatedCSS: llmResponse.css,
      selectors: llmResponse.selectors || [],
      confidence: llmResponse.confidence || 0.8,
      status: 'active',
      failureCount: 0,
      lastValidated: Date.now(),
    });

    // Inject updated CSS
    await notifyTabsOfUpdate(domain);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleValidationFailure(message: Message): Promise<void> {
  const domain = message.domain as string;
  const failedRuleIds = message.failedRuleIds as string[];

  const settings = await getSettings();

  for (const ruleId of failedRuleIds) {
    const rule = await getRule(domain, ruleId);
    if (!rule) continue;

    // Increment failure count
    const failureCount = rule.failureCount + 1;
    let status = rule.status;

    if (failureCount >= BROKEN_THRESHOLD) {
      status = 'broken';
    } else if (failureCount >= WARNING_THRESHOLD) {
      status = 'warning';
    }

    await updateRule(domain, ruleId, { failureCount, status });

    // Notify user if enabled and rule is now broken
    if (settings.notifyOnFailure && status === 'broken' && rule.status !== 'broken') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon48.png',
        title: 'MalleableWeb Rule Issue',
        message: `Rule "${rule.userRequest.slice(0, 50)}" on ${domain} stopped working.`,
      });
    }
  }
}

async function notifyTabsOfUpdate(domain: string): Promise<void> {
  const { css, ruleIds } = await getCSSForDomain(domain);

  // Find all tabs matching this domain
  const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });
  const wwwTabs = await chrome.tabs.query({ url: `*://www.${domain}/*` });
  const allTabs = [...tabs, ...wwwTabs];

  // Send updated CSS to each tab
  for (const tab of allTabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'INJECT_CSS',
        css,
        ruleIds,
      }).catch(() => {
        // Tab may not have content script loaded
      });
    }
  }
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});
