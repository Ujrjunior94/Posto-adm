import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

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

  app.use(express.json({ limit: '20mb' }));

  // Rotas de API PRIMEIRO
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  /**
   * Endpoint de OCR Multimodal e Análise Inteligente de Escala via Gemini 3.8 Flash
   * - Lê foto da escala impressa / quadro branco / folha de ponto
   * - Identifica nomes de colaboradores e faz correspondência com cadastrados
   * - Detecta colaboradores não cadastrados e gera proposta de cadastro prévio
   * - Extrai dias, turnos, horários e status
   */
  app.post('/api/gemini/escala-ocr', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', funcionariosCadastrados = [] } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
      }

      const ai = getAIClient();
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

      const prompt = `Você é um assistente especialista em postos de combustíveis e RH operacional.
Analise a fotografia fornecida contendo uma escala de trabalho, quadro de turnos ou folha de horários de frentistas e funcionários do posto.

Colaboradores atualmente cadastrados no posto para conciliação:
${JSON.stringify(funcionariosCadastrados.map((f: { id: string; nome: string; matricula: string; cargo: string }) => ({ id: f.id, nome: f.nome, matricula: f.matricula, cargo: f.cargo })))}

DIRETRIZES CRÍTICAS DE RECONHECIMENTO DE TURNOS (PADRÃO OPERACIONAL DO POSTO):
1. TABELA DE TURNOS DO POSTO:
   - TURNO 2: 06h às 14h (06:00 - 14:00) -> Padronizar como "Turno 2 (06h - 14h)", horarioInicio: "06:00", horarioFim: "14:00".
     * Sinônimos/Abreviações na imagem: "2", "T2", "Turno 2", "06-14", "06h às 14h", "Manhã", "M".
   - TURNO 3: 14h às 22h (14:00 - 22:00) -> Padronizar como "Turno 3 (14h - 22h)", horarioInicio: "14:00", horarioFim: "22:00".
     * Sinônimos/Abreviações na imagem: "3", "T3", "Turno 3", "14-22", "14h às 22h", "Tarde", "T".
   - TURNO 4: 22h às 06h (22:00 - 06:00) -> Padronizar como "Turno 4 (22h - 06h)", horarioInicio: "22:00", horarioFim: "06:00".
     * Sinônimos/Abreviações na imagem: "4", "T4", "Turno 4", "22-06", "22h às 06h", "Noite", "Noturno", "N".
   - Demais marcações:
     * "F", "FOLGA", "DSR", "OFF" -> status: "FOLGA", turno: "Folga", horarioInicio: "00:00", horarioFim: "00:00"
     * "AT", "ATEST", "AFAS", "MED" -> status: "AFASTADO"
     * "FER", "FERIAS" -> status: "FERIAS"

2. IDENTIFICAÇÃO DE COLABORADORES:
   - Extraia o nome de cada colaborador que aparece na escala.
   - Compare com a lista de colaboradores já cadastrados (considere variações normais de nomes, abreviações ou apelidos operacionais).
   - Se um colaborador estiver na imagem mas NÃO constar nos cadastrados, marque "jaCadastrado": false e preencha "sugestaoCadastroPrevio" com nome, cargo estimado (ex: 'Frentista', 'Operador de Caixa'), função estimada e turno preferencial ("Turno 2 (06h - 14h)", "Turno 3 (14h - 22h)" ou "Turno 4 (22h - 06h)").

3. GRADE DE DIAS E TURNOS:
   - Extraia para cada dia da escala os itens com:
     * funcionarioNome: Nome do colaborador
     * data: Formato YYYY-MM-DD (se o ano/mês não estiver explícito na imagem, utilize o mês atual do calendário 2026)
     * turno: "Turno 2 (06h - 14h)", "Turno 3 (14h - 22h)", "Turno 4 (22h - 06h)" ou "Folga"
     * horarioInicio: "06:00", "14:00", "22:00" (ou correspondente)
     * horarioFim: "14:00", "22:00", "06:00" (ou correspondente)
     * status: 'TRABALHO', 'FOLGA', 'AFASTADO' ou 'FERIAS'`;

      const contents = {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      };

      const config = {
        systemInstruction: 'Você é um extrator de alta precisão para escalas operacionais de postos em JSON.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tituloEscala: { type: Type.STRING, description: 'Título ou cabeçalho do documento' },
            mesReferencia: { type: Type.STRING, description: 'Mês ou período identificado' },
            colaboradoresIdentificados: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nomeOriginal: { type: Type.STRING },
                  jaCadastrado: { type: Type.BOOLEAN },
                  funcionarioId: { type: Type.STRING },
                  sugestaoCadastroPrevio: {
                    type: Type.OBJECT,
                    properties: {
                      nome: { type: Type.STRING },
                      cargo: { type: Type.STRING },
                      funcao: { type: Type.STRING },
                      turnoPreferencial: { type: Type.STRING },
                    },
                  },
                },
                required: ['nomeOriginal', 'jaCadastrado'],
              },
            },
            itensEscala: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  funcionarioNome: { type: Type.STRING },
                  funcionarioId: { type: Type.STRING },
                  data: { type: Type.STRING },
                  turno: { type: Type.STRING },
                  horarioInicio: { type: Type.STRING },
                  horarioFim: { type: Type.STRING },
                  status: { type: Type.STRING },
                  observacao: { type: Type.STRING },
                },
                required: ['funcionarioNome', 'data', 'turno', 'status'],
              },
            },
          },
          required: ['colaboradoresIdentificados', 'itensEscala'],
        },
      };

      // Modelos suportados em ordem de preferência e resiliência contra picos de demanda 503
      const modelosCandidatos = [
        'gemini-flash-latest',
        'gemini-3.1-flash-lite',
        'gemini-3.8-flash',
      ];
      let response: any = null;
      let ultimoErro: any = null;

      for (const model of modelosCandidatos) {
        for (let tentativa = 1; tentativa <= 2; tentativa++) {
          try {
            console.log(`[Gemini OCR] Executando análise com modelo ${model} (tentativa ${tentativa})...`);
            response = await ai.models.generateContent({
              model,
              contents,
              config,
            });
            console.log(`[Gemini OCR] Resposta obtida com sucesso via ${model}!`);
            break;
          } catch (err: any) {
            ultimoErro = err;
            const errStr = String(err?.message || err);
            const is503 =
              errStr.includes('503') ||
              errStr.includes('UNAVAILABLE') ||
              errStr.includes('high demand') ||
              errStr.includes('Overloaded') ||
              errStr.includes('overloaded');
            const is429 =
              errStr.includes('429') ||
              errStr.includes('RESOURCE_EXHAUSTED') ||
              errStr.includes('Quota exceeded');

            console.warn(`[Gemini OCR] Modelo ${model} falhou na tentativa ${tentativa}: ${errStr.slice(0, 160)}`);

            // Se for 429 (cota esgotada), pula para o próximo modelo imediatamente
            if (is429) {
              break;
            }

            // Se for 503 (alta demanda transitória), espera 800ms antes da 2ª tentativa
            if (is503 && tentativa === 1) {
              await new Promise((r) => setTimeout(r, 800));
            } else {
              break;
            }
          }
        }

        if (response) {
          break;
        }
      }

      if (!response) {
        throw ultimoErro || new Error('Nenhum modelo Gemini respondeu à solicitação de OCR.');
      }

      const parsed = JSON.parse(response.text || '{}');
      res.json(parsed);
    } catch (error: any) {
      console.error('Erro na rota de OCR de escala:', error);

      let rawMsg = error instanceof Error ? error.message : String(error || '');
      try {
        const parsedJson = JSON.parse(rawMsg);
        if (parsedJson?.error?.message) {
          rawMsg = parsedJson.error.message;
        }
      } catch {
        // rawMsg já contém o texto
      }

      const is503 =
        rawMsg.includes('503') ||
        rawMsg.includes('UNAVAILABLE') ||
        rawMsg.includes('high demand');
      const is429 =
        rawMsg.includes('429') ||
        rawMsg.includes('RESOURCE_EXHAUSTED') ||
        rawMsg.includes('Quota exceeded');

      let mensagemAmigavel = rawMsg;
      let statusCode = 500;

      if (is503) {
        mensagemAmigavel = 'O serviço de IA está temporariamente com alta demanda nos servidores do Google. Por favor, tente novamente em alguns instantes.';
        statusCode = 503;
      } else if (is429) {
        mensagemAmigavel = 'Limite temporário de requisições por minuto da IA atingido. Por favor, aguarde alguns instantes e tente novamente.';
        statusCode = 429;
      }

      res.status(statusCode).json({
        error: mensagemAmigavel,
        isHighDemand: is503 || is429,
      });
    }
  });

  // Middleware do Vite para desenvolvimento e fallback SPA para produção
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
