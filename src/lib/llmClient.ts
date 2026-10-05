import type { LLMConfig } from './types';
import { DEFAULT_MODEL_ID, normalizeModelId } from './modelCatalog';

// Local models can take minutes on a large category prompt, so the timeout is generous.
export const DEFAULT_LLM_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_LLM_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

class RetryableLLMError extends Error {}

export async function callLLM(config: LLMConfig, prompt: string): Promise<string> {
  const model = normalizeModelId(config.model ?? DEFAULT_MODEL_ID);
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: config.maxTokens ?? 2048
  };
  if (config.responseFormat) {
    body.response_format = config.responseFormat;
  }

  const maxRetries = Math.max(0, config.maxRetries ?? DEFAULT_LLM_MAX_RETRIES);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestCompletion(config, body);
    } catch (e) {
      if (!(e instanceof RetryableLLMError) || attempt >= maxRetries) {
        throw e;
      }
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
}

async function requestCompletion(config: LLMConfig, body: Record<string, unknown>): Promise<string> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: llmRequestHeaders(config.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (e) {
    if (isTimeoutError(e)) {
      // Not retried: a model that is still generating would just time out again.
      throw new Error(`LLM request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new RetryableLLMError(msg);
  }

  if (!response.ok) {
    const message = `LLM returned ${response.status}: ${await response.text()}`;
    throw RETRYABLE_STATUSES.has(response.status) ? new RetryableLLMError(message) : new Error(message);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const content = message?.content || message?.reasoning_content;
  if (typeof content !== 'string') {
    throw new Error(`LLM response missing content: ${JSON.stringify(data)}`);
  }
  return content;
}

export function llmRequestHeaders(apiKey?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  };
}

function isTimeoutError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
