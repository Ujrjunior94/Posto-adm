import { Funcionario, Escala, EscalaStatus } from '../../types';
import { requisitarLeituraEscalaOCR } from '../../services/geminiOcrService';

export interface TurnoCadastrado {
  id: string;
  sigla: string;
  nomeCurto: string;
  inicio: string;
  fim: string;
  corBadge?: string;
}

export const TURNOS_PADRAO_POSTO: TurnoCadastrado[] = [
  {
    id: 'Turno 1 - Manhã (06h - 14h)',
    sigla: 'T1',
    nomeCurto: '1º Turno (Manhã)',
    inicio: '06:00',
    fim: '14:00',
    corBadge: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  {
    id: 'Turno 2 - Tarde (14h - 22h)',
    sigla: 'T2',
    nomeCurto: '2º Turno (Tarde)',
    inicio: '14:00',
    fim: '22:00',
    corBadge: 'bg-blue-100 text-blue-900 border-blue-300',
  },
  {
    id: 'Turno 3 - Noite (22h - 06h)',
    sigla: 'T3',
    nomeCurto: '3º Turno (Noite)',
    inicio: '22:00',
    fim: '06:00',
    corBadge: 'bg-purple-100 text-purple-900 border-purple-300',
  },
  {
    id: 'Turno Horista',
    sigla: 'HOR',
    nomeCurto: 'Turno Horista',
    inicio: '08:00',
    fim: '14:00',
    corBadge: 'bg-teal-100 text-teal-900 border-teal-300',
  },
  {
    id: 'Plantão',
    sigla: 'PLT',
    nomeCurto: 'Plantão 12x36',
    inicio: '06:00',
    fim: '18:00',
    corBadge: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  },
];

export type StatusRegistroImportado = 'CONFIRMADO' | 'REVISAO' | 'NAO_IDENTIFICADO';

export interface RegistroImportadoReconhecido {
  id: string; // identificador único do registro na tabela de revisão
  employeeId: string | null;
  employeeName: string;
  day: number;
  shiftId: string | null;
  shiftName: string;
  shiftSigla: string;
  confidence: number; // 0.00 a 1.00
  status: StatusRegistroImportado;
  observation: string;
  isFolga: boolean;
  horarioInicio: string;
  horarioFim: string;
  rawName?: string;
  rawShift?: string;
}

export interface ResultadoImportacaoEscala {
  month: number;
  year: number;
  motorUtilizado: string;
  records: RegistroImportadoReconhecido[];
  totalReconhecidos: number;
  totalConfirmados: number;
  totalRevisao: number;
  totalNaoIdentificados: number;
}

// ============================================================================
// FUNÇÃO DE NORMALIZAÇÃO DE NOMES
// ============================================================================
export function normalizeName(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// VALIDADORES NO CÓDIGO (REGRA 7: CAMADA INDEPENDENTE DA IA)
// ============================================================================
export function validateEmployee(
  employeeId: string | null | undefined,
  funcionarios: Funcionario[]
): { valid: boolean; funcionario?: Funcionario } {
  if (!employeeId || !Array.isArray(funcionarios)) {
    return { valid: false };
  }
  const func = funcionarios.find((f) => f && f.id === employeeId);
  return {
    valid: Boolean(func),
    funcionario: func,
  };
}

export function validateShift(
  shiftId: string | null | undefined,
  turnos: TurnoCadastrado[] = TURNOS_PADRAO_POSTO
): { valid: boolean; turno?: TurnoCadastrado; isFolga: boolean } {
  if (!shiftId) {
    return { valid: false, isFolga: false };
  }

  const norm = normalizeName(shiftId);
  if (norm === 'folga' || norm === 's' || norm === 'folga 6x1' || norm === 'descanso') {
    return { valid: true, isFolga: true };
  }

  const found = turnos.find(
    (t) =>
      t.id === shiftId ||
      normalizeName(t.id) === norm ||
      normalizeName(t.sigla) === norm ||
      normalizeName(t.nomeCurto) === norm
  );

  return {
    valid: Boolean(found),
    turno: found,
    isFolga: false,
  };
}

export function validateDay(day: number, totalDaysInMonth: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= totalDaysInMonth;
}

export function validateRecord(
  record: Partial<RegistroImportadoReconhecido>,
  funcionarios: Funcionario[],
  turnos: TurnoCadastrado[],
  totalDaysInMonth: number
): RegistroImportadoReconhecido {
  const dayValid = validateDay(Number(record.day), totalDaysInMonth);
  const empVal = validateEmployee(record.employeeId, funcionarios);
  const shiftVal = validateShift(record.shiftId, turnos);

  let status: StatusRegistroImportado = 'CONFIRMADO';
  const obs: string[] = [];

  if (!dayValid) {
    status = 'REVISAO';
    obs.push(`Dia inválido (${record.day}). Deve estar entre 1 e ${totalDaysInMonth}.`);
  }

  if (!empVal.valid) {
    status = 'NAO_IDENTIFICADO';
    obs.push('Funcionário não encontrado no cadastro oficial.');
  }

  if (!shiftVal.valid) {
    status = status === 'NAO_IDENTIFICADO' ? 'NAO_IDENTIFICADO' : 'REVISAO';
    obs.push('Turno não corresponde aos turnos oficiais cadastrados.');
  }

  const confidence = typeof record.confidence === 'number' ? record.confidence : 0.9;
  if (confidence < 0.7 && status === 'CONFIRMADO') {
    status = 'REVISAO';
    obs.push('Baixa confiança de leitura visual.');
  }

  const shiftName = shiftVal.isFolga
    ? 'Folga'
    : shiftVal.turno?.nomeCurto || shiftVal.turno?.id || record.shiftName || 'Não identificado';

  const shiftSigla = shiftVal.isFolga
    ? 'S'
    : shiftVal.turno?.sigla || '—';

  return {
    id: record.id || `rec-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    employeeId: empVal.valid && empVal.funcionario ? empVal.funcionario.id : null,
    employeeName: empVal.valid && empVal.funcionario ? empVal.funcionario.nome : record.employeeName || 'Não identificado',
    day: Number(record.day) || 1,
    shiftId: shiftVal.valid ? (shiftVal.isFolga ? 'FOLGA' : shiftVal.turno?.id || 'FOLGA') : null,
    shiftName,
    shiftSigla,
    confidence,
    status,
    observation: record.observation ? `${record.observation} ${obs.join(' ')}`.trim() : obs.join(' '),
    isFolga: shiftVal.isFolga,
    horarioInicio: shiftVal.isFolga ? '00:00' : shiftVal.turno?.inicio || '06:00',
    horarioFim: shiftVal.isFolga ? '00:00' : shiftVal.turno?.fim || '14:00',
    rawName: record.rawName,
    rawShift: record.rawShift,
  };
}

// ============================================================================
// CORRESPONDÊNCIA SEGURA DE FUNCIONÁRIOS (SEM AMBIGUIDADE)
// ============================================================================
export function matchEmployeeByName(
  rawName: string,
  funcionarios: Funcionario[]
): {
  funcionario: Funcionario | null;
  status: StatusRegistroImportado;
  confidence: number;
  candidates: Funcionario[];
  observation: string;
} {
  const norm = normalizeName(rawName);
  if (!norm || norm === 'nao identificado' || norm.length < 2) {
    return {
      funcionario: null,
      status: 'NAO_IDENTIFICADO',
      confidence: 0,
      candidates: [],
      observation: 'Nome ilegível ou ausente na imagem.',
    };
  }

  // 1. Correspondência exata
  const exact = funcionarios.filter((f) => normalizeName(f.nome) === norm);
  if (exact.length === 1) {
    return {
      funcionario: exact[0],
      status: 'CONFIRMADO',
      confidence: 0.98,
      candidates: exact,
      observation: 'Correspondência exata de cadastro.',
    };
  }

  // 2. Correspondência por tokens (Primeiro nome + Sobrenome)
  const tokensLido = norm.split(' ').filter((t) => t.length >= 2);
  const candidatas: Funcionario[] = [];

  for (const f of funcionarios) {
    const normF = normalizeName(f.nome);
    if (normF.includes(norm) || norm.includes(normF)) {
      candidatas.push(f);
      continue;
    }

    const tokensF = normF.split(' ').filter((t) => t.length >= 2);
    if (tokensLido.length >= 2 && tokensF.length >= 2) {
      if (
        tokensLido[0] === tokensF[0] &&
        (tokensLido[tokensLido.length - 1] === tokensF[tokensF.length - 1] || tokensLido[1] === tokensF[1])
      ) {
        candidatas.push(f);
      }
    } else if (tokensLido.length === 1 && tokensF.length > 0 && tokensF[0] === tokensLido[0]) {
      candidatas.push(f);
    }
  }

  // Desduplicar candidatas
  const candidatasUnicas = Array.from(new Set(candidatas));

  if (candidatasUnicas.length === 1) {
    return {
      funcionario: candidatasUnicas[0],
      status: 'CONFIRMADO',
      confidence: 0.92,
      candidates: candidatasUnicas,
      observation: `Conciliado com "${candidatasUnicas[0].nome}".`,
    };
  }

  if (candidatasUnicas.length > 1) {
    // Ambiguidade detectada: REGRA 8 -> REVISAO
    return {
      funcionario: null,
      status: 'REVISAO',
      confidence: 0.5,
      candidates: candidatasUnicas,
      observation: `Ambiguidade: múltiplos funcionários encontrados (${candidatasUnicas.map((c) => c.nome).join(', ')}). Selecione manualmente.`,
    };
  }

  return {
    funcionario: null,
    status: 'NAO_IDENTIFICADO',
    confidence: 0.3,
    candidates: [],
    observation: `Nenhum funcionário cadastrado corresponde a "${rawName}".`,
  };
}

// ============================================================================
// CORRESPONDÊNCIA SEGURA DE TURNOS (REGRA 9)
// ============================================================================
export function matchShiftByText(
  rawShift: string,
  turnos: TurnoCadastrado[] = TURNOS_PADRAO_POSTO
): {
  shiftId: string | null;
  shiftName: string;
  shiftSigla: string;
  isFolga: boolean;
  status: StatusRegistroImportado;
  confidence: number;
} {
  const norm = normalizeName(rawShift);

  if (
    norm === 's' ||
    norm === 'folga' ||
    norm === 'f' ||
    norm === 'descanso' ||
    norm === 'folga 6x1' ||
    norm === 'd'
  ) {
    return {
      shiftId: 'FOLGA',
      shiftName: 'Folga',
      shiftSigla: 'S',
      isFolga: true,
      status: 'CONFIRMADO',
      confidence: 0.99,
    };
  }

  if (norm === 'fe' || norm === 'ferias') {
    return {
      shiftId: 'FERIAS',
      shiftName: 'Férias',
      shiftSigla: 'FE',
      isFolga: false,
      status: 'CONFIRMADO',
      confidence: 0.95,
    };
  }

  if (norm === 'at' || norm === 'atestado' || norm === 'medico') {
    return {
      shiftId: 'ATESTADO',
      shiftName: 'Atestado',
      shiftSigla: 'AT',
      isFolga: false,
      status: 'CONFIRMADO',
      confidence: 0.95,
    };
  }

  if (norm === 'fa' || norm === 'falta' || norm === 'ausente') {
    return {
      shiftId: 'AUSENTE',
      shiftName: 'Falta',
      shiftSigla: 'FA',
      isFolga: false,
      status: 'CONFIRMADO',
      confidence: 0.95,
    };
  }

  for (const t of turnos) {
    const normSigla = normalizeName(t.sigla);
    const normNome = normalizeName(t.nomeCurto);
    const normId = normalizeName(t.id);
    const horarioRange = normalizeName(`${t.inicio} ${t.fim}`).replace(/[^0-9]/g, '');

    const digitsOnly = norm.replace(/[^0-9]/g, '');

    if (
      norm === normSigla ||
      norm === normNome ||
      norm === normId ||
      (digitsOnly.length >= 4 && horarioRange.length >= 4 && (horarioRange.includes(digitsOnly) || digitsOnly.includes(horarioRange.slice(0, 4))))
    ) {
      return {
        shiftId: t.id,
        shiftName: t.nomeCurto,
        shiftSigla: t.sigla,
        isFolga: false,
        status: 'CONFIRMADO',
        confidence: 0.95,
      };
    }
  }

  // Heurística de aproximação se contém 06, 14, 22
  if (norm.includes('06') || norm.includes('manha') || norm.includes('1o') || norm.includes('t1')) {
    const t1 = turnos.find((t) => t.sigla === 'T1') || turnos[0];
    return {
      shiftId: t1.id,
      shiftName: t1.nomeCurto,
      shiftSigla: t1.sigla,
      isFolga: false,
      status: 'CONFIRMADO',
      confidence: 0.88,
    };
  }

  if (norm.includes('14') || norm.includes('tarde') || norm.includes('2o') || norm.includes('t2')) {
    const t2 = turnos.find((t) => t.sigla === 'T2') || turnos[1];
    return {
      shiftId: t2.id,
      shiftName: t2.nomeCurto,
      shiftSigla: t2.sigla,
      isFolga: false,
      status: 'CONFIRMADO',
      confidence: 0.88,
    };
  }

  if (norm.includes('22') || norm.includes('noite') || norm.includes('3o') || norm.includes('t3')) {
    const t3 = turnos.find((t) => t.sigla === 'T3') || turnos[2];
    return {
      shiftId: t3.id,
      shiftName: t3.nomeCurto,
      shiftSigla: t3.sigla,
      isFolga: false,
      status: 'CONFIRMADO',
      confidence: 0.88,
    };
  }

  if (norm.includes('hor') || norm.includes('horista')) {
    const th = turnos.find((t) => t.sigla === 'HOR') || turnos[3];
    return {
      shiftId: th ? th.id : 'Turno Horista',
      shiftName: th ? th.nomeCurto : 'Turno Horista',
      shiftSigla: 'HOR',
      isFolga: false,
      status: 'CONFIRMADO',
      confidence: 0.88,
    };
  }

  if (norm.includes('12x36') || norm.includes('plantao') || norm.includes('plt')) {
    const tp = turnos.find((t) => t.sigla === 'PLT') || turnos[4];
    return {
      shiftId: tp ? tp.id : 'Plantão',
      shiftName: tp ? tp.nomeCurto : 'Plantão 12x36',
      shiftSigla: 'PLT',
      isFolga: false,
      status: 'CONFIRMADO',
      confidence: 0.88,
    };
  }

  return {
    shiftId: null,
    shiftName: rawShift || 'Não identificado',
    shiftSigla: '—',
    isFolga: false,
    status: 'NAO_IDENTIFICADO',
    confidence: 0.3,
  };
}

// ============================================================================
// EXECUTOR PRINCIPAL DO FLUXO DE IMPORTAÇÃO DE ESCALA POR IMAGEM
// ============================================================================
export async function importarEscalaPorImagem({
  imageBase64,
  mimeType = 'image/jpeg',
  month,
  year,
  funcionarios,
  turnos = TURNOS_PADRAO_POSTO,
  motor = 'chatgpt',
}: {
  imageBase64: string;
  mimeType?: string;
  month: number; // 1 a 12
  year: number;
  funcionarios: Funcionario[];
  turnos?: TurnoCadastrado[];
  motor?: 'chatgpt' | 'gemini';
}): Promise<ResultadoImportacaoEscala> {
  const mesAnoStr = `${year}-${String(month).padStart(2, '0')}`;
  const totalDaysInMonth = new Date(year, month, 0).getDate();

  // 1. Enviar para a IA com a lista oficial de funcionários e turnos cadastrados
  const payloadFuncionarios = funcionarios.map((f) => ({
    id: f.id,
    nome: f.nome,
    matricula: f.matricula || '',
    cargo: f.cargo || 'Frentista',
    funcao: f.funcao || '',
    setor: f.setor || 'Pista',
    turnoPreferencial: f.turnoPreferencial || '',
  }));

  const ocrResponse = await requisitarLeituraEscalaOCR({
    imageBase64,
    mimeType,
    mesAnoReferencia: mesAnoStr,
    motor,
    funcionariosCadastrados: payloadFuncionarios,
  });

  const motorUtilizado = ocrResponse.motorUtilizado || (motor === 'chatgpt' ? 'ChatGPT (GPT-4o Vision)' : 'Gemini Vision');

  const itens = Array.isArray(ocrResponse.itensEscala) ? ocrResponse.itensEscala : [];
  const colabs = Array.isArray(ocrResponse.colaboradoresIdentificados) ? ocrResponse.colaboradoresIdentificados : [];

  const recordsValidados: RegistroImportadoReconhecido[] = [];

  // Se a IA retornou itens estruturados por dia
  if (itens.length > 0) {
    itens.forEach((it: any, idx: number) => {
      const rawNome = String(it.funcionarioNome || it.nomeOriginal || '').trim();
      const rawShift = String(it.turno || it.codigoOriginal || it.status || '').trim();

      let dayNum = 1;
      if (it.data) {
        const parts = String(it.data).split('-');
        if (parts.length === 3) {
          dayNum = parseInt(parts[2], 10);
        }
      } else if (it.dia) {
        dayNum = parseInt(String(it.dia), 10);
      }

      // Correspondência estrita de funcionário
      const matchFunc = matchEmployeeByName(rawNome, funcionarios);
      const matchTurno = matchShiftByText(rawShift, turnos);

      let conf = 0.95;
      if (typeof it.confianca === 'number') conf = it.confianca;
      else if (matchFunc.confidence && matchTurno.confidence) {
        conf = Math.min(matchFunc.confidence, matchTurno.confidence);
      }

      const recParcial: Partial<RegistroImportadoReconhecido> = {
        id: `ocr-${idx}-${Date.now()}`,
        employeeId: matchFunc.funcionario ? matchFunc.funcionario.id : null,
        employeeName: matchFunc.funcionario ? matchFunc.funcionario.nome : rawNome || 'Não identificado',
        day: dayNum,
        shiftId: matchTurno.shiftId,
        shiftName: matchTurno.shiftName,
        shiftSigla: matchTurno.shiftSigla,
        confidence: conf,
        status: matchFunc.status === 'CONFIRMADO' && matchTurno.status === 'CONFIRMADO' ? 'CONFIRMADO' : 'REVISAO',
        observation: [matchFunc.observation, matchTurno.status === 'NAO_IDENTIFICADO' ? 'Turno não reconhecido.' : '']
          .filter(Boolean)
          .join(' '),
        isFolga: matchTurno.isFolga,
        rawName: rawNome,
        rawShift: rawShift,
      };

      const recordFinal = validateRecord(recParcial, funcionarios, turnos, totalDaysInMonth);
      recordsValidados.push(recordFinal);
    });
  } else if (colabs.length > 0) {
    // Caso a imagem tenha identificado apenas os colaboradores e seus turnos principais
    colabs.forEach((c: any, cIdx: number) => {
      const rawNome = String(c.nomeOriginal || '').trim();
      const matchFunc = matchEmployeeByName(rawNome, funcionarios);
      const matchTurno = matchShiftByText(c.turnoPadrao || c.siglaTurnoPadrao || 'T1', turnos);

      for (let d = 1; d <= totalDaysInMonth; d++) {
        const ehFolga = d % 7 === 0;
        const recParcial: Partial<RegistroImportadoReconhecido> = {
          id: `ocr-colab-${cIdx}-d${d}`,
          employeeId: matchFunc.funcionario ? matchFunc.funcionario.id : null,
          employeeName: matchFunc.funcionario ? matchFunc.funcionario.nome : rawNome,
          day: d,
          shiftId: ehFolga ? 'FOLGA' : matchTurno.shiftId,
          shiftName: ehFolga ? 'Folga' : matchTurno.shiftName,
          shiftSigla: ehFolga ? 'S' : matchTurno.shiftSigla,
          confidence: matchFunc.confidence,
          status: matchFunc.status,
          observation: ehFolga ? 'Folga sugerida 6x1.' : matchFunc.observation,
          isFolga: ehFolga,
          rawName: rawNome,
          rawShift: ehFolga ? 'S' : matchTurno.shiftSigla,
        };
        const recordFinal = validateRecord(recParcial, funcionarios, turnos, totalDaysInMonth);
        recordsValidados.push(recordFinal);
      }
    });
  }

  const totalReconhecidos = recordsValidados.length;
  const totalConfirmados = recordsValidados.filter((r) => r.status === 'CONFIRMADO').length;
  const totalRevisao = recordsValidados.filter((r) => r.status === 'REVISAO').length;
  const totalNaoIdentificados = recordsValidados.filter((r) => r.status === 'NAO_IDENTIFICADO').length;

  return {
    month,
    year,
    motorUtilizado,
    records: recordsValidados,
    totalReconhecidos,
    totalConfirmados,
    totalRevisao,
    totalNaoIdentificados,
  };
}
