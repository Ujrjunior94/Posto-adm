/**
 * src/services/openrouterService.ts
 *
 * Serviço seguro de integração com o OpenRouter para o Frontend.
 * Todas as requisições passam pelo backend Node (Express) para que a
 * OPENROUTER_API_KEY permaneça 100% segura e nunca seja exposta no navegador.
 */

export interface OpenRouterStatus {
  status: 'configured' | 'missing_key';
  configured: boolean;
  model: string;
  maskedKey?: string;
  serverTime?: string;
}

export interface OpenRouterTestResult {
  success: boolean;
  message?: string;
  model?: string;
  reply?: string;
  error?: string;
  status?: number;
  details?: string;
}

export interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface OpenRouterChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
  signal?: AbortSignal;
}

export interface OpenRouterChatResult {
  success: boolean;
  data?: any;
  content?: string;
  model?: string;
  error?: string;
}

/**
 * Consulta o status da integração OpenRouter no servidor (sem expor a chave)
 */
export async function getOpenRouterStatus(): Promise<OpenRouterStatus> {
  try {
    const res = await fetch('/api/openrouter/status');
    if (!res.ok) {
      return { status: 'missing_key', configured: false, model: 'Indisponível' };
    }
    return await res.json();
  } catch {
    return { status: 'missing_key', configured: false, model: 'Indisponível' };
  }
}

/**
 * Testa a conexão e autenticação com o OpenRouter a partir do servidor
 */
export async function testOpenRouterConnection(): Promise<OpenRouterTestResult> {
  try {
    const res = await fetch('/api/openrouter/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Erro ao comunicar com o backend do servidor.',
    };
  }
}

/**
 * Envia uma mensagem ou prompt multimodal através do proxy seguro do backend
 */
export async function sendOpenRouterChat(
  messages: OpenRouterChatMessage[],
  options?: OpenRouterChatOptions
): Promise<OpenRouterChatResult> {
  try {
    const res = await fetch('/api/openrouter/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        model: options?.model,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.max_tokens,
        response_format: options?.response_format,
      }),
      signal: options?.signal,
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      return {
        success: false,
        error: json.error || `Erro ${res.status}: Falha no servidor.`,
      };
    }

    const content = json?.data?.choices?.[0]?.message?.content || '';
    return {
      success: true,
      data: json.data,
      content,
      model: json.model,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro na requisição ao backend OpenRouter.',
    };
  }
}
