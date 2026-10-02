import {
  construirPromptAnaliseANP,
  gerarParecerLocalANP,
} from '../../src/services/chatGptCalculadoraAnpService';
import { parseAndRepairJson } from '../../src/services/geminiOcrService';
import OpenAI from 'openai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const dados = req.body || {};
    const openAiKey = process.env.OPENAI_API_KEY || '';
    const prompt = construirPromptAnaliseANP(dados);

    if (openAiKey && openAiKey !== 'MY_OPENAI_API_KEY') {
      const openai = new OpenAI({ apiKey: openAiKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Você é um Perito Metrológico da ANP especialista em fiscalização de combustíveis no Brasil. Sempre responda em formato JSON estrito conforme solicitado.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      const parsed = parseAndRepairJson(raw);
      parsed.motorUtilizado = 'ChatGPT (OpenAI GPT-4o - Padrões Oficiais ANP Agosto/2026)';
      return res.status(200).json(parsed);
    }

    const localResult = gerarParecerLocalANP(dados);
    return res.status(200).json(localResult);
  } catch (error: any) {
    console.warn('[ChatGPT Analise ANP Serverless] Falha:', error);
    const fallbackResult = gerarParecerLocalANP(req.body);
    return res.status(200).json(fallbackResult);
  }
}
