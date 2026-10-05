import type { Request, Response } from 'express';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Método não permitido. Utilize POST para envio da imagem da escala.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { image, imageBase64, image_base64, data, mimeType = 'image/jpeg' } = body;
    const rawImage = String(image || imageBase64 || image_base64 || data || '').trim();

    if (!rawImage) {
      return res.status(400).json({
        success: false,
        error: 'Nenhuma imagem em base64 foi enviada para análise.',
      });
    }

    const isDataUrl = rawImage.startsWith('data:image/');
    let cleanBase64 = rawImage;
    let detectedMime = mimeType;

    if (isDataUrl) {
      const mimeMatch = rawImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
      if (mimeMatch) {
        detectedMime = mimeMatch[1];
      }
      cleanBase64 = rawImage.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
    }

    cleanBase64 = cleanBase64.replace(/\s+/g, '');

    if (cleanBase64.length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Conteúdo da imagem em base64 corrompido ou insuficiente.',
      });
    }

    const formattedDataUrl = `data:${detectedMime};base64,${cleanBase64}`;

    const openRouterKey =
      process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || '';
    const openRouterModel =
      process.env.OPENROUTER_MODEL ||
      process.env.VITE_OPENROUTER_MODEL ||
      'google/gemini-2.0-flash-lite-preview-02-05:free';

    if (!openRouterKey) {
      return res.status(500).json({
        success: false,
        error: 'A variável de ambiente OPENROUTER_API_KEY não está configurada no servidor.',
      });
    }

    const systemPrompt = `Você é um leitor óptico (OCR) puramente visual de tabelas de escalas de trabalho em postos de combustível.
Os turnos operacionais oficiais deste posto são:
- T1: Turno 1 Manhã (06:00 às 14:00 ou "06-14")
- T2: Turno 2 Tarde (14:00 às 22:00 ou "14-22")
- HORISTA: Turno Horista / Intermediário (08:00 às 14:00 ou "HOR")
- ADM: Administrativo (08:00 às 17:00 ou "ADM")
- FOLGA: Folga Semanal / DSR ("FOLGA", "DSR", "S", "F")
- FÉRIAS: Férias ("FÉRIAS", "FERIAS", "FE", "FER")

Analise a imagem da escala e extraia RIGOROSAMENTE e APENAS o conteúdo visual lido nas células. Retorne EXCLUSIVAMENTE um objeto JSON válido com "cells" e "colaboradoresEscala".`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let openRouterRes: any;
    try {
      openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://posto-adm.local',
          'X-Title': 'Posto ADM Backend',
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: systemPrompt },
                {
                  type: 'image_url',
                  image_url: { url: formattedDataUrl },
                },
              ],
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!openRouterRes.ok) {
      const errorBody = await openRouterRes.text().catch(() => '');
      return res.status(openRouterRes.status).json({
        success: false,
        error: `Erro retornado pelo OpenRouter (${openRouterRes.status})`,
        details: errorBody,
      });
    }

    const responseJson: any = await openRouterRes.json().catch(() => null);
    const content = responseJson?.choices?.[0]?.message?.content || '{}';
    const cleaned = content.replace(/^```json/i, '').replace(/```$/i, '').trim();
    const parsedRawData = JSON.parse(cleaned);

    return res.status(200).json({
      success: true,
      data: parsedRawData,
      raw: parsedRawData,
      cells: parsedRawData.cells || [],
      colaboradoresEscala: parsedRawData.colaboradoresEscala || [],
      motorUtilizado: `OpenRouter (${openRouterModel})`,
      model: openRouterModel,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao processar imagem da escala.',
    });
  }
}
