import { Escala, Funcionario, EscalaStatus } from '../../types';
import { normalizarTextoComparacao } from '../../services/geminiOcrService';

export type TipoConflitoEscala =
  | 'INTERJORNADA_INSUFICIENTE' // Menos de 11h entre o término de um turno e o início do próximo
  | 'DOBRA_DE_TURNO_DIRETO' // Turnos colados ou consecutivos imediatos sem intervalo
  | 'DIAS_CONSECUTIVOS_SEM_DESCANSO' // Mais de 6 dias seguidos de trabalho sem folga semanal (DSR / 6x1)
  | 'TURNO_SEM_COBERTURA' // Turno com 0 colaboradores escalados no dia
  | 'COBERTURA_ABAIXO_DO_MINIMO' // Turno com menos colaboradores do que o mínimo configurado
  | 'DUPLICIDADE_TURNO_MESMO_DIA'; // Mesmo funcionário com múltiplos turnos ativos no mesmo dia

export type SeveridadeConflito = 'CRITICO' | 'AVISO';

export interface ConflitoEscala {
  id: string;
  tipo: TipoConflitoEscala;
  severidade: SeveridadeConflito;
  titulo: string;
  descricao: string;
  explicacaoLegal: string;
  funcionarioId?: string;
  funcionarioNome?: string;
  data: string; // YYYY-MM-DD
  dataFim?: string;
  diaMes: number;
  turnoId?: string; // T1, T2, T3, HOR, PLT
  turnoNome?: string;
  detalhes?: {
    horasDescanso?: number;
    diasConsecutivos?: number;
    coberturaAtual?: number;
    coberturaMinima?: number;
    horarioSaidaAnterior?: string;
    horarioEntradaSeguinte?: string;
    turnosConflitantes?: string[];
  };
  sugestaoCorrecao: string;
}

export interface ConfiguracaoRegrasEscala {
  minimoColaboradoresPorTurno: Record<string, number>;
  minimoColaboradoresPadrao: number;
  horasMinimasInterjornada: number; // Padrão: 11 horas (CLT Art. 66)
  maximoDiasConsecutivos: number; // Padrão: 6 dias (Escala 6x1 / CLT Art. 67)
  alertarTurnoDescoberto: boolean; // Padrão: true
  turnosMonitorados: Array<{ sigla: string; nome: string; inicioPadrao: string; fimPadrao: string }>;
}

export const REGRAS_PADRAO_ESCALA: ConfiguracaoRegrasEscala = {
  minimoColaboradoresPorTurno: {
    T1: 1, // Pelo menos 1 no 1º Turno (Manhã)
    T2: 1, // Pelo menos 1 no 2º Turno (Tarde)
    T3: 1, // Pelo menos 1 no 3º Turno (Noite)
    HOR: 0,
    PLT: 0,
  },
  minimoColaboradoresPadrao: 1,
  horasMinimasInterjornada: 11,
  maximoDiasConsecutivos: 6,
  alertarTurnoDescoberto: true,
  turnosMonitorados: [
    { sigla: 'T1', nome: '1º Turno (Manhã 06h-14h)', inicioPadrao: '06:00', fimPadrao: '14:00' },
    { sigla: 'T2', nome: '2º Turno (Tarde 14h-22h)', inicioPadrao: '14:00', fimPadrao: '22:00' },
    { sigla: 'T3', nome: '3º Turno (Noite 22h-06h)', inicioPadrao: '22:00', fimPadrao: '06:00' },
  ],
};

/**
 * Converte data (YYYY-MM-DD) e hora (HH:MM) para timestamp numérico em milissegundos
 */
function calcularTimestamp(dataIso: string, horaHhMm: string, diaOffset: number = 0): number {
  if (!dataIso) return 0;
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const [hora, min] = (horaHhMm || '00:00').split(':').map(Number);
  const d = new Date(ano, mes - 1, dia + diaOffset, hora || 0, min || 0, 0, 0);
  return d.getTime();
}

/**
 * Extrai a sigla padronizada do turno (T1, T2, T3, HOR, PLT)
 */
export function normalizarSiglaTurno(turno?: string, horarioInicio?: string): string {
  const t = (turno || '').toLowerCase();
  const h = (horarioInicio || '').trim();

  if (t.includes('plantão') || t.includes('plantao') || t.includes('12x36') || t === 'plt') return 'PLT';
  if (t.includes('horista') || t === 'hor') return 'HOR';
  if (t.includes('noite') || t.includes('turno 3') || t === 't3' || h.startsWith('22:') || h.startsWith('23:')) {
    return 'T3';
  }
  // T1 - Manhã (06h - 14h / 1T / T1)
  if (
    t.includes('turno 1') ||
    t.includes('manhã') ||
    t.includes('manha') ||
    t.includes('1t') ||
    t === 't1' ||
    t === '1' ||
    t.includes('06h') ||
    t.includes('06-14') ||
    h.startsWith('05:') ||
    h.startsWith('06:') ||
    h.startsWith('07:')
  ) {
    return 'T1';
  }
  // T2 - Tarde (14h - 22h / 2T / T2)
  if (
    t.includes('turno 2') ||
    t.includes('tarde') ||
    t.includes('vespertino') ||
    t.includes('2t') ||
    t === 't2' ||
    t === '2' ||
    t.includes('14-22') ||
    (t.includes('14h') && !t.includes('06h')) ||
    h.startsWith('12:') ||
    h.startsWith('13:') ||
    h.startsWith('14:') ||
    h.startsWith('15:')
  ) {
    return 'T2';
  }
  return 'T1';
}

/**
 * Obtém horários de entrada e saída padrão para uma sigla de turno
 */
export function obterHorariosPadraoTurno(sigla: string, entradaInformada?: string, saidaInformada?: string) {
  if (entradaInformada && saidaInformada && entradaInformada !== '00:00' && saidaInformada !== '00:00') {
    return { inicio: entradaInformada, fim: saidaInformada };
  }
  switch (sigla) {
    case 'T1':
      return { inicio: '06:00', fim: '14:00' };
    case 'T2':
      return { inicio: '14:00', fim: '22:00' };
    case 'T3':
      return { inicio: '22:00', fim: '06:00' };
    case 'HOR':
      return { inicio: '08:00', fim: '14:00' };
    case 'PLT':
      return { inicio: '06:00', fim: '18:00' };
    default:
      return { inicio: '06:00', fim: '14:00' };
  }
}

export interface ResultadoAuditoriaConflitos {
  conflitos: ConflitoEscala[];
  conflitosCriticos: ConflitoEscala[];
  conflitosAvisos: ConflitoEscala[];
  estatisticas: {
    total: number;
    criticos: number;
    avisos: number;
    interjornadas: number;
    diasSemDescanso: number;
    faltaCobertura: number;
    duplicidades: number;
  };
  mapaConflitosPorCelula: Record<string, ConflitoEscala[]>;
  mapaConflitosPorDia: Record<number, ConflitoEscala[]>;
  coberturaPorDia: Record<number, Record<string, number>>; // dia -> { T1: count, T2: count, T3: count, total: count }
  turnosDescobertosPorDia: Record<number, string[]>; // dia -> siglas dos turnos sem cobertura
}

/**
 * Motor Principal de Auditoria Automática de Conflitos da Escala do Planner
 */
export function analisarConflitosEscala(params: {
  funcionarios: Funcionario[];
  escalas: Escala[];
  anoMes: string; // YYYY-MM
  config?: Partial<ConfiguracaoRegrasEscala>;
}): ResultadoAuditoriaConflitos {
  const { funcionarios, escalas, anoMes } = params;
  const config: ConfiguracaoRegrasEscala = {
    ...REGRAS_PADRAO_ESCALA,
    ...(params.config || {}),
    minimoColaboradoresPorTurno: {
      ...REGRAS_PADRAO_ESCALA.minimoColaboradoresPorTurno,
      ...(params.config?.minimoColaboradoresPorTurno || {}),
    },
  };

  const [anoStr, mesStr] = anoMes.split('-');
  const ano = parseInt(anoStr, 10) || new Date().getFullYear();
  const mes = parseInt(mesStr, 10) || new Date().getMonth() + 1;
  const diasNoMes = new Date(ano, mes, 0).getDate();

  const conflitos: ConflitoEscala[] = [];
  const mapaConflitosPorCelula: Record<string, ConflitoEscala[]> = {};
  const mapaConflitosPorDia: Record<number, ConflitoEscala[]> = {};
  const coberturaPorDia: Record<number, Record<string, number>> = {};
  const turnosDescobertosPorDia: Record<number, string[]> = {};

  // Inicializa mapa de cobertura para todos os dias do mês
  for (let d = 1; d <= diasNoMes; d++) {
    coberturaPorDia[d] = {
      T1: 0,
      T2: 0,
      T3: 0,
      HOR: 0,
      PLT: 0,
      totalTrabalho: 0,
      totalFolga: 0,
    };
    turnosDescobertosPorDia[d] = [];
    mapaConflitosPorDia[d] = [];
  }

  // Filtra apenas escalas pertencentes a este mês e cria índice rápido
  const escalasMes = escalas.filter((e) => e.data && e.data.startsWith(anoMes));

  // Mapa de escalas por funcionário (chave: funcionarioId ou nomeNormalizado)
  interface ItemJornadaFuncionario {
    escalaId: string;
    dia: number;
    dataIso: string;
    siglaTurno: string;
    turnoNome: string;
    horarioInicio: string;
    horarioFim: string;
    status: EscalaStatus;
    tsInicio: number;
    tsFim: number;
    escalaOriginal: Escala;
  }

  const jornadasPorFuncionario = new Map<string, ItemJornadaFuncionario[]>();
  const funcionariosPorId = new Map<string, Funcionario>();
  funcionarios.forEach((f) => {
    funcionariosPorId.set(f.id, f);
  });

  // Agrupa e tabula a cobertura por dia
  escalasMes.forEach((esc) => {
    const diaNum = parseInt(esc.data.split('-')[2] || '0', 10);
    if (diaNum < 1 || diaNum > diasNoMes) return;

    const ehTrabalho = esc.status === 'TRABALHO' || esc.status === 'PLANTAO';
    const ehFolga = esc.status === 'FOLGA';

    const sigla = normalizarSiglaTurno(esc.turno, esc.horarioInicio);

    if (ehTrabalho) {
      if (coberturaPorDia[diaNum][sigla] !== undefined) {
        coberturaPorDia[diaNum][sigla]++;
      }
      coberturaPorDia[diaNum].totalTrabalho++;

      // Calcula timestamps de início e fim da jornada
      const { inicio, fim } = obterHorariosPadraoTurno(sigla, esc.horarioInicio, esc.horarioFim);
      const [hIni] = (inicio || '06:00').split(':').map(Number);
      const [hFim] = (fim || '14:00').split(':').map(Number);

      // Se hFim <= hIni, o turno atravessa a meia-noite (ex: Turno 3 Noite 22h às 06h)
      const diaOffsetFim = hFim <= hIni ? 1 : 0;
      const tsInicio = calcularTimestamp(esc.data, inicio, 0);
      const tsFim = calcularTimestamp(esc.data, fim, diaOffsetFim);

      const funcKey = esc.funcionarioId || `nome:${normalizarTextoComparacao(esc.funcionarioNome)}`;
      if (!jornadasPorFuncionario.has(funcKey)) {
        jornadasPorFuncionario.set(funcKey, []);
      }

      jornadasPorFuncionario.get(funcKey)!.push({
        escalaId: esc.id,
        dia: diaNum,
        dataIso: esc.data,
        siglaTurno: sigla,
        turnoNome: esc.turno || sigla,
        horarioInicio: inicio,
        horarioFim: fim,
        status: esc.status,
        tsInicio,
        tsFim,
        escalaOriginal: esc,
      });
    } else if (ehFolga) {
      coberturaPorDia[diaNum].totalFolga++;
    }
  });

  // =========================================================================
  // 1. AUDITORIA INDIVIDUAL: Interjornadas, Dobras e Dias Consecutivos sem Folga
  // =========================================================================
  funcionarios.forEach((func) => {
    const nomeNorm = normalizarTextoComparacao(func.nome);
    const jornadas = jornadasPorFuncionario.get(func.id) || jornadasPorFuncionario.get(`nome:${nomeNorm}`) || [];

    // Ordena jornadas cronologicamente
    jornadas.sort((a, b) => a.tsInicio - b.tsInicio);

    // 1.1 Duplicidade de escala ativa no mesmo dia
    const jornadasPorDia = new Map<number, ItemJornadaFuncionario[]>();
    jornadas.forEach((j) => {
      if (!jornadasPorDia.has(j.dia)) jornadasPorDia.set(j.dia, []);
      jornadasPorDia.get(j.dia)!.push(j);
    });

    jornadasPorDia.forEach((itensDia, dNum) => {
      if (itensDia.length > 1) {
        const dataIso = `${anoMes}-${String(dNum).padStart(2, '0')}`;
        const turnosStr = itensDia.map((it) => it.siglaTurno).join(' e ');
        const conflito: ConflitoEscala = {
          id: `dup-${func.id}-${dataIso}`,
          tipo: 'DUPLICIDADE_TURNO_MESMO_DIA',
          severidade: 'CRITICO',
          titulo: 'Múltiplos Turnos no Mesmo Dia',
          descricao: `${func.nome} está escalado em mais de um turno no dia ${String(dNum).padStart(2, '0')}: ${turnosStr}.`,
          explicacaoLegal: 'Um colaborador não pode estar alocado em dois turnos concorrentes simultaneamente sem acordo específico.',
          funcionarioId: func.id,
          funcionarioNome: func.nome,
          data: dataIso,
          diaMes: dNum,
          detalhes: {
            turnosConflitantes: itensDia.map((it) => it.turnoNome),
          },
          sugestaoCorrecao: 'Remova um dos lançamentos duplicados ou consolide em um único turno.',
        };
        conflitos.push(conflito);
        adicionarAoMapa(mapaConflitosPorCelula, `${func.id}_${dataIso}`, conflito);
        adicionarAoMapa(mapaConflitosPorCelula, `nome:${nomeNorm}_${dataIso}`, conflito);
        mapaConflitosPorDia[dNum].push(conflito);
      }
    });

    // 1.2 Descanso Interjornada Insuficiente e Dobras de Turno (< 11 Horas de Descanso - CLT Artigo 66)
    for (let i = 0; i < jornadas.length - 1; i++) {
      const atual = jornadas[i];
      const proximo = jornadas[i + 1];

      // Intervalo em milissegundos entre o término do turno atual e o início do próximo
      const diferencaMs = proximo.tsInicio - atual.tsFim;
      const horasDescanso = diferencaMs / (1000 * 60 * 60);

      // Se o próximo turno começa antes do anterior terminar (sobreposição) ou com menos de 11h
      if (horasDescanso < config.horasMinimasInterjornada && diferencaMs >= 0) {
        const ehDobraDireta = horasDescanso <= 1.0;
        const tipo: TipoConflitoEscala = ehDobraDireta ? 'DOBRA_DE_TURNO_DIRETO' : 'INTERJORNADA_INSUFICIENTE';
        const severidade: SeveridadeConflito = horasDescanso < 8 ? 'CRITICO' : 'AVISO';

        const conflito: ConflitoEscala = {
          id: `inter-${func.id}-${atual.dataIso}-${proximo.dataIso}`,
          tipo,
          severidade,
          titulo: ehDobraDireta ? 'Dobra de Turno sem Descanso' : 'Descanso Interjornada Insuficiente (< 11h)',
          descricao: `${func.nome}: Sai do ${atual.siglaTurno} às ${atual.horarioFim} (Dia ${String(atual.dia).padStart(2, '0')}) e entra no ${proximo.siglaTurno} às ${proximo.horarioInicio} (Dia ${String(proximo.dia).padStart(2, '0')}). Descanso de apenas ${horasDescanso.toFixed(1)}h.`,
          explicacaoLegal: 'CLT Artigo 66: Entre 2 (duas) jornadas de trabalho haverá um período mínimo de 11 (onze) horas consecutivas para descanso.',
          funcionarioId: func.id,
          funcionarioNome: func.nome,
          data: proximo.dataIso,
          diaMes: proximo.dia,
          turnoId: proximo.siglaTurno,
          turnoNome: proximo.turnoNome,
          detalhes: {
            horasDescanso: Math.max(0, parseFloat(horasDescanso.toFixed(1))),
            horarioSaidaAnterior: `${atual.dataIso} às ${atual.horarioFim}`,
            horarioEntradaSeguinte: `${proximo.dataIso} às ${proximo.horarioInicio}`,
          },
          sugestaoCorrecao: `Altere o turno de entrada para permitir no mínimo 11h de repouso, ou insira uma Folga (S) no dia ${String(proximo.dia).padStart(2, '0')}.`,
        };

        conflitos.push(conflito);
        adicionarAoMapa(mapaConflitosPorCelula, `${func.id}_${proximo.dataIso}`, conflito);
        adicionarAoMapa(mapaConflitosPorCelula, `nome:${nomeNorm}_${proximo.dataIso}`, conflito);
        mapaConflitosPorDia[proximo.dia].push(conflito);
      }
    }

    // 1.3 Excesso de Dias Consecutivos Trabalhados sem Folga (Regra 6x1 / Limite CLT Artigo 67)
    // Constrói array ordenado de status por dia do mês
    const diasTrabalhadosSet = new Set(jornadas.map((j) => j.dia));

    let diasConsecutivos = 0;
    let diaInicioStreak = 1;

    for (let d = 1; d <= diasNoMes; d++) {
      if (diasTrabalhadosSet.has(d)) {
        if (diasConsecutivos === 0) {
          diaInicioStreak = d;
        }
        diasConsecutivos++;

        if (diasConsecutivos > config.maximoDiasConsecutivos) {
          const dataIso = `${anoMes}-${String(d).padStart(2, '0')}`;
          const conflito: ConflitoEscala = {
            id: `dias-sem-descanso-${func.id}-${dataIso}`,
            tipo: 'DIAS_CONSECUTIVOS_SEM_DESCANSO',
            severidade: diasConsecutivos >= 8 ? 'CRITICO' : 'AVISO',
            titulo: 'Trabalho Consecutivo sem Folga Semanal (DSR)',
            descricao: `${func.nome} está escalado há ${diasConsecutivos} dias consecutivos de trabalho (desde o dia ${String(diaInicioStreak).padStart(2, '0')}) sem nenhuma folga DSR.`,
            explicacaoLegal: 'CLT Artigo 67 & Súmula 444 TST: É assegurado a todo empregado um descanso semanal remunerado de 24 horas consecutivas, obrigatoriamente após no máximo 6 dias seguidos de trabalho.',
            funcionarioId: func.id,
            funcionarioNome: func.nome,
            data: dataIso,
            diaMes: d,
            detalhes: {
              diasConsecutivos,
            },
            sugestaoCorrecao: `Conceda Folga (S) no dia ${String(d).padStart(2, '0')} para cumprir a escala legal 6x1.`,
          };

          conflitos.push(conflito);
          adicionarAoMapa(mapaConflitosPorCelula, `${func.id}_${dataIso}`, conflito);
          adicionarAoMapa(mapaConflitosPorCelula, `nome:${nomeNorm}_${dataIso}`, conflito);
          mapaConflitosPorDia[d].push(conflito);
        }
      } else {
        // Encontrou dia sem trabalho (Folga / Férias / Ausente) -> reseta a contagem
        diasConsecutivos = 0;
      }
    }
  });

  // =========================================================================
  // 2. AUDITORIA COLETIVA: Falta de Cobertura Mínima e Turnos Descobertos
  // =========================================================================
  if (config.alertarTurnoDescoberto && funcionarios.length > 0) {
    for (let d = 1; d <= diasNoMes; d++) {
      const dataIso = `${anoMes}-${String(d).padStart(2, '0')}`;
      const cobDia = coberturaPorDia[d];

      // Avalia cada turno monitorado
      config.turnosMonitorados.forEach((t) => {
        const qtdEscalados = cobDia[t.sigla] || 0;
        const minExigido = config.minimoColaboradoresPorTurno[t.sigla] ?? config.minimoColaboradoresPadrao;

        if (minExigido > 0) {
          if (qtdEscalados === 0) {
            // Turno totalmente descoberto (Crítico)
            turnosDescobertosPorDia[d].push(t.sigla);

            const conflito: ConflitoEscala = {
              id: `cob-zero-${d}-${t.sigla}`,
              tipo: 'TURNO_SEM_COBERTURA',
              severidade: 'CRITICO',
              titulo: `Turno Descoberto: ${t.nome}`,
              descricao: `O ${t.nome} está sem NENHUM colaborador escalado no dia ${String(d).padStart(2, '0')}! O posto ficará desassistido neste horário.`,
              explicacaoLegal: 'Regra Operacional: Cada turno ativo deve possuir no mínimo 1 colaborador escalado para garantir a operação do posto.',
              data: dataIso,
              diaMes: d,
              turnoId: t.sigla,
              turnoNome: t.nome,
              detalhes: {
                coberturaAtual: 0,
                coberturaMinima: minExigido,
              },
              sugestaoCorrecao: `Escale pelo menos ${minExigido} colaborador(es) no ${t.sigla} para o dia ${String(d).padStart(2, '0')}.`,
            };

            conflitos.push(conflito);
            mapaConflitosPorDia[d].push(conflito);
          } else if (qtdEscalados < minExigido) {
            // Cobertura abaixo da meta estabelecida (Aviso)
            const conflito: ConflitoEscala = {
              id: `cob-abaixo-${d}-${t.sigla}`,
              tipo: 'COBERTURA_ABAIXO_DO_MINIMO',
              severidade: 'AVISO',
              titulo: `Cobertura Insuficiente: ${t.sigla}`,
              descricao: `O ${t.nome} possui apenas ${qtdEscalados} colaborador(es) no dia ${String(d).padStart(2, '0')}, abaixo do mínimo configurado (${minExigido}).`,
              explicacaoLegal: 'Dimensionamento de Equipe: A equipe alocada está inferior ao limite mínimo de segurança para a demanda do posto.',
              data: dataIso,
              diaMes: d,
              turnoId: t.sigla,
              turnoNome: t.nome,
              detalhes: {
                coberturaAtual: qtdEscalados,
                coberturaMinima: minExigido,
              },
              sugestaoCorrecao: `Adicione mais ${minExigido - qtdEscalados} funcionário(s) no ${t.sigla} deste dia.`,
            };

            conflitos.push(conflito);
            mapaConflitosPorDia[d].push(conflito);
          }
        }
      });
    }
  }

  // Estatísticas consolidadas
  const criticos = conflitos.filter((c) => c.severidade === 'CRITICO');
  const avisos = conflitos.filter((c) => c.severidade === 'AVISO');

  return {
    conflitos,
    conflitosCriticos: criticos,
    conflitosAvisos: avisos,
    estatisticas: {
      total: conflitos.length,
      criticos: criticos.length,
      avisos: avisos.length,
      interjornadas: conflitos.filter((c) => c.tipo === 'INTERJORNADA_INSUFICIENTE' || c.tipo === 'DOBRA_DE_TURNO_DIRETO').length,
      diasSemDescanso: conflitos.filter((c) => c.tipo === 'DIAS_CONSECUTIVOS_SEM_DESCANSO').length,
      faltaCobertura: conflitos.filter((c) => c.tipo === 'TURNO_SEM_COBERTURA' || c.tipo === 'COBERTURA_ABAIXO_DO_MINIMO').length,
      duplicidades: conflitos.filter((c) => c.tipo === 'DUPLICIDADE_TURNO_MESMO_DIA').length,
    },
    mapaConflitosPorCelula,
    mapaConflitosPorDia,
    coberturaPorDia,
    turnosDescobertosPorDia,
  };
}

function adicionarAoMapa(mapa: Record<string, ConflitoEscala[]>, chave: string, conflito: ConflitoEscala) {
  if (!mapa[chave]) {
    mapa[chave] = [];
  }
  mapa[chave].push(conflito);
}
