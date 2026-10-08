import { AIProvider, defaultAIProvider, openRouterProvider } from './aiProvider';
import { defaultDeepSeekProvider, DeepSeekProvider } from './deepseekProvider';
import {
  processarLeituraBrutaParaValidacao,
  ResultadoImportacaoEscala,
  TurnoCadastrado,
  TURNOS_PADRAO_POSTO,
} from '../../features/planner/importadorEscalaImagemService';
import { Funcionario } from '../../types';

export interface ScheduleProcessOptions {
  mimeType?: string;
  motor?: 'deepseek' | 'openrouter' | 'gemini';
  provider?: AIProvider;
}

/**
 * ScheduleImageImporter — Atua como ponte entre o provedor de IA (DeepSeek / OpenRouter / Gemini)
 * e o motor determinístico de validação de negócios do Posto ADM.
 */
export class ScheduleImageImporter {
  private defaultProvider: AIProvider;

  constructor(provider: AIProvider = defaultDeepSeekProvider) {
    this.defaultProvider = provider;
  }

  async processImage(
    imageBase64: string,
    employees: Funcionario[],
    shifts: TurnoCadastrado[] = TURNOS_PADRAO_POSTO,
    month: number,
    year: number,
    options?: ScheduleProcessOptions
  ): Promise<ResultadoImportacaoEscala> {
    const mesAnoStr = `${year}-${String(month).padStart(2, '0')}`;

    // Escolhe o provedor baseado na opção informada (priorizando DeepSeek quando solicitado)
    let activeProvider = options?.provider || this.defaultProvider;
    if (options?.motor === 'deepseek') {
      activeProvider = defaultDeepSeekProvider;
    } else if (options?.motor === 'openrouter') {
      activeProvider = openRouterProvider;
    }

    // 1. Chama a camada de IA para extração óptica e estruturação bruta
    const aiResponse = await activeProvider.analyzeScheduleImage(imageBase64, {
      mimeType: options?.mimeType || 'image/jpeg',
      mesAnoReferencia: mesAnoStr,
    });

    if (!aiResponse || !aiResponse.success) {
      throw new Error(aiResponse?.error || 'A imagem não pôde ser analisada pelo modelo de IA.');
    }

    // 2. Extrai os dados crus (cells/grid) retornado pelo modelo
    const rawData = aiResponse.data || aiResponse;

    // 3. Executa a validação rigorosa 100% determinística do Posto ADM (resolveEmployee, resolveShift)
    const resultadoValidado = processarLeituraBrutaParaValidacao(
      rawData,
      employees,
      shifts,
      month,
      year
    );

    resultadoValidado.motorUtilizado =
      aiResponse.motorUtilizado || rawData?.motorUtilizado || (options?.motor === 'deepseek' ? 'DeepSeek AI' : 'IA Multimodal');

    return resultadoValidado;
  }
}

export const scheduleImageImporter = new ScheduleImageImporter(defaultDeepSeekProvider);
