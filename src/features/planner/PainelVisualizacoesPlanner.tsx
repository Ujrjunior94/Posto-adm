import React, { useState, useMemo } from 'react';
import { Escala, Funcionario, EscalaImportada, EscalaStatus } from '../../types';
import { ResultadoAuditoriaConflitos } from './detectorConflitosEscala';
import { normalizarTextoComparacao } from '../../services/geminiOcrService';
import {
  Calendar,
  Clock,
  Users,
  Layers,
  Search,
  History,
  Plus,
  Edit2,
  Trash2,
  Sun,
  Sunrise,
  Moon,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Filter,
} from 'lucide-react';

export type ModoVisaoPlanner =
  | 'MENSAL'
  | 'SEMANAL'
  | 'DIARIA'
  | 'FUNCIONARIO'
  | 'SETOR'
  | 'TURNO'
  | 'HISTORICO';

interface PainelVisualizacoesPlannerProps {
  modoVisao: ModoVisaoPlanner;
  onChangeModoVisao: (m: ModoVisaoPlanner) => void;
  escalasMes: Escala[];
  todasEscalas: Escala[];
  funcionarios: Funcionario[];
  escalasImportadas?: EscalaImportada[];
  anoMesAtual: string; // YYYY-MM
  buscaTexto: string;
  onChangeBuscaTexto: (s: string) => void;
  filtroSetor: string;
  onChangeFiltroSetor: (s: string) => void;
  onNovoRegistroManual: () => void;
  onEditarRegistroEscala: (esc: Escala) => void;
  onExcluirRegistroEscala: (esc: Escala) => void;
  resultadoAuditoria?: ResultadoAuditoriaConflitos;
}

const formatarDataBr = (iso: string) => {
  if (!iso || !iso.includes('-')) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export const obterMetaTurnoCompleta = (esc: Partial<Escala>) => {
  if (esc.statusConferencia === 'CONFLITO') {
    return {
      cor: 'bg-red-100 text-red-900 border-red-300',
      icone: AlertTriangle,
      nome: 'Conflito',
      sigla: 'FA',
    };
  }
  if (esc.status === 'FOLGA' || esc.turno === 'Folga') {
    return {
      cor: 'bg-slate-200 text-slate-800 border-slate-300',
      icone: Clock,
      nome: 'Folga (DSR)',
      sigla: 'FOL',
    };
  }
  if (esc.status === 'FERIAS' || esc.turno?.includes('Férias')) {
    return {
      cor: 'bg-orange-100 text-orange-900 border-orange-300',
      icone: Clock,
      nome: 'Férias',
      sigla: 'FER',
    };
  }
  if (esc.status === 'PLANTAO' || esc.turno?.toLowerCase().includes('plant')) {
    return {
      cor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      icone: Clock,
      nome: 'Plantão',
      sigla: 'PLT',
    };
  }

  const t = (esc.turno || '').toLowerCase();
  const hIni = esc.horarioInicio || '';

  // Turno 3 - Noite (22h - 06h)
  if (
    t.includes('noite') ||
    t.includes('noturno') ||
    t.includes('turno 3') ||
    t.includes('3t') ||
    t === 't3' ||
    (t.includes('22h') && !t.includes('14h')) ||
    hIni.startsWith('22:') ||
    hIni.startsWith('23:')
  ) {
    return {
      cor: 'bg-purple-100 text-purple-900 border-purple-300',
      icone: Moon,
      nome: 'Turno 3 — Noite (22h–06h)',
      sigla: 'T3',
    };
  }

  // Turno 1 - Manhã (06h - 14h / 1T / T1)
  if (
    t.includes('turno 1') ||
    t.includes('manhã') ||
    t.includes('manha') ||
    t.includes('matutino') ||
    t.includes('1t') ||
    t === 't1' ||
    t === '1' ||
    t.includes('06h') ||
    t.includes('06-14') ||
    (hIni.startsWith('05:') || hIni.startsWith('06:') || hIni.startsWith('07:'))
  ) {
    return {
      cor: 'bg-amber-100 text-amber-900 border-amber-300',
      icone: Sunrise,
      nome: 'Turno 1 — Manhã (06h–14h)',
      sigla: 'T1',
    };
  }

  // Turno 2 - Tarde (14h - 22h / 2T / T2)
  if (
    t.includes('tarde') ||
    t.includes('vespertino') ||
    t.includes('turno 2') ||
    t.includes('2t') ||
    t === 't2' ||
    t === '2' ||
    t.includes('14-22') ||
    (t.includes('14h') && !t.includes('06h')) ||
    hIni.startsWith('12:') ||
    hIni.startsWith('13:') ||
    hIni.startsWith('14:') ||
    hIni.startsWith('15:') ||
    hIni.startsWith('16:')
  ) {
    return {
      cor: 'bg-blue-100 text-blue-900 border-blue-300',
      icone: Sun,
      nome: 'Turno 2 — Tarde (14h–22h)',
      sigla: 'T2',
    };
  }

  // Turno Horista (08h - 14h)
  if (t.includes('horista') || t === 'hor' || (hIni === '08:00' && esc.horarioFim === '14:00')) {
    return {
      cor: 'bg-teal-100 text-teal-900 border-teal-300',
      icone: Clock,
      nome: 'Horista (08h–14h)',
      sigla: 'HOR',
    };
  }

  // Turno ADM (08h - 17h)
  if (t.includes('adm') || t.includes('admin') || (hIni === '08:00' && esc.horarioFim === '17:00')) {
    return {
      cor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      icone: Building2,
      nome: 'Administrativo (08h–17h)',
      sigla: 'ADM',
    };
  }

  // Turno 1 - Manhã (06h - 14h)
  return {
    cor: 'bg-amber-100 text-amber-900 border-amber-300',
    icone: Sunrise,
    nome: 'Turno 1 — Manhã (06h–14h)',
    sigla: 'T1',
  };
};

export const obterCorEventoPlanner = (esc: Partial<Escala>) => {
  return obterMetaTurnoCompleta(esc).cor;
};

export const PainelVisualizacoesPlanner: React.FC<PainelVisualizacoesPlannerProps> = ({
  modoVisao,
  onChangeModoVisao,
  escalasMes,
  todasEscalas,
  funcionarios,
  escalasImportadas = [],
  anoMesAtual,
  buscaTexto,
  onChangeBuscaTexto,
  filtroSetor,
  onChangeFiltroSetor,
  onNovoRegistroManual,
  onEditarRegistroEscala,
  onExcluirRegistroEscala,
  resultadoAuditoria,
}) => {
  const hojeIso = new Date().toISOString().slice(0, 10);
  const [dataDiaria, setDataDiaria] = useState<string>(
    hojeIso.startsWith(anoMesAtual) ? hojeIso : `${anoMesAtual}-01`
  );
  const [semanaIndice, setSemanaIndice] = useState<number>(0); // 0 = dias 1-7, 1 = 8-14, 2 = 15-21, 3 = 22-28, 4 = 29-31
  const [funcionarioSelecionadoId, setFuncionarioSelecionadoId] = useState<string>(
    funcionarios[0]?.id || 'TODOS'
  );

  const setoresDisponiveis = useMemo(() => {
    const s = new Set<string>(['Pista', 'Caixa', 'Conveniência', 'Lubrificação', 'Gerência']);
    funcionarios.forEach((f) => {
      if (f.setor) s.add(f.setor);
    });
    escalasMes.forEach((e) => {
      if (e.setor) s.add(e.setor);
    });
    return Array.from(s);
  }, [funcionarios, escalasMes]);

  // Dias da semana selecionada
  const diasDaSemana = useMemo(() => {
    const [y, m] = anoMesAtual.split('-').map(Number);
    const totalDias = new Date(y, m, 0).getDate();
    const inicio = semanaIndice * 7 + 1;
    const fim = Math.min(totalDias, inicio + 6);
    const lista: string[] = [];
    for (let d = inicio; d <= fim; d++) {
      lista.push(`${anoMesAtual}-${String(d).padStart(2, '0')}`);
    }
    return lista;
  }, [anoMesAtual, semanaIndice]);

  // Histórico consolidado de alterações nas escalas
  const historicoConsolidado = useMemo(() => {
    const logs: Array<{
      id: string;
      dataHora: string;
      usuario: string;
      funcionarioNome: string;
      dataEscala: string;
      acao: string;
      valorAnterior?: string;
      valorNovo?: string;
    }> = [];

    todasEscalas.forEach((e) => {
      if (Array.isArray(e.historicoAlteracoes)) {
        e.historicoAlteracoes.forEach((h, idx) => {
          logs.push({
            id: `${e.id}-h-${idx}`,
            dataHora: h.dataHora,
            usuario: h.usuario,
            funcionarioNome: e.funcionarioNome,
            dataEscala: e.data,
            acao: h.acao,
            valorAnterior: h.valorAnterior,
            valorNovo: h.valorNovo,
          });
        });
      }
    });

    return logs.sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  }, [todasEscalas]);

  return (
    <div className="space-y-4">
      {/* Barra de Modos de Visualização do Planner + Pesquisa + Filtros (Requisito 5) */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Abas das 7 Visualizações com rolagem suave no mobile */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar max-w-full">
            {(
              [
                { id: 'MENSAL', label: 'Mensal' },
                { id: 'SEMANAL', label: 'Semanal' },
                { id: 'DIARIA', label: 'Diária' },
                { id: 'FUNCIONARIO', label: 'Por Funcionário' },
                { id: 'SETOR', label: 'Por Setor' },
                { id: 'TURNO', label: 'Por Turno' },
                { id: 'HISTORICO', label: 'Histórico & Alterações' },
              ] as const
            ).map((aba) => (
              <button
                key={aba.id}
                type="button"
                onClick={() => onChangeModoVisao(aba.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  modoVisao === aba.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {aba.label}
              </button>
            ))}
          </div>

          {/* Pesquisa, Filtro de Setor e Inclusão Manual */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[190px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={buscaTexto}
                onChange={(e) => onChangeBuscaTexto(e.target.value)}
                placeholder="Pesquisar funcionário, setor..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={filtroSetor}
              onChange={(e) => onChangeFiltroSetor(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            >
              <option value="TODOS">Todos os Setores</option>
              {setoresDisponiveis.map((s) => (
                <option key={s} value={s}>
                  Setor: {s}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onNovoRegistroManual}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Incluir Escala Manual
            </button>
          </div>
        </div>

        {/* Legenda Visual de Cores dos Turnos Oficiais (Requisito 6) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-500 uppercase text-[10px]">Turnos Oficiais:</span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold">
              T1: Manhã (06:00–14:00)
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-300 font-bold">
              T2: Tarde (14:00–22:00)
            </span>
            <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-900 border border-teal-300 font-bold">
              HOR: Horista (08:00–14:00)
            </span>
            <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold">
              ADM: Administrativo (08:00–17:00)
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
              FOL: Folga (DSR)
            </span>
            <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-900 border border-orange-300 font-bold">
              FER: Férias
            </span>
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-300 font-bold">
              FA: Falta / Conflito
            </span>
          </div>
        </div>
      </div>

      {/* 1. VISUALIZAÇÃO DIÁRIA */}
      {modoVisao === 'DIARIA' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Visualização Diária do Planner — {formatarDataBr(dataDiaria)}
              </h3>
              <p className="text-xs text-slate-500">
                Relação completa de funcionários escalados, horários de entrada/saída, intervalos, setores e folgas no dia
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700">Selecionar Dia:</label>
              <input
                type="date"
                value={dataDiaria}
                onChange={(e) => setDataDiaria(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Funcionário</th>
                  <th className="py-2.5 px-3">Setor / Função</th>
                  <th className="py-2.5 px-3">Turno / Status</th>
                  <th className="py-2.5 px-3">Entrada — Saída</th>
                  <th className="py-2.5 px-3">Intervalo</th>
                  <th className="py-2.5 px-3">Observações</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {escalasMes
                  .filter((e) => e.data === dataDiaria)
                  .map((esc) => {
                    const conflitosEsc = resultadoAuditoria
                      ? resultadoAuditoria.mapaConflitosPorCelula[`${esc.funcionarioId}_${esc.data}`] ||
                        resultadoAuditoria.mapaConflitosPorCelula[
                          `nome:${normalizarTextoComparacao(esc.funcionarioNome)}_${esc.data}`
                        ] ||
                        []
                      : [];
                    const temConflito = conflitosEsc.length > 0;
                    const temCritico = conflitosEsc.some((c) => c.severidade === 'CRITICO');

                    return (
                      <tr key={esc.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{esc.funcionarioNome}</span>
                            {temConflito && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                  temCritico
                                    ? 'bg-red-100 text-red-800 border-red-300'
                                    : 'bg-amber-100 text-amber-900 border-amber-300'
                                }`}
                                title={conflitosEsc.map((c) => `${c.titulo}: ${c.descricao}`).join('\n')}
                              >
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {conflitosEsc[0].titulo}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <span className="font-semibold text-slate-800">{esc.setor || 'Pista'}</span> •{' '}
                          {esc.funcao || 'Frentista'}
                        </td>
                        <td className="py-2.5 px-3">
                          {(() => {
                            const meta = obterMetaTurnoCompleta(esc);
                            const IconeT = meta.icone;
                            return (
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border text-[11px] font-bold ${meta.cor}`}
                              >
                                <IconeT className="w-3.5 h-3.5 shrink-0" />
                                <span>{esc.status === 'FOLGA' ? 'Folga (S)' : esc.turno}</span>
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          {esc.status === 'FOLGA' ? 'Folga' : `${esc.horarioInicio} às ${esc.horarioFim}`}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{esc.intervalo || '1h'}</td>
                        <td className="py-2.5 px-3 text-slate-500">{esc.observacao || '—'}</td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditarRegistroEscala(esc)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Editar horário / turno"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onExcluirRegistroEscala(esc)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Excluir registro"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {escalasMes.filter((e) => e.data === dataDiaria).length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Nenhum registro encontrado para {formatarDataBr(dataDiaria)}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. VISUALIZAÇÃO SEMANAL */}
      {modoVisao === 'SEMANAL' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Visualização Semanal Detalhada</h3>
              <p className="text-xs text-slate-500">
                Horários de entrada, saída e setores dia a dia na semana selecionada
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSemanaIndice(idx)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                    semanaIndice === idx
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Semana {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="py-2.5 px-3 min-w-[180px]">Funcionário / Setor</th>
                  {diasDaSemana.map((dIso) => (
                    <th key={dIso} className="py-2.5 px-2 text-center min-w-[125px] border-l border-slate-800">
                      <div className="font-mono font-bold">{formatarDataBr(dIso)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {funcionarios.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      <div>{f.nome}</div>
                      <div className="text-[10px] text-slate-500">
                        {f.setor || 'Pista'} • {f.cargo}
                      </div>
                    </td>
                    {diasDaSemana.map((dIso) => {
                      const esc = escalasMes.find(
                        (e) =>
                          (e.funcionarioId === f.id ||
                            e.funcionarioNome.toLowerCase() === f.nome.toLowerCase()) &&
                          e.data === dIso
                      );

                      const conflitosEsc = resultadoAuditoria
                        ? resultadoAuditoria.mapaConflitosPorCelula[`${f.id}_${dIso}`] ||
                          resultadoAuditoria.mapaConflitosPorCelula[
                            `nome:${normalizarTextoComparacao(f.nome)}_${dIso}`
                          ] ||
                          []
                        : [];
                      const temConflito = conflitosEsc.length > 0;

                      return (
                        <td
                          key={dIso}
                          onClick={() => esc && onEditarRegistroEscala(esc)}
                          className="p-1.5 border-l border-slate-100 text-center cursor-pointer"
                        >
                          {esc ? (
                            <div
                              className={`p-1.5 rounded-lg border text-[11px] relative ${obterCorEventoPlanner(
                                esc
                              )} ${temConflito ? 'ring-2 ring-red-500 ring-inset shadow-xs' : ''}`}
                              title={
                                temConflito
                                  ? `🚨 CONFLITO NA ESCALA:\n${conflitosEsc
                                      .map((c) => `• ${c.titulo}: ${c.descricao}`)
                                      .join('\n')}`
                                  : undefined
                              }
                            >
                              <div className="font-bold flex items-center justify-center gap-1">
                                <span>
                                  {esc.status === 'FOLGA'
                                    ? 'FOLGA (S)'
                                    : `${esc.horarioInicio} - ${esc.horarioFim}`}
                                </span>
                                {temConflito && (
                                  <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
                                )}
                              </div>
                              <div className="text-[10px] opacity-80 truncate">
                                {esc.setor || f.setor || 'Pista'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-[11px]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. VISUALIZAÇÃO POR FUNCIONÁRIO */}
      {modoVisao === 'FUNCIONARIO' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Agenda Individual por Funcionário</h3>
              <p className="text-xs text-slate-500">
                Todos os eventos, turnos, intervalos e folgas vinculados ao colaborador selecionado
              </p>
            </div>
            <select
              value={funcionarioSelecionadoId}
              onChange={(e) => setFuncionarioSelecionadoId(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
            >
              <option value="TODOS">Todos os Funcionários</option>
              {funcionarios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome} ({f.cargo})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[460px] overflow-y-auto">
            {escalasMes
              .filter(
                (e) =>
                  funcionarioSelecionadoId === 'TODOS' ||
                  e.funcionarioId === funcionarioSelecionadoId
              )
              .sort((a, b) => a.data.localeCompare(b.data))
              .map((esc) => (
                <div
                  key={esc.id}
                  onClick={() => onEditarRegistroEscala(esc)}
                  className={`p-3 rounded-xl border cursor-pointer transition hover:shadow-xs ${obterCorEventoPlanner(
                    esc
                  )}`}
                >
                  <div className="flex items-center justify-between font-bold text-xs">
                    <span>{formatarDataBr(esc.data)}</span>
                    <span className="font-mono text-[10px] uppercase">{esc.status}</span>
                  </div>
                  <div className="font-extrabold text-sm mt-1">{esc.funcionarioNome}</div>
                  <div className="text-xs font-mono mt-1">
                    {esc.status === 'FOLGA'
                      ? 'Descanso Semanal (Folga)'
                      : `Entrada: ${esc.horarioInicio} | Saída: ${esc.horarioFim}`}
                  </div>
                  <div className="text-[11px] mt-1 opacity-85">
                    Setor: {esc.setor || 'Pista'} • Turno: {esc.turno}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 4. VISUALIZAÇÃO POR SETOR */}
      {modoVisao === 'SETOR' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {setoresDisponiveis.map((setorNome) => {
            const itensSetor = escalasMes.filter(
              (e) => (e.setor || 'Pista').toLowerCase() === setorNome.toLowerCase()
            );
            return (
              <div
                key={setorNome}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>Setor: {setorNome}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    {itensSetor.length} alocações
                  </span>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {itensSetor.slice(0, 30).map((esc) => (
                    <div
                      key={esc.id}
                      onClick={() => onEditarRegistroEscala(esc)}
                      className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{esc.funcionarioNome}</div>
                        <div className="text-[10px] text-slate-500">
                          {formatarDataBr(esc.data)} • {esc.turno}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[11px] text-blue-700">
                        {esc.status === 'FOLGA' ? 'FOLGA' : `${esc.horarioInicio}-${esc.horarioFim}`}
                      </span>
                    </div>
                  ))}
                  {itensSetor.length === 0 && (
                    <div className="text-xs text-slate-400 py-4 text-center">
                      Nenhuma alocação neste setor.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. VISUALIZAÇÃO POR TURNO (TURNOS OFICIAIS: T1, T2, HORISTA, ADM, FOLGA, FERIAS) */}
      {modoVisao === 'TURNO' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {[
            {
              titulo: 'T1 — Manhã (06h–14h)',
              badge: 'bg-amber-100 text-amber-900 border-amber-300',
              filtro: (e: Escala) =>
                e.status === 'TRABALHO' &&
                (e.turno.includes('Turno 1') ||
                  e.turno.includes('Manhã') ||
                  e.horarioInicio === '06:00' ||
                  e.horarioInicio.startsWith('05:') ||
                  e.horarioInicio.startsWith('06:') ||
                  e.horarioInicio.startsWith('07:') ||
                  e.turno.toUpperCase().startsWith('T1') ||
                  e.turno.toUpperCase().startsWith('1T')),
            },
            {
              titulo: 'T2 — Tarde (14h–22h)',
              badge: 'bg-blue-100 text-blue-900 border-blue-300',
              filtro: (e: Escala) =>
                e.status === 'TRABALHO' &&
                (e.turno.includes('Turno 2') ||
                  e.turno.includes('Tarde') ||
                  e.horarioInicio === '14:00' ||
                  e.horarioInicio.startsWith('12:') ||
                  e.horarioInicio.startsWith('13:') ||
                  e.horarioInicio.startsWith('14:') ||
                  e.horarioInicio.startsWith('15:') ||
                  e.horarioInicio.startsWith('16:') ||
                  e.turno.toUpperCase().startsWith('T2') ||
                  e.turno.toUpperCase().startsWith('2T')),
            },
            {
              titulo: 'HOR — Horista (08h–14h)',
              badge: 'bg-teal-100 text-teal-900 border-teal-300',
              filtro: (e: Escala) =>
                e.status === 'TRABALHO' &&
                (e.turno.toLowerCase().includes('horista') ||
                  e.turno.toUpperCase() === 'HOR' ||
                  (e.horarioInicio === '08:00' && e.horarioFim === '14:00')),
            },
            {
              titulo: 'ADM — Administrativo',
              badge: 'bg-indigo-100 text-indigo-900 border-indigo-300',
              filtro: (e: Escala) =>
                e.status === 'TRABALHO' &&
                (e.turno.toLowerCase().includes('adm') ||
                  e.turno.toLowerCase().includes('admin') ||
                  (e.horarioInicio === '08:00' && e.horarioFim === '17:00')),
            },
            {
              titulo: 'FOL — Folga (DSR)',
              badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
              filtro: (e: Escala) => e.status === 'FOLGA',
            },
            {
              titulo: 'FER — Férias',
              badge: 'bg-orange-100 text-orange-900 border-orange-300',
              filtro: (e: Escala) => e.status === 'FERIAS',
            },
          ].map((grupo) => {
            const lista = escalasMes.filter(grupo.filtro);
            return (
              <div
                key={grupo.titulo}
                className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-xs text-slate-900 truncate" title={grupo.titulo}>{grupo.titulo}</span>
                  <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded border ${grupo.badge}`}>{lista.length}</span>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {lista.slice(0, 35).map((esc) => (
                    <div
                      key={esc.id}
                      onClick={() => onEditarRegistroEscala(esc)}
                      className="p-2 rounded bg-slate-50 border border-slate-200 text-xs flex items-center justify-between cursor-pointer"
                    >
                      <span className="font-semibold text-slate-800 truncate max-w-[130px]">
                        {esc.funcionarioNome}
                      </span>
                      <span className="font-mono text-[11px] text-slate-600">
                        {formatarDataBr(esc.data)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. HISTÓRICO DE ALTERAÇÕES E ESCALAS IMPORTADAS (Requisitos 10, 13 e 19) */}
      {modoVisao === 'HISTORICO' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4 text-purple-600" />
            Histórico de Alterações de Escala & Versões Importadas
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase">
                Alterações Registradas em Horários e Turnos ({historicoConsolidado.length})
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
                {historicoConsolidado.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma alteração de horário registrada até o momento.</p>
                ) : (
                  historicoConsolidado.map((h) => (
                    <div key={h.id} className="bg-white p-2.5 rounded border border-slate-200 text-xs">
                      <div className="flex items-center justify-between font-bold text-slate-800">
                        <span>
                          {h.funcionarioNome} — {formatarDataBr(h.dataEscala)}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(h.dataHora).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {h.acao} por <strong>{h.usuario}</strong>
                      </div>
                      {h.valorAnterior && (
                        <div className="text-[11px] font-mono mt-1">
                          <span className="text-red-700">Antes: {h.valorAnterior}</span> {' → '}
                          <span className="text-emerald-700 font-bold">Depois: {h.valorNovo}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase">
                Escalas Originais Importadas com Imagem ({escalasImportadas.length})
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
                {escalasImportadas.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma escala importada arquivada ainda.</p>
                ) : (
                  escalasImportadas.map((imp) => (
                    <div key={imp.id} className="bg-white p-2.5 rounded border border-slate-200 text-xs flex items-center gap-3">
                      {imp.imagemOriginalBase64 && (
                        <img
                          src={imp.imagemOriginalBase64}
                          alt={imp.tituloEscala}
                          className="w-12 h-12 object-cover rounded border border-slate-300 shrink-0"
                        />
                      )}
                      <div>
                        <div className="font-bold text-slate-900">
                          {imp.tituloEscala} (Versão v{imp.versao})
                        </div>
                        <div className="text-[11px] text-slate-500">
                          ID: {imp.id} • {new Date(imp.dataImportacao).toLocaleString('pt-BR')} • Resp:{' '}
                          {imp.usuarioResponsavelNome}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
