import { AIProvider, defaultAIProvider } from './aiProvider';
import {
  processarLeituraBrutaParaValidacao,
  ResultadoImportacaoEscala,
  TurnoCadastrado,
  TURNOS_PADRAO_POSTO,
} from '../../features/planner/importadorEscalaImagemService';
import { Funcionario } from '../../types';

/**
 * ScheduleImageImporter — Atua como ponte entre o provedor multimodal (AIProvider -> OpenRouter)
 * e o motor determinístico de validação de negócios do Posto ADM.
 */
export class ScheduleImageImporter {
  private aiProvider: AIProvider;

  constructor(provider: AIProvider = defaultAIProvider) {
    this.aiProvider = provider;
  }

  async processImage(
    imageBase64: string,
    employees: Funcionario[],
    shifts: TurnoCadastrado[] = TURNOS_PADRAO_POSTO,
    month: number,
    year: number,
    options?: { mimeType?: string }
  ): Promise<ResultadoImportacaoEscala> {
    const mesAnoStr = `${year}-${String(month).padStart(2, '0')}`;

    // 1. Chama a camada de IA para extração óptica bruta
    const aiResponse = await this.aiProvider.analyzeScheduleImage(imageBase64, {
      mimeType: options?.mimeType || 'image/jpeg',
      mesAnoReferencia: mesAnoStr,
    });

    if (!aiResponse || !aiResponse.success) {
      throw new Error(aiResponse?.error || 'A imagem não pôde ser analisada.');
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
      aiResponse.motorUtilizado || rawData?.motorUtilizado || 'OpenRouter Multimodal';

    return resultadoValidado;
  }
}

export const scheduleImageImporter = new ScheduleImageImporter();
