import {
  StorageSchema,
  DomainRules,
  CSSRule,
  UserSettings,
  ChatMessage,
} from './types';
import {
  STORAGE_KEY,
  API_KEY_STORAGE_KEY,
  CRYPTO_KEY_SESSION_KEY,
  DEFAULT_SETTINGS,
} from './constants';

// Generate a UUID for rule IDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Get the full storage schema
async function getSchema(): Promise<StorageSchema> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || { domains: {}, settings: DEFAULT_SETTINGS };
}

// Save the full storage schema
async function saveSchema(schema: StorageSchema): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: schema });
}

// Get rules for a specific domain
export async function getRulesForDomain(domain: string): Promise<CSSRule[]> {
  const schema = await getSchema();
  return schema.domains[domain]?.rules || [];
}

// Get combined CSS for a domain (only enabled, active rules)
export async function getCSSForDomain(domain: string): Promise<{ css: string; ruleIds: string[] }> {
  const rules = await getRulesForDomain(domain);
  const enabledRules = rules.filter(r => r.enabled && r.status !== 'disabled');

  const css = enabledRules.map(r => r.generatedCSS).join('\n\n');
  const ruleIds = enabledRules.map(r => r.id);

  return { css, ruleIds };
}

// Save or update a rule
export async function saveRule(domain: string, rule: CSSRule): Promise<void> {
  const schema = await getSchema();

  if (!schema.domains[domain]) {
    schema.domains[domain] = {
      domain,
      rules: [],
      lastAccessed: Date.now(),
    };
  }

  // Ensure chatMessages array exists (without mutating the original)
  const ruleToSave = rule.chatMessages ? rule : { ...rule, chatMessages: [] };

  const existingIndex = schema.domains[domain].rules.findIndex(r => r.id === ruleToSave.id);
  if (existingIndex >= 0) {
    schema.domains[domain].rules[existingIndex] = ruleToSave;
  } else {
    schema.domains[domain].rules.push(ruleToSave);
  }

  schema.domains[domain].lastAccessed = Date.now();
  await saveSchema(schema);
}

// Get a specific rule
export async function getRule(domain: string, ruleId: string): Promise<CSSRule | null> {
  const rules = await getRulesForDomain(domain);
  return rules.find(r => r.id === ruleId) || null;
}

// Delete a rule
export async function deleteRule(domain: string, ruleId: string): Promise<void> {
  const schema = await getSchema();

  if (schema.domains[domain]) {
    schema.domains[domain].rules = schema.domains[domain].rules.filter(
      r => r.id !== ruleId
    );

    // Clean up empty domains
    if (schema.domains[domain].rules.length === 0) {
      delete schema.domains[domain];
    }

    await saveSchema(schema);
  }
}

// Update rule properties
export async function updateRule(
  domain: string,
  ruleId: string,
  updates: Partial<CSSRule>
): Promise<void> {
  const schema = await getSchema();

  if (schema.domains[domain]) {
    const ruleIndex = schema.domains[domain].rules.findIndex(r => r.id === ruleId);
    if (ruleIndex >= 0) {
      schema.domains[domain].rules[ruleIndex] = {
        ...schema.domains[domain].rules[ruleIndex],
        ...updates,
        updatedAt: Date.now(),
      };
      await saveSchema(schema);
    }
  }
}

// Get chat messages for a specific rule
export async function getChatMessages(domain: string, ruleId: string): Promise<ChatMessage[]> {
  const rule = await getRule(domain, ruleId);
  return rule?.chatMessages || [];
}

// Save chat messages for a rule
export async function saveChatMessages(
  domain: string,
  ruleId: string,
  messages: ChatMessage[]
): Promise<void> {
  await updateRule(domain, ruleId, { chatMessages: messages });
}

// Clear chat messages for a rule (used when closing a tab)
export async function clearChatMessages(domain: string, ruleId: string): Promise<void> {
  await updateRule(domain, ruleId, { chatMessages: [] });
}

// Get all rules across all domains
export async function getAllRules(): Promise<Record<string, DomainRules>> {
  const schema = await getSchema();
  return schema.domains;
}

// Get user settings
export async function getSettings(): Promise<UserSettings> {
  const schema = await getSchema();
  return schema.settings;
}

// Save user settings
export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  const schema = await getSchema();
  schema.settings = { ...schema.settings, ...settings };
  await saveSchema(schema);
}

// --- API Key Encryption ---

// Encrypt and save API key
export async function saveApiKey(apiKey: string): Promise<void> {
  // Trim whitespace and remove non-printable ASCII characters (common from copy-paste)
  const sanitizedKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');

  const encoder = new TextEncoder();
  const data = encoder.encode(sanitizedKey);

  // Generate a new key for encryption
  const cryptoKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );

  // Export the key to store in session storage
  const exportedKey = await crypto.subtle.exportKey('raw', cryptoKey);

  // Store encrypted key in local storage
  await chrome.storage.local.set({
    [API_KEY_STORAGE_KEY]: {
      encrypted: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
    },
  });

  // Store crypto key in session storage (cleared on browser close)
  await chrome.storage.session.set({
    [CRYPTO_KEY_SESSION_KEY]: Array.from(new Uint8Array(exportedKey)),
  });
}

// Decrypt and retrieve API key
export async function getApiKey(): Promise<string | null> {
  try {
    const [keyData, encryptedData] = await Promise.all([
      chrome.storage.session.get(CRYPTO_KEY_SESSION_KEY),
      chrome.storage.local.get(API_KEY_STORAGE_KEY),
    ]);

    const cryptoKeyRaw = keyData[CRYPTO_KEY_SESSION_KEY];
    const stored = encryptedData[API_KEY_STORAGE_KEY];

    if (!cryptoKeyRaw || !stored) {
      return null;
    }

    // Import the crypto key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(cryptoKeyRaw),
      'AES-GCM',
      true,
      ['decrypt']
    );

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(stored.iv) },
      cryptoKey,
      new Uint8Array(stored.encrypted)
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// Check if API key is configured
export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return key !== null && key.length > 0;
}

// Clear API key
export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
  await chrome.storage.session.remove(CRYPTO_KEY_SESSION_KEY);
}

// Extract main domain from hostname
export function extractDomain(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

// Migrate old 'warning' statuses to 'active' (warning status was removed)
export async function migrateWarningStatus(): Promise<void> {
  const schema = await getSchema();
  let modified = false;

  for (const domain of Object.keys(schema.domains)) {
    for (const rule of schema.domains[domain].rules) {
      if ((rule.status as string) === 'warning') {
        rule.status = 'active';
        modified = true;
      }
    }
  }

  if (modified) {
    await saveSchema(schema);
  }
}
