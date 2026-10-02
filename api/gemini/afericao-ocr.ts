const CLOUD_BACKEND_URLS = [
  'https://ais-pre-rztllfl5siqd7bb34giamw-80494517285.us-east5.run.app/api/gemini/afericao-ocr',
  'https://ais-dev-rztllfl5siqd7bb34giamw-80494517285.us-east5.run.app/api/gemini/afericao-ocr',
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
        // Tenta próximo endpoint
      }
    }

    return res.status(500).json({
      error: 'Não foi possível processar a leitura metrológica no momento.',
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Erro ao processar foto de aferição.',
    });
  }
}
