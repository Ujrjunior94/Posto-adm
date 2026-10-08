/**
 * src/services/ai/deepseekProvider.ts
 *
 * Provedor DeepSeek para reconhecimento e estruturação inteligente de escalas de trabalho.
 * Implementa a interface AIProvider, desacoplando o motor de IA do frontend.
 */

import {
  AIProvider,
  RawScheduleCell,
  RawScheduleData,
  ScheduleAnalysisOptions,
  ScheduleAnalysisResult,
  normalizarDataUrl,
} from '../AIProvider';

export class DeepSeekProvider implements AIProvider {
  private model: string;

  constructor(model: string = 'deepseek-chat') {
    this.model = model;
  }

  public getModel(): string {
    return this.model;
  }

  async analyzeScheduleImage(
    image: string,
    options?: ScheduleAnalysisOptions
  ): Promise<ScheduleAnalysisResult> {
    if (!image) {
      throw new Error('A imagem não pôde ser analisada pelo DeepSeek.');
    }

    const { dataUrl, mimeType } = normalizarDataUrl(image, options?.mimeType || 'image/jpeg');

    const endpoints = [
      '/api/deepseek/analyze-schedule',
      '/api/analyze-schedule-image',
      '/api/gemini/escala-ocr',
    ];
    let lastError = 'Motor DeepSeek temporariamente indisponível.';

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: dataUrl,
            imageBase64: dataUrl,
            mimeType,
            mesAnoReferencia: options?.mesAnoReferencia,
            engine: 'deepseek',
            provider: 'deepseek',
            model: this.model,
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
            motorUtilizado: json.motorUtilizado || `DeepSeek (${this.model})`,
          };
        }

        if (json?.error) {
          lastError = json.error;
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          lastError = err?.message || 'Falha ao conectar com o serviço DeepSeek.';
        }
      }
    }

    throw new Error(lastError);
  }
}

export const defaultDeepSeekProvider = new DeepSeekProvider();
