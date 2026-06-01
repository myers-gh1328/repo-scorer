import type { MLXConfig } from './types';

export async function callMLX(config: MLXConfig, prompt: string): Promise<string> {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model ?? 'local',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    throw new Error(`MLX returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`MLX response missing content: ${JSON.stringify(data)}`);
  }
  return content;
}
