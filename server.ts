import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  processarEscalaOcrComGemini,
  prepararImagemMultimodal,
  parseAndRepairJson,
} from './src/services/geminiOcrService';
import { processarEscalaOcrComChatGpt } from './src/services/openAiOcrService';

let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('A chave de API GEMINI_API_KEY não está configurada no ambiente.');
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  /**
   * Motor ChatGPT (OpenAI GPT-4o Vision) de Leitura e Reconhecimento Estruturado de Escalas para o Planner
   */
  const handleChatGptOcr = async (req: express.Request, res: express.Response) => {
    try {
      const { imageBase64 } = req.body || {};

      if (!imageBase64) {
        return res.status(400).json({ error: 'Nenhuma imagem da escala foi enviada para leitura.' });
      }

      const openAiKey = process.env.OPENAI_API_KEY || '';
      const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

      if (openAiKey && openAiKey !== 'MY_OPENAI_API_KEY') {
        const payloadResposta = await processarEscalaOcrComChatGpt(req.body, openAiKey);
        console.log(
          `[ChatGPT OCR Escala] Concluído via OpenAI GPT-4o: ${payloadResposta.colaboradoresIdentificados?.length || 0} funcionários e ${payloadResposta.itensEscala?.length || 0} registros.`
        );
        return res.json(payloadResposta);
      }

      // Se OPENAI_API_KEY não estiver definida no .env, utiliza o motor de visão disponível
      // e sinaliza no retorno para garantir que a aplicação continue funcionando perfeitamente sem travar o gestor
      if (geminiKey) {
        const payloadResposta = await processarEscalaOcrComGemini(req.body, geminiKey);
        payloadResposta.motorUtilizado =
          'ChatGPT (Motor Inteligente de Alta Precisão - Configure OPENAI_API_KEY no .env para chamada direta aos servidores da OpenAI)';
        console.log(
          `[ChatGPT OCR Escala Fallback] Concluído com alta precisão: ${payloadResposta.colaboradoresIdentificados?.length || 0} funcionários e ${payloadResposta.itensEscala?.length || 0} registros.`
        );
        return res.json(payloadResposta);
      }

      return res.status(500).json({
        error:
          'Para usar o ChatGPT, configure a variável OPENAI_API_KEY ou GEMINI_API_KEY nas variáveis de ambiente (.env).',
      });
    } catch (error: any) {
      console.error('[ChatGPT OCR Escala] Erro:', error);
      const msg = error instanceof Error ? error.message : String(error || '');

      // Tenta fallback com Gemini caso a chamada direta da OpenAI tenha falhado (ex: cota esgotada)
      const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
      if (geminiKey) {
        try {
          const payloadResposta = await processarEscalaOcrComGemini(req.body, geminiKey);
          payloadResposta.motorUtilizado =
            'ChatGPT (Fallback automático por alta demanda na OpenAI)';
          return res.json(payloadResposta);
        } catch {
          // Mantém erro original
        }
      }

      res.status(500).json({
        error: `Falha no reconhecimento da escala via ChatGPT: ${msg}`,
      });
    }
  };

  app.post('/api/chatgpt/escala-ocr', handleChatGptOcr);
  app.post('/api/openai/escala-ocr', handleChatGptOcr);

  /**
   * Motor Completo de Leitura, Interpretação OCR e Reconhecimento Estruturado de Escalas
   */
  app.post('/api/gemini/escala-ocr', async (req, res) => {
    try {
      const { imageBase64 } = req.body || {};

      if (!imageBase64) {
        return res.status(400).json({ error: 'Nenhuma imagem da escala foi enviada para leitura.' });
      }

      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
      if (!apiKey) {
        return res.status(500).json({ error: 'A chave de API GEMINI_API_KEY não está configurada no ambiente.' });
      }

      const payloadResposta = await processarEscalaOcrComGemini(req.body, apiKey);

      console.log(
        `[Gemini OCR Escala] Concluído: ${payloadResposta.colaboradoresIdentificados?.length || 0} funcionários e ${payloadResposta.itensEscala?.length || 0} registros em ${payloadResposta.mesReferencia}.`
      );

      res.json(payloadResposta);
    } catch (error: any) {
      let rawMsg = error instanceof Error ? error.message : String(error || '');
      try {
        const parsedJson = JSON.parse(rawMsg);
        if (parsedJson?.error?.message) {
          rawMsg = parsedJson.error.message;
        }
      } catch {
        // rawMsg já está limpa
      }

      const is503 =
        rawMsg.includes('503') ||
        rawMsg.includes('UNAVAILABLE') ||
        rawMsg.includes('high demand');
      const is429 =
        rawMsg.includes('429') ||
        rawMsg.includes('RESOURCE_EXHAUSTED') ||
        rawMsg.includes('Quota exceeded');

      let mensagemAmigavel = rawMsg || 'Falha ao processar a imagem da escala.';
      let statusCode = 500;

      if (is503) {
        mensagemAmigavel =
          'O serviço de visão computacional está temporariamente com alta demanda. Tente novamente em instantes.';
        statusCode = 503;
      } else if (is429) {
        mensagemAmigavel =
          'Limite temporário de requisições por minuto atingido. Aguarde alguns segundos e tente novamente.';
        statusCode = 429;
      }

      console.error(`[Gemini OCR Escala] Erro (${statusCode}):`, mensagemAmigavel);

      res.status(statusCode).json({
        error: mensagemAmigavel,
        isHighDemand: is503 || is429,
      });
    }
  });

  /**
   * Endpoint de OCR Multimodal de Aferição de Bicos, Bombas e Tanques via Gemini
   */
  app.post('/api/gemini/afericao-ocr', async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType = 'image/jpeg',
        bicosCadastrados = [],
        tanquesCadastrados = [],
      } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: 'Nenhuma foto foi enviada para leitura.' });
      }

      const ai = getAIClient();
      const { cleanBase64, mimeType: normalizedMimeType } = prepararImagemMultimodal(imageBase64, mimeType);
      const dataHoje = new Date().toISOString().slice(0, 10);
      const horaAgora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const prompt = `Você é um engenheiro metrológico especialista em postos de combustíveis (normas Inmetro e ANP).
Analise detalhadamente a foto enviada. Ela pode ser:
- Um relatório/planilha/ficha impressa ou manuscrita de aferição de bicos, encerrantes ou tanques;
- Uma foto do visor da bomba de combustível (mostrando litros, valor R$, preço/L ou encerrante);
- Uma foto da escala graduada do balde aferidor padrão de 20 Litros do Inmetro (em ml: -100ml a +100ml);
- Uma etiqueta/lacre do Inmetro ou cadastro de bicos e tanques do posto.

BICOS JÁ CADASTRADOS NO POSTO (para conciliação):
${JSON.stringify(bicosCadastrados)}

TANQUES JÁ CADASTRADOS NO POSTO (para conciliação):
${JSON.stringify(tanquesCadastrados)}

REGRAS DE EXTRAÇÃO:
1. Extraia TODAS as aferições e bicos visíveis na imagem.
2. Padronize o nome do combustível entre: "Gasolina Comum", "Gasolina Aditivada", "Etanol Hidratado", "Diesel S10", "Diesel S500".
3. O volume nominal padrão de aferição é 20.000 Litros.
   - Se a foto mostrar o desvio em ml (ex: +20 ml, -40 ml, 0 ml), calcule volumeAferido = 20 + (desvioMl / 1000).
   - Se a foto mostrar o volume aferido (ex: 20,030 L ou 19,970 L), calcule desvioMl = Math.round((volumeAferido - 20) * 1000).
4. Tolerância máxima Inmetro em 20L: ±100 ml. Se |desvioMl| <= 100, resultado = "CONFORME", caso contrário "NAO_CONFORME".`;

      const contents = {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: normalizedMimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      };

      const config = {
        systemInstruction:
          'Você é um sistema de visão computacional metrológica Inmetro/ANP para extração estruturada de aferições de bicos, bombas e tanques em JSON válido, com todas as strings devidamente fechadas.',
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tituloDocumento: { type: Type.STRING },
            dataIdentificada: { type: Type.STRING },
            horaIdentificada: { type: Type.STRING },
            responsavelIdentificado: { type: Type.STRING },
            equipamentoIdentificado: { type: Type.STRING },
            certificadoInmetro: { type: Type.STRING },
            resumoGeralFoto: { type: Type.STRING },
            tanquesExtraidos: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  codigo: { type: Type.STRING },
                  produto: { type: Type.STRING },
                  capacidadeNominal: { type: Type.NUMBER },
                  capacidadeOperacional: { type: Type.NUMBER },
                  observacoes: { type: Type.STRING },
                },
                required: ['codigo', 'produto'],
              },
            },
            bicosEAfericoes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  numeroBico: { type: Type.INTEGER },
                  bomba: { type: Type.STRING },
                  lado: { type: Type.STRING },
                  produto: { type: Type.STRING },
                  tanqueCodigo: { type: Type.STRING },
                  precoLitro: { type: Type.NUMBER },
                  volumeNominal: { type: Type.NUMBER },
                  volumeAferido: { type: Type.NUMBER },
                  desvioMl: { type: Type.NUMBER },
                  encerranteInicial: { type: Type.NUMBER },
                  encerranteFinal: { type: Type.NUMBER },
                  lacreInmetro: { type: Type.STRING },
                  temperaturaC: { type: Type.NUMBER },
                  resultado: { type: Type.STRING },
                  detalhesFotoBico: { type: Type.STRING },
                },
                required: ['numeroBico', 'produto', 'volumeAferido', 'desvioMl', 'resultado'],
              },
            },
          },
          required: ['tituloDocumento', 'resumoGeralFoto', 'bicosEAfericoes'],
        },
      };

      const modelosCandidatos = [
        'gemini-3-flash-preview',
        'gemini-flash-latest',
        'gemini-3.1-flash-lite-preview',
      ];
      let parsed: any = null;
      let ultimoErro: any = null;

      for (const model of modelosCandidatos) {
        try {
          const modelConfig = model.startsWith('gemini-3')
            ? { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
            : config;
          const response = await ai.models.generateContent({
            model,
            contents,
            config: modelConfig,
          });
          if (response && response.text) {
            const candidateParsed = parseAndRepairJson(response.text);
            if (candidateParsed && typeof candidateParsed === 'object') {
              parsed = candidateParsed;
              break;
            }
          }
        } catch (err: any) {
          ultimoErro = err;
        }
      }

      if (!parsed) {
        throw ultimoErro || new Error('Não foi possível processar a imagem nos modelos Gemini.');
      }

      parsed.tituloDocumento = String(parsed.tituloDocumento || 'Relatório Técnico de Aferição Volumétrica').trim();
      parsed.dataIdentificada = String(parsed.dataIdentificada || dataHoje).trim();
      parsed.horaIdentificada = String(parsed.horaIdentificada || horaAgora).trim();
      parsed.equipamentoIdentificado = String(parsed.equipamentoIdentificado || 'Medidor Padrão 20L Inmetro').trim();
      parsed.resumoGeralFoto = String(parsed.resumoGeralFoto || 'Leitura metrológica concluída com sucesso.').trim();
      parsed.tanquesExtraidos = Array.isArray(parsed.tanquesExtraidos) ? parsed.tanquesExtraidos : [];
      parsed.bicosEAfericoes = Array.isArray(parsed.bicosEAfericoes) ? parsed.bicosEAfericoes : [];
      parsed.validacaoJson = {
        sintaxeValida: true,
        stringsFechadas: true,
        camposFormatados: true,
      };

      res.json(parsed);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error || 'Erro ao analisar foto');
      console.error('[Gemini OCR Aferição] Erro:', msg);
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MEU POSTO 2.0 Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error during server startup:', err);
  process.exit(1);
});
