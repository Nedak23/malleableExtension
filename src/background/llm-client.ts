import { LLMResponse, SelectedElement, ChatMessage } from '../shared/types';
import { getApiKey, getSettings } from '../shared/storage';
import { SYSTEM_PROMPT, formatUserPrompt } from '../prompts/system-prompt';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Sanitize string to only contain printable ASCII characters for HTTP headers
function sanitizeForHeaders(str: string): string {
  return str.replace(/[^\x20-\x7E]/g, '');
}

export class LLMClient {
  async generateRuleName(userRequest: string): Promise<string> {
    let apiKey = await getApiKey();

    if (!apiKey) {
      // Fallback to truncated request if no API key
      return userRequest.slice(0, 30) + (userRequest.length > 30 ? '...' : '');
    }

    apiKey = sanitizeForHeaders(apiKey.trim());

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 50,
          messages: [{
            role: 'user',
            content: `Generate a short 1-5 word name for this CSS rule request. Return ONLY the name, nothing else.\n\nRequest: "${userRequest}"`,
          }],
        }),
      });

      if (!response.ok) {
        throw new Error('API error');
      }

      const data = await response.json();
      const name = data.content[0]?.text?.trim();

      if (name && name.split(/\s+/).length <= 5) {
        return name;
      }

      // If response is too long, take first 5 words
      const truncatedName = name?.split(/\s+/).slice(0, 5).join(' ');
      if (truncatedName) {
        return truncatedName;
      }
      return userRequest.slice(0, 30) + (userRequest.length > 30 ? '...' : '');
    } catch {
      // Fallback to truncated request on error
      return userRequest.slice(0, 30) + (userRequest.length > 30 ? '...' : '');
    }
  }

  async generateCSS(
    request: string,
    url: string,
    title: string,
    serializedDOM: string,
    selectedElements?: SelectedElement[],
    conversationHistory?: ChatMessage[]
  ): Promise<LLMResponse> {
    let apiKey = await getApiKey();

    if (!apiKey) {
      return { success: false, error: 'API key not configured. Please add your API key in settings.' };
    }

    // Ensure API key is safe for HTTP headers (remove non-ASCII characters)
    apiKey = sanitizeForHeaders(apiKey.trim());

    const settings = await getSettings();
    const userPrompt = formatUserPrompt(request, url, title, serializedDOM, selectedElements);

    // Build messages array with conversation history for context
    const messages: AnthropicMessage[] = [];

    if (conversationHistory?.length) {
      for (const msg of conversationHistory) {
        if (msg.type === 'user') {
          messages.push({ role: 'user', content: msg.content });
        } else if (msg.type === 'assistant') {
          messages.push({ role: 'assistant', content: msg.content });
        }
        // Skip 'error' and 'system' messages
      }
    }

    // Add current request with full context (DOM, selected element, etc.)
    messages.push({ role: 'user', content: userPrompt });

    try {
      return await this.callAnthropic(apiKey, settings.model, messages);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API request failed',
      };
    }
  }

  private async callAnthropic(apiKey: string, model: string, messages: AnthropicMessage[]): Promise<LLMResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0]?.text;

    if (!content) {
      return { success: false, error: 'Empty response from Anthropic' };
    }

    try {
      // Extract JSON from response (Claude may add explanation text around it)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as LLMResponse;
      }
      return { success: false, error: 'No valid JSON in Anthropic response' };
    } catch {
      return { success: false, error: 'Invalid JSON response from Anthropic' };
    }
  }
}

// Singleton instance
export const llmClient = new LLMClient();
