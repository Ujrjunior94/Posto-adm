/**
 * src/services/AIProvider.ts
 *
 * Arquitetura de Visão Computacional do Posto ADM:
 * Planner
 *   ↓
 * ScheduleImageImporter
 *   ↓
 * AIProvider
 *   ↓
 * OpenRouterProvider
 *   ↓
 * OpenRouter API (Compatível com formato multimodal OpenAI)
 *   ↓
 * Modelo Multimodal Gratuito
 */

export interface RawScheduleCell {
  rowIndex: number;
  columnIndex: number;
  rawText: string;
  confidence?: number;
  role?: 'HEADER' | 'EMPLOYEE' | 'DAY_NUMBER' | 'SHIFT_VALUE';
}

export interface RawScheduleData {
  cells?: RawScheduleCell[];
  grid?: {
    headers?: string[];
    rows?: Array<{
      rowIndex: number;
      employeeCell?: { rawText: string; confidence?: number };
      dayCells?: Array<{ day?: number; columnIndex: number; rawText: string; confidence?: number }>;
    }>;
  };
  colaboradoresEscala?: any[];
  document?: {
    month?: number | null;
    year?: number | null;
    title?: string;
  };
  [key: string]: any;
}

export interface ScheduleAnalysisOptions {
  mimeType?: string;
  mesAnoReferencia?: string;
  signal?: AbortSignal;
}

export interface ScheduleAnalysisResult {
  success: boolean;
  data: RawScheduleData;
  cells: RawScheduleCell[];
  motorUtilizado: string;
  error?: string;
}

/**
 * Interface AIProvider
 * Camada abstrata de serviço que desacopla a leitura de imagens de escala
 * de qualquer modelo de IA específico.
 */
export interface AIProvider {
  analyzeScheduleImage(
    image: string,
    options?: ScheduleAnalysisOptions
  ): Promise<ScheduleAnalysisResult>;
}

/**
 * Helper para higienizar e normalizar Data URL da imagem
 */
export function normalizarDataUrl(imageInput: string, mimeTypeDefault = 'image/jpeg'): {
  dataUrl: string;
  cleanBase64: string;
  mimeType: string;
} {
  const raw = String(imageInput || '').trim();
  const mimeMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  const detectedMime = mimeMatch ? mimeMatch[1] : mimeTypeDefault || 'image/jpeg';
  const cleanBase64 = raw.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s+/g, '');
  const dataUrl = `data:${detectedMime};base64,${cleanBase64}`;
  return {
    dataUrl,
    cleanBase64,
    mimeType: detectedMime,
  };
}

/**
 * Implementação OpenRouterProvider
 * Consome as variáveis de ambiente OPENROUTER_API_KEY e OPENROUTER_MODEL.
 * Suporta execução tanto no backend/Node via OpenRouter API direta
 * quanto no frontend através do endpoint seguro /api/analyze-schedule-image.
 */
export class OpenRouterProvider implements AIProvider {
  /**
   * Obtém a chave da API do OpenRouter das variáveis de ambiente
   */
  public getApiKey(): string {
    if (typeof process !== 'undefined' && process.env) {
      const key = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY;
      if (key) return key;
    }
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const key = (import.meta as any).env.VITE_OPENROUTER_API_KEY || (import.meta as any).env.OPENROUTER_API_KEY;
      if (key) return key;
    }
    return '';
  }

  /**
   * Obtém o modelo configurado via OPENROUTER_MODEL
   */
  public getModel(): string {
    if (typeof process !== 'undefined' && process.env) {
      const model = process.env.OPENROUTER_MODEL || process.env.VITE_OPENROUTER_MODEL;
      if (model) return model;
    }
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const model = (import.meta as any).env.VITE_OPENROUTER_MODEL || (import.meta as any).env.OPENROUTER_MODEL;
      if (model) return model;
    }
    return 'google/gemini-2.0-flash-lite-preview-02-05:free';
  }

  /**
   * Realiza a análise visual da escala
   */
  async analyzeScheduleImage(
    image: string,
    options?: ScheduleAnalysisOptions
  ): Promise<ScheduleAnalysisResult> {
    if (!image) {
      throw new Error('A imagem não pôde ser analisada.');
    }

    const apiKey = this.getApiKey();
    const model = this.getModel();

    // Se estiver no ambiente Node/servidor com a chave do OpenRouter configurada:
    if (apiKey && typeof window === 'undefined') {
      return OpenRouterProvider.callOpenRouterDirect(image, apiKey, model, options);
    }

    // No frontend (ou fallback), envia para o endpoint backend seguro /api/analyze-schedule-image
    return this.callBackendEndpoint(image, options);
  }

  /**
   * Comunicação segura via endpoint do backend Node /api/analyze-schedule-image
   */
  private async callBackendEndpoint(
    image: string,
    options?: ScheduleAnalysisOptions
  ): Promise<ScheduleAnalysisResult> {
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
            image,
            imageBase64: image,
            mimeType: options?.mimeType || 'image/jpeg',
            mesAnoReferencia: options?.mesAnoReferencia,
          }),
          signal: options?.signal || controller.signal,
        });

        clearTimeout(timeoutId);

        const json = await response.json().catch(() => null);

        if (response.ok && json) {
          if (json.success === false && json.error) {
            throw new Error(json.error);
          }

          const rawData: RawScheduleData = json.data || json;
          const cells: RawScheduleCell[] = Array.isArray(rawData?.cells)
            ? rawData.cells
            : Array.isArray(json.cells)
            ? json.cells
            : [];

          return {
            success: true,
            data: rawData,
            cells,
            motorUtilizado: json.motorUtilizado || `OpenRouter (${this.getModel()})`,
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

  /**
   * Chamada direta à API do OpenRouter (usada no backend com OPENROUTER_API_KEY e OPENROUTER_MODEL)
   */
  public static async callOpenRouterDirect(
    image: string,
    apiKey: string,
    model: string,
    options?: ScheduleAnalysisOptions
  ): Promise<ScheduleAnalysisResult> {
    if (!apiKey) {
      throw new Error('Não foi possível conectar ao serviço de IA.');
    }

    const { dataUrl } = normalizarDataUrl(image, options?.mimeType);

    const systemPrompt = `Você é um leitor óptico (OCR) puramente visual de tabelas de escalas de trabalho em postos de combustível.
Os turnos operacionais oficiais deste posto são:
- T1: Turno 1 Manhã (06:00 às 14:00 ou "06-14")
- T2: Turno 2 Tarde (14:00 às 22:00 ou "14-22")
- HORISTA: Turno Horista / Intermediário (08:00 às 14:00 ou "HOR")
- ADM: Administrativo (08:00 às 17:00 ou "ADM")
- FOLGA: Folga Semanal / DSR ("FOLGA", "DSR", "S", "F")
- FÉRIAS: Férias ("FÉRIAS", "FERIAS", "FE", "FER")

Analise a imagem da escala e extraia RIGOROSAMENTE e APENAS o conteúdo visual lido nas células.

REGRAS DE LEITURA DA IMAGEM:
1. Extraia o texto visual bruto ("rawText") exatamente como está escrito na imagem (ex: "JOAO", "06-14", "T1", "T2", "HOR", "ADM", "FOLGA", "S", "FE").
2. NÃO crie funcionários, NÃO adivinhe sobrenomes ou matrículas.
3. NÃO altere horários ou siglas escritas nas células.
4. Retorne EXCLUSIVAMENTE um objeto JSON com a propriedade "cells":
{
  "cells": [
    {
      "rowIndex": 1,
      "columnIndex": 0,
      "rawText": "JOAO",
      "confidence": 0.95,
      "role": "EMPLOYEE"
    },
    {
      "rowIndex": 1,
      "columnIndex": 1,
      "rawText": "06-14",
      "confidence": 0.98,
      "role": "SHIFT_VALUE"
    }
  ]
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://posto-adm.local',
          'X-Title': 'Posto ADM',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: systemPrompt },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl },
                },
              ],
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: options?.signal || controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      if (fetchErr?.name === 'AbortError') {
        throw new Error('Modelo de IA temporariamente indisponível.');
      }
      throw new Error('Não foi possível conectar ao serviço de IA.');
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Não foi possível conectar ao serviço de IA.');
      }
      if (res.status === 429) {
        throw new Error('Limite temporário de utilização atingido.');
      }
      throw new Error('Modelo de IA temporariamente indisponível.');
    }

    const json: any = await res.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content || '{}';

    let parsedData: any = null;
    try {
      // Extração robusta de JSON
      const cleaned = content.replace(/^```json/i, '').replace(/```$/i, '').trim();
      parsedData = JSON.parse(cleaned);
    } catch {
      throw new Error('A imagem não pôde ser analisada.');
    }

    if (!parsedData || typeof parsedData !== 'object') {
      throw new Error('A imagem não pôde ser analisada.');
    }

    const cells: RawScheduleCell[] = Array.isArray(parsedData.cells) ? parsedData.cells : [];

    return {
      success: true,
      data: parsedData,
      cells,
      motorUtilizado: `OpenRouter (${model})`,
    };
  }
}

export const openRouterProvider = new OpenRouterProvider();
export { DeepSeekProvider, defaultDeepSeekProvider } from './ai/deepseekProvider';
export const defaultAIProvider: AIProvider = openRouterProvider;
