/**
 * src/services/deepseekService.ts
 *
 * Serviço de Integração com o DeepSeek para Reconhecimento e Raciocínio de Escalas Operacionais.
 * Assegura que chaves de API nunca sejam expostas no navegador, trafegando pelas rotas /api/deepseek/*
 */

export interface DeepSeekStatus {
  status: 'configured' | 'missing_key';
  configured: boolean;
  model: string;
  maskedKey?: string;
  provider: 'direct' | 'openrouter' | 'none';
  serverTime: string;
}

export interface DeepSeekTestResult {
  success: boolean;
  message: string;
  model: string;
  reply?: string;
  error?: string;
}

export interface DeepSeekSchedulePayload {
  image?: string;
  imageBase64?: string;
  mimeType?: string;
  mesAnoReferencia?: string;
  funcionariosCadastrados?: Array<{
    id?: string;
    nome: string;
    funcao?: string;
    cargo?: string;
    matricula?: string;
  }>;
  model?: string;
}

/**
 * Consulta o status da configuração do DeepSeek no backend
 */
export async function getDeepSeekStatus(): Promise<DeepSeekStatus> {
  try {
    const res = await fetch('/api/deepseek/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[DeepSeek] Não foi possível obter o status da API:', e);
  }
  return {
    status: 'missing_key',
    configured: false,
    model: 'deepseek-chat',
    provider: 'none',
    serverTime: new Date().toISOString(),
  };
}

/**
 * Testa a conectividade com o DeepSeek via backend
 */
export async function testDeepSeekConnection(): Promise<DeepSeekTestResult> {
  try {
    const res = await fetch('/api/deepseek/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      message: 'Falha na comunicação com o servidor DeepSeek.',
      model: 'deepseek-chat',
      error: err?.message || 'Erro de rede',
    };
  }
}

/**
 * Envia uma escala para análise e reconhecimento via DeepSeek
 */
export async function analisarEscalaComDeepSeek(payload: DeepSeekSchedulePayload): Promise<any> {
  const endpoints = ['/api/deepseek/analyze-schedule', '/api/analyze-schedule-image'];
  let lastError = '';

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          engine: 'deepseek',
          provider: 'deepseek',
          model: payload.model || 'deepseek-chat',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const json = await res.json().catch(() => null);
      if (res.ok && json && json.success !== false) {
        return json;
      }
      if (json && json.error) {
        lastError = json.error;
      }
    } catch (err: any) {
      lastError = err?.message || `Erro no endpoint ${endpoint}`;
    }
  }

  throw new Error(lastError || 'Não foi possível processar a escala com o DeepSeek.');
}
