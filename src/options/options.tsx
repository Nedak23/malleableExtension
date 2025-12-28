import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { CSSRule, ClaudeModel, DomainRules, UserSettings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';

function App() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [apiStatus, setApiStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [domains, setDomains] = useState<Record<string, DomainRules>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // Load settings
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (settingsResponse?.settings) {
      setSettings(settingsResponse.settings);
    }

    // Check if API key exists
    const keyResponse = await chrome.runtime.sendMessage({ type: 'CHECK_API_KEY' });
    if (keyResponse?.hasKey) {
      setApiKey('••••••••••••••••');
    }

    // Load all rules
    const rulesResponse = await chrome.runtime.sendMessage({ type: 'GET_ALL_RULES' });
    if (rulesResponse?.domains) {
      setDomains(rulesResponse.domains);
    }
  }

  async function handleSaveApiKey() {
    if (!apiKey || apiKey === '••••••••••••••••') {
      setApiStatus({ type: 'error', message: 'Please enter an API key' });
      return;
    }

    try {
      await chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', apiKey });
      setApiStatus({ type: 'success', message: 'API key saved!' });
      setApiKey('••••••••••••••••');
      setTimeout(() => setApiStatus(null), 3000);
    } catch {
      setApiStatus({ type: 'error', message: 'Failed to save API key' });
    }
  }

  async function handleSettingsChange(updates: Partial<UserSettings>) {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: updates });
  }

  async function handleToggleRule(domain: string, ruleId: string, enabled: boolean) {
    const currentRule = domains[domain]?.rules.find(r => r.id === ruleId);
    if (!currentRule) return;

    let updates: Partial<CSSRule>;

    if (enabled) {
      // Re-enabling: restore previous status (or default to 'active')
      const status = currentRule.previousStatus || 'active';
      updates = { enabled, status, previousStatus: undefined };
    } else {
      // Disabling: save current status before setting to 'disabled'
      // If already disabled, preserve the existing previousStatus
      const previousStatus = currentRule.status === 'disabled'
        ? currentRule.previousStatus || 'active'
        : (currentRule.status as 'active' | 'broken');
      updates = { enabled, status: 'disabled', previousStatus };
    }

    await chrome.runtime.sendMessage({
      type: 'UPDATE_RULE',
      domain,
      ruleId,
      updates,
    });

    setDomains(prev => ({
      ...prev,
      [domain]: {
        ...prev[domain],
        rules: prev[domain].rules.map(r =>
          r.id === ruleId ? { ...r, ...updates } : r
        ),
      },
    }));
  }

  async function handleDeleteRule(domain: string, ruleId: string) {
    if (!confirm('Delete this rule?')) return;

    await chrome.runtime.sendMessage({
      type: 'DELETE_RULE',
      domain,
      ruleId,
    });

    setDomains(prev => {
      const updated = { ...prev };
      if (updated[domain]) {
        updated[domain] = {
          ...updated[domain],
          rules: updated[domain].rules.filter(r => r.id !== ruleId),
        };
        if (updated[domain].rules.length === 0) {
          delete updated[domain];
        }
      }
      return updated;
    });
  }

  async function handleRegenerateRule(domain: string, ruleId: string) {
    // Find a tab with this domain
    const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });
    const wwwTabs = await chrome.tabs.query({ url: `*://www.${domain}/*` });
    const allTabs = [...tabs, ...wwwTabs];

    if (allTabs.length === 0) {
      alert(`Please open ${domain} in a tab first, then try regenerating.`);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'REGENERATE_RULE',
      domain,
      ruleId,
      tabId: allTabs[0].id,
    });

    if (response.success) {
      await loadData();
    } else {
      alert(`Failed to regenerate: ${response.error}`);
    }
  }

  function exportRules() {
    const data = JSON.stringify(domains, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'malleableweb-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importRules() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Record<string, DomainRules>;

        // Save each domain's rules
        for (const [domain, domainRules] of Object.entries(imported)) {
          for (const rule of domainRules.rules) {
            await chrome.runtime.sendMessage({
              type: 'UPDATE_RULE',
              domain,
              ruleId: rule.id,
              updates: rule,
            });
          }
        }

        await loadData();
        alert('Rules imported successfully!');
      } catch {
        alert('Failed to import rules. Please check the file format.');
      }
    };
    input.click();
  }

  // Filter rules
  const allRules: Array<{ domain: string; rule: CSSRule }> = [];
  for (const [domain, domainRules] of Object.entries(domains)) {
    for (const rule of domainRules.rules) {
      if (domainFilter !== 'all' && domain !== domainFilter) continue;
      if (statusFilter !== 'all' && rule.status !== statusFilter) continue;
      // Search by ruleName (or fall back to userRequest for older rules without names)
      const searchTarget = (rule.ruleName || rule.userRequest).toLowerCase();
      if (searchQuery && !searchTarget.includes(searchQuery.toLowerCase())) continue;
      allRules.push({ domain, rule });
    }
  }

  const uniqueDomains = Object.keys(domains);

  return (
    <div>
      <header>
        <h1>MalleableWeb Settings</h1>
      </header>

      <section class="section">
        <h2>API Configuration</h2>

        <div class="form-group">
          <label htmlFor="model">Model</label>
          <select
            id="model"
            value={settings.model}
            onChange={e => handleSettingsChange({ model: (e.target as HTMLSelectElement).value as ClaudeModel })}
          >
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fast)</option>
            <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Balanced)</option>
            <option value="claude-opus-4-5-20251101">Claude Opus 4.5 (Most Capable)</option>
          </select>
        </div>

        <div class="form-group">
          <label htmlFor="api-key">API Key</label>
          <input
            type="password"
            id="api-key"
            value={apiKey}
            onInput={e => setApiKey((e.target as HTMLInputElement).value)}
            placeholder="Enter your API key"
          />
          <p class="help-text">
            Your API key is encrypted and stored locally.{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank">Get an Anthropic API key</a>
          </p>
        </div>

        <div class="button-row">
          <button class="btn btn-primary" onClick={handleSaveApiKey}>
            Save API Key
          </button>
          {apiStatus && (
            <span class={`status-message status-${apiStatus.type}`}>
              {apiStatus.message}
            </span>
          )}
        </div>
      </section>

      <section class="section">
        <h2>Preferences</h2>

        <div class="toggle-group">
          <label class="toggle-label">
            <span class="toggle">
              <input
                type="checkbox"
                checked={settings.notifyOnFailure}
                onChange={e => handleSettingsChange({ notifyOnFailure: (e.target as HTMLInputElement).checked })}
              />
              <span class="toggle-slider"></span>
            </span>
            <span>Notify when rules stop working</span>
          </label>
          <p class="toggle-description">Show a notification when a rule fails to apply</p>
        </div>
      </section>

      <section class="section">
        <h2>Manage Rules</h2>

        <div class="filter-bar">
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onInput={e => setSearchQuery((e.target as HTMLInputElement).value)}
          />
          <select
            value={domainFilter}
            onChange={e => setDomainFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="all">All domains</option>
            {uniqueDomains.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="broken">Broken</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        <div class="rules-list">
          {allRules.length === 0 ? (
            <div class="empty-state">
              <p>No rules found</p>
            </div>
          ) : (
            allRules.map(({ domain, rule }) => (
              <div key={rule.id} class="rule-item rule-item-compact">
                <div class="rule-row">
                  <label class="toggle toggle-small">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={e => handleToggleRule(domain, rule.id, (e.target as HTMLInputElement).checked)}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                  <span class="rule-domain">{domain}</span>
                  <span class={`rule-status rule-status-${rule.status}`}>
                    {rule.status}
                  </span>
                  {rule.status === 'broken' && (
                    <button
                      class="btn btn-small btn-secondary"
                      onClick={() => handleRegenerateRule(domain, rule.id)}
                    >
                      Regen
                    </button>
                  )}
                  <button
                    class="btn btn-small btn-danger-text"
                    onClick={() => handleDeleteRule(domain, rule.id)}
                    title="Delete rule"
                  >
                    Delete
                  </button>
                </div>
                <div class="rule-details">
                  <span class="rule-request">{rule.ruleName || rule.userRequest}</span>
                  <span class="rule-date">{new Date(rule.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div class="bulk-actions">
          <button class="btn btn-secondary" onClick={exportRules}>
            Export Rules
          </button>
          <button class="btn btn-secondary" onClick={importRules}>
            Import Rules
          </button>
        </div>
      </section>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
