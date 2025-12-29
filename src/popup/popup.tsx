import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { CSSRule, ChatMessage } from '../shared/types';

// Icons as inline SVGs
const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

function App() {
  const [rules, setRules] = useState<CSSRule[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null); // rule ID or null for new
  const [draftMessages, setDraftMessages] = useState<ChatMessage[]>([]);
  const [showNewTabPicker, setShowNewTabPicker] = useState(false);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [domain, setDomain] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Get messages for current tab
  const activeMessages = activeTabId === null
    ? draftMessages
    : (rules.find(r => r.id === activeTabId)?.chatMessages || []);

  // Get rule count
  const ruleCount = rules.filter(r => r.enabled).length;

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [activeMessages]);

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowNewTabPicker(false);
      }
    }
    if (showNewTabPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNewTabPicker]);

  async function init() {
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const url = new URL(tab.url);
      const d = url.hostname.replace(/^www\./, '');
      setDomain(d);
      await loadRulesForDomain(d);
    }

    // Check API key
    const keyResponse = await chrome.runtime.sendMessage({ type: 'CHECK_API_KEY' });
    setHasApiKey(keyResponse?.hasKey || false);
  }

  async function loadRulesForDomain(d: string, skipAutoSelect = false) {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_RULES_FOR_DOMAIN',
      domain: d,
    });
    const domainRules = response?.rules || [];
    setRules(domainRules);

    // Skip auto-select when called after creating a rule (caller will set activeTabId)
    if (skipAutoSelect) return;

    // If there are rules, select the most recently updated one
    if (domainRules.length > 0) {
      const sorted = [...domainRules].sort((a: CSSRule, b: CSSRule) => b.updatedAt - a.updatedAt);
      const mostRecent = sorted[0];
      // Only auto-select if it has chat messages
      if (mostRecent.chatMessages && mostRecent.chatMessages.length > 0) {
        setActiveTabId(mostRecent.id);
      } else {
        // Otherwise start with new tab
        setActiveTabId(null);
      }
    }
  }

  const MAX_REQUEST_LENGTH = 2000;

  async function handleSend() {
    const request = input.trim();
    if (!request || isProcessing) return;

    // Validate request length
    if (request.length > MAX_REQUEST_LENGTH) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'error',
        content: `Request is too long (${request.length} characters). Please keep it under ${MAX_REQUEST_LENGTH} characters.`,
        timestamp: Date.now(),
      };

      if (activeTabId === null) {
        setDraftMessages(prev => [...prev, errorMessage]);
      } else {
        setRules(prev => prev.map(r =>
          r.id === activeTabId
            ? { ...r, chatMessages: [...(r.chatMessages || []), errorMessage] }
            : r
        ));
      }
      return;
    }

    setIsProcessing(true);
    setInput('');

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: request,
      timestamp: Date.now(),
    };

    // Add to appropriate message store
    if (activeTabId === null) {
      setDraftMessages(prev => [...prev, userMessage]);
    } else {
      // Update local state immediately
      const currentRule = rules.find(r => r.id === activeTabId);
      const messagesWithUser = [...(currentRule?.chatMessages || []), userMessage];

      setRules(prev => prev.map(r =>
        r.id === activeTabId
          ? { ...r, chatMessages: messagesWithUser }
          : r
      ));

      // Persist immediately so message survives popup close
      await chrome.runtime.sendMessage({
        type: 'SAVE_CHAT_MESSAGES',
        domain,
        ruleId: activeTabId,
        messages: messagesWithUser,
      });
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');

      // Collect all messages to send for context
      const allMessages = activeTabId === null
        ? [...draftMessages, userMessage]
        : [...(rules.find(r => r.id === activeTabId)?.chatMessages || []), userMessage];

      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_CSS',
        request,
        domain,
        url: tab.url,
        title: tab.title,
        tabId: tab.id,
        initialMessages: activeTabId === null ? allMessages : undefined,
      });

      if (response.success) {
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          type: 'assistant',
          content: response.explanation || 'Done!',
          timestamp: Date.now(),
          ruleId: response.ruleId,
        };

        if (activeTabId === null) {
          // New rule was created - migrate draft to the new rule
          // Note: draftMessages already contains userMessage from the setDraftMessages call above
          const newMessages = [...draftMessages, userMessage, assistantMessage];

          // Save messages to the new rule
          await chrome.runtime.sendMessage({
            type: 'SAVE_CHAT_MESSAGES',
            domain,
            ruleId: response.ruleId,
            messages: newMessages,
          });

          // Clear draft and reload rules (skip auto-select since we set it explicitly)
          setDraftMessages([]);
          await loadRulesForDomain(domain, true);
          setActiveTabId(response.ruleId);
        } else {
          // Existing tab - append only the assistant message (user message already added above)
          setRules(prev => prev.map(r =>
            r.id === activeTabId
              ? { ...r, chatMessages: [...(r.chatMessages || []), assistantMessage] }
              : r
          ));

          // Persist the complete message history including the already-saved user message
          const currentRule = rules.find(r => r.id === activeTabId);
          const updatedMessages = [...(currentRule?.chatMessages || []), userMessage, assistantMessage];

          await chrome.runtime.sendMessage({
            type: 'SAVE_CHAT_MESSAGES',
            domain,
            ruleId: activeTabId,
            messages: updatedMessages,
          });
        }
      } else {
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          type: 'error',
          content: response.error || 'Failed to generate CSS',
          timestamp: Date.now(),
        };

        if (activeTabId === null) {
          setDraftMessages(prev => [...prev, errorMessage]);
        } else {
          setRules(prev => prev.map(r =>
            r.id === activeTabId
              ? { ...r, chatMessages: [...(r.chatMessages || []), errorMessage] }
              : r
          ));
        }
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'error',
        content: error instanceof Error ? error.message : 'An error occurred',
        timestamp: Date.now(),
      };

      if (activeTabId === null) {
        setDraftMessages(prev => [...prev, errorMessage]);
      } else {
        setRules(prev => prev.map(r =>
          r.id === activeTabId
            ? { ...r, chatMessages: [...(r.chatMessages || []), errorMessage] }
            : r
        ));
      }
    }

    setIsProcessing(false);
  }

  async function handleUndo(messageIndex: number, ruleId: string) {
    await chrome.runtime.sendMessage({
      type: 'DELETE_RULE',
      domain,
      ruleId,
    });

    // Mark message as undone
    if (activeTabId === null) {
      setDraftMessages(prev =>
        prev.map((msg, i) => (i === messageIndex ? { ...msg, undone: true } : msg))
      );
    } else {
      setRules(prev => prev.map(r =>
        r.id === activeTabId
          ? {
              ...r,
              chatMessages: r.chatMessages.map((msg, i) =>
                i === messageIndex ? { ...msg, undone: true } : msg
              ),
            }
          : r
      ));
    }

    // Reload rules since one was deleted
    await loadRulesForDomain(domain);

    // If the deleted rule was the active tab, switch to new tab
    if (activeTabId === ruleId) {
      setActiveTabId(null);
    }
  }

  async function handleCloseTab(ruleId: string) {
    // Clear chat messages for this rule
    await chrome.runtime.sendMessage({
      type: 'CLEAR_CHAT_MESSAGES',
      domain,
      ruleId,
    });

    // Update local state
    setRules(prev => prev.map(r =>
      r.id === ruleId ? { ...r, chatMessages: [] } : r
    ));

    // Switch to new tab if this was the active one
    if (activeTabId === ruleId) {
      setActiveTabId(null);
    }
  }

  function handleNewTabSelect(ruleId: string | null) {
    setActiveTabId(ruleId);
    setShowNewTabPicker(false);
    if (ruleId === null) {
      setDraftMessages([]);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  // Rules with chat messages (open tabs)
  const openTabs = rules.filter(r => r.chatMessages && r.chatMessages.length > 0);

  // Rules without chat messages (available to open)
  const closedRules = rules.filter(r => !r.chatMessages || r.chatMessages.length === 0);

  const showWelcome = activeMessages.length === 0 && hasApiKey;

  return (
    <>
      <header class="header">
        <div class="site-info">
          {domain && (
            <>
              <img
                class="favicon"
                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                alt=""
              />
              <span class="domain" title={domain}>{domain}</span>
            </>
          )}
        </div>
        <div class="header-right">
          <div class="active-rules">
            <span>{ruleCount} rule{ruleCount !== 1 ? 's' : ''} active</span>
            <button class="text-btn" onClick={openSettings}>
              Manage
            </button>
          </div>
          <button class="icon-btn" onClick={openSettings} title="Settings">
            <SettingsIcon />
          </button>
        </div>
      </header>

      {/* Tab bar - show only if there are multiple tabs or existing rules to switch between */}
      {(openTabs.length > 0 || draftMessages.length > 0 || closedRules.length > 0) && (
        <div class="tab-bar">
          <div class="tabs-scroll">
            {/* New tab (draft) */}
            {(activeTabId === null || draftMessages.length > 0) && (
              <button
                class={`tab ${activeTabId === null ? 'active' : ''}`}
                onClick={() => setActiveTabId(null)}
              >
                <span>New rule</span>
              </button>
            )}
            {/* Existing rule tabs */}
            {openTabs.map(rule => (
              <button
                key={rule.id}
                class={`tab ${activeTabId === rule.id ? 'active' : ''}`}
                onClick={() => setActiveTabId(rule.id)}
                title={rule.ruleName || rule.userRequest}
              >
                <span>{truncate(rule.ruleName || rule.userRequest, 15)}</span>
                <span
                  class="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(rule.id);
                  }}
                >
                  <CloseIcon />
                </span>
              </button>
            ))}
          </div>
          <div class="new-tab-wrapper" ref={pickerRef}>
            <button
              class="new-tab-btn"
              onClick={() => setShowNewTabPicker(!showNewTabPicker)}
              title="New chat"
            >
              <PlusIcon />
            </button>
            {showNewTabPicker && (
              <div class="new-tab-picker">
                <div
                  class="picker-option"
                  onClick={() => handleNewTabSelect(null)}
                >
                  + Create new rule
                </div>
                {closedRules.length > 0 && (
                  <>
                    <div class="picker-divider">Edit existing rule</div>
                    {closedRules.map(rule => (
                      <div
                        key={rule.id}
                        class="picker-option"
                        onClick={() => handleNewTabSelect(rule.id)}
                      >
                        {truncate(rule.ruleName || rule.userRequest, 30)}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <main class="chat-container">
        <div class="messages" ref={messagesRef}>
          {activeMessages.map((msg, i) => (
            <div key={msg.id || i} class={`message message-${msg.type} ${msg.undone ? 'undone' : ''}`}>
              <div class="message-content">{msg.content}</div>
              {msg.ruleId && !msg.undone && (
                <button class="undo-btn" onClick={() => handleUndo(i, msg.ruleId!)}>
                  Undo
                </button>
              )}
            </div>
          ))}

          {isProcessing && (
            <div class="message message-loading">
              <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          {!hasApiKey && (
            <div class="message message-system">
              <div class="message-content">
                Please configure your API key in settings to get started.
              </div>
            </div>
          )}

          {showWelcome && (
            <div class="welcome-message">
              <p>Tell me how you'd like to customize this page.</p>
            </div>
          )}
        </div>
      </main>

      <footer class="input-area">
        <div class="input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onInput={e => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? "Message" : "API key required - check settings"}
            rows={1}
            disabled={isProcessing || !hasApiKey}
          />
          <button
            class="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isProcessing || !hasApiKey}
          >
            <SendIcon />
          </button>
        </div>
      </footer>
    </>
  );
}

render(<App />, document.getElementById('app')!);
