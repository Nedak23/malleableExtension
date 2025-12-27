import { LLMResponse, UserSettings } from '../shared/types';
import { getApiKey, getSettings } from '../shared/storage';
import { SYSTEM_PROMPT, formatUserPrompt } from '../prompts/system-prompt';

export class LLMClient {
  async generateCSS(
    request: string,
    url: string,
    title: string,
    serializedDOM: string
  ): Promise<LLMResponse> {
    const apiKey = await getApiKey();

    if (!apiKey) {
      return { success: false, error: 'API key not configured. Please add your API key in settings.' };
    }

    const settings = await getSettings();
    const userPrompt = formatUserPrompt(request, url, title, serializedDOM);

    try {
      if (settings.llmProvider === 'openai') {
        return await this.callOpenAI(apiKey, userPrompt);
      } else {
        return await this.callAnthropic(apiKey, userPrompt);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API request failed',
      };
    }
  }

  private async callOpenAI(apiKey: string, userPrompt: string): Promise<LLMResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return { success: false, error: 'Empty response from OpenAI' };
    }

    try {
      return JSON.parse(content) as LLMResponse;
    } catch {
      return { success: false, error: 'Invalid JSON response from OpenAI' };
    }
  }

  private async callAnthropic(apiKey: string, userPrompt: string): Promise<LLMResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
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
      // Extract JSON from response (Claude may add explanation)
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
