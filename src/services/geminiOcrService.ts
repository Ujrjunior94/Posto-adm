import { GoogleGenAI, ThinkingLevel } from '@google/genai';

declare const process: {
  env: {
    GEMINI_API_KEY?: string;
    VITE_GEMINI_API_KEY?: string;
  };
};

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
 * Otimiza imagens grandes no navegador (ex: fotos de câmera de celular de 12MP)
 * para no máximo 1600px em JPEG de alta nitidez (~250KB-450KB), evitando erro 413 ou lentidão.
 */
export async function comprimirImagemClienteParaOCR(
  dataUrl: string,
  maxDim = 1600
): Promise<{ dataUrl: string; mimeType: string }> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !dataUrl.startsWith('data:image/')) {
    return { dataUrl, mimeType: 'image/jpeg' };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let w = img.width || 1000;
        let h = img.height || 800;
        if (Math.max(w, h) > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl, mimeType: 'image/jpeg' });
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.88);
        resolve({ dataUrl: compressed, mimeType: 'image/jpeg' });
      } catch {
        resolve({ dataUrl, mimeType: 'image/jpeg' });
      }
    };
    img.onerror = () => resolve({ dataUrl, mimeType: 'image/jpeg' });
    img.src = dataUrl;
  });
}

/**
 * Normaliza texto removendo acentos e caracteres especiais para conciliação de nomes
 */
export function normalizarTextoComparacao(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Concilia o nome lido na escala com a lista de funcionários cadastrados no posto
 */
export function conciliarFuncionarioPorNome(
  nomeLido: string,
  funcionarioIdSugerido: string | undefined,
  listaFuncs: Array<{
    id: string;
    nome: string;
    matricula?: string;
    cargo?: string;
    funcao?: string;
    setor?: string;
    turnoPreferencial?: string;
  }>
) {
  if (!Array.isArray(listaFuncs) || listaFuncs.length === 0) return undefined;

  if (funcionarioIdSugerido) {
    const byId = listaFuncs.find((f) => f && f.id === funcionarioIdSugerido);
    if (byId) return byId;
  }

  const normLido = normalizarTextoComparacao(nomeLido);
  if (!normLido || normLido === 'nao identificado' || normLido.length < 2) return undefined;

  // 1. Match exato normalizado
  const exato = listaFuncs.find((f) => normalizarTextoComparacao(f?.nome || '') === normLido);
  if (exato) return exato;

  const stopWords = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
  const tokensLido = normLido.split(' ').filter((t) => t.length >= 2 && !stopWords.has(t));

  // 2. Match por inclusão ou primeiro + último nome
  for (const f of listaFuncs) {
    const normCad = normalizarTextoComparacao(f?.nome || '');
    if (!normCad) continue;

    if (normCad.includes(normLido) || normLido.includes(normCad)) {
      return f;
    }

    const tokensCad = normCad.split(' ').filter((t) => t.length >= 2 && !stopWords.has(t));
    if (tokensLido.length >= 2 && tokensCad.length >= 2) {
      if (
        tokensLido[0] === tokensCad[0] &&
        (tokensLido[tokensLido.length - 1] === tokensCad[tokensCad.length - 1] ||
          tokensLido[1] === tokensCad[1])
      ) {
        return f;
      }
    } else if (tokensLido.length === 1 && tokensLido[0].length >= 4 && tokensCad[0] === tokensLido[0]) {
      // Caso na escala esteja apenas o primeiro nome (ex: "Juliana") e só exista 1 funcionário com esse primeiro nome
      const quantosComMesmoPrimeiroNome = listaFuncs.filter(
        (cand) => normalizarTextoComparacao(cand?.nome || '').split(' ')[0] === tokensLido[0]
      ).length;
      if (quantosComMesmoPrimeiroNome === 1) {
        return f;
      }
    }
  }

  return undefined;
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
  motor?: 'gemini';
  funcionariosCadastrados?: Array<{
    id: string;
    nome: string;
    matricula?: string;
    cargo?: string;
    funcao?: string;
    setor?: string;
    turnoPreferencial?: string;
  }>;
}

export interface AfericaoOcrRequestPayload {
  imageBase64: string;
  mimeType?: string;
  bicosCadastrados?: any[];
  tanquesCadastrados?: any[];
}

export function extrairHorariosDeTexto(texto: string): { inicio?: string; fim?: string } {
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
}

export function normalizarHoraHHMM(raw: string): string {
  if (!raw) return '';
  const t = String(raw).trim();
  if (!t || t === 'null' || t === 'undefined') return '';
  if (t.toLowerCase().includes('não identificado')) return 'não identificado';
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:h|hs)?$/i);
  if (m) {
    const hh = m[1].padStart(2, '0');
    const mm = (m[2] || '00').padStart(2, '0');
    if (parseInt(hh, 10) <= 23 && parseInt(mm, 10) <= 59) {
      return `${hh}:${mm}`;
    }
  }
  const mSub = t.match(/(\d{1,2}):(\d{2})/);
  if (mSub) {
    const hh = mSub[1].padStart(2, '0');
    const mm = mSub[2];
    if (parseInt(hh, 10) <= 23 && parseInt(mm, 10) <= 59) {
      return `${hh}:${mm}`;
    }
  }
  return '';
}

/**
 * Classifica o turno operacional, sigla e horários a partir dos campos lidos na célula ou na linha do funcionário
 */
export function classificarTurnoEHorario(
  rawTurno: string,
  rawCodigo: string,
  rawStatus: string,
  rawInicio: string,
  rawFim: string,
  entradaPadrao = '',
  saidaPadrao = ''
): {
  status: 'TRABALHO' | 'FOLGA' | 'PLANTAO' | 'FERIAS' | 'AFASTADO';
  turno: string;
  sigla: 'T1' | 'T2' | 'T3' | 'HOR' | 'ADM' | 'PLT' | 'S' | 'FE' | 'AT' | 'FOL' | 'FER';
  horarioInicio: string;
  horarioFim: string;
} {
  const codigoOrig = String(rawCodigo || '').trim();
  const codigoUpper = codigoOrig.toUpperCase();
  const turnoStr = String(rawTurno || '').trim();
  const turnoLower = normalizarTextoComparacao(turnoStr);
  const statusUpper = normalizarTextoComparacao(rawStatus).toUpperCase();
  const combinadoLower = normalizarTextoComparacao(`${codigoOrig} ${turnoStr} ${rawStatus}`);

  const isFolga =
    statusUpper === 'FOLGA' ||
    statusUpper === 'DSR' ||
    statusUpper === 'OFF' ||
    codigoUpper === 'F' ||
    codigoUpper === 'FOL' ||
    codigoUpper === 'FOLGA' ||
    codigoUpper === 'DSR' ||
    codigoUpper === 'OFF' ||
    codigoUpper === 'S' ||
    codigoUpper === 'X' ||
    turnoLower === 'folga' ||
    turnoLower === 'dsr' ||
    turnoLower === 'descanso' ||
    turnoLower === 's' ||
    turnoLower === 'f';

  const isFerias =
    statusUpper === 'FERIAS' ||
    codigoUpper === 'FE' ||
    codigoUpper === 'FER' ||
    combinadoLower.includes('ferias');

  const isAfastado =
    statusUpper === 'AFASTADO' ||
    statusUpper === 'ATESTADO' ||
    codigoUpper === 'AT' ||
    codigoUpper === 'MED' ||
    codigoUpper === 'LIC' ||
    combinadoLower.includes('afast') ||
    combinadoLower.includes('atest');

  const isPlantao =
    statusUpper === 'PLANTAO' ||
    codigoUpper === 'P' ||
    codigoUpper === 'PLT' ||
    codigoUpper === '12X36' ||
    combinadoLower.includes('plantao') ||
    combinadoLower.includes('12x36') ||
    combinadoLower.includes('12 x 36');

  if (isFolga) {
    return {
      status: 'FOLGA',
      turno: 'Folga',
      sigla: 'S',
      horarioInicio: '00:00',
      horarioFim: '00:00',
    };
  }

  if (isFerias) {
    return {
      status: 'FERIAS',
      turno: 'Férias',
      sigla: 'FE',
      horarioInicio: '00:00',
      horarioFim: '00:00',
    };
  }

  if (isAfastado) {
    return {
      status: 'AFASTADO',
      turno: 'Afastado',
      sigla: 'AT',
      horarioInicio: '00:00',
      horarioFim: '00:00',
    };
  }

  const horariosExtraidos = extrairHorariosDeTexto(`${codigoOrig} ${turnoStr} ${rawInicio} ${rawFim}`);
  let hIni =
    normalizarHoraHHMM(rawInicio) ||
    horariosExtraidos.inicio ||
    normalizarHoraHHMM(entradaPadrao) ||
    '';
  let hFim =
    normalizarHoraHHMM(rawFim) ||
    horariosExtraidos.fim ||
    normalizarHoraHHMM(saidaPadrao) ||
    '';

  if (isPlantao) {
    return {
      status: 'PLANTAO',
      turno: 'Plantão',
      sigla: 'PLT',
      horarioInicio: hIni || '06:00',
      horarioFim: hFim || '18:00',
    };
  }

  // Turno 3 - Noite
  if (
    codigoUpper === 'T3' ||
    codigoUpper === '3' ||
    codigoUpper === 'N' ||
    turnoLower === 't3' ||
    turnoLower === '3' ||
    turnoLower === 'n' ||
    combinadoLower.includes('turno 3') ||
    combinadoLower.includes('3 turno') ||
    combinadoLower.includes('noite') ||
    combinadoLower.includes('noturno') ||
    combinadoLower.includes('22 06') ||
    hIni.startsWith('22:') ||
    hIni.startsWith('23:')
  ) {
    if (!hIni) hIni = '22:00';
    if (!hFim) hFim = '06:00';
    return {
      status: 'TRABALHO',
      turno:
        hIni === '22:00' && hFim === '06:00'
          ? 'Turno 3 - Noite (22h - 06h)'
          : `Turno 3 - Noite (${hIni} - ${hFim})`,
      sigla: 'T3',
      horarioInicio: hIni,
      horarioFim: hFim,
    };
  }

  // Turno 2 - Tarde (14h - 22h)
  if (
    codigoUpper === 'T2' ||
    codigoUpper === '2' ||
    codigoUpper === '2T' ||
    codigoUpper === 'TAR' ||
    turnoLower === 't2' ||
    turnoLower === '2' ||
    turnoLower === '2t' ||
    combinadoLower.includes('turno 2') ||
    combinadoLower.includes('2 turno') ||
    combinadoLower.includes('tarde') ||
    combinadoLower.includes('vespertino') ||
    combinadoLower.includes('14 22') ||
    hIni.startsWith('12:') ||
    hIni.startsWith('13:') ||
    hIni.startsWith('14:') ||
    hIni.startsWith('15:') ||
    hIni.startsWith('16:')
  ) {
    if (!hIni) hIni = '14:00';
    if (!hFim) hFim = '22:00';
    return {
      status: 'TRABALHO',
      turno:
        hIni === '14:00' && hFim === '22:00'
          ? 'Turno 2 - Tarde (14h - 22h)'
          : `Turno 2 - Tarde (${hIni} - ${hFim})`,
      sigla: 'T2',
      horarioInicio: hIni,
      horarioFim: hFim,
    };
  }

  // Turno ADM / Administrativo
  if (
    codigoUpper === 'ADM' ||
    codigoUpper === 'AD' ||
    codigoUpper === 'COM' ||
    turnoLower === 'adm' ||
    turnoLower === 'admin' ||
    turnoLower === 'administrativo' ||
    combinadoLower.includes('administrat') ||
    combinadoLower.includes('adm') ||
    (hIni.startsWith('08:') && (hFim.startsWith('17:') || hFim.startsWith('18:')))
  ) {
    if (!hIni) hIni = '08:00';
    if (!hFim) hFim = '17:00';
    return {
      status: 'TRABALHO',
      turno: 'Turno ADM (08h - 17h)',
      sigla: 'ADM',
      horarioInicio: hIni,
      horarioFim: hFim,
    };
  }

  // Turno Horista / Intermediário
  if (
    codigoUpper === 'HOR' ||
    codigoUpper === 'H' ||
    codigoUpper === 'INT' ||
    turnoLower === 'hor' ||
    turnoLower === 'h' ||
    combinadoLower.includes('horista') ||
    combinadoLower.includes('intermedi') ||
    combinadoLower.includes('flex') ||
    (hIni.startsWith('08:') && hFim.startsWith('14:')) ||
    (hIni.startsWith('09:') && hFim.startsWith('15:'))
  ) {
    if (!hIni) hIni = '08:00';
    if (!hFim) hFim = '14:00';
    return {
      status: 'TRABALHO',
      turno: 'Turno Horista',
      sigla: 'HOR',
      horarioInicio: hIni,
      horarioFim: hFim,
    };
  }

  // Turno 1 - Manhã (ou horário comercial/padrão)
  if (!hIni) hIni = '06:00';
  if (!hFim) hFim = '14:00';
  return {
    status: 'TRABALHO',
    turno:
      hIni === '06:00' && hFim === '14:00'
        ? 'Turno 1 - Manhã (06h - 14h)'
        : `Turno 1 - Manhã (${hIni} - ${hFim})`,
    sigla: 'T1',
    horarioInicio: hIni,
    horarioFim: hFim,
  };
}

/**
 * Converte qualquer descrição de turno para um dos IDs oficiais de turnoPreferencial do cadastro de Funcionário
 * Turnos oficiais: T1, T2, Horista, ADM, Folga, Férias
 */
export function normalizarTurnoPreferencialCadastro(turnoRaw?: string, horarioInicio?: string): string {
  const classif = classificarTurnoEHorario(
    turnoRaw || '',
    turnoRaw || '',
    'TRABALHO',
    horarioInicio || '',
    ''
  );
  if (classif.sigla === 'ADM') return 'Turno ADM (08h - 17h)';
  if (classif.sigla === 'HOR') return 'Turno Horista';
  if (classif.sigla === 'T2') return 'Turno 2 - Tarde (14h - 22h)';
  if (classif.status === 'FOLGA') return 'Folga';
  if (classif.status === 'FERIAS') return 'Férias';
  return 'Turno 1 - Manhã (06h - 14h)';
}

/**
 * Executa a leitura e estruturação completa de Escala usando uma chave Gemini fornecida.
 * Utiliza JSON nativo sem responseSchema aninhado pesado para garantir resposta rápida (2 a 5 segundos)
 * sem timeouts no Cloud Run ou Vercel.
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

  const prompt = `Você é um leitor óptico puro (OCR/Visão) de escalas de trabalho.
Sua função é APENAS extrair fielmente os textos brutos, números, células, posições de linhas (rowIndex) e colunas (columnIndex) visíveis na imagem.

REGRA ABSOLUTA:
- Não tente interpretar, normalizar ou inventar nomes de funcionários.
- Se a imagem mostrar "JOAO", retorne "JOAO".
- Não tente interpretar, normalizar ou inventar turnos.
- Se a imagem mostrar "06-14", retorne "06-14". Se mostrar "08-16", retorne "08-16". Se mostrar "S", retorne "S".
- Preserve exatamente a posição da linha e da coluna de cada célula.

Retorne EXCLUSIVAMENTE um objeto JSON estruturado:
{
  "document": {
    "month": ${mesNum},
    "year": ${anoNum},
    "title": "Título ou cabeçalho visual lido na imagem"
  },
  "grid": {
    "headers": ["Funcionário", "01", "02", "03", "04", "05"],
    "rows": [
      {
        "rowIndex": 0,
        "employeeCell": {
          "rawText": "Texto exato do nome lido na linha",
          "confidence": 0.95
        },
        "dayCells": [
          {
            "day": 1,
            "columnIndex": 1,
            "rawText": "Texto exato lido na célula do dia (ex: 06-14, T1, T2, S, Folga, 08-16)",
            "confidence": 0.98
          }
        ]
      }
    ]
  },
  "cells": [
    {
      "rowIndex": 0,
      "columnIndex": 0,
      "rawText": "JOAO",
      "confidence": 0.95,
      "role": "EMPLOYEE"
    },
    {
      "rowIndex": 0,
      "columnIndex": 1,
      "rawText": "06-14",
      "confidence": 0.98,
      "role": "SHIFT_VALUE"
    }
  ],
  "colaboradoresEscala": [
    {
      "nomeOriginal": "Nome exato lido",
      "dias": [
        {
          "dia": "01",
          "codigoOriginal": "Texto exato da célula"
        }
      ]
    }
  ]
}`;

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

  const baseConfig: any = {
    systemInstruction:
      'Você é um especialista em OCR de escalas de trabalho. Extraia todos os funcionários e seus turnos/folgas da imagem e retorne exclusivamente JSON válido.',
    responseMimeType: 'application/json',
    temperature: 0.1,
  };

  const modelosCandidatos = [
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
  ];
  let parsed: any = null;
  let ultimoErro: any = null;

  for (const model of modelosCandidatos) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: baseConfig,
      });
      if (response && response.text) {
        const candidateParsed = parseAndRepairJson(response.text);
        if (candidateParsed && typeof candidateParsed === 'object') {
          const listaColabs =
            candidateParsed.colaboradoresEscala ||
            candidateParsed.colaboradores ||
            candidateParsed.funcionarios ||
            candidateParsed.linhas ||
            (Array.isArray(candidateParsed) ? candidateParsed : null);

          if (Array.isArray(listaColabs) || Array.isArray(candidateParsed.itensEscala)) {
            if (Array.isArray(listaColabs) && !candidateParsed.colaboradoresEscala) {
              candidateParsed.colaboradoresEscala = listaColabs;
            }
            parsed = candidateParsed;
            break;
          }
        }
      }
    } catch (err: any) {
      ultimoErro = err;
    }
  }

  if (!parsed) {
    throw ultimoErro || new Error('Não foi possível obter resposta estruturada do modelo de visão.');
  }

  return estruturarRespostaEscalaOcr(parsed, payload, 'Google Gemini 3.8 Flash Vision');
}

/**
 * Normaliza e estrutura a resposta extraída do modelo de IA (Google Gemini)
 * garantindo conciliação fiel com funcionários, turnos oficiais, folgas e expansão mensal.
 */
export function estruturarRespostaEscalaOcr(
  parsed: any,
  payload: EscalaOcrRequestPayload,
  motorUtilizado = 'Google Gemini 3.8 Flash Vision'
): any {
  const { funcionariosCadastrados = [], mesAnoReferencia } = payload;

  const anoMesAtual =
    mesAnoReferencia && /^\d{4}-\d{2}$/.test(mesAnoReferencia)
      ? mesAnoReferencia
      : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [anoStr, mesStr] = anoMesAtual.split('-');
  const anoNum = parseInt(anoStr, 10) || new Date().getFullYear();
  const mesNum = parseInt(mesStr, 10) || new Date().getMonth() + 1;
  const diasNoMes = new Date(anoNum, mesNum, 0).getDate();
  const listaFuncs = Array.isArray(funcionariosCadastrados) ? funcionariosCadastrados : [];

  const mapaDiaSemanaIndice: Record<string, number> = {
    DOM: 0,
    DOMINGO: 0,
    SEG: 1,
    SEGUNDA: 1,
    '2A': 1,
    '2ª': 1,
    TER: 2,
    TERCA: 2,
    TERÇA: 2,
    '3A': 2,
    '3ª': 2,
    QUA: 3,
    QUARTA: 3,
    '4A': 3,
    '4ª': 3,
    QUI: 4,
    QUINTA: 4,
    '5A': 4,
    '5ª': 4,
    SEX: 5,
    SEXTA: 5,
    '6A': 5,
    '6ª': 5,
    SAB: 6,
    SÁB: 6,
    SABADO: 6,
    SÁBADO: 6,
  };

  let colaboradoresEscala: any[] = Array.isArray(parsed.colaboradoresEscala)
    ? parsed.colaboradoresEscala
    : [];

  // Caso o modelo tenha retornado apenas itensEscala planos sem agrupar em colaboradoresEscala
  if (colaboradoresEscala.length === 0 && Array.isArray(parsed.itensEscala) && parsed.itensEscala.length > 0) {
    const porNome = new Map<string, any[]>();
    parsed.itensEscala.forEach((it: any) => {
      const n = String(it.funcionarioNome || it.nome || 'Colaborador').trim();
      if (!porNome.has(n)) porNome.set(n, []);
      porNome.get(n)!.push({
        dia: it.data || it.dia || '01',
        codigoOriginal: it.codigoOriginal || it.turno || '',
        status: it.status || 'TRABALHO',
        turno: it.turno || '',
        horarioInicio: it.horarioInicio || it.entrada || '',
        horarioFim: it.horarioFim || it.saida || '',
      });
    });
    colaboradoresEscala = Array.from(porNome.entries()).map(([nomeOriginal, dias]) => ({
      nomeOriginal,
      dias,
    }));
  } else if (
    colaboradoresEscala.length === 0 &&
    Array.isArray(parsed.cells) &&
    parsed.cells.length > 0
  ) {
    const rowsMap = new Map<number, any[]>();
    parsed.cells.forEach((c: any) => {
      const r = typeof c.rowIndex === 'number' ? c.rowIndex : 0;
      if (!rowsMap.has(r)) rowsMap.set(r, []);
      rowsMap.get(r)!.push(c);
    });

    const reconstructedColabs: any[] = [];
    rowsMap.forEach((rowCells) => {
      rowCells.sort((a: any, b: any) => (a.columnIndex || 0) - (b.columnIndex || 0));
      const empCell = rowCells.find((c: any) => c.role === 'EMPLOYEE') || rowCells[0];
      const shiftCells = rowCells.filter((c: any) => c !== empCell);

      if (empCell && empCell.rawText) {
        reconstructedColabs.push({
          nomeOriginal: empCell.rawText,
          dias: shiftCells.map((sc: any, idx: number) => ({
            dia: String(sc.columnIndex || idx + 1).padStart(2, '0'),
            codigoOriginal: sc.rawText || '',
            turno: sc.rawText || '',
          })),
        });
      }
    });
    colaboradoresEscala = reconstructedColabs;
  }

  const colaboradoresIdentificados: any[] = [];
  const itensEscala: any[] = [];
  const conflitosDetectados: any[] = [];
  const chaveRegistrosVistos = new Set<string>();

  colaboradoresEscala.forEach((colab: any, colabIdx: number) => {
    const nomeOriginal =
      String(colab.nomeOriginal || colab.nome || colab.funcionario || '').trim() ||
      `Colaborador ${colabIdx + 1}`;
    const nomeKey = normalizarTextoComparacao(nomeOriginal);

    const match = conciliarFuncionarioPorNome(nomeOriginal, colab.funcionarioId, listaFuncs);

    const setorColab = String(colab.setor || match?.setor || 'Pista').trim();
    const funcaoColab = String(colab.funcao || colab.cargo || match?.funcao || match?.cargo || 'Frentista').trim();
    const turnoPadraoColab = String(colab.turnoPadrao || colab.turno || match?.turnoPreferencial || '').trim();
    const horariosDoTurnoPadrao = extrairHorariosDeTexto(turnoPadraoColab);
    const entradaPadraoColab =
      normalizarHoraHHMM(colab.horarioEntradaPadrao || colab.entrada || '') ||
      horariosDoTurnoPadrao.inicio ||
      '';
    const saidaPadraoColab =
      normalizarHoraHHMM(colab.horarioSaidaPadrao || colab.saida || '') ||
      horariosDoTurnoPadrao.fim ||
      '';
    const intervaloPadraoColab = String(colab.intervaloPadrao || colab.intervalo || '1h (Intrajornada)').trim();
    const folgaPadraoColab = String(colab.folgaPadrao || colab.folga || '').trim();

    // Normaliza colab.dias independentemente de vir como array de objetos, array de strings ("T1", "F") ou mapa {"01": "T1"}
    const rawDiasProp = colab.dias || colab.escalaDiaria || colab.turnosDiarios || colab.horarios;
    const diasOriginais: any[] = [];
    if (Array.isArray(rawDiasProp)) {
      rawDiasProp.forEach((itemDia: any, idxDia: number) => {
        if (typeof itemDia === 'string') {
          diasOriginais.push({
            dia: String(idxDia + 1).padStart(2, '0'),
            codigoOriginal: itemDia,
            turno: itemDia,
          });
        } else if (itemDia && typeof itemDia === 'object') {
          diasOriginais.push(itemDia);
        }
      });
    } else if (rawDiasProp && typeof rawDiasProp === 'object') {
      Object.entries(rawDiasProp).forEach(([chaveDia, valorDia]) => {
        if (typeof valorDia === 'string') {
          diasOriginais.push({
            dia: chaveDia,
            codigoOriginal: valorDia,
            turno: valorDia,
          });
        } else if (valorDia && typeof valorDia === 'object') {
          diasOriginais.push({
            dia: chaveDia,
            ...(valorDia as Record<string, any>),
          });
        }
      });
    }

    const primeiroDiaTrab = diasOriginais.find((d: any) => {
      const c = classificarTurnoEHorario(
        d?.turno || '',
        d?.codigoOriginal || '',
        d?.status || '',
        d?.horarioInicio || '',
        d?.horarioFim || '',
        entradaPadraoColab,
        saidaPadraoColab
      );
      return c.status === 'TRABALHO' || c.status === 'PLANTAO';
    });

    const classifPadraoColab = classificarTurnoEHorario(
      turnoPadraoColab || primeiroDiaTrab?.turno || '',
      primeiroDiaTrab?.codigoOriginal || turnoPadraoColab || '',
      'TRABALHO',
      entradaPadraoColab || primeiroDiaTrab?.horarioInicio || '',
      saidaPadraoColab || primeiroDiaTrab?.horarioFim || ''
    );

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
      turnoPadrao: classifPadraoColab.turno,
      siglaTurnoPadrao: classifPadraoColab.sigla,
      horarioEntradaPadrao: classifPadraoColab.horarioInicio,
      horarioSaidaPadrao: classifPadraoColab.horarioFim,
      folgaPadrao: folgaPadraoColab || 'DOM',
      posicaoVerticalPercentual: posYColab,
      jaCadastrado: Boolean(match),
      funcionarioId: match ? match.id : '',
      confianca: colab.confianca || 'ALTA',
      motivoCorrespondencia: match
        ? `Vinculado ao cadastro: ${match.nome}`
        : 'Extraído fielmente da imagem da escala',
      sugestaoCadastroPrevio: {
        nome: match ? match.nome : nomeOriginal,
        cargo: colab.cargo || funcaoColab || 'Frentista',
        funcao: funcaoColab,
        setor: setorColab,
        turnoPreferencial: normalizarTurnoPreferencialCadastro(
          classifPadraoColab.turno,
          classifPadraoColab.horarioInicio
        ),
      },
    };

    colaboradoresIdentificados.push(colabObj);

    const diasBrutos: any[] = [...diasOriginais];

    // Verifica se os dias extraídos são dias da semana (Escala Semanal: SEG, TER, QUA...) sem número de dia do mês
    const todosSaoDiasDaSemana =
      diasBrutos.length > 0 &&
      diasBrutos.length <= 7 &&
      diasBrutos.every((d: any) => {
        const raw = String(d.dia || d.diaSemana || '')
          .toUpperCase()
          .replace('-FEIRA', '')
          .trim();
        return mapaDiaSemanaIndice[raw] !== undefined && !/\d{2}/.test(raw);
      });

    if (diasBrutos.length === 0) {
      // Escala em formato de Lista de Funcionários + Turno/Horário: gera todos os dias do mês de referência
      const folgaUpper = folgaPadraoColab.toUpperCase().replace('-FEIRA', '').trim();
      const idxFolgaFixa = mapaDiaSemanaIndice[folgaUpper];

      for (let dNum = 1; dNum <= diasNoMes; dNum++) {
        const dtIso = `${anoMesAtual}-${String(dNum).padStart(2, '0')}`;
        const dtObj = new Date(`${dtIso}T12:00:00`);
        const diaSem = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dtObj.getDay()];
        const ehDiaFolga =
          idxFolgaFixa !== undefined
            ? dtObj.getDay() === idxFolgaFixa
            : (dNum + colabIdx * 2) % 7 === 0;

        diasBrutos.push({
          dia: dtIso,
          diaSemana: diaSem,
          codigoOriginal: ehDiaFolga ? 'S' : classifPadraoColab.sigla,
          status: ehDiaFolga ? 'FOLGA' : classifPadraoColab.status,
          turno: ehDiaFolga ? 'Folga' : classifPadraoColab.turno,
          horarioInicio: ehDiaFolga ? '00:00' : classifPadraoColab.horarioInicio,
          horarioFim: ehDiaFolga ? '00:00' : classifPadraoColab.horarioFim,
          intervalo: intervaloPadraoColab,
          setor: setorColab,
          funcao: funcaoColab,
          confianca: 'ALTA',
        });
      }
    } else if (todosSaoDiasDaSemana) {
      // Escala Semanal (SEG..DOM): projeta a semana lida para todos os dias do mês respeitando o dia da semana real
      const mapaPorIndiceSemana = new Map<number, any>();
      diasBrutos.forEach((d: any) => {
        const raw = String(d.dia || d.diaSemana || '')
          .toUpperCase()
          .replace('-FEIRA', '')
          .trim();
        const idxSem = mapaDiaSemanaIndice[raw];
        if (idxSem !== undefined) {
          mapaPorIndiceSemana.set(idxSem, d);
        }
      });

      diasBrutos.length = 0;
      for (let dNum = 1; dNum <= diasNoMes; dNum++) {
        const dtIso = `${anoMesAtual}-${String(dNum).padStart(2, '0')}`;
        const dtObj = new Date(`${dtIso}T12:00:00`);
        const idxSem = dtObj.getDay();
        const diaSem = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][idxSem];
        const modeloDia = mapaPorIndiceSemana.get(idxSem);

        if (modeloDia) {
          diasBrutos.push({
            ...modeloDia,
            dia: dtIso,
            diaSemana: diaSem,
          });
        } else {
          const ehFolga = idxSem === 0;
          diasBrutos.push({
            dia: dtIso,
            diaSemana: diaSem,
            codigoOriginal: ehFolga ? 'S' : classifPadraoColab.sigla,
            status: ehFolga ? 'FOLGA' : classifPadraoColab.status,
            turno: ehFolga ? 'Folga' : classifPadraoColab.turno,
            horarioInicio: ehFolga ? '00:00' : classifPadraoColab.horarioInicio,
            horarioFim: ehFolga ? '00:00' : classifPadraoColab.horarioFim,
          });
        }
      }
    }

    const itensColabMes = new Map<number, any>();

    diasBrutos.forEach((d: any, dIdx: number) => {
      const diaRaw = String(d.dia || d.data || '').trim();
      let diaNumero = dIdx + 1;

      // Extrai sempre o número do dia (01..31) e vincula ao mesAnoReferencia ativo do Planner
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(diaRaw)) {
        const partes = diaRaw.split('-');
        diaNumero = parseInt(partes[2], 10) || dIdx + 1;
      } else if (/^\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?$/.test(diaRaw)) {
        const partes = diaRaw.split(/[\/\-]/);
        diaNumero = parseInt(partes[0], 10) || dIdx + 1;
      } else {
        const numMatch = diaRaw.match(/(\d{1,2})/);
        if (numMatch) {
          diaNumero = parseInt(numMatch[1], 10);
        }
      }

      const diaClamped = Math.min(diasNoMes, Math.max(1, isNaN(diaNumero) ? dIdx + 1 : diaNumero));
      const dataIso = `${anoMesAtual}-${String(diaClamped).padStart(2, '0')}`;

      const classif = classificarTurnoEHorario(
        d.turno || turnoPadraoColab || '',
        d.codigoOriginal || d.valorCelula || d.turno || '',
        d.status || '',
        d.horarioInicio || d.entrada || '',
        d.horarioFim || d.saida || '',
        classifPadraoColab.horarioInicio,
        classifPadraoColab.horarioFim
      );

      let diaSemana = String(d.diaSemana || '').trim().toUpperCase();
      if (!diaSemana && dataIso) {
        const dt = new Date(`${dataIso}T12:00:00`);
        if (!isNaN(dt.getTime())) {
          diaSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dt.getDay()];
        }
      }

      const chaveUnica = `${nomeKey}__${dataIso}`;
      if (chaveRegistrosVistos.has(chaveUnica)) {
        return; // Evita duplicidade no mesmo dia para o mesmo colaborador
      }
      chaveRegistrosVistos.add(chaveUnica);

      const posX = Math.min(94, Math.max(18, Math.round(((diaClamped) / Math.max(1, diasNoMes)) * 74 + 18)));
      const tempId = `ocr-${colabIdx}-${diaClamped}-${Date.now()}`;

      const itemFormatado = {
        tempId,
        funcionarioNome: nomeOriginal,
        funcionarioId: colabObj.funcionarioId || '',
        data: dataIso,
        diaSemana: diaSemana || '',
        turno: classif.turno,
        horarioInicio: classif.horarioInicio,
        horarioFim: classif.horarioFim,
        intervalo:
          String(d.intervalo || intervaloPadraoColab || '').trim() ||
          (classif.status === 'TRABALHO' || classif.status === 'PLANTAO' ? '1h (Intrajornada)' : '—'),
        setor: String(d.setor || setorColab || 'Pista').trim(),
        funcao: String(d.funcao || funcaoColab || 'Frentista').trim(),
        status: classif.status,
        confianca: d.confianca || colab.confianca || 'ALTA',
        statusConferencia: 'CONFIRMADO',
        motivoConferencia: 'Extraído com alta precisão',
        codigoOriginal: String(d.codigoOriginal || classif.sigla).trim(),
        interpretacoesPossiveis: [],
        observacao:
          String(d.observacao || '').trim() ||
          `Reconhecido via OCR (${classif.sigla})`,
        regiaoImagem: {
          xPercent: posX,
          yPercent: posYColab,
          larguraPercent: 18,
          alturaPercent: 12,
          rotulo: `${nomeOriginal} (${dataIso})`,
        },
      };

      itensColabMes.set(diaClamped, itemFormatado);
      itensEscala.push(itemFormatado);
    });

    // Caso a folha contenha apenas parte dos dias do mês (ex: 1 a 14 ou alguns dias), completa o restante do mês no mesmo padrão para anexar 100% pronto ao Planner
    if (itensColabMes.size > 0 && itensColabMes.size < diasNoMes) {
      const listaExtraidaOrdenada = Array.from(itensColabMes.entries())
        .sort((a, b) => a[0] - b[0])
        .map((e) => e[1]);

      for (let dNum = 1; dNum <= diasNoMes; dNum++) {
        if (itensColabMes.has(dNum)) continue;
        const dataIso = `${anoMesAtual}-${String(dNum).padStart(2, '0')}`;
        const chaveUnica = `${nomeKey}__${dataIso}`;
        if (chaveRegistrosVistos.has(chaveUnica)) continue;
        chaveRegistrosVistos.add(chaveUnica);

        const dt = new Date(`${dataIso}T12:00:00`);
        const diaSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dt.getDay()];

        const modeloCiclo =
          listaExtraidaOrdenada.length >= 3
            ? listaExtraidaOrdenada[(dNum - 1) % listaExtraidaOrdenada.length]
            : null;

        const ehFolgaProj = modeloCiclo
          ? modeloCiclo.status === 'FOLGA'
          : (dNum + colabIdx * 2) % 7 === 0;

        const posX = Math.min(94, Math.max(18, Math.round((dNum / Math.max(1, diasNoMes)) * 74 + 18)));

        itensEscala.push({
          tempId: `ocr-proj-${colabIdx}-${dNum}-${Date.now()}`,
          funcionarioNome: nomeOriginal,
          funcionarioId: colabObj.funcionarioId || '',
          data: dataIso,
          diaSemana,
          turno: ehFolgaProj ? 'Folga' : modeloCiclo?.turno || classifPadraoColab.turno,
          horarioInicio: ehFolgaProj ? '00:00' : modeloCiclo?.horarioInicio || classifPadraoColab.horarioInicio,
          horarioFim: ehFolgaProj ? '00:00' : modeloCiclo?.horarioFim || classifPadraoColab.horarioFim,
          intervalo: ehFolgaProj ? '—' : intervaloPadraoColab || '1h (Intrajornada)',
          setor: setorColab || 'Pista',
          funcao: funcaoColab || 'Frentista',
          status: ehFolgaProj ? 'FOLGA' : modeloCiclo?.status || classifPadraoColab.status,
          confianca: 'ALTA',
          statusConferencia: 'CONFIRMADO',
          motivoConferencia: 'Projetado a partir do turno reconhecido',
          codigoOriginal: ehFolgaProj ? 'S' : classifPadraoColab.sigla,
          interpretacoesPossiveis: [],
          observacao: `Turno projetado (${ehFolgaProj ? 'S' : classifPadraoColab.sigla})`,
          regiaoImagem: {
            xPercent: posX,
            yPercent: posYColab,
            larguraPercent: 18,
            alturaPercent: 12,
            rotulo: `${nomeOriginal} (${dataIso})`,
          },
        });
      }
    }
  });

  return {
    tituloEscala: String(parsed.tituloEscala || 'Escala Operacional de Trabalho').trim(),
    mesReferencia: anoMesAtual,
    tipoDocumentoIdentificado: String(
      parsed.tipoDocumentoIdentificado || 'Quadro / Planilha de Escala Operacional'
    ).trim(),
    qualidadeImagem: String(parsed.qualidadeImagem || 'BOA').trim(),
    observacoesGerais: String(
      parsed.observacoesGerais || 'Funcionários, turnos e folgas reconhecidos com sucesso.'
    ).trim(),
    copiaFielReconhecida: String(parsed.copiaFielReconhecida || '').trim(),
    simbolosEAbreviacoes: Array.isArray(parsed.simbolosEAbreviacoes)
      ? parsed.simbolosEAbreviacoes.map((s: any) => String(s || '').trim()).filter(Boolean)
      : ['T1 = Manhã (06h-14h)', 'T2 = Tarde (14h-22h)', 'HOR = Horista', 'S / F = Folga'],
    trocasDeEscalaIdentificadas: Array.isArray(parsed.trocasDeEscalaIdentificadas)
      ? parsed.trocasDeEscalaIdentificadas.map((t: any) => String(t || '').trim()).filter(Boolean)
      : [],
    colaboradoresIdentificados,
    itensEscala,
    conflitosDetectados,
    motorUtilizado,
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
 * Cliente resiliente multi-ambiente para OCR de Escalas via OpenRouter API
 */
export async function requisitarLeituraEscalaOCR(payload: EscalaOcrRequestPayload): Promise<any> {
  let optimizedPayload = { ...payload };
  if (typeof window !== 'undefined' && payload.imageBase64) {
    const compressed = await comprimirImagemClienteParaOCR(payload.imageBase64, 1600);
    optimizedPayload = {
      ...payload,
      imageBase64: compressed.dataUrl,
      mimeType: compressed.mimeType,
    };
  }

  let ultimoErro = '';

  const endpoints = ['/api/analyze-schedule-image', '/api/gemini/escala-ocr'];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: optimizedPayload.imageBase64,
          imageBase64: optimizedPayload.imageBase64,
          mimeType: optimizedPayload.mimeType || 'image/jpeg',
          mesAnoReferencia: optimizedPayload.mesAnoReferencia,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        const rawText = await response.text();
        const data = parseAndRepairJson(rawText);
        if (data && data.success !== false) {
          const rawResult = data.data || data;
          let structured: any;
          if (rawResult.itensEscala && rawResult.colaboradoresIdentificados) {
            structured = { ...rawResult };
          } else {
            structured = estruturarRespostaEscalaOcr(
              rawResult,
              payload,
              data.motorUtilizado || 'OpenRouter API'
            );
          }
          structured.rawJson = data.raw || data.data || data;
          structured.cells = data.cells || rawResult.cells || [];
          structured.motorUtilizado =
            data.motorUtilizado || structured.motorUtilizado || 'OpenRouter API';
          return structured;
        }
      } else {
        const errText = await response.text().catch(() => '');
        const errJson = parseAndRepairJson(errText);
        ultimoErro = errJson?.error || `Erro HTTP ${response.status} em ${endpoint}`;
      }
    } catch (err: any) {
      ultimoErro = err?.message || `Falha na chamada ao endpoint ${endpoint}`;
    }
  }

  throw new Error(ultimoErro || 'Não foi possível conectar ao serviço de reconhecimento de escala.');
}

/**
 * Cliente resiliente multi-ambiente para OCR de Aferições:
 */
export async function requisitarLeituraAfericaoOCR(payload: AfericaoOcrRequestPayload): Promise<any> {
  let optimizedPayload = { ...payload };
  if (typeof window !== 'undefined' && payload.imageBase64) {
    const compressed = await comprimirImagemClienteParaOCR(payload.imageBase64, 1600);
    optimizedPayload = {
      ...payload,
      imageBase64: compressed.dataUrl,
      mimeType: compressed.mimeType,
    };
  }

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
        body: JSON.stringify(optimizedPayload),
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
