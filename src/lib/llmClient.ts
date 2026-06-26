import type { LLMConfig } from './types';
import { DEFAULT_OPENAI_MODEL_ID, normalizeModelId } from './modelCatalog';

export async function callLLM(config: LLMConfig, prompt: string): Promise<string> {
  const model = normalizeModelId(config.model ?? DEFAULT_OPENAI_MODEL_ID);
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: config.maxTokens ?? 2048
  };
  if (config.responseFormat) {
    body.response_format = config.responseFormat;
  }

  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`LLM returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const content = message?.content || message?.reasoning_content;
  if (typeof content !== 'string') {
    throw new Error(`LLM response missing content: ${JSON.stringify(data)}`);
  }
  return content;
}
