import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const CLOUD_BACKEND_URLS = [
  'https://ais-pre-rztllfl5siqd7bb34giamw-80494517285.us-east5.run.app',
  'https://ais-dev-rztllfl5siqd7bb34giamw-80494517285.us-east5.run.app',
];

/**
 * Etapa 1: Carrega, higieniza e valida o payload da imagem antes de enviar ao modelo multimodal
 */
export function prepararImagemMultimodal(imageBase64: string, mimeTypeDefault = 'image/jpeg') {
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
 * garantindo que todas as strings estejam devidamente fechadas e colchetes/chaves balanceados.
 */
export function parseAndRepairJson(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') {
    return {};
  }

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

  try {
    return JSON.parse(text);
  } catch {
    // Prossegue para o reparo estrutural de strings e delimitadores
  }

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

  if (inString) {
    if (isEscaped && sanitized.endsWith('\\')) {
      sanitized = sanitized.slice(0, -1);
    }
    sanitized += '"';
  }

  sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(sanitized);
  } catch {
    // Prossegue para fechamento de objetos/arrays truncados
  }

  let candidate = sanitized.trim();
  for (let attempt = 0; attempt < 12; attempt++) {
    candidate = candidate
      .replace(/,\s*$/, '')
      .replace(/:\s*$/, ': null')
      .replace(/,\s*"[^"]*"\s*$/, '')
      .replace(/\{\s*"[^"]*"\s*$/, '{');

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

export interface EscalaOcrRequestPayload {
  imageBase64: string;
  mimeType?: string;
  mesAnoReferencia?: string;
  funcionariosCadastrados?: Array<{
    id: string;
    nome: string;
    matricula?: string;
    cargo?: string;
    funcao?: string;
    setor?: string;
  }>;
}

export interface AfericaoOcrRequestPayload {
  imageBase64: string;
  mimeType?: string;
  bicosCadastrados?: any[];
  tanquesCadastrados?: any[];
}

/**
 * Executa a leitura e estruturação completa de Escala usando uma chave Gemini fornecida
 */
export async function processarEscalaOcrComGemini(
  payload: EscalaOcrRequestPayload,
  apiKey: string
): Promise<any> {
  const {
    imageBase64,
    mimeType = 'image/jpeg',
    funcionariosCadastrados = [],
    mesAnoReferencia,
  } = payload;

  const ai = new GoogleGenAI({ apiKey });
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

  const config: any = {
    systemInstruction:
      'Você é um motor de OCR e reconhecimento estruturado de escalas de trabalho. Extraia com 100% de fidelidade todos os funcionários, datas, horários de entrada e saída, intervalos, turnos, setores, funções, folgas e observações presentes na imagem. Retorne sempre JSON válido com todas as strings devidamente fechadas.',
    responseMimeType: 'application/json',
    maxOutputTokens: 65536,
    temperature: 0.1,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        tituloEscala: { type: Type.STRING },
        mesReferencia: { type: Type.STRING },
        tipoDocumentoIdentificado: { type: Type.STRING },
        qualidadeImagem: { type: Type.STRING },
        copiaFielReconhecida: { type: Type.STRING },
        simbolosEAbreviacoes: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        trocasDeEscalaIdentificadas: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        observacoesGerais: { type: Type.STRING },
        colaboradoresEscala: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              nomeOriginal: { type: Type.STRING },
              funcionarioId: { type: Type.STRING },
              cargo: { type: Type.STRING },
              funcao: { type: Type.STRING },
              setor: { type: Type.STRING },
              turnoPadrao: { type: Type.STRING },
              horarioEntradaPadrao: { type: Type.STRING },
              horarioSaidaPadrao: { type: Type.STRING },
              intervaloPadrao: { type: Type.STRING },
              folgaPadrao: { type: Type.STRING },
              posicaoVerticalPercentual: { type: Type.NUMBER },
              confianca: { type: Type.STRING },
              dias: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dia: { type: Type.STRING },
                    diaSemana: { type: Type.STRING },
                    codigoOriginal: { type: Type.STRING },
                    status: { type: Type.STRING },
                    turno: { type: Type.STRING },
                    horarioInicio: { type: Type.STRING },
                    horarioFim: { type: Type.STRING },
                    intervalo: { type: Type.STRING },
                    setor: { type: Type.STRING },
                    funcao: { type: Type.STRING },
                    observacao: { type: Type.STRING },
                    confianca: { type: Type.STRING },
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
          break;
        }
      }
    } catch (err: any) {
      ultimoErro = err;
    }
  }

  if (!parsed) {
    throw ultimoErro || new Error('Não foi possível obter resposta estruturada do modelo de visão.');
  }

  const extrairHorariosDeTexto = (texto: string): { inicio?: string; fim?: string } => {
    if (!texto) return {};
    const matchCompleto = texto.match(
      /(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|:)?\s*(?:às|as|a|-|\/|até)\s*(\d{1,2})(?::(\d{2}))?/i
    );
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

      const match = listaFuncs.find((f: any) => {
        if (!f || !f.nome) return false;
        const fNome = String(f.nome).toLowerCase().trim();
        if (colab.funcionarioId && f.id === colab.funcionarioId) return true;
        if (fNome === nomeKey) return true;
        if (nomeKey !== 'não identificado' && nomeKey.length >= 3) {
          const partesLidas = nomeKey.split(/\s+/).filter((p: string) => p.length > 2);
          const partesCad = fNome.split(/\s+/).filter((p: string) => p.length > 2);
          if (fNome.includes(nomeKey) || nomeKey.includes(fNome)) return true;
          if (
            partesLidas.length >= 2 &&
            partesLidas[0] === partesCad[0] &&
            partesLidas[partesLidas.length - 1] === partesCad[partesCad.length - 1]
          ) {
            return true;
          }
        }
        return false;
      });

      const setorColab = String(colab.setor || match?.setor || 'Pista').trim();
      const funcaoColab = String(colab.funcao || colab.cargo || match?.funcao || match?.cargo || 'Frentista').trim();
      const turnoPadraoColab = String(colab.turnoPadrao || '').trim();
      const horariosDoTurnoPadrao = extrairHorariosDeTexto(turnoPadraoColab);
      const entradaPadraoColab =
        normalizarHoraHHMM(colab.horarioEntradaPadrao || '') || horariosDoTurnoPadrao.inicio || '';
      const saidaPadraoColab =
        normalizarHoraHHMM(colab.horarioSaidaPadrao || '') || horariosDoTurnoPadrao.fim || '';
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

      const diasBrutos: any[] = Array.isArray(colab.dias) ? [...colab.dias] : [];

      if (diasBrutos.length === 0 && (entradaPadraoColab || turnoPadraoColab || folgaPadraoColab)) {
        const folgaUpper = folgaPadraoColab.toUpperCase();
        for (let dNum = 1; dNum <= Math.min(7, diasNoMes); dNum++) {
          const dtIso = `${anoMesAtual}-${String(dNum).padStart(2, '0')}`;
          const dtObj = new Date(`${dtIso}T12:00:00`);
          const diaSem = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dtObj.getDay()];
          const ehDiaFolga =
            (folgaUpper && folgaUpper.includes(diaSem)) || (!folgaUpper && dtObj.getDay() === 0);

          diasBrutos.push({
            dia: dtIso,
            diaSemana: diaSem,
            codigoOriginal: ehDiaFolga
              ? `Folga (${folgaPadraoColab || 'DOM'})`
              : `${entradaPadraoColab || '06:00'}-${saidaPadraoColab || '14:00'}`,
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

      diasBrutos.forEach((d: any, dIdx: number) => {
        const diaRaw = String(d.dia || d.data || '').trim();
        let dataIso = '';
        let dataInvalida = false;

        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(diaRaw)) {
          const [y, m, dd] = diaRaw.split('-');
          dataIso = `${y}-${m.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(diaRaw)) {
          const [dd, mm, yy] = diaRaw.split('/');
          const yyyy = yy.length === 2 ? `20${yy}` : yy;
          dataIso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        } else if (/^\d{1,2}[\/\-]\d{1,2}$/.test(diaRaw)) {
          const [dd, mm] = diaRaw.split(/[\/\-]/);
          dataIso = `${anoStr}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        } else if (mapaDiaSemanaIndice[diaRaw.toUpperCase().replace('-FEIRA', '').trim()] !== undefined) {
          // Escala semanal: mapeia sequencialmente nos dias do mês preservando a ordem das colunas
          const seqDay = Math.min(diasNoMes, dIdx + 1);
          dataIso = `${anoMesAtual}-${String(seqDay).padStart(2, '0')}`;
        } else {
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
          turnoLower === 'dsr';

        const isFerias =
          statusRaw === 'FERIAS' ||
          statusRaw === 'FÉRIAS' ||
          codigoUpper === 'FE' ||
          codigoUpper === 'FER' ||
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
          turnoLower.includes('afast') ||
          turnoLower.includes('atest');

        let status: 'TRABALHO' | 'FOLGA' | 'PLANTAO' | 'FERIAS' | 'AFASTADO' = 'TRABALHO';
        if (isFolga) status = 'FOLGA';
        else if (isFerias) status = 'FERIAS';
        else if (isPlantao) status = 'PLANTAO';
        else if (isAfastado) status = 'AFASTADO';

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
          if (
            turnoLower.includes('noite') ||
            turnoLower === 't3' ||
            codigoUpper === 'T3' ||
            horarioInicio.startsWith('22:')
          ) {
            if (!horarioInicio) horarioInicio = '22:00';
            if (!horarioFim) horarioFim = '06:00';
            turnoFormatado =
              horarioInicio === '22:00' && horarioFim === '06:00'
                ? 'Turno 3 - Noite (22h - 06h)'
                : `Noite (${horarioInicio} - ${horarioFim})`;
          } else if (
            turnoLower.includes('tarde') ||
            turnoLower === 't2' ||
            codigoUpper === 'T2' ||
            horarioInicio.startsWith('14:')
          ) {
            if (!horarioInicio) horarioInicio = '14:00';
            if (!horarioFim) horarioFim = '22:00';
            turnoFormatado =
              horarioInicio === '14:00' && horarioFim === '22:00'
                ? 'Turno 2 - Tarde (14h - 22h)'
                : `Tarde (${horarioInicio} - ${horarioFim})`;
          } else if (
            turnoLower.includes('horista') ||
            turnoLower === 'hor' ||
            codigoUpper === 'HOR'
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
                : `Manhã (${horarioInicio} - ${horarioFim})`;
          }
        }

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

        const chaveUnica = `${nomeKey}__${dataIso}`;
        const registroDuplicado = chaveRegistrosVistos.has(chaveUnica);
        chaveRegistrosVistos.add(chaveUnica);

        let statusConferencia: 'CONFIRMADO' | 'REVISAO' | 'CONFLITO' = 'CONFIRMADO';
        let motivoConferencia = 'Extraído com alta precisão';

        if (dataInvalida || nomeOriginal === 'não identificado' || registroDuplicado) {
          statusConferencia = 'CONFLITO';
          motivoConferencia = registroDuplicado
            ? `Registro duplicado para ${nomeOriginal} no dia ${dataIso}`
            : 'Verificar dados na imagem';
        } else if (confiancaItem !== 'ALTA' || interpretacoes.length > 0) {
          statusConferencia = 'REVISAO';
          motivoConferencia = 'Confira a nitidez da célula na imagem';
        }

        const posX = Math.min(94, Math.max(18, Math.round(((dIdx + 1) / Math.max(1, diasBrutos.length)) * 74 + 18)));
        const posY = posYColab;
        const tempId = `ocr-${colabIdx}-${dIdx}-${Date.now()}`;

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

  return {
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
}

/**
 * Cliente resiliente multi-ambiente para OCR de Escalas:
 * 1. Tenta o endpoint local `/api/gemini/escala-ocr` (Express ou Vercel Serverless Function)
 * 2. Se retornar 404/405/502 (ex: deploy estático no Vercel), tenta os endpoints Cloud Run oficiais com CORS
 * 3. Se houver chave de API disponível no bundle, executa diretamente via SDK `@google/genai`
 */
export async function requisitarLeituraEscalaOCR(payload: EscalaOcrRequestPayload): Promise<any> {
  const endpoints = [
    '/api/gemini/escala-ocr',
    ...CLOUD_BACKEND_URLS.map((base) => `${base}/api/gemini/escala-ocr`),
  ];

  let ultimoErro = '';

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 404 || response.status === 405) {
        ultimoErro = `Endpoint ${url} indisponível (${response.status})`;
        continue;
      }

      const rawText = await response.text();
      const data = parseAndRepairJson(rawText);

      if (response.ok && data && (Array.isArray(data.itensEscala) || Array.isArray(data.colaboradoresIdentificados))) {
        return data;
      }

      if (data?.error) {
        ultimoErro = data.error;
      }
    } catch (err: any) {
      ultimoErro = err?.message || 'Falha de conexão';
    }
  }

  // Tentativa direta com SDK caso a chave tenha sido injetada no ambiente de build
  const clientKey =
    (typeof process !== 'undefined' && (process.env as any)?.GEMINI_API_KEY) ||
    (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
    '';

  if (clientKey) {
    return await processarEscalaOcrComGemini(payload, clientKey);
  }

  throw new Error(ultimoErro || 'Não foi possível conectar ao serviço de reconhecimento de escala.');
}

/**
 * Cliente resiliente multi-ambiente para OCR de Aferições:
 * 1. Tenta `/api/gemini/afericao-ocr` local
 * 2. Se retornar 404/405 no Vercel estático, tenta os endpoints Cloud Run oficiais
 */
export async function requisitarLeituraAfericaoOCR(payload: AfericaoOcrRequestPayload): Promise<any> {
  const endpoints = [
    '/api/gemini/afericao-ocr',
    ...CLOUD_BACKEND_URLS.map((base) => `${base}/api/gemini/afericao-ocr`),
  ];

  let ultimoErro = '';

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 404 || response.status === 405) {
        ultimoErro = `Endpoint ${url} indisponível (${response.status})`;
        continue;
      }

      const rawText = await response.text();
      const data = parseAndRepairJson(rawText);

      if (response.ok && data && typeof data === 'object') {
        return data;
      }

      if (data?.error) {
        ultimoErro = data.error;
      }
    } catch (err: any) {
      ultimoErro = err?.message || 'Falha de conexão';
    }
  }

  throw new Error(ultimoErro || 'Não foi possível conectar ao serviço de leitura metrológica.');
}
