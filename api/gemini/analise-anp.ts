import {
  construirPromptAnaliseANP,
  gerarParecerLocalANP,
} from '../../src/services/geminiCalculadoraAnpService';
import { parseAndRepairJson } from '../../src/services/geminiOcrService';
import { GoogleGenAI } from '@google/genai';

const CLOUD_BACKEND_URLS = [
  'https://ais-pre-rztllfl5siqd7bb34giamw-80494517285.us-east5.run.app/api/gemini/analise-anp',
  'https://ais-dev-rztllfl5siqd7bb34giamw-80494517285.us-east5.run.app/api/gemini/analise-anp',
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
    const dados = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

    if (apiKey) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const prompt = construirPromptAnaliseANP(dados);
      const geminiRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });
      const raw = geminiRes.text || '{}';
      const parsed = parseAndRepairJson(raw);
      parsed.motorUtilizado = 'Google Gemini 3.8 Flash (Padrões Oficiais ANP Agosto/2026)';
      return res.status(200).json(parsed);
    }

    for (const targetUrl of CLOUD_BACKEND_URLS) {
      try {
        const upstream = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        });
        if (upstream.ok) {
          const data = await upstream.json();
          return res.status(200).json(data);
        }
      } catch {
        // Tenta próximo
      }
    }

    const fallback = gerarParecerLocalANP(dados);
    return res.status(200).json(fallback);
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Erro ao processar análise ANP.',
    });
  }
}
