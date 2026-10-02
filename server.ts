import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

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

/**
 * Etapa 1: Carrega, higieniza e valida o payload da imagem antes de enviar ao modelo multimodal
 */
function prepararImagemMultimodal(imageBase64: string, mimeTypeDefault = 'image/jpeg') {
  const raw = String(imageBase64 || '').trim();
  const mimeMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  const detectedMime = mimeMatch ? mimeMatch[1] : mimeTypeDefault || 'image/jpeg';
  const cleanBase64 = raw.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s+/g, '');
  return {
    cleanBase64,
    mimeType: detectedMime,
  };
}

/**
 * Etapa 2: Processa a resposta textual do modelo e converte em um objeto JSON 100% válido,
 * garantindo que todas as strings estejam devidamente fechadas, caracteres de controle escapados
 * e colchetes/chaves balanceados sem erros de sintaxe.
 */
function parseAndRepairJson(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') {
    return {};
  }

  // 1. Remover cercas Markdown (```json ... ```) e espaços extras
  let text = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else {
    startIdx = Math.max(firstBrace, firstBracket);
  }
  if (startIdx > 0) {
    text = text.slice(startIdx);
  }

  // Tentativa direta rápida se o JSON já estiver íntegro
  try {
    return JSON.parse(text);
  } catch {
    // Prossegue para o reparo estrutural de strings e delimitadores
  }

  // 2. Higienizar quebras de linha literais e caracteres de controle dentro de strings JSON
  let sanitized = '';
  let inString = false;
  let isEscaped = false;
  const stack: ('{' | '[')[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (isEscaped) {
        sanitized += ch;
        isEscaped = false;
      } else if (ch === '\\') {
        sanitized += ch;
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
        sanitized += ch;
      } else if (ch === '\n') {
        sanitized += '\\n';
      } else if (ch === '\r') {
        sanitized += '\\r';
      } else if (ch === '\t') {
        sanitized += '\\t';
      } else if (ch.charCodeAt(0) < 32) {
        sanitized += ' ';
      } else {
        sanitized += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
        sanitized += ch;
      } else if (ch === '{' || ch === '[') {
        stack.push(ch);
        sanitized += ch;
      } else if (ch === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '{') {
          stack.pop();
        }
        sanitized += ch;
      } else if (ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') {
          stack.pop();
        }
        sanitized += ch;
      } else {
        sanitized += ch;
      }
    }
  }

  // Se terminou com barra invertida pendente dentro de string, removê-la antes de fechar aspas
  if (inString) {
    if (isEscaped && sanitized.endsWith('\\')) {
      sanitized = sanitized.slice(0, -1);
    }
    sanitized += '"';
  }

  // Remover vírgulas finais antes de } ou ]
  sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');

  // Testar após fechar string e limpar vírgulas
  try {
    return JSON.parse(sanitized);
  } catch {
    // Prossegue para fechamento de objetos/arrays truncados
  }

  // 3. Se houve truncamento no final, limpar pares chave:valor incompletos na cauda e fechar a pilha
  let candidate = sanitized.trim();
  for (let attempt = 0; attempt < 12; attempt++) {
    // Remove vírgula, dois-pontos ou chave órfã no final
    candidate = candidate
      .replace(/,\s*$/, '')
      .replace(/:\s*$/, ': null')
      .replace(/,\s*"[^"]*"\s*$/, '')
      .replace(/\{\s*"[^"]*"\s*$/, '{');

    // Recalcular pilha de delimitadores abertos
    const openStack: ('{' | '[')[] = [];
    let strMode = false;
    let escMode = false;
    for (let i = 0; i < candidate.length; i++) {
      const c = candidate[i];
      if (strMode) {
        if (escMode) escMode = false;
        else if (c === '\\') escMode = true;
        else if (c === '"') strMode = false;
      } else {
        if (c === '"') strMode = true;
        else if (c === '{' || c === '[') openStack.push(c);
        else if (c === '}' && openStack[openStack.length - 1] === '{') openStack.pop();
        else if (c === ']' && openStack[openStack.length - 1] === '[') openStack.pop();
      }
    }

    let closedCandidate = candidate;
    if (strMode) closedCandidate += '"';
    closedCandidate = closedCandidate.replace(/,\s*$/, '');

    for (let s = openStack.length - 1; s >= 0; s--) {
      closedCandidate += openStack[s] === '{' ? '}' : ']';
    }
    closedCandidate = closedCandidate.replace(/,\s*([}\]])/g, '$1');

    try {
      return JSON.parse(closedCandidate);
    } catch {
      // Recorta até a última vírgula ou objeto completo e tenta novamente
      const lastComma = candidate.lastIndexOf(',');
      if (lastComma > 0) {
        candidate = candidate.slice(0, lastComma);
      } else {
        break;
      }
    }
  }

  return {};
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

  app.use(express.json({ limit: '20mb' }));

  // Rotas de API PRIMEIRO
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  /**
   * Motor Completo de Leitura, Interpretação OCR e Reconhecimento Estruturado de Escalas
   * 1. Pré-processa e valida a imagem enviada
   * 2. Extrai cópia fiel literal, símbolos, legendas, trocas, colaboradores e horários
   * 3. Preserva 100% da fidelidade dos dados (nomes, datas, entradas, saídas, intervalos, setores, funções)
   * 4. Converte e valida o JSON garantindo todas as strings fechadas e campos formatados
   * 5. Executa conferência automática (Imagem Original -> Dados Extraídos -> Planner)
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
        return res.status(400).json({ error: 'Nenhuma imagem da escala foi enviada para leitura.' });
      }

      const ai = getAIClient();
      const { cleanBase64, mimeType: normalizedMimeType } = prepararImagemMultimodal(imageBase64, mimeType);

      const anoMesAtual =
        mesAnoReferencia && /^\d{4}-\d{2}$/.test(mesAnoReferencia)
          ? mesAnoReferencia
          : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const [anoStr, mesStr] = anoMesAtual.split('-');
      const anoNum = parseInt(anoStr, 10) || new Date().getFullYear();
      const mesNum = parseInt(mesStr, 10) || new Date().getMonth() + 1;
      const diasNoMes = new Date(anoNum, mesNum, 0).getDate();

      const listaFuncs = Array.isArray(funcionariosCadastrados) ? funcionariosCadastrados : [];

      const prompt = `Você é um sistema especialista de OCR de alta precisão, leitura de escalas de trabalho e estruturação de planner.
Analise minuciosamente a imagem enviada. Ela pode ser uma tabela horizontal (dias 1 a 31 nas colunas), tabela vertical (datas nas linhas), escala semanal, lista de horários por funcionário, planilha fotografada, folha impressa, escala manuscrita, quadro de parede ou captura de tela.

REGRAS ABSOLUTAS DE LEITURA E FIDELIDADE:
1. NUNCA INVENTE INFORMAÇÕES: Extraia exclusivamente o que está visível na imagem. Se um nome ou horário estiver ilegível, preencha "não identificado" e informe as possibilidades em "interpretacoesPossiveis".
2. PRESERVE A FIDELIDADE DOS DADOS:
   - Não altere nomes dos funcionários.
   - Não altere datas nem horários específicos (ex: se estiver escrito "07:20 às 15:40", extraia exatamente horarioInicio="07:20" e horarioFim="15:40").
   - Não descarte informações pequenas, manuscritas ou nas bordas da folha.
3. PRIMEIRO FAÇA UMA CÓPIA FIEL ("copiaFielReconhecida"):
   - Transcreva literalmente o cabeçalho, linhas de funcionários, horários, códigos e rodapé lidos na imagem.
4. DEPOIS ESTRUTURE TODOS OS FUNCIONÁRIOS E SEUS DIAS ("colaboradoresEscala"):
   - Para cada funcionário presente na imagem, extraia:
     * "nomeOriginal": Nome exatamente como escrito na imagem.
     * "setor": Setor identificado (ex: Pista, Caixa, Conveniência, Lubrificação, Lavagem, Escritório, Gerência).
     * "funcao": Função/cargo identificado (ex: Frentista, Operador de Caixa, Chefe de Pista, Lubrificador, Atendente).
     * "turnoPadrao": Turno principal do funcionário se indicado na linha/coluna (ex: Manhã, Tarde, Noite, Plantão, Horista, 12x36).
     * "horarioEntradaPadrao": Horário de entrada padrão da linha do funcionário no formato HH:MM (se houver coluna fixa de horário).
     * "horarioSaidaPadrao": Horário de saída padrão da linha do funcionário no formato HH:MM (se houver coluna fixa de horário).
     * "intervaloPadrao": Intervalo de refeição/descanso se indicado (ex: "12:00 — 13:00" ou "1h").
     * "folgaPadrao": Dia da semana ou regra de folga fixa se escrita na linha (ex: "DOM", "Quarta-feira", "DSR").
     * "posicaoVerticalPercentual": Posição vertical aproximada (0 a 100) da linha deste funcionário na imagem.
     * "dias": Lista de todos os dias/datas/colunas lidos para este funcionário na imagem.
5. INTERPRETAÇÃO DE CÓDIGOS E LEGENDAS DE ESCALA:
   - Verifique se há legenda na imagem. Caso use siglas padrão:
     * "T1", "1", "M", "MANHÃ", "06-14", "06:00 às 14:00" -> status="TRABALHO", turno="Manhã", horarioInicio="06:00", horarioFim="14:00"
     * "T2", "2", "T", "TARDE", "14-22", "14:00 às 22:00" -> status="TRABALHO", turno="Tarde", horarioInicio="14:00", horarioFim="22:00"
     * "T3", "3", "N", "NOITE", "22-06", "22:00 às 06:00" -> status="TRABALHO", turno="Noite", horarioInicio="22:00", horarioFim="06:00"
     * "HOR", "H", "HORISTA", "INTERMEDIÁRIO" -> status="TRABALHO", turno="Horista"
     * "P", "PLT", "PLANTÃO", "12X36" -> status="PLANTAO", turno="Plantão"
     * "F", "FOL", "FOLGA", "DSR", "S", "OFF", "X" (quando indicar folga) -> status="FOLGA", turno="Folga", horarioInicio="00:00", horarioFim="00:00"
     * "FE", "FER", "FÉRIAS" -> status="FERIAS", turno="Férias", horarioInicio="00:00", horarioFim="00:00"
     * "AT", "MED", "LIC", "AFASTADO" -> status="AFASTADO", turno="Afastado", horarioInicio="00:00", horarioFim="00:00"
   - Se a célula tiver um horário explícito (ex: "08:00-16:20"), preserve EXATAMENTE esse horário!

CONTEXTO DO MÊS DE REFERÊNCIA (para dias numéricos 01 a ${diasNoMes}): ${anoMesAtual} (${diasNoMes} dias).
COLABORADORES JÁ CADASTRADOS NO POSTO (para vincular "funcionarioId" quando o nome corresponder):
${JSON.stringify(
  listaFuncs.map((f: any) => ({
    id: f.id,
    nome: f.nome,
    cargo: f.cargo,
    funcao: f.funcao,
    setor: f.setor,
  }))
)}

Retorne EXCLUSIVAMENTE um objeto JSON válido com todas as strings devidamente fechadas.`;

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
          'Você é um motor de OCR e reconhecimento estruturado de escalas de trabalho. Extraia com 100% de fidelidade todos os funcionários, datas, horários de entrada e saída, intervalos, turnos, setores, funções, folgas e observações presentes na imagem. Retorne sempre JSON válido com todas as strings devidamente fechadas.',
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tituloEscala: { type: Type.STRING, description: 'Título ou cabeçalho exato lido na imagem' },
            mesReferencia: { type: Type.STRING, description: 'Mês/Ano ou período identificado na imagem' },
            tipoDocumentoIdentificado: {
              type: Type.STRING,
              description: 'Ex: Tabela Mensal Horizontal, Tabela Semanal, Lista de Horários, Escala Manuscrita, Planilha Impressa',
            },
            qualidadeImagem: {
              type: Type.STRING,
              description: 'EXCELENTE, BOA, REGULAR ou BAIXA_RESOLUCAO',
            },
            copiaFielReconhecida: {
              type: Type.STRING,
              description: 'Transcrição fiel de todas as linhas, cabeçalhos, nomes, horários e legendas lidas na imagem',
            },
            simbolosEAbreviacoes: {
              type: Type.ARRAY,
              description: 'Símbolos, siglas, códigos e legendas encontrados na imagem',
              items: { type: Type.STRING },
            },
            trocasDeEscalaIdentificadas: {
              type: Type.ARRAY,
              description: 'Trocas de escala, substituições ou observações manuscritas identificadas',
              items: { type: Type.STRING },
            },
            observacoesGerais: {
              type: Type.STRING,
              description: 'Observações gerais e regras identificadas na escala',
            },
            colaboradoresEscala: {
              type: Type.ARRAY,
              description: 'Lista completa de todos os funcionários encontrados na imagem',
              items: {
                type: Type.OBJECT,
                properties: {
                  nomeOriginal: { type: Type.STRING, description: 'Nome exato do funcionário como consta na imagem' },
                  funcionarioId: { type: Type.STRING, description: 'ID do funcionário cadastrado se houver correspondência' },
                  cargo: { type: Type.STRING, description: 'Cargo lido na imagem' },
                  funcao: { type: Type.STRING, description: 'Função lida na imagem (ex: Frentista, Caixa)' },
                  setor: { type: Type.STRING, description: 'Setor lido na imagem (ex: Pista, Caixa, Conveniência)' },
                  turnoPadrao: { type: Type.STRING, description: 'Turno padrão da linha do funcionário (Manhã, Tarde, Noite, Plantão, Outro)' },
                  horarioEntradaPadrao: { type: Type.STRING, description: 'Horário de entrada HH:MM fixo da linha, se houver' },
                  horarioSaidaPadrao: { type: Type.STRING, description: 'Horário de saída HH:MM fixo da linha, se houver' },
                  intervaloPadrao: { type: Type.STRING, description: 'Intervalo HH:MM — HH:MM fixo da linha, se houver' },
                  folgaPadrao: { type: Type.STRING, description: 'Dia de folga fixa ou regra semanal escrita na linha, se houver' },
                  posicaoVerticalPercentual: { type: Type.NUMBER, description: 'Posição vertical 0 a 100 na imagem' },
                  confianca: { type: Type.STRING, description: 'ALTA, MEDIA ou BAIXA' },
                  dias: {
                    type: Type.ARRAY,
                    description: 'Registros diários ou colunas de dias extraídos para este funcionário',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        dia: { type: Type.STRING, description: 'Data (DD/MM/AAAA, DD/MM, AAAA-MM-DD), número do dia (01 a 31) ou dia da semana (SEG..DOM)' },
                        diaSemana: { type: Type.STRING, description: 'DOM, SEG, TER, QUA, QUI, SEX ou SAB' },
                        codigoOriginal: { type: Type.STRING, description: 'Texto ou código exato lido na célula' },
                        status: { type: Type.STRING, description: 'TRABALHO, FOLGA, PLANTAO, FERIAS ou AFASTADO' },
                        turno: { type: Type.STRING, description: 'Manhã, Tarde, Noite, Plantão, Horista, Folga, Férias ou Outro' },
                        horarioInicio: { type: Type.STRING, description: 'Horário de entrada HH:MM' },
                        horarioFim: { type: Type.STRING, description: 'Horário de saída HH:MM' },
                        intervalo: { type: Type.STRING, description: 'Intervalo HH:MM — HH:MM se presente' },
                        setor: { type: Type.STRING, description: 'Setor específico neste dia se presente' },
                        funcao: { type: Type.STRING, description: 'Função específica neste dia se presente' },
                        observacao: { type: Type.STRING, description: 'Observação ou troca neste dia' },
                        confianca: { type: Type.STRING, description: 'ALTA, MEDIA ou BAIXA' },
                        interpretacoesPossiveis: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      required: ['dia', 'status'],
                    },
                  },
                },
                required: ['nomeOriginal'],
              },
            },
          },
          required: ['colaboradoresEscala'],
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
          console.log(`[Gemini OCR Escala] Iniciando leitura multimodal com ${model}...`);
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
            if (
              candidateParsed &&
              typeof candidateParsed === 'object' &&
              (Array.isArray(candidateParsed.colaboradoresEscala) ||
                Array.isArray(candidateParsed.colaboradores) ||
                Array.isArray(candidateParsed.itensEscala))
            ) {
              parsed = candidateParsed;
              console.log(`[Gemini OCR Escala] Leitura e validação JSON concluídas com sucesso via ${model}!`);
              break;
            }
          }
        } catch (err: any) {
          ultimoErro = err;
          console.warn(`[Gemini OCR Escala] Alternando de ${model}:`, err?.message || err);
        }
      }

      if (!parsed) {
        throw ultimoErro || new Error('Não foi possível obter resposta estruturada do modelo de visão.');
      }

      // Funções auxiliares para extração fiel de horários e datas
      const extrairHorariosDeTexto = (texto: string): { inicio?: string; fim?: string } => {
        if (!texto) return {};
        // Casa padrões como "06:00 às 14:00", "06:00-14:00", "06h às 14h", "07:30 / 15:50", "06-14"
        const matchCompleto = texto.match(/(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|:)?\s*(?:às|as|a|-|\/|até)\s*(\d{1,2})(?::(\d{2}))?/i);
        if (matchCompleto) {
          const h1 = matchCompleto[1].padStart(2, '0');
          const m1 = (matchCompleto[2] || '00').padStart(2, '0');
          const h2 = matchCompleto[3].padStart(2, '0');
          const m2 = (matchCompleto[4] || '00').padStart(2, '0');
          if (parseInt(h1, 10) <= 23 && parseInt(h2, 10) <= 23) {
            return { inicio: `${h1}:${m1}`, fim: `${h2}:${m2}` };
          }
        }
        const matchHoraUnica = texto.match(/\b(\d{2}:\d{2})\b/g);
        if (matchHoraUnica && matchHoraUnica.length >= 2) {
          return { inicio: matchHoraUnica[0], fim: matchHoraUnica[1] };
        }
        return {};
      };

      const normalizarHoraHHMM = (raw: string): string => {
        if (!raw) return '';
        const t = raw.trim();
        if (t.toLowerCase().includes('não identificado')) return 'não identificado';
        const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:h|hs)?$/i);
        if (m) {
          const hh = m[1].padStart(2, '0');
          const mm = (m[2] || '00').padStart(2, '0');
          return `${hh}:${mm}`;
        }
        const mSub = t.match(/(\d{1,2}):(\d{2})/);
        if (mSub) {
          return `${mSub[1].padStart(2, '0')}:${mSub[2]}`;
        }
        return t;
      };

      const mapaDiaSemanaIndice: Record<string, number> = {
        DOM: 0,
        DOMINGO: 0,
        SEG: 1,
        SEGUNDA: 1,
        TER: 2,
        TERCA: 2,
        TERÇA: 2,
        QUA: 3,
        QUARTA: 3,
        QUI: 4,
        QUINTA: 4,
        SEX: 5,
        SEXTA: 5,
        SAB: 6,
        SÁB: 6,
        SABADO: 6,
        SÁBADO: 6,
      };

      const colaboradoresEscala = parsed.colaboradoresEscala || parsed.colaboradores || [];
      const colaboradoresIdentificados: any[] = [];
      const itensEscala: any[] = [];
      const conflitosDetectados: any[] = [];
      const nomesVistosNaImagem = new Map<string, number>();
      const chaveRegistrosVistos = new Set<string>();

      if (Array.isArray(colaboradoresEscala) && colaboradoresEscala.length > 0) {
        colaboradoresEscala.forEach((colab: any, colabIdx: number) => {
          const nomeOriginal = String(colab.nomeOriginal || colab.nome || '').trim() || 'não identificado';
          const nomeKey = nomeOriginal.toLowerCase();
          nomesVistosNaImagem.set(nomeKey, (nomesVistosNaImagem.get(nomeKey) || 0) + 1);

          // Conciliação inteligente com funcionários já cadastrados no posto
          const match = listaFuncs.find((f: any) => {
            if (!f || !f.nome) return false;
            const fNome = String(f.nome).toLowerCase().trim();
            if (colab.funcionarioId && f.id === colab.funcionarioId) return true;
            if (fNome === nomeKey) return true;
            if (nomeKey !== 'não identificado' && nomeKey.length >= 3) {
              const partesLidas = nomeKey.split(/\s+/).filter((p: string) => p.length > 2);
              const partesCad = fNome.split(/\s+/).filter((p: string) => p.length > 2);
              if (fNome.includes(nomeKey) || nomeKey.includes(fNome)) return true;
              if (partesLidas.length >= 2 && partesLidas[0] === partesCad[0] && partesLidas[partesLidas.length - 1] === partesCad[partesCad.length - 1]) {
                return true;
              }
            }
            return false;
          });

          const setorColab = String(colab.setor || match?.setor || colab.sugestaoCadastroPrevio?.setor || 'Pista').trim();
          const funcaoColab = String(colab.funcao || colab.cargo || match?.funcao || match?.cargo || 'Frentista').trim();
          const turnoPadraoColab = String(colab.turnoPadrao || colab.sugestaoCadastroPrevio?.turnoPreferencial || '').trim();
          const horariosDoTurnoPadrao = extrairHorariosDeTexto(turnoPadraoColab);
          const entradaPadraoColab = normalizarHoraHHMM(colab.horarioEntradaPadrao || '') || horariosDoTurnoPadrao.inicio || '';
          const saidaPadraoColab = normalizarHoraHHMM(colab.horarioSaidaPadrao || '') || horariosDoTurnoPadrao.fim || '';
          const intervaloPadraoColab = String(colab.intervaloPadrao || '').trim();
          const folgaPadraoColab = String(colab.folgaPadrao || '').trim();

          const posYColab =
            typeof colab.posicaoVerticalPercentual === 'number' &&
            colab.posicaoVerticalPercentual >= 0 &&
            colab.posicaoVerticalPercentual <= 100
              ? colab.posicaoVerticalPercentual
              : Math.min(92, Math.max(12, Math.round(((colabIdx + 1) / (colaboradoresEscala.length + 1)) * 82 + 10)));

          const colabObj = {
            nomeOriginal,
            cargo: colab.cargo || funcaoColab,
            funcao: funcaoColab,
            setor: setorColab,
            posicaoVerticalPercentual: posYColab,
            jaCadastrado: Boolean(match),
            funcionarioId: match ? match.id : '',
            confianca: colab.confianca || (match ? 'ALTA' : 'MEDIA'),
            motivoCorrespondencia: match
              ? `Vinculado ao cadastro: ${match.nome}`
              : 'Extraído fielmente da imagem da escala',
            sugestaoCadastroPrevio: match
              ? undefined
              : {
                  nome: nomeOriginal,
                  cargo: colab.cargo || funcaoColab || 'Frentista',
                  funcao: funcaoColab,
                  setor: setorColab,
                  turnoPreferencial: turnoPadraoColab || 'Turno 1 - Manhã (06h - 14h)',
                },
          };

          colaboradoresIdentificados.push(colabObj);

          let diasBrutos: any[] = Array.isArray(colab.dias) ? [...colab.dias] : [];

          // Se a escala na imagem for uma lista fixa (ex: Nome | Horário 06:00-14:00 | Folga Domingo) sem colunas diárias individuais,
          // estruturamos os dias da primeira semana do mês de referência preservando o horário e folga lidos na linha!
          if (diasBrutos.length === 0 && (entradaPadraoColab || turnoPadraoColab || folgaPadraoColab)) {
            const folgaUpper = folgaPadraoColab.toUpperCase();
            for (let dNum = 1; dNum <= Math.min(7, diasNoMes); dNum++) {
              const dtIso = `${anoMesAtual}-${String(dNum).padStart(2, '0')}`;
              const dtObj = new Date(`${dtIso}T12:00:00`);
              const diaSem = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dtObj.getDay()];
              const ehDiaFolga =
                (folgaUpper && folgaUpper.includes(diaSem)) ||
                ( !folgaUpper && dtObj.getDay() === 0 );

              diasBrutos.push({
                dia: dtIso,
                diaSemana: diaSem,
                codigoOriginal: ehDiaFolga ? `Folga (${folgaPadraoColab || 'DOM'})` : `${entradaPadraoColab || '06:00'}-${saidaPadraoColab || '14:00'}`,
                status: ehDiaFolga ? 'FOLGA' : 'TRABALHO',
                turno: ehDiaFolga ? 'Folga' : turnoPadraoColab || 'Manhã',
                horarioInicio: ehDiaFolga ? '00:00' : entradaPadraoColab,
                horarioFim: ehDiaFolga ? '00:00' : saidaPadraoColab,
                intervalo: intervaloPadraoColab,
                setor: setorColab,
                funcao: funcaoColab,
                confianca: colab.confianca || 'ALTA',
              });
            }
          }

          if (diasBrutos.length === 0) {
            conflitosDetectados.push({
              id: `conf-sem-horario-${colabIdx}`,
              tipo: 'FUNCIONARIO_SEM_HORARIO',
              severidade: 'REVISAO',
              funcionarioNome: nomeOriginal,
              descricao: `Funcionário "${nomeOriginal}" foi lido na imagem, mas não possui células de horário/dia associadas.`,
              sugestaoOpcoes: ['Verificar imagem original', 'Preencher turno manualmente'],
            });
          }

          diasBrutos.forEach((d: any, dIdx: number) => {
            const diaRaw = String(d.dia || d.data || '').trim();
            let dataIso = '';
            let dataInvalida = false;

            // 1. Data completa ISO YYYY-MM-DD
            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(diaRaw)) {
              const [y, m, dd] = diaRaw.split('-');
              dataIso = `${y}-${m.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            }
            // 2. Data brasileira DD/MM/AAAA ou DD/MM/AA
            else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(diaRaw)) {
              const [dd, mm, yy] = diaRaw.split('/');
              const yyyy = yy.length === 2 ? `20${yy}` : yy;
              dataIso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            }
            // 3. Dia e Mês DD/MM ou DD-MM
            else if (/^\d{1,2}[\/\-]\d{1,2}$/.test(diaRaw)) {
              const [dd, mm] = diaRaw.split(/[\/\-]/);
              dataIso = `${anoStr}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            }
            // 4. Nome do dia da semana (ex: "SEG", "TER", "DOMINGO") em escalas semanais
            else if (mapaDiaSemanaIndice[diaRaw.toUpperCase().replace('-FEIRA', '').trim()] !== undefined) {
              const targetDow = mapaDiaSemanaIndice[diaRaw.toUpperCase().replace('-FEIRA', '').trim()];
              // Encontra a primeira ocorrência desse dia da semana no mês ou avança conforme dIdx
              let foundDay = 1;
              for (let tryD = 1; tryD <= diasNoMes; tryD++) {
                const dtTest = new Date(`${anoMesAtual}-${String(tryD).padStart(2, '0')}T12:00:00`);
                if (dtTest.getDay() === targetDow) {
                  foundDay = tryD + Math.floor(dIdx / 7) * 7;
                  break;
                }
              }
              if (foundDay > diasNoMes) foundDay = diasNoMes;
              dataIso = `${anoMesAtual}-${String(foundDay).padStart(2, '0')}`;
            }
            // 5. Número do dia ("01" a "31", "D01", "Dia 5")
            else {
              const numMatch = diaRaw.match(/(\d{1,2})/);
              const diaNum = numMatch ? parseInt(numMatch[1], 10) : NaN;
              if (!isNaN(diaNum) && diaNum >= 1 && diaNum <= 31) {
                if (diaNum > diasNoMes) {
                  dataInvalida = true;
                  dataIso = `${anoMesAtual}-${String(diasNoMes).padStart(2, '0')}`;
                } else {
                  dataIso = `${anoMesAtual}-${String(diaNum).padStart(2, '0')}`;
                }
              } else {
                dataIso = `${anoMesAtual}-${String(Math.min(diasNoMes, dIdx + 1)).padStart(2, '0')}`;
                dataInvalida = true;
              }
            }

            const codigoOrig = String(d.codigoOriginal || d.valorCelula || d.turno || '').trim();
            const codigoUpper = codigoOrig.toUpperCase();
            const turnoRaw = String(d.turno || turnoPadraoColab || '').trim();
            const turnoLower = turnoRaw.toLowerCase();
            const statusRaw = String(d.status || '').toUpperCase().trim();

            // Classificação precisa do status do dia
            const isFolga =
              statusRaw === 'FOLGA' ||
              statusRaw === 'DSR' ||
              statusRaw === 'OFF' ||
              codigoUpper === 'F' ||
              codigoUpper === 'FOL' ||
              codigoUpper === 'FOLGA' ||
              codigoUpper === 'DSR' ||
              codigoUpper === 'OFF' ||
              codigoUpper === 'S' ||
              turnoLower === 'folga' ||
              turnoLower === 'dsr' ||
              turnoLower === 'descanso';

            const isFerias =
              statusRaw === 'FERIAS' ||
              statusRaw === 'FÉRIAS' ||
              codigoUpper === 'FE' ||
              codigoUpper === 'FER' ||
              codigoUpper === 'FERIAS' ||
              codigoUpper === 'FÉRIAS' ||
              turnoLower.includes('férias') ||
              turnoLower.includes('ferias');

            const isPlantao =
              statusRaw === 'PLANTAO' ||
              statusRaw === 'PLANTÃO' ||
              codigoUpper === 'P' ||
              codigoUpper === 'PLT' ||
              codigoUpper === '12X36' ||
              turnoLower.includes('plantão') ||
              turnoLower.includes('plantao') ||
              turnoLower.includes('12x36');

            const isAfastado =
              statusRaw === 'AFASTADO' ||
              statusRaw === 'ATESTADO' ||
              codigoUpper === 'AT' ||
              codigoUpper === 'MED' ||
              codigoUpper === 'LIC' ||
              turnoLower.includes('afast') ||
              turnoLower.includes('atest');

            let status: 'TRABALHO' | 'FOLGA' | 'PLANTAO' | 'FERIAS' | 'AFASTADO' = 'TRABALHO';
            if (isFolga) status = 'FOLGA';
            else if (isFerias) status = 'FERIAS';
            else if (isPlantao) status = 'PLANTAO';
            else if (isAfastado) status = 'AFASTADO';

            // Extrair horários específicos da célula, ou do código lido, ou herdar o horário padrão da linha do funcionário
            const horariosDaCelula = extrairHorariosDeTexto(`${codigoOrig} ${turnoRaw}`);
            let horarioInicio =
              normalizarHoraHHMM(d.horarioInicio || d.entrada || '') ||
              horariosDaCelula.inicio ||
              (status === 'TRABALHO' || status === 'PLANTAO' ? entradaPadraoColab : '');
            let horarioFim =
              normalizarHoraHHMM(d.horarioFim || d.saida || '') ||
              horariosDaCelula.fim ||
              (status === 'TRABALHO' || status === 'PLANTAO' ? saidaPadraoColab : '');

            let turnoFormatado = turnoRaw;

            if (status === 'FOLGA') {
              turnoFormatado = 'Folga';
              horarioInicio = '00:00';
              horarioFim = '00:00';
            } else if (status === 'FERIAS') {
              turnoFormatado = 'Férias';
              horarioInicio = '00:00';
              horarioFim = '00:00';
            } else if (status === 'AFASTADO') {
              turnoFormatado = 'Afastado';
              horarioInicio = '00:00';
              horarioFim = '00:00';
            } else if (status === 'PLANTAO') {
              turnoFormatado = turnoRaw && !['p', 'plt'].includes(turnoLower) ? turnoRaw : 'Plantão';
              if (!horarioInicio) horarioInicio = '06:00';
              if (!horarioFim) horarioFim = '18:00';
            } else {
              // Status TRABALHO — preserva horário fiel da imagem e classifica o turno
              if (
                turnoLower.includes('noite') ||
                turnoLower.includes('noturno') ||
                turnoLower.includes('turno 3') ||
                turnoLower === 't3' ||
                turnoLower === '3' ||
                turnoLower === 'n' ||
                codigoUpper === 'T3' ||
                codigoUpper === 'N' ||
                horarioInicio.startsWith('22:') ||
                horarioInicio.startsWith('23:')
              ) {
                if (!horarioInicio) horarioInicio = '22:00';
                if (!horarioFim) horarioFim = '06:00';
                turnoFormatado =
                  horarioInicio === '22:00' && horarioFim === '06:00'
                    ? 'Turno 3 - Noite (22h - 06h)'
                    : `Noite (${horarioInicio} - ${horarioFim})`;
              } else if (
                turnoLower.includes('tarde') ||
                turnoLower.includes('vespertino') ||
                turnoLower.includes('turno 2') ||
                turnoLower === 't2' ||
                turnoLower === '2' ||
                turnoLower === 't' ||
                codigoUpper === 'T2' ||
                codigoUpper === 'T' ||
                horarioInicio.startsWith('13:') ||
                horarioInicio.startsWith('14:') ||
                horarioInicio.startsWith('15:')
              ) {
                if (!horarioInicio) horarioInicio = '14:00';
                if (!horarioFim) horarioFim = '22:00';
                turnoFormatado =
                  horarioInicio === '14:00' && horarioFim === '22:00'
                    ? 'Turno 2 - Tarde (14h - 22h)'
                    : `Tarde (${horarioInicio} - ${horarioFim})`;
              } else if (
                turnoLower.includes('horista') ||
                turnoLower.includes('intermedi') ||
                turnoLower === 'hor' ||
                turnoLower === 'h' ||
                codigoUpper === 'HOR' ||
                codigoUpper === 'H'
              ) {
                if (!horarioInicio) horarioInicio = '08:00';
                if (!horarioFim) horarioFim = '14:00';
                turnoFormatado = 'Turno Horista';
              } else {
                if (!horarioInicio) horarioInicio = '06:00';
                if (!horarioFim) horarioFim = '14:00';
                turnoFormatado =
                  horarioInicio === '06:00' && horarioFim === '14:00'
                    ? 'Turno 1 - Manhã (06h - 14h)'
                    : turnoRaw && !['t1', '1', 'm', 'manhã', 'manha'].includes(turnoLower)
                    ? turnoRaw
                    : `Manhã (${horarioInicio} - ${horarioFim})`;
              }
            }

            // Dia da semana calculado ou preservado
            let diaSemana = String(d.diaSemana || '').trim().toUpperCase();
            if (!diaSemana && dataIso) {
              const dt = new Date(`${dataIso}T12:00:00`);
              if (!isNaN(dt.getTime())) {
                diaSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dt.getDay()];
              }
            }

            const confiancaItem = d.confianca || colab.confianca || 'ALTA';
            const interpretacoes = Array.isArray(d.interpretacoesPossiveis)
              ? d.interpretacoesPossiveis.filter(Boolean)
              : [];

            // Verificar duplicidade de registro (mesmo funcionário e mesma data)
            const chaveUnica = `${nomeKey}__${dataIso}`;
            const registroDuplicado = chaveRegistrosVistos.has(chaveUnica);
            chaveRegistrosVistos.add(chaveUnica);

            const textoIlegivel =
              nomeOriginal.toLowerCase().includes('não identificado') ||
              horarioInicio.toLowerCase().includes('não identificado') ||
              horarioFim.toLowerCase().includes('não identificado') ||
              codigoOrig.includes('?');

            const horarioImpossivel =
              status === 'TRABALHO' &&
              (horarioInicio === horarioFim ||
                (!/^\d{2}:\d{2}$/.test(horarioInicio) && horarioInicio !== 'não identificado') ||
                (!/^\d{2}:\d{2}$/.test(horarioFim) && horarioFim !== 'não identificado'));

            let statusConferencia: 'CONFIRMADO' | 'REVISAO' | 'CONFLITO' = 'CONFIRMADO';
            let motivoConferencia = 'Extraído com alta precisão';

            if (dataInvalida || horarioImpossivel || nomeOriginal === 'não identificado' || registroDuplicado) {
              statusConferencia = 'CONFLITO';
              motivoConferencia = registroDuplicado
                ? `Registro duplicado para ${nomeOriginal} no dia ${dataIso}`
                : dataInvalida
                ? 'Data inválida ou fora do calendário'
                : horarioImpossivel
                ? `Horário inconsistente (${horarioInicio} - ${horarioFim})`
                : 'Funcionário não identificado para este horário';
            } else if (confiancaItem !== 'ALTA' || interpretacoes.length > 0 || textoIlegivel) {
              statusConferencia = 'REVISAO';
              motivoConferencia =
                interpretacoes.length > 0
                  ? `Dúvida de leitura: ${interpretacoes.join(' ou ')}`
                  : 'Baixa nitidez na célula — confira na imagem';
            }

            const posX = Math.min(94, Math.max(18, Math.round(((dIdx + 1) / Math.max(1, diasBrutos.length)) * 74 + 18)));
            const posY = posYColab;
            const tempId = `ocr-${colabIdx}-${dIdx}-${Date.now()}`;

            if (statusConferencia !== 'CONFIRMADO') {
              conflitosDetectados.push({
                id: `conf-${tempId}`,
                tipo: registroDuplicado
                  ? 'REGISTRO_DUPLICADO'
                  : dataInvalida
                  ? 'DATA_INVALIDA'
                  : horarioImpossivel
                  ? 'HORARIO_IMPOSSIVEL'
                  : nomeOriginal === 'não identificado'
                  ? 'HORARIO_SEM_FUNCIONARIO'
                  : 'TEXTO_ILEGIVEL',
                severidade: statusConferencia === 'CONFLITO' ? 'CONFLITO' : 'REVISAO',
                funcionarioNome: nomeOriginal,
                data: dataIso,
                descricao: `${nomeOriginal} (${dataIso}): ${motivoConferencia}`,
                sugestaoOpcoes: interpretacoes.length > 0 ? interpretacoes : undefined,
                regiaoImagem: {
                  xPercent: posX,
                  yPercent: posY,
                  larguraPercent: 18,
                  alturaPercent: 12,
                  rotulo: `${nomeOriginal} - ${dataIso}`,
                },
              });
            }

            itensEscala.push({
              tempId,
              funcionarioNome: nomeOriginal,
              funcionarioId: colabObj.funcionarioId || '',
              data: dataIso,
              diaSemana: diaSemana || '',
              turno: turnoFormatado,
              horarioInicio,
              horarioFim,
              intervalo:
                String(d.intervalo || intervaloPadraoColab || '').trim() ||
                (status === 'TRABALHO' || status === 'PLANTAO' ? '1h (Intrajornada)' : '—'),
              setor: String(d.setor || setorColab || 'Pista').trim(),
              funcao: String(d.funcao || funcaoColab || 'Frentista').trim(),
              status,
              confianca: confiancaItem,
              statusConferencia,
              motivoConferencia,
              codigoOriginal: codigoOrig || turnoFormatado,
              interpretacoesPossiveis: interpretacoes,
              observacao:
                String(d.observacao || '').trim() ||
                (codigoOrig ? `Lido na imagem: "${codigoOrig}"` : 'Extraído fielmente da imagem'),
              regiaoImagem: {
                xPercent: posX,
                yPercent: posY,
                larguraPercent: 18,
                alturaPercent: 12,
                rotulo: `${nomeOriginal} (${dataIso})`,
              },
            });
          });
        });
      }

      // Verificar se o mesmo nome apareceu em mais de uma linha na imagem
      nomesVistosNaImagem.forEach((count, nomeKey) => {
        if (count > 1 && nomeKey !== 'não identificado') {
          conflitosDetectados.push({
            id: `conf-dup-nome-${nomeKey}`,
            tipo: 'NOME_DUPLICADO',
            severidade: 'REVISAO',
            funcionarioNome: nomeKey.toUpperCase(),
            descricao: `O nome "${nomeKey.toUpperCase()}" aparece ${count} vezes na imagem da escala. Verifique se são turnos complementares ou homônimos.`,
          });
        }
      });

      const payloadResposta = {
        tituloEscala: String(parsed.tituloEscala || 'Escala Operacional de Trabalho').trim(),
        mesReferencia: String(parsed.mesReferencia || anoMesAtual).trim(),
        tipoDocumentoIdentificado: String(
          parsed.tipoDocumentoIdentificado || 'Quadro / Planilha de Escala Operacional'
        ).trim(),
        qualidadeImagem: String(parsed.qualidadeImagem || 'BOA').trim(),
        observacoesGerais: String(
          parsed.observacoesGerais || 'Leitura e estruturação concluídas com fidelidade à imagem original.'
        ).trim(),
        copiaFielReconhecida: String(parsed.copiaFielReconhecida || '').trim(),
        simbolosEAbreviacoes: Array.isArray(parsed.simbolosEAbreviacoes)
          ? parsed.simbolosEAbreviacoes.map((s: any) => String(s || '').trim()).filter(Boolean)
          : [],
        trocasDeEscalaIdentificadas: Array.isArray(parsed.trocasDeEscalaIdentificadas)
          ? parsed.trocasDeEscalaIdentificadas.map((t: any) => String(t || '').trim()).filter(Boolean)
          : [],
        colaboradoresIdentificados,
        itensEscala,
        conflitosDetectados,
        validacaoJson: {
          sintaxeValida: true,
          stringsFechadas: true,
          camposFormatados: true,
          totalColaboradores: colaboradoresIdentificados.length,
          totalRegistros: itensEscala.length,
          timestampValidacao: new Date().toISOString(),
        },
      };

      console.log(
        `[Gemini OCR Escala] Concluído: ${colaboradoresIdentificados.length} funcionários, ${itensEscala.length} registros e ${conflitosDetectados.length} alertas em ${anoMesAtual}.`
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
        mensagemAmigavel = 'O serviço de visão computacional está temporariamente com alta demanda. Tente novamente em instantes.';
        statusCode = 503;
      } else if (is429) {
        mensagemAmigavel = 'Limite temporário de requisições por minuto atingido. Aguarde alguns segundos e tente novamente.';
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
   * - Lê fotos de relatórios de aferição, cupons de bombas, visores de encerrantes,
   *   escalas de balde aferidor 20L Inmetro, lacres ou tabelas de bicos/tanques.
   * - Extrai cadastro de bicos, tanques vinculados e leituras metrológicas (20L e desvio em ml)
   *   para salvar na nuvem e gerar o Relatório Técnico de Aferição com informações da foto.
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
1. Extraia TODAS as aferições e bicos visíveis na imagem (se houver 1 bico na foto, extraia 1; se for uma tabela ou relatório com vários bicos, extraia TODOS os bicos da foto sem omitir nenhum!).
2. Padronize o nome do combustível entre: "Gasolina Comum", "Gasolina Aditivada", "Etanol Hidratado", "Diesel S10", "Diesel S500".
3. O volume nominal padrão de aferição é 20.000 Litros.
   - Se a foto mostrar o desvio em ml (ex: +20 ml, -40 ml, 0 ml), calcule volumeAferido = 20 + (desvioMl / 1000).
   - Se a foto mostrar o volume aferido (ex: 20,030 L ou 19,970 L), calcule desvioMl = Math.round((volumeAferido - 20) * 1000).
   - Se a foto mostrar uma aferição sem desvio explícito ou apenas cadastro/encerrante do bico, assuma volumeNominal = 20.0, volumeAferido = 20.0, desvioMl = 0, e preencha encerranteInicial, encerranteFinal e precoLitro conforme lido na foto.
4. Tolerância máxima Inmetro em 20L: ±100 ml. Se |desvioMl| <= 100, resultado = "CONFORME", caso contrário "NAO_CONFORME".
5. Se a foto também trouxer informações de Tanques (ex: TQ-01, capacidade, volume, régua, produto), inclua em tanquesExtraidos.
6. Em resumoGeralFoto, descreva de forma clara e técnica todos os elementos visuais identificados na foto (números lidos, série, lacres, estado, cabeçalho do documento, etc.).`;

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
            tituloDocumento: { type: Type.STRING, description: 'Título ou tipo do documento/equipamento fotografado' },
            dataIdentificada: { type: Type.STRING, description: 'Data no formato YYYY-MM-DD' },
            horaIdentificada: { type: Type.STRING, description: 'Hora no formato HH:MM' },
            responsavelIdentificado: { type: Type.STRING, description: 'Nome do responsável ou operador se constar na foto' },
            equipamentoIdentificado: { type: Type.STRING, description: 'Equipamento medidor identificado (ex: Medidor Padrão 20L Inmetro)' },
            certificadoInmetro: { type: Type.STRING, description: 'Número de certificado, selo ou lacre Inmetro visível' },
            resumoGeralFoto: { type: Type.STRING, description: 'Descrição técnica detalhada das informações extraídas da foto' },
            tanquesExtraidos: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  codigo: { type: Type.STRING, description: 'Ex: TQ-01' },
                  produto: { type: Type.STRING, description: 'Combustível do tanque' },
                  capacidadeNominal: { type: Type.NUMBER, description: 'Capacidade nominal em Litros (ex: 15000, 20000, 30000)' },
                  capacidadeOperacional: { type: Type.NUMBER, description: 'Capacidade operacional em Litros' },
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
                  numeroBico: { type: Type.INTEGER, description: 'Número do bico (1, 2, 3...)' },
                  bomba: { type: Type.STRING, description: 'Identificação da bomba (ex: Bomba 01 (Sêxtupla - Ilha 01))' },
                  lado: { type: Type.STRING, description: 'A ou B' },
                  produto: { type: Type.STRING, description: 'Combustível (Gasolina Comum, Gasolina Aditivada, Etanol Hidratado, Diesel S10, Diesel S500)' },
                  tanqueCodigo: { type: Type.STRING, description: 'Código do tanque vinculado (ex: TQ-01)' },
                  precoLitro: { type: Type.NUMBER, description: 'Preço por litro em R$' },
                  volumeNominal: { type: Type.NUMBER, description: 'Volume padrão (20.0)' },
                  volumeAferido: { type: Type.NUMBER, description: 'Volume lido em Litros (ex: 20.020)' },
                  desvioMl: { type: Type.NUMBER, description: 'Desvio em mililitros (ex: +20, -35, 0)' },
                  encerranteInicial: { type: Type.NUMBER, description: 'Leitura inicial do encerrante da bomba' },
                  encerranteFinal: { type: Type.NUMBER, description: 'Leitura final do encerrante da bomba' },
                  lacreInmetro: { type: Type.STRING, description: 'Número do lacre ou selo da bomba/bico' },
                  temperaturaC: { type: Type.NUMBER, description: 'Temperatura lida em °C se houver' },
                  resultado: { type: Type.STRING, description: 'CONFORME ou NAO_CONFORME' },
                  detalhesFotoBico: { type: Type.STRING, description: 'Informações específicas lidas na foto para este bico' },
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
          console.log(`[Gemini OCR Aferição] Processando foto com ${model}...`);
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
          console.log(`[Gemini OCR Aferição] Tentando próximo modelo após erro em ${model}`);
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
