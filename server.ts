import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // Cliente compartilhado do Gemini no servidor conforme especificações do SKILL.md
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

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

      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

      const prompt = `Você é um assistente especialista em postos de combustíveis e RH operacional.
Analise a fotografia fornecida contendo uma escala de trabalho, quadro de turnos ou folha de horários de frentistas e funcionários do posto.

Colaboradores atualmente cadastrados no posto para conciliação:
${JSON.stringify(funcionariosCadastrados.map((f: { id: string; nome: string; matricula: string; cargo: string }) => ({ id: f.id, nome: f.nome, matricula: f.matricula, cargo: f.cargo })))}

Diretrizes:
1. Extraia o nome dos colaboradores que aparecem na imagem.
2. Compare com a lista de colaboradores já cadastrados (considere variações normais de nomes, abreviações ou apelidos operacionais).
3. Se um colaborador estiver presente na imagem mas NÃO constar nos cadastrados, marque "jaCadastrado": false e preencha "sugestaoCadastroPrevio" com nome, cargo estimado (ex: 'Frentista', 'Operador de Caixa', 'Lava-rápido'), função estimada e turno preferencial.
4. Extraia para cada dia da escala os itens com: nome do colaborador, data no formato YYYY-MM-DD (se o ano/mês não estiver explícito na imagem, utilize o mês atual do calendário 2026), turno (ex: 'Manhã (06h - 14h)', 'Tarde (14h - 22h)', 'Noite (22h - 06h)', '12x36'), horários de início e término, e status ('TRABALHO', 'FOLGA', 'ATESTADO', 'FERIAS').`;

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

startServer();
