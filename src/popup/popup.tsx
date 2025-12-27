import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { CSSRule } from '../shared/types';

interface ChatMessage {
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  ruleId?: string;
  undone?: boolean;
}

// Icons as inline SVGs
const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v4m0 14v4M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M1 12h4m14 0h4M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [domain, setDomain] = useState('');
  const [ruleCount, setRuleCount] = useState(0);
  const [hasApiKey, setHasApiKey] = useState(true);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  async function init() {
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const url = new URL(tab.url);
      const d = url.hostname.replace(/^www\./, '');
      setDomain(d);
    }

    // Check API key
    const keyResponse = await chrome.runtime.sendMessage({ type: 'CHECK_API_KEY' });
    setHasApiKey(keyResponse?.hasKey || false);

    if (!keyResponse?.hasKey) {
      setMessages([
        {
          type: 'system',
          content: 'Please configure your API key in settings to get started.',
        },
      ]);
    }

    // Load rule count
    await updateRuleCount();
  }

  async function updateRuleCount() {
    if (!domain) return;
    const response = await chrome.runtime.sendMessage({
      type: 'GET_RULES_FOR_DOMAIN',
      domain,
    });
    const count = response?.rules?.filter((r: CSSRule) => r.enabled)?.length || 0;
    setRuleCount(count);
  }

  async function handleSend() {
    const request = input.trim();
    if (!request || isProcessing) return;

    setIsProcessing(true);
    setInput('');

    // Add user message
    setMessages(prev => [...prev, { type: 'user', content: request }]);

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');

      // Send request to service worker
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_CSS',
        request,
        domain,
        url: tab.url,
        title: tab.title,
        tabId: tab.id,
      });

      if (response.success) {
        setMessages(prev => [
          ...prev,
          {
            type: 'assistant',
            content: response.explanation || 'Done!',
            ruleId: response.ruleId,
          },
        ]);
        await updateRuleCount();
      } else {
        setMessages(prev => [
          ...prev,
          {
            type: 'error',
            content: response.error || 'Failed to generate CSS',
          },
        ]);
      }
    } catch (error) {
      setMessages(prev => [
        ...prev,
        {
          type: 'error',
          content: error instanceof Error ? error.message : 'An error occurred',
        },
      ]);
    }

    setIsProcessing(false);
  }

  async function handleUndo(index: number, ruleId: string) {
    await chrome.runtime.sendMessage({
      type: 'DELETE_RULE',
      domain,
      ruleId,
    });

    setMessages(prev =>
      prev.map((msg, i) => (i === index ? { ...msg, undone: true } : msg))
    );

    await updateRuleCount();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleExampleClick(request: string) {
    setInput(request);
    inputRef.current?.focus();
  }

  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  const showWelcome = messages.length === 0 || (messages.length === 1 && messages[0].type === 'system');

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
              <span class="domain">{domain}</span>
            </>
          )}
        </div>
        <button class="icon-btn" onClick={openSettings} title="Settings">
          <SettingsIcon />
        </button>
      </header>

      <main class="chat-container">
        <div class="messages" ref={messagesRef}>
          {messages.map((msg, i) => (
            <div key={i} class={`message message-${msg.type} ${msg.undone ? 'undone' : ''}`}>
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

          {showWelcome && hasApiKey && (
            <div class="welcome-message">
              <p>Tell me how you'd like to customize this page.</p>
              <div class="examples">
                <button class="example-btn" onClick={() => handleExampleClick('Hide ads')}>
                  Hide ads
                </button>
                <button class="example-btn" onClick={() => handleExampleClick('Make text larger')}>
                  Larger text
                </button>
                <button class="example-btn" onClick={() => handleExampleClick('Dark mode')}>
                  Dark mode
                </button>
                <button class="example-btn" onClick={() => handleExampleClick('Hide sidebar')}>
                  Hide sidebar
                </button>
              </div>
            </div>
          )}
        </div>

        <div class="active-rules">
          <span>{ruleCount} rule{ruleCount !== 1 ? 's' : ''} active</span>
          <button class="text-btn" onClick={openSettings}>
            Manage
          </button>
        </div>
      </main>

      <footer class="input-area">
        <div class="input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onInput={e => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Hide the shorts section..."
            rows={1}
            disabled={isProcessing}
          />
          <button
            class="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
          >
            <SendIcon />
          </button>
        </div>
      </footer>
    </>
  );
}

render(<App />, document.getElementById('app')!);
