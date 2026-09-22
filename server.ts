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
   * - Lê foto da escala impressa / quadro branco / folha de ponto com alta precisão
   * - Identifica orientação, cabeçalhos, datas, siglas e legendas de postos
   * - Faz correspondência inteligente (fuzzy match + apelidos) com funcionários cadastrados
   * - Detecta colaboradores não cadastrados e gera proposta de cadastro prévio
   * - Extrai dias, turnos padronizados (Turno 2, 3, 4, Intermediário, 12x36), folgas e atestados
   * - Retorna índices de confiança e diagnóstico da leitura
   */
  app.post('/api/gemini/escala-ocr', async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType = 'image/jpeg',
        funcionariosCadastrados = [],
        mesAnoReferencia,
      } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
      }

      const ai = getAIClient();
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

      const anoMesAtual = mesAnoReferencia || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const [anoStr, mesStr] = anoMesAtual.split('-');
      const anoNum = parseInt(anoStr, 10) || new Date().getFullYear();
      const mesNum = parseInt(mesStr, 10) || (new Date().getMonth() + 1);
      const diasNoMes = new Date(anoNum, mesNum, 0).getDate();

      const prompt = `Você é um perito em RH operacional de postos de combustíveis e especialista em OCR e visão computacional de documentos de trabalho.
Sua missão é analisar minuciosamente a imagem fornecida (que pode ser uma folha impressa de escala, tabela do Excel impressa, quadro branco de pista, anotação de turnos ou folha de ponto) e extrair com 100% de fidelidade a grade de trabalho dos colaboradores.

CONTEXTO TEMPORAL E CALENDÁRIO:
- Mês e ano de referência priorizado para a escala: ${anoMesAtual} (formato AAAA-MM, com ${diasNoMes} dias).
- Construa a data no formato ISO completo AAAA-MM-DD usando este mês/ano (${anoMesAtual}). Se a tabela listar dias D01, D02, 1, 2, 3... use cada número de dia formatado com 2 dígitos (${anoMesAtual}-01, ${anoMesAtual}-02, etc.).

COLABORADORES CADASTRADOS NO SISTEMA DO POSTO (Use para conciliação inteligente):
${JSON.stringify(
  funcionariosCadastrados.map((f: { id: string; nome: string; matricula: string; cargo: string }) => ({
    id: f.id,
    nome: f.nome,
    matricula: f.matricula,
    cargo: f.cargo,
  }))
)}

REGRAS INVIOLÁVEIS DE EXTRAÇÃO COMPLETA (CRÍTICO - NÃO TRUNQUE!):
1. TODOS OS COLABORADORES: Identifique e extraia CADA UMA das linhas da tabela contendo funcionários. Se a folha tiver 3, 5, 8, 12 ou mais colaboradores, você DEVE extrair TODOS eles, sem omitir ninguém. É expressamente PROIBIDO retornar apenas 1 colaborador.
2. TODOS OS DIAS DA TABELA: Para CADA colaborador, você DEVE extrair a linha horizontal COMPLETA da tabela (todos os dias presentes na folha, de D01 até o último dia da grade, cobrindo todo o período visível, ex: 1 a 31 ou 1 a 7). É expressamente PROIBIDO parar após 5 dias ou truncar a grade. Percorra todas as colunas de datas da esquerda para a direita.
3. CADA CÉLULA = TURNO OU FOLGA:
   - TURNO 2 (06:00 às 14:00): Células com "2", "T2", "T02", "Turno 2", "06-14", "06h às 14h", "06:00", "M", "MAN", "Manhã", "M1" -> turno="Turno 2 (06h - 14h)", horarioInicio="06:00", horarioFim="14:00", status="TRABALHO".
   - TURNO 3 (14:00 às 22:00): Células com "3", "T3", "T03", "Turno 3", "14-22", "14h às 22h", "14:00", "T", "TAR", "Tarde", "T1" -> turno="Turno 3 (14h - 22h)", horarioInicio="14:00", horarioFim="22:00", status="TRABALHO".
   - TURNO 4 (22:00 às 06:00 - Noturno): Células com "4", "T4", "T04", "Turno 4", "22-06", "22h às 06h", "22:00", "N", "NOT", "Noite", "Noturno" -> turno="Turno 4 (22h - 06h)", horarioInicio="22:00", horarioFim="06:00", status="TRABALHO".
   - INTERMEDIÁRIO (10:00 às 18:00): "INT", "10-18", "10h" -> turno="Intermediário (10h - 18h)", horarioInicio="10:00", horarioFim="18:00", status="TRABALHO".
   - 12x36 (07:00 às 19:00): "12x36", "07-19" -> turno="12x36 (07h - 19h)", horarioInicio="07:00", horarioFim="19:00", status="TRABALHO".
   - 12x36 Noturno (19:00 às 07:00): "12x36 N", "19-07" -> turno="12x36 Noturno (19h - 07h)", horarioInicio="19:00", horarioFim="07:00", status="TRABALHO".
   - FOLGAS E DSR: "F", "FOL", "FOLGA", "DSR", "OFF", "DESC", traço ("-") -> status="FOLGA", turno="Folga", horarioInicio="00:00", horarioFim="00:00". NÃO OMITA AS FOLGAS!
   - AFASTADO / FÉRIAS: "AT", "MED", "LIC" -> status="AFASTADO"; "FE", "FER", "FERIAS" -> status="FERIAS".

4. CORRESPONDÊNCIA DE CADASTRO:
   - Para cada colaborador, compare com a lista cadastrada no posto (primeiro nome, sobrenome, apelidos).
   - Se já constar nos cadastrados, preencha funcionarioId com o id e jaCadastrado=true.
   - Se for novo colaborador não cadastrado, marque jaCadastrado=false e forneça sugestaoCadastroPrevio (cargo, função, turnoPreferencial).

Retorne os dados estruturados rigorosamente conforme o esquema JSON definido.`;

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
        systemInstruction:
          'Você é um sistema de OCR e visão computacional de nível industrial especializado em conciliação de escalas de trabalho completas de postos de combustível em JSON.',
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
        temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tituloEscala: { type: Type.STRING, description: 'Título ou cabeçalho do documento' },
            mesReferencia: { type: Type.STRING, description: 'Mês ou período identificado (ex: 2026-09 ou Setembro/2026)' },
            tipoDocumentoIdentificado: {
              type: Type.STRING,
              description: 'Ex: Planilha Impressa Matriz, Quadro Branco com Caneta, Anotação Manuscrita, Escala Semanal de Pista',
            },
            qualidadeImagem: {
              type: Type.STRING,
              description: 'EXCELENTE, BOA, REGULAR ou BAIXA_RESOLUCAO',
            },
            observacoesGerais: {
              type: Type.STRING,
              description: 'Observações do OCR sobre a folha, rasuras, orientação ou legendas detectadas',
            },
            colaboradoresEscala: {
              type: Type.ARRAY,
              description: 'TODOS os colaboradores encontrados nas linhas da escala (NÃO deixe nenhum de fora)',
              items: {
                type: Type.OBJECT,
                properties: {
                  nomeOriginal: { type: Type.STRING, description: 'Nome do colaborador exatamente como está na linha' },
                  cargo: { type: Type.STRING, description: 'Cargo ou função' },
                  jaCadastrado: { type: Type.BOOLEAN },
                  funcionarioId: { type: Type.STRING },
                  confianca: { type: Type.STRING, description: 'ALTA, MEDIA ou BAIXA' },
                  motivoCorrespondencia: { type: Type.STRING },
                  sugestaoCadastroPrevio: {
                    type: Type.OBJECT,
                    properties: {
                      nome: { type: Type.STRING },
                      cargo: { type: Type.STRING },
                      funcao: { type: Type.STRING },
                      turnoPreferencial: { type: Type.STRING },
                    },
                  },
                  dias: {
                    type: Type.ARRAY,
                    description: 'TODOS os dias da tabela para este colaborador (do primeiro ao último dia visível, ex: 1 a 31). NÃO pare no quinto dia!',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        dia: { type: Type.STRING, description: 'Número do dia (ex: "01", "02", ..., "31") ou data AAAA-MM-DD' },
                        diaSemana: { type: Type.STRING, description: 'DOM, SEG, TER, QUA, QUI, SEX, SAB' },
                        turno: { type: Type.STRING, description: 'Turno: "Turno 2 (06h - 14h)", "Turno 3 (14h - 22h)", "Turno 4 (22h - 06h)", "Intermediário (10h - 18h)", "12x36 (07h - 19h)", "Folga"' },
                        horarioInicio: { type: Type.STRING, description: 'HH:MM (06:00, 14:00, 22:00, ou 00:00 para folga)' },
                        horarioFim: { type: Type.STRING, description: 'HH:MM (14:00, 22:00, 06:00, ou 00:00 para folga)' },
                        status: { type: Type.STRING, description: 'TRABALHO ou FOLGA ou AFASTADO ou FERIAS' },
                        codigoOriginal: { type: Type.STRING, description: 'Valor lido na célula: 2, 3, 4, F, FOLGA, OFF, etc' },
                        confianca: { type: Type.STRING, description: 'ALTA, MEDIA ou BAIXA' },
                      },
                      required: ['dia', 'turno', 'status'],
                    },
                  },
                },
                required: ['nomeOriginal', 'dias'],
              },
            },
          },
          required: ['colaboradoresEscala'],
        },
      };

      // Modelos suportados em ordem de preferência e resiliência com chaveamento rápido em pico de demanda
      const modelosCandidatos = [
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
      ];
      let response: any = null;
      let ultimoErro: any = null;

      for (const model of modelosCandidatos) {
        try {
          console.log(`[Gemini OCR Escala] Tentando reconhecimento com ${model}...`);
          response = await ai.models.generateContent({
            model,
            contents,
            config,
          });
          if (response && response.text) {
            console.log(`[Gemini OCR Escala] Sucesso via ${model}!`);
            break;
          }
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

          if (is503) {
            console.log(`[Gemini OCR Escala] Modelo ${model} em alta demanda transitória (503). Alternando imediatamente para o próximo modelo de contingência...`);
          } else if (is429) {
            console.log(`[Gemini OCR Escala] Modelo ${model} com limite de requisições (429). Alternando para modelo alternativo...`);
          } else {
            console.log(`[Gemini OCR Escala] Modelo ${model} indisponível. Alternando para contingência...`);
          }
        }
      }

      if (!response) {
        throw ultimoErro || new Error('Nenhum modelo Gemini respondeu à solicitação de OCR.');
      }

      const parsed = JSON.parse(response.text || '{}');

      // Normalização robusta: transformar colaboradoresEscala em itensEscala e colaboradoresIdentificados
      const colaboradoresEscala = parsed.colaboradoresEscala || parsed.colaboradores || [];
      const colaboradoresIdentificados: any[] = parsed.colaboradoresIdentificados || [];
      const itensEscala: any[] = parsed.itensEscala || [];

      // Mapeamento de funcionários para rápida conciliação
      const listaFuncs = Array.isArray(funcionariosCadastrados) ? funcionariosCadastrados : [];

      if (Array.isArray(colaboradoresEscala) && colaboradoresEscala.length > 0) {
        colaboradoresEscala.forEach((colab: any, colabIdx: number) => {
          const nomeOriginal = String(colab.nomeOriginal || '').trim();
          if (!nomeOriginal) return;

          // Busca correspondência com funcionário cadastrado
          const match = listaFuncs.find(
            (f: any) =>
              f.id === colab.funcionarioId ||
              f.nome.toLowerCase().trim() === nomeOriginal.toLowerCase() ||
              f.nome.toLowerCase().includes(nomeOriginal.toLowerCase()) ||
              nomeOriginal.toLowerCase().includes(f.nome.toLowerCase())
          );

          const colabObj = {
            nomeOriginal,
            jaCadastrado: Boolean(match || colab.jaCadastrado),
            funcionarioId: match ? match.id : colab.funcionarioId,
            confianca: colab.confianca || (match ? 'ALTA' : 'MEDIA'),
            motivoCorrespondencia: match
              ? 'Colaborador cadastrado no posto'
              : (colab.motivoCorrespondencia || 'Identificado na folha da escala'),
            sugestaoCadastroPrevio: match
              ? undefined
              : {
                  nome: colab.sugestaoCadastroPrevio?.nome || nomeOriginal,
                  cargo: colab.cargo || colab.sugestaoCadastroPrevio?.cargo || 'Frentista',
                  funcao: colab.sugestaoCadastroPrevio?.funcao || 'Operacional de Pista',
                  turnoPreferencial: colab.sugestaoCadastroPrevio?.turnoPreferencial || 'Turno 2 (06h - 14h)',
                },
          };

          // Evita duplicar em colaboradoresIdentificados
          const existe = colaboradoresIdentificados.find(
            (c) => c.nomeOriginal.toLowerCase().trim() === nomeOriginal.toLowerCase()
          );
          if (!existe) {
            colaboradoresIdentificados.push(colabObj);
          }

          // Percorre TODOS os dias deste colaborador sem pular nenhum
          const dias = Array.isArray(colab.dias) ? colab.dias : [];
          dias.forEach((d: any, dIdx: number) => {
            let dataIso = '';
            const diaRaw = String(d.dia || '').trim();

            if (diaRaw.includes('-') && diaRaw.length === 10) {
              dataIso = diaRaw;
            } else {
              const diaNum = parseInt(diaRaw.replace(/\D/g, ''), 10);
              if (diaNum >= 1 && diaNum <= 31) {
                dataIso = `${anoMesAtual}-${String(diaNum).padStart(2, '0')}`;
              } else {
                dataIso = `${anoMesAtual}-${String(dIdx + 1).padStart(2, '0')}`;
              }
            }

            const turnoTexto = String(d.turno || '').trim();
            const statusRaw = String(d.status || '').toUpperCase();
            const isFolga =
              statusRaw.includes('FOLGA') ||
              statusRaw === 'F' ||
              statusRaw === 'OFF' ||
              statusRaw === 'DSR' ||
              turnoTexto.toLowerCase().includes('folga') ||
              turnoTexto.toLowerCase() === 'f' ||
              turnoTexto.toLowerCase() === 'dsr' ||
              turnoTexto.toLowerCase() === '-';

            let horarioInicio = d.horarioInicio || (isFolga ? '00:00' : '06:00');
            let horarioFim = d.horarioFim || (isFolga ? '00:00' : '14:00');
            let status = isFolga ? 'FOLGA' : 'TRABALHO';

            if (turnoTexto.includes('14h') || turnoTexto.includes('14-22') || turnoTexto.includes('Turno 3')) {
              horarioInicio = '14:00';
              horarioFim = '22:00';
            } else if (turnoTexto.includes('22h') || turnoTexto.includes('22-06') || turnoTexto.includes('Turno 4')) {
              horarioInicio = '22:00';
              horarioFim = '06:00';
            } else if (turnoTexto.includes('10h') || turnoTexto.includes('10-18') || turnoTexto.includes('Intermediário')) {
              horarioInicio = '10:00';
              horarioFim = '18:00';
            } else if (turnoTexto.includes('12x36')) {
              horarioInicio = turnoTexto.includes('Noturno') ? '19:00' : '07:00';
              horarioFim = turnoTexto.includes('Noturno') ? '07:00' : '19:00';
            }

            // Determinar dia da semana caso não tenha vindo
            let diaSemana = d.diaSemana;
            if (!diaSemana && dataIso) {
              const dt = new Date(`${dataIso}T12:00:00`);
              if (!isNaN(dt.getTime())) {
                const diasSemanaNomes = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
                diaSemana = diasSemanaNomes[dt.getDay()];
              }
            }

            itensEscala.push({
              tempId: `item-${colabIdx}-${dIdx}-${Date.now()}`,
              funcionarioNome: nomeOriginal,
              funcionarioId: colabObj.funcionarioId || '',
              data: dataIso,
              diaSemana: diaSemana || '',
              turno: isFolga ? 'Folga' : (turnoTexto || 'Turno 2 (06h - 14h)'),
              horarioInicio: isFolga ? '00:00' : horarioInicio,
              horarioFim: isFolga ? '00:00' : horarioFim,
              status,
              confianca: d.confianca || 'ALTA',
              observacao: d.codigoOriginal ? `Célula: "${d.codigoOriginal}"` : 'OCR Multimodal Matriz',
            });
          });
        });
      }

      parsed.colaboradoresIdentificados = colaboradoresIdentificados;
      parsed.itensEscala = itensEscala;

      console.log(
        `[Gemini OCR Escala] Extração concluída: ${colaboradoresIdentificados.length} colaboradores e ${itensEscala.length} turnos/folgas identificados no mês ${anoMesAtual}.`
      );

      res.json(parsed);
    } catch (error: any) {
      let rawMsg = error instanceof Error ? error.message : String(error || '');
      try {
        const parsedJson = JSON.parse(rawMsg);
        if (parsedJson?.error?.message) {
          rawMsg = parsedJson.error.message;
        }
      } catch {
        // rawMsg já contém a mensagem limpa
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
        mensagemAmigavel = 'O serviço de IA está temporariamente com alta demanda nos servidores do Google. Ativando contingência operacional.';
        statusCode = 503;
      } else if (is429) {
        mensagemAmigavel = 'Limite temporário de requisições por minuto da IA atingido. Por favor, aguarde alguns instantes.';
        statusCode = 429;
      }

      console.log(`[Gemini OCR Escala] Tratamento da rota: ${mensagemAmigavel}`);

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
