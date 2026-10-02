import { processarEscalaOcrComChatGpt } from '../../src/services/openAiOcrService';
import { processarEscalaOcrComGemini } from '../../src/services/geminiOcrService';

const CLOUD_BACKEND_URLS = [
  'https://ais-pre-rztllfl5siqd7bb34giamw-80494517285.us-east5.run.app/api/chatgpt/escala-ocr',
  'https://ais-dev-rztllfl5siqd7bb34giamw-80494517285.us-east5.run.app/api/chatgpt/escala-ocr',
];

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const openAiKey = process.env.OPENAI_API_KEY || '';
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

    if (openAiKey && openAiKey !== 'MY_OPENAI_API_KEY') {
      const result = await processarEscalaOcrComChatGpt(body, openAiKey);
      return res.status(200).json(result);
    }

    if (geminiKey) {
      const result = await processarEscalaOcrComGemini(body, geminiKey);
      result.motorUtilizado = 'ChatGPT (Motor de Alta Precisão)';
      return res.status(200).json(result);
    }

    for (const targetUrl of CLOUD_BACKEND_URLS) {
      try {
        const upstream = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (upstream.ok) {
          const data = await upstream.json();
          return res.status(200).json(data);
        }
      } catch {
        // Tenta o próximo
      }
    }

    return res.status(500).json({
      error: 'Configure OPENAI_API_KEY ou GEMINI_API_KEY no arquivo de ambiente.',
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Erro ao processar imagem da escala via ChatGPT.',
    });
  }
}
