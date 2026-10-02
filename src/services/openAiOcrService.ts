import {
  EscalaOcrRequestPayload,
  processarEscalaOcrComGemini,
} from './geminiOcrService';

/**
 * Função de transição: Redireciona qualquer chamada de reconhecimento de escala diretamente para o motor Google Gemini 3.8 Flash Vision.
 */
export async function processarEscalaOcrComChatGpt(
  payload: EscalaOcrRequestPayload,
  apiKey?: string
): Promise<any> {
  const geminiKey =
    apiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    '';
  return processarEscalaOcrComGemini(payload, geminiKey);
}
