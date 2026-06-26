import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callLLM } from './llmClient';
import type { LLMConfig } from './types';

const config: LLMConfig = { baseUrl: 'http://localhost:8080' };

describe('callLLM', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score":72}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callLLM(config, 'test prompt');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends the prompt as a user message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callLLM(config, 'my prompt text');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toContainEqual({ role: 'user', content: 'my prompt text' });
  });

  it('returns the message content string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score":72}' } }] })
    }));

    const result = await callLLM(config, 'prompt');
    expect(result).toBe('{"score":72}');
  });

  it('falls back to reasoning_content when message content is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '', reasoning_content: '{"score":72}' } }]
      })
    }));

    const result = await callLLM(config, 'prompt');
    expect(result).toBe('{"score":72}');
  });

  it('throws when the response status is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable'
    }));

    await expect(callLLM(config, 'prompt')).rejects.toThrow('503');
  });

  it('uses a configured model name when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callLLM({ baseUrl: 'http://localhost:8080', model: 'gpt-5.4-nano' }, 'prompt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-5.4-nano');
  });

  it('uses the default suggested OpenAI model when omitted', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callLLM({ baseUrl: 'http://localhost:8080' }, 'prompt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-5.4-mini');
  });

  it('rejects the dangerous local placeholder before sending a request', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await expect(callLLM({ baseUrl: 'http://localhost:8080', model: 'local' }, 'prompt'))
      .rejects.toThrow('Model "local" is not allowed');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends arbitrary discovered model ids', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callLLM({ baseUrl: 'http://localhost:8080', model: 'mlx-community/gemma-4-e4b-it-8bit' }, 'prompt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('mlx-community/gemma-4-e4b-it-8bit');
  });

  it('uses a custom max token limit when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callLLM({ baseUrl: 'http://localhost:8080', model: 'gpt-5.4-mini', maxTokens: 4096 }, 'prompt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(4096);
  });

  it('sends response_format when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callLLM({
      baseUrl: 'http://localhost:8080',
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'test',
          schema: { type: 'object' }
        }
      }
    }, 'prompt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('test');
  });
});
