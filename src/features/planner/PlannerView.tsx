import React, { useState, useMemo } from 'react';
import { Escala, Funcionario, EscalaStatus } from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Users,
  ShieldCheck,
  Clock,
  UserCheck,
} from 'lucide-react';

const repoEscalas = new PostoSubcollectionRepository<Escala>('escalas');

interface PlannerProps {
  escalas: Escala[];
  funcionarios: Funcionario[];
  onReload: () => void;
  onNavigateToIAEscala?: () => void;
}

export const PlannerView: React.FC<PlannerProps> = ({
  escalas,
  funcionarios,
  onReload,
  onNavigateToIAEscala,
}) => {
  const { postoId, userProfile } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCell, setSelectedCell] = useState<{ funcId: string; dia: number } | null>(null);
  const [modalTurno, setModalTurno] = useState('Turno 1 - Manhã (06h - 14h)');
  const [modalStatus, setModalStatus] = useState<EscalaStatus>('TRABALHO');
  const [propostaGerada, setPropostaGerada] = useState<Escala[] | null>(null);
  const [conflitosDetectados, setConflitosDetectados] = useState<string[]>([]);

  const normalizarTurnoPlanner = (raw?: string): string => {
    const t = (raw || '').toLowerCase();
    if (t.includes('horista') || t === 'hor') return 'Turno Horista';
    if (t.includes('tarde') || t.includes('14h') || t.includes('turno 2 - tarde') || t === 'turno 2' || t === 't2') {
      return 'Turno 2 - Tarde (14h - 22h)';
    }
    return 'Turno 1 - Manhã (06h - 14h)';
  };

  const ano = currentDate.getFullYear();
  const mes = currentDate.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diasArray = Array.from({ length: diasNoMes }, (_, i) => i + 1);

  const mesNome = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate);

  const formatarDataIso = (dia: number) => {
    const diaStr = String(dia).padStart(2, '0');
    const mesStr = String(mes + 1).padStart(2, '0');
    return `${ano}-${mesStr}-${diaStr}`;
  };

  const mudarMes = (delta: number) => {
    setCurrentDate(new Date(ano, mes + delta, 1));
  };

  // Lista unificada de colaboradores para o mês (ativos + colaboradores com escalas importadas)
  const colaboradoresExibicao = useMemo(() => {
    const mapa = new Map<
      string,
      { id: string; nome: string; cargo: string; turnoPreferencial: string; isPendente?: boolean }
    >();

    // Funcionários ativos no cadastro
    funcionarios
      .filter((f) => f.status === 'ATIVO')
      .forEach((f) => {
        mapa.set(f.id, {
          id: f.id,
          nome: f.nome,
          cargo: f.cargo,
          turnoPreferencial: f.turnoPreferencial,
        });
      });

    // Colaboradores que possuem escalas gravadas neste mês específico
    const prefixoMes = `${ano}-${String(mes + 1).padStart(2, '0')}`;
    escalas.forEach((e) => {
      if (e.data && e.data.startsWith(prefixoMes)) {
        if (!mapa.has(e.funcionarioId)) {
          mapa.set(e.funcionarioId, {
            id: e.funcionarioId,
            nome: e.funcionarioNome || 'Colaborador',
            cargo: 'Escala Importada',
            turnoPreferencial: normalizarTurnoPlanner(e.turno),
            isPendente: true,
          });
        }
      }
    });

    return Array.from(mapa.values());
  }, [funcionarios, escalas, ano, mes]);

  // Estatísticas operacionais do mês
  const prefixoMesAtual = `${ano}-${String(mes + 1).padStart(2, '0')}`;
  const escalasDoMes = useMemo(() => {
    return escalas.filter((e) => e.data && e.data.startsWith(prefixoMesAtual));
  }, [escalas, prefixoMesAtual]);

  const totalTrabalhosMes = escalasDoMes.filter((e) => e.status === 'TRABALHO').length;
  const totalFolgasMes = escalasDoMes.filter((e) => e.status === 'FOLGA').length;

  // Dias com cobertura menor que 2 pessoas em trabalho
  const diasComDesfalque = useMemo(() => {
    let count = 0;
    diasArray.forEach((dia) => {
      const dataStr = formatarDataIso(dia);
      const emTrabalho = escalas.filter((e) => e.data === dataStr && e.status === 'TRABALHO').length;
      if (emTrabalho < 2) count++;
    });
    return count;
  }, [diasArray, escalas, ano, mes]);

  // Gerador de proposta de escala 6x1 automatizada (Turno 1, Turno 2 e Horista)
  const handleGerarProposta = () => {
    const conflitos: string[] = [];
    const novasEscalas: Escala[] = [];

    colaboradoresExibicao.forEach((f, idx) => {
      const turnoNorm = normalizarTurnoPlanner(f.turnoPreferencial);
      const isTarde = turnoNorm.includes('Turno 2');
      const isHorista = turnoNorm.includes('Horista');

      diasArray.forEach((dia) => {
        const data = formatarDataIso(dia);
        // Exemplo de rodízio: 6 dias de trabalho e 1 folga
        const ehFolga = (dia + idx) % 7 === 0;
        const status: EscalaStatus = ehFolga ? 'FOLGA' : 'TRABALHO';

        novasEscalas.push({
          id: `escala-${f.id}-${data}`,
          postoId,
          funcionarioId: f.id,
          funcionarioNome: f.nome,
          data,
          turno: ehFolga ? 'Folga' : turnoNorm,
          horarioInicio: ehFolga ? '00:00' : isHorista ? '08:00' : isTarde ? '14:00' : '06:00',
          horarioFim: ehFolga ? '00:00' : isHorista ? '14:00' : isTarde ? '22:00' : '14:00',
          status,
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        });
      });
    });

    if (colaboradoresExibicao.length < 2) {
      conflitos.push('Atenção: Número de funcionários insuficiente para cobertura mínima de 2 turnos.');
    }

    setConflitosDetectados(conflitos);
    setPropostaGerada(novasEscalas);
  };

  const handleConfirmarProposta = async () => {
    if (!propostaGerada) return;
    for (const esc of propostaGerada) {
      await repoEscalas.save(postoId, esc);
    }
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'ESCALAS',
      'Planner',
      `planner-${ano}-${mes + 1}`,
      'CREATE',
      null,
      { totalDias: propostaGerada.length }
    );
    setPropostaGerada(null);
    onReload();
  };

  const salvarCelula = async () => {
    if (!selectedCell) return;
    const data = formatarDataIso(selectedCell.dia);
    const func = colaboradoresExibicao.find((f) => f.id === selectedCell.funcId);
    if (!func) return;

    const id = `escala-${func.id}-${data}`;
    let hInicio = '06:00';
    let hFim = '14:00';
    if (modalTurno.includes('Horista')) {
      hInicio = '08:00';
      hFim = '14:00';
    } else if (modalTurno.includes('Turno 2') || modalTurno.includes('14h') || modalTurno.includes('14:00') || modalTurno.includes('Tarde')) {
      hInicio = '14:00';
      hFim = '22:00';
    }

    const novaEscala: Escala = {
      id,
      postoId,
      funcionarioId: func.id,
      funcionarioNome: func.nome,
      data,
      turno: modalTurno,
      horarioInicio: hInicio,
      horarioFim: hFim,
      status: modalStatus,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await repoEscalas.save(postoId, novaEscala);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'ESCALAS',
      'Escala',
      id,
      'UPDATE',
      null,
      novaEscala as unknown as Record<string, unknown>
    );
    setSelectedCell(null);
    onReload();
  };

  return (
    <div className="space-y-6">
      {/* Header do Planner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            Planner Operacional Mensal
          </h2>
          <p className="text-sm text-slate-500 mt-1 capitalize">
            {mesNome} — Escalas, Folgas e Alocação de Pista
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => mudarMes(-1)}
              className="p-1.5 hover:bg-white text-slate-600 rounded-md transition"
              title="Mês Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-700 uppercase">{mesNome}</span>
            <button
              onClick={() => mudarMes(1)}
              className="p-1.5 hover:bg-white text-slate-600 rounded-md transition"
              title="Próximo Mês"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {onNavigateToIAEscala && (
            <button
              onClick={onNavigateToIAEscala}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition shadow-sm flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Importar Escala por Foto
            </button>
          )}

          <button
            onClick={handleGerarProposta}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition shadow-sm"
          >
            Gerar Proposta
          </button>
        </div>
      </div>

      {/* Cards de Resumo Operacional */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Equipe Ativa</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            {colaboradoresExibicao.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">colaboradores no mês</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Turnos de Trabalho</span>
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2 font-mono">
            {totalTrabalhosMes}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{totalFolgasMes} folgas programadas</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Média em Pista</span>
            <UserCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            {diasNoMes > 0 ? (totalTrabalhosMes / diasNoMes).toFixed(1) : 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">colaboradores/dia</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Alertas de Cobertura</span>
            <AlertTriangle className={`w-4 h-4 ${diasComDesfalque > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div className={`text-2xl font-bold mt-2 font-mono ${diasComDesfalque > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {diasComDesfalque}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">dias com &lt; 2 colaboradores</div>
        </div>
      </div>

      {/* Barra de Legenda dos Status e Turnos */}
      <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="font-bold text-slate-700 uppercase text-[11px]">Legenda de Turnos & Status:</span>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1">
            <span className="w-6 h-5 rounded border bg-amber-100 border-amber-300 text-amber-900 font-bold flex items-center justify-center text-[10px]">T1</span>
            <span className="text-slate-700 font-semibold">Turno 1 — Manhã (06h-14h)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-6 h-5 rounded border bg-blue-100 border-blue-300 text-blue-900 font-bold flex items-center justify-center text-[10px]">T2</span>
            <span className="text-slate-700 font-semibold">Turno 2 — Tarde (14h-22h)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-7 h-5 rounded border bg-teal-100 border-teal-300 text-teal-900 font-bold flex items-center justify-center text-[10px]">HOR</span>
            <span className="text-slate-700 font-semibold">Turno Horista</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-6 h-5 rounded border bg-slate-100 border-slate-200 text-slate-600 font-bold flex items-center justify-center text-[10px]">F</span>
            <span className="text-slate-600">Folga</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-6 h-5 rounded border bg-red-100 border-red-300 text-red-800 font-bold flex items-center justify-center text-[10px]">AUS</span>
            <span className="text-red-700 font-bold">Falta ("X Faltou")</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-6 h-5 rounded border bg-sky-50 border-sky-200 text-sky-700 font-bold flex items-center justify-center text-[10px]">FER</span>
            <span className="text-slate-600">Férias</span>
          </span>
        </div>
        <span className="text-slate-400 text-[11px]">Clique em qualquer dia para alterar turno</span>
      </div>

      {/* Proposta & Conflitos Modal / Banner */}
      {propostaGerada && (
        <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-indigo-700" />
              <h3 className="font-bold text-indigo-900 text-sm">
                Proposta de Escala Gerada ({propostaGerada.length} alocações)
              </h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPropostaGerada(null)}
                className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-50"
              >
                Descartar
              </button>
              <button
                onClick={handleConfirmarProposta}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700"
              >
                Confirmar e Salvar no Firestore
              </button>
            </div>
          </div>
          {conflitosDetectados.length > 0 && (
            <div className="text-xs text-amber-800 bg-amber-100 p-2 rounded">
              {conflitosDetectados.map((c, i) => (
                <div key={i}>• {c}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Matriz Planner (Desktop: Grid completo, Mobile: Horizontal Scroll com coluna de funcionário congelada) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[620px]">
          <table className="w-full border-collapse text-center text-xs">
            <thead className="bg-slate-100 sticky top-0 z-20 shadow-xs">
              <tr>
                <th className="sticky left-0 z-30 bg-slate-100 text-left px-4 py-3 min-w-[180px] font-bold text-slate-700 border-r border-b border-slate-300">
                  Funcionário
                </th>
                {diasArray.map((dia) => (
                  <th key={dia} className="px-2 py-3 min-w-[48px] font-semibold text-slate-600 border-b border-r border-slate-200">
                    <div className="text-[10px] text-slate-400">Dia</div>
                    <div className="text-sm font-bold text-slate-800">{dia}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {colaboradoresExibicao.map((func) => (
                <tr key={func.id} className="hover:bg-slate-50/80 transition">
                  <td className="sticky left-0 z-10 bg-white font-medium text-slate-900 text-left px-4 py-3 border-r border-slate-200 shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="font-bold truncate max-w-[140px]">{func.nome}</div>
                      {func.isPendente && (
                        <span className="text-[9px] bg-purple-100 text-purple-700 font-bold px-1 py-0.5 rounded" title="Importado da foto da escala">
                          IA
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400">{func.cargo}</div>
                  </td>
                  {diasArray.map((dia) => {
                    const dataStr = formatarDataIso(dia);
                    const escala = escalas.find((e) => e.funcionarioId === func.id && e.data === dataStr);
                    const status = escala ? escala.status : 'FOLGA';

                    let badgeColor = 'bg-slate-100 text-slate-500 border-slate-200';
                    let label = 'F';

                    if (status === 'TRABALHO') {
                      const t = (escala?.turno || func.turnoPreferencial || '').toLowerCase();
                      if (t.includes('horista') || t === 'hor') {
                        badgeColor = 'bg-teal-100 text-teal-900 border-teal-300 font-bold';
                        label = 'HOR';
                      } else if (t.includes('tarde') || t.includes('14h') || t.includes('14:00') || t.includes('turno 2 - tarde') || t === 'turno 2' || t === 't2') {
                        badgeColor = 'bg-blue-100 text-blue-900 border-blue-300 font-bold';
                        label = 'T2';
                      } else {
                        badgeColor = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
                        label = 'T1';
                      }
                    } else if (status === 'FERIAS') {
                      badgeColor = 'bg-sky-50 text-sky-700 border-sky-200 font-semibold';
                      label = 'FER';
                    } else if (status === 'AUSENTE') {
                      badgeColor = 'bg-red-100 text-red-800 border-red-300 font-bold';
                      label = 'AUS';
                    } else if (status === 'AFASTADO') {
                      badgeColor = 'bg-rose-50 text-rose-700 border-rose-300 font-bold';
                      label = 'AFAS';
                    }

                    return (
                      <td
                        key={dia}
                        onClick={() => {
                          setSelectedCell({ funcId: func.id, dia });
                          if (escala) {
                            setModalStatus(escala.status);
                            setModalTurno(normalizarTurnoPlanner(escala.turno));
                          } else {
                            setModalStatus('TRABALHO');
                            setModalTurno(normalizarTurnoPlanner(func.turnoPreferencial));
                          }
                        }}
                        className="p-1 border-r border-slate-100 cursor-pointer hover:bg-blue-50/50"
                        title={`${func.nome} - Dia ${dia}/${mes + 1}: ${status} ${escala?.turno ? `(${escala.turno})` : ''}`}
                      >
                        <div className={`py-1.5 px-1 rounded border text-[11px] ${badgeColor} transition hover:scale-105`}>
                          {label}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {/* Rodapé com somatório diário de pessoas em trabalho e alertas */}
            <tfoot className="bg-slate-100 sticky bottom-0 z-20 border-t-2 border-slate-300 font-semibold">
              <tr>
                <td className="sticky left-0 z-30 bg-slate-100 text-left px-4 py-2.5 text-xs font-bold text-slate-800 border-r border-slate-300 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span>Equipe em Trabalho</span>
                    <span className="text-[10px] text-slate-500 font-normal">Pista/Caixa</span>
                  </div>
                </td>
                {diasArray.map((dia) => {
                  const dataStr = formatarDataIso(dia);
                  const totalTrabalho = escalas.filter((e) => e.data === dataStr && e.status === 'TRABALHO').length;
                  const semCobertura = totalTrabalho === 0;
                  const coberturaBaixa = totalTrabalho === 1;

                  return (
                    <td
                      key={dia}
                      className={`px-1 py-2 text-center font-mono font-bold text-xs border-r border-slate-200 ${
                        semCobertura
                          ? 'bg-red-100 text-red-800'
                          : coberturaBaixa
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-50 text-emerald-800'
                      }`}
                      title={`Dia ${dia}: ${totalTrabalho} colaborador(es) trabalhando`}
                    >
                      {totalTrabalho}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal de Edição de Célula de Escala */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Editar Escala: Dia {selectedCell.dia}/{mes + 1}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Funcionário: {colaboradoresExibicao.find((f) => f.id === selectedCell.funcId)?.nome}
            </p>

            <div className="space-y-4">
              {/* Botões Rápidos de 1 Clique */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">
                  Atalhos Rápidos de Turno:
                </label>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalStatus('TRABALHO');
                      setModalTurno('Turno 1 - Manhã (06h - 14h)');
                    }}
                    className={`p-2 rounded-lg text-xs font-bold border transition text-center ${
                      modalStatus === 'TRABALHO' && modalTurno.includes('Turno 1')
                        ? 'bg-amber-100 border-amber-400 text-amber-900 ring-2 ring-amber-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-amber-50'
                    }`}
                  >
                    <div>Turno 1</div>
                    <div className="text-[10px] font-normal text-slate-500">Manhã (06h-14h)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalStatus('TRABALHO');
                      setModalTurno('Turno 2 - Tarde (14h - 22h)');
                    }}
                    className={`p-2 rounded-lg text-xs font-bold border transition text-center ${
                      modalStatus === 'TRABALHO' && modalTurno.includes('Turno 2')
                        ? 'bg-blue-100 border-blue-400 text-blue-900 ring-2 ring-blue-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50'
                    }`}
                  >
                    <div>Turno 2</div>
                    <div className="text-[10px] font-normal text-slate-500">Tarde (14h-22h)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalStatus('TRABALHO');
                      setModalTurno('Turno Horista');
                    }}
                    className={`p-2 rounded-lg text-xs font-bold border transition text-center ${
                      modalStatus === 'TRABALHO' && modalTurno.includes('Horista')
                        ? 'bg-teal-100 border-teal-400 text-teal-900 ring-2 ring-teal-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-teal-50'
                    }`}
                  >
                    <div>Horista</div>
                    <div className="text-[10px] font-normal text-slate-500">Flexível</div>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setModalStatus('FOLGA');
                    }}
                    className={`p-1.5 rounded-lg text-xs font-semibold border transition text-center ${
                      modalStatus === 'FOLGA'
                        ? 'bg-slate-700 border-slate-800 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Folga / DSR
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalStatus('AUSENTE');
                    }}
                    className={`p-1.5 rounded-lg text-xs font-bold border transition text-center ${
                      modalStatus === 'AUSENTE'
                        ? 'bg-red-600 border-red-700 text-white'
                        : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    Falta (X Faltou)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalStatus('FERIAS');
                    }}
                    className={`p-1.5 rounded-lg text-xs font-semibold border transition text-center ${
                      modalStatus === 'FERIAS'
                        ? 'bg-sky-600 border-sky-700 text-white'
                        : 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'
                    }`}
                  >
                    Férias
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Status do Dia</label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as EscalaStatus)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="TRABALHO">Trabalho (Pista / Caixa)</option>
                  <option value="FOLGA">Folga</option>
                  <option value="FERIAS">Férias</option>
                  <option value="AFASTADO">Afastado (Médico/INSS)</option>
                  <option value="AUSENTE">Ausente / Falta</option>
                </select>
              </div>

              {modalStatus === 'TRABALHO' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Turno de Trabalho</label>
                  <select
                    value={modalTurno}
                    onChange={(e) => setModalTurno(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Turno 1 - Manhã (06h - 14h)">Turno 1 — Manhã (06h às 14h)</option>
                    <option value="Turno 2 - Tarde (14h - 22h)">Turno 2 — Tarde (14h às 22h)</option>
                    <option value="Turno Horista">Turno Horista (Flexível / Por Hora)</option>
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedCell(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={salvarCelula}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
