import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callMLX } from './mlxClient';
import type { MLXConfig } from './types';

const config: MLXConfig = { baseUrl: 'http://localhost:8080' };

describe('callMLX', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score":72}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callMLX(config, 'test prompt');

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

    await callMLX(config, 'my prompt text');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toContainEqual({ role: 'user', content: 'my prompt text' });
  });

  it('returns the message content string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score":72}' } }] })
    }));

    const result = await callMLX(config, 'prompt');
    expect(result).toBe('{"score":72}');
  });

  it('falls back to reasoning_content when message content is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '', reasoning_content: '{"score":72}' } }]
      })
    }));

    const result = await callMLX(config, 'prompt');
    expect(result).toBe('{"score":72}');
  });


  it('throws when the response status is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable'
    }));

    await expect(callMLX(config, 'prompt')).rejects.toThrow('503');
  });

  it('uses a custom model name when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callMLX({ baseUrl: 'http://localhost:8080', model: 'gemma-4-27b' }, 'prompt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gemma-4-27b');
  });

  it('uses a custom max token limit when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callMLX({ baseUrl: 'http://localhost:8080', maxTokens: 4096 }, 'prompt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(4096);
  });


  it('sends response_format when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] })
    });
    vi.stubGlobal('fetch', mockFetch);

    await callMLX({
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
