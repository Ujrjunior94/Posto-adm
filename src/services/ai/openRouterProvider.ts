export interface OpenRouterAnalysisOptions {
  mimeType?: string;
  mesAnoReferencia?: string;
}

export interface OpenRouterAnalysisResponse {
  success: boolean;
  data?: any;
  cells?: any[];
  motorUtilizado?: string;
  error?: string;
}

/**
 * OpenRouterProvider — Implementação do serviço de integração com a API OpenRouter no backend.
 * O frontend NUNCA acessa a chave de API diretamente; todas as chamadas trafegam pelo endpoint seguro /api/analyze-schedule-image.
 */
export class OpenRouterProvider {
  async analyzeScheduleImage(
    imageBase64: string,
    options?: OpenRouterAnalysisOptions
  ): Promise<OpenRouterAnalysisResponse> {
    const endpoints = ['/api/analyze-schedule-image', '/api/gemini/escala-ocr'];
    let lastError = 'Modelo de IA temporariamente indisponível.';

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: imageBase64,
            imageBase64,
            mimeType: options?.mimeType || 'image/jpeg',
            mesAnoReferencia: options?.mesAnoReferencia,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const json = await response.json().catch(() => null);

        if (response.ok && json) {
          if (json.success === false && json.error) {
            throw new Error(json.error);
          }

          const rawData = json.data || json;
          return {
            success: true,
            data: rawData,
            cells: rawData?.cells || json.cells || [],
            motorUtilizado: json.motorUtilizado || 'OpenRouter API',
          };
        }

        if (json?.error) {
          lastError = json.error;
        } else if (response.status === 401 || response.status === 403) {
          lastError = 'Não foi possível conectar ao serviço de IA.';
        } else if (response.status === 429) {
          lastError = 'Limite temporário de utilização atingido.';
        } else {
          lastError = 'Modelo de IA temporariamente indisponível.';
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          lastError = 'Modelo de IA temporariamente indisponível.';
        } else if (err?.message) {
          lastError = err.message;
        }
      }
    }

    throw new Error(lastError);
  }
}

export const openRouterProvider = new OpenRouterProvider();
