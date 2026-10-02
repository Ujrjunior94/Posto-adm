import React, { useState } from 'react';
import {
  ConflitoEscala,
  ConfiguracaoRegrasEscala,
  ResultadoAuditoriaConflitos,
  TipoConflitoEscala,
} from './detectorConflitosEscala';
import {
  AlertTriangle,
  CheckCircle2,
  Sliders,
  X,
  Clock,
  Calendar,
  Users,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Filter,
} from 'lucide-react';

interface PainelConflitosEscalaProps {
  resultadoAuditoria: ResultadoAuditoriaConflitos;
  configRegras: ConfiguracaoRegrasEscala;
  onChangeConfigRegras: (novaConfig: ConfiguracaoRegrasEscala) => void;
  destacarNaGrade: boolean;
  onToggleDestacarNaGrade: (ativo: boolean) => void;
  filtrarApenasComConflito: boolean;
  onToggleFiltrarApenasComConflito: (ativo: boolean) => void;
  onNavegarParaCelula?: (funcionarioId: string, dia: number, dataIso: string) => void;
  onAplicarFolgaRapida?: (funcionarioId: string, dataIso: string) => void;
}

export const PainelConflitosEscala: React.FC<PainelConflitosEscalaProps> = ({
  resultadoAuditoria,
  configRegras,
  onChangeConfigRegras,
  destacarNaGrade,
  onToggleDestacarNaGrade,
  filtrarApenasComConflito,
  onToggleFiltrarApenasComConflito,
  onNavegarParaCelula,
  onAplicarFolgaRapida,
}) => {
  const [modalAuditoriaAberto, setModalAuditoriaAberto] = useState(false);
  const [modalRegrasAberto, setModalRegrasAberto] = useState(false);
  const [filtroTipoModal, setFiltroTipoModal] = useState<'TODOS' | 'INTERJORNADA' | 'DIAS_SEGUIDOS' | 'COBERTURA'>('TODOS');

  // Estado temporário do modal de regras
  const [tempMinT1, setTempMinT1] = useState(configRegras.minimoColaboradoresPorTurno.T1 ?? 1);
  const [tempMinT2, setTempMinT2] = useState(configRegras.minimoColaboradoresPorTurno.T2 ?? 1);
  const [tempMinT3, setTempMinT3] = useState(configRegras.minimoColaboradoresPorTurno.T3 ?? 1);
  const [tempHorasInter, setTempHorasInter] = useState(configRegras.horasMinimasInterjornada ?? 11);
  const [tempMaxDias, setTempMaxDias] = useState(configRegras.maximoDiasConsecutivos ?? 6);
  const [tempAlertarTurno, setTempAlertarTurno] = useState(configRegras.alertarTurnoDescoberto ?? true);

  const { total, criticos, avisos, interjornadas, diasSemDescanso, faltaCobertura } = resultadoAuditoria.estatisticas;
  const semConflitos = total === 0;

  const salvarConfigRegras = (e: React.FormEvent) => {
    e.preventDefault();
    onChangeConfigRegras({
      ...configRegras,
      minimoColaboradoresPorTurno: {
        ...configRegras.minimoColaboradoresPorTurno,
        T1: Math.max(0, tempMinT1),
        T2: Math.max(0, tempMinT2),
        T3: Math.max(0, tempMinT3),
      },
      horasMinimasInterjornada: Math.max(1, tempHorasInter),
      maximoDiasConsecutivos: Math.max(1, tempMaxDias),
      alertarTurnoDescoberto: tempAlertarTurno,
    });
    setModalRegrasAberto(false);
  };

  const conflitosFiltradosModal = resultadoAuditoria.conflitos.filter((c) => {
    if (filtroTipoModal === 'INTERJORNADA') {
      return c.tipo === 'INTERJORNADA_INSUFICIENTE' || c.tipo === 'DOBRA_DE_TURNO_DIRETO';
    }
    if (filtroTipoModal === 'DIAS_SEGUIDOS') {
      return c.tipo === 'DIAS_CONSECUTIVOS_SEM_DESCANSO';
    }
    if (filtroTipoModal === 'COBERTURA') {
      return c.tipo === 'TURNO_SEM_COBERTURA' || c.tipo === 'COBERTURA_ABAIXO_DO_MINIMO';
    }
    return true;
  });

  return (
    <>
      {/* Banner Superior de Status da Auditoria de Escala */}
      <div
        className={`p-4 rounded-xl border transition shadow-xs ${
          semConflitos
            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
            : criticos > 0
            ? 'bg-red-50/90 border-red-200 text-red-950'
            : 'bg-amber-50/90 border-amber-200 text-amber-950'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                semConflitos
                  ? 'bg-emerald-600 text-white'
                  : criticos > 0
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {semConflitos ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  {semConflitos
                    ? 'Escala em Plena Conformidade Legal e Operacional'
                    : `${total} Inconsistência${total > 1 ? 's' : ''} Identificada${total > 1 ? 's' : ''} na Escala`}
                </h3>

                {!semConflitos && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {criticos > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 font-bold">
                        {criticos} Crítico{criticos > 1 ? 's' : ''}
                      </span>
                    )}
                    {avisos > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
                        {avisos} Alerta{avisos > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-600 mt-0.5">
                {semConflitos ? (
                  <span>
                    Descansos interjornadas de 11h (CLT Art. 66), limite semanal de 6x1 (CLT Art. 67) e cobertura mínima de turnos atendidos.
                  </span>
                ) : (
                  <span>
                    {interjornadas > 0 && `${interjornadas} descanso(s) < 11h`}
                    {interjornadas > 0 && (diasSemDescanso > 0 || faltaCobertura > 0) && ' • '}
                    {diasSemDescanso > 0 && `${diasSemDescanso} funcionário(s) > 6 dias sem folga`}
                    {diasSemDescanso > 0 && faltaCobertura > 0 && ' • '}
                    {faltaCobertura > 0 && `${faltaCobertura} turno(s) sem cobertura mínima`}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200/60">
            {/* Toggle de Destacar na Grade */}
            <button
              type="button"
              onClick={() => onToggleDestacarNaGrade(!destacarNaGrade)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                destacarNaGrade
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Destaca as células que possuem conflitos na grade mensal com borda pulsante e ícone de alerta"
            >
              <Eye className="w-3.5 h-3.5" />
              {destacarNaGrade ? 'Destaque Ativo' : 'Destacar na Grade'}
            </button>

            {/* Toggle de Filtrar Apenas Quem Tem Conflito */}
            {!semConflitos && (
              <button
                type="button"
                onClick={() => onToggleFiltrarApenasComConflito(!filtrarApenasComConflito)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  filtrarApenasComConflito
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
                title="Filtra a lista do Planner exibindo somente colaboradores envolvidos em conflitos"
              >
                <Filter className="w-3.5 h-3.5" />
                {filtrarApenasComConflito ? 'Mostrando Conflitos' : 'Filtrar Conflitos'}
              </button>
            )}

            {/* Botão de Auditoria Completa */}
            {!semConflitos && (
              <button
                type="button"
                onClick={() => setModalAuditoriaAberto(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Auditar Conflitos ({total})
              </button>
            )}

            {/* Botão de Regras de Cobertura */}
            <button
              type="button"
              onClick={() => {
                setTempMinT1(configRegras.minimoColaboradoresPorTurno.T1 ?? 1);
                setTempMinT2(configRegras.minimoColaboradoresPorTurno.T2 ?? 1);
                setTempMinT3(configRegras.minimoColaboradoresPorTurno.T3 ?? 1);
                setTempHorasInter(configRegras.horasMinimasInterjornada ?? 11);
                setTempMaxDias(configRegras.maximoDiasConsecutivos ?? 6);
                setTempAlertarTurno(configRegras.alertarTurnoDescoberto ?? true);
                setModalRegrasAberto(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer"
              title="Personalizar regras de cobertura mínima por turno, descanso interjornada e limite de dias 6x1"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              Regras da Escala
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: AUDITORIA DETALHADA DE CONFLITOS */}
      {modalAuditoriaAberto && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Topo do Modal */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-red-600/80 text-white">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Auditoria de Conflitos da Escala</h3>
                  <p className="text-xs text-slate-300">
                    {total} apontamento{total > 1 ? 's' : ''} identificado{total > 1 ? 's' : ''} ({criticos} crítico{criticos > 1 ? 's' : ''}, {avisos} alerta{avisos > 1 ? 's' : ''})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAuditoriaAberto(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas de Filtro de Conflitos */}
            <div className="px-5 pt-3 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setFiltroTipoModal('TODOS')}
                className={`pb-2.5 px-3 font-bold border-b-2 transition ${
                  filtroTipoModal === 'TODOS'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({total})
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipoModal('INTERJORNADA')}
                className={`pb-2.5 px-3 font-bold border-b-2 transition ${
                  filtroTipoModal === 'INTERJORNADA'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Interjornada & Dobras ({interjornadas})
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipoModal('DIAS_SEGUIDOS')}
                className={`pb-2.5 px-3 font-bold border-b-2 transition ${
                  filtroTipoModal === 'DIAS_SEGUIDOS'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Excesso de Dias sem DSR ({diasSemDescanso})
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipoModal('COBERTURA')}
                className={`pb-2.5 px-3 font-bold border-b-2 transition ${
                  filtroTipoModal === 'COBERTURA'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Falta de Cobertura ({faltaCobertura})
              </button>
            </div>

            {/* Lista com scroll dos Conflitos */}
            <div className="p-5 overflow-y-auto space-y-3.5 flex-1 bg-slate-50/50">
              {conflitosFiltradosModal.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-sm">Nenhum conflito encontrado nesta categoria!</p>
                </div>
              ) : (
                conflitosFiltradosModal.map((conflito) => {
                  const ehCritico = conflito.severidade === 'CRITICO';

                  return (
                    <div
                      key={conflito.id}
                      className={`p-4 rounded-xl border transition bg-white shadow-xs ${
                        ehCritico ? 'border-red-300' : 'border-amber-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                ehCritico
                                  ? 'bg-red-600 text-white'
                                  : 'bg-amber-500 text-white'
                              }`}
                            >
                              {conflito.severidade}
                            </span>

                            <h4 className="text-sm font-bold text-slate-900">
                              {conflito.titulo}
                            </h4>

                            {conflito.data && (
                              <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                Dia {String(conflito.diaMes).padStart(2, '0')} ({conflito.data})
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-700 leading-relaxed">
                            {conflito.descricao}
                          </p>

                          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
                            <HelpCircle className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-slate-800">Fundamentação:</strong> {conflito.explicacaoLegal}
                            </div>
                          </div>

                          <div className="text-xs text-blue-900 bg-blue-50/80 p-2.5 rounded-lg border border-blue-200 flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <strong>Sugestão de Resolução:</strong> {conflito.sugestaoCorrecao}
                            </div>
                          </div>
                        </div>

                        {/* Ações de Resolução */}
                        <div className="flex sm:flex-col items-center gap-2 shrink-0 pt-2 sm:pt-0">
                          {conflito.funcionarioId && onNavegarParaCelula && (
                            <button
                              type="button"
                              onClick={() => {
                                setModalAuditoriaAberto(false);
                                onNavegarParaCelula(
                                  conflito.funcionarioId!,
                                  conflito.diaMes,
                                  conflito.data
                                );
                              }}
                              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              Ajustar no Planner
                            </button>
                          )}

                          {conflito.funcionarioId &&
                            onAplicarFolgaRapida &&
                            (conflito.tipo === 'INTERJORNADA_INSUFICIENTE' ||
                              conflito.tipo === 'DOBRA_DE_TURNO_DIRETO' ||
                              conflito.tipo === 'DIAS_CONSECUTIVOS_SEM_DESCANSO') && (
                              <button
                                type="button"
                                onClick={() => {
                                  onAplicarFolgaRapida(conflito.funcionarioId!, conflito.data);
                                }}
                                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition cursor-pointer"
                                title="Define este dia como Folga (S) para garantir o descanso regulamentar"
                              >
                                Conceder Folga (S)
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Lógica alinhada à Consolidação das Leis do Trabalho (CLT) e melhores práticas operacionais de postos.
              </span>
              <button
                type="button"
                onClick={() => setModalAuditoriaAberto(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIGURAÇÃO DE REGRAS DE COBERTURA E CONFLITOS */}
      {modalRegrasAberto && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-600 text-white">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Regras e Parâmetros da Escala</h3>
                  <p className="text-xs text-slate-300">
                    Defina coberturas mínimas e limites de jornada
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalRegrasAberto(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={salvarConfigRegras} className="p-6 space-y-4">
              {/* Cobertura mínima por Turno */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase mb-2">
                  Meta de Cobertura Mínima por Turno (Colaboradores por Dia)
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-center">
                    <span className="block text-xs font-bold text-amber-900 mb-1">1º Manhã (T1)</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={tempMinT1}
                      onChange={(e) => setTempMinT1(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-center text-sm font-bold"
                    />
                    <span className="text-[10px] text-amber-700 mt-1 block">Mínimo/dia</span>
                  </div>

                  <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 text-center">
                    <span className="block text-xs font-bold text-blue-900 mb-1">2º Tarde (T2)</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={tempMinT2}
                      onChange={(e) => setTempMinT2(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2 py-1 bg-white border border-blue-300 rounded text-center text-sm font-bold"
                    />
                    <span className="text-[10px] text-blue-700 mt-1 block">Mínimo/dia</span>
                  </div>

                  <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 text-center">
                    <span className="block text-xs font-bold text-purple-900 mb-1">3º Noite (T3)</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={tempMinT3}
                      onChange={(e) => setTempMinT3(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2 py-1 bg-white border border-purple-300 rounded text-center text-sm font-bold"
                    />
                    <span className="text-[10px] text-purple-700 mt-1 block">Mínimo/dia</span>
                  </div>
                </div>
              </div>

              {/* Limites de Descanso e CLT */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Interjornada Mínima (Horas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={tempHorasInter}
                    onChange={(e) => setTempHorasInter(parseInt(e.target.value, 10) || 11)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                  />
                  <span className="text-[10px] text-slate-500">Padrão CLT: 11 horas</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Máximo de Dias Seguidos
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="14"
                    value={tempMaxDias}
                    onChange={(e) => setTempMaxDias(parseInt(e.target.value, 10) || 6)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                  />
                  <span className="text-[10px] text-slate-500">Padrão 6x1: 6 dias</span>
                </div>
              </div>

              {/* Checkbox de alerta para turno totalmente descoberto */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={tempAlertarTurno}
                    onChange={(e) => setTempAlertarTurno(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="text-xs text-slate-700 font-semibold">
                    Alertar como Crítico quando houver turno com 0 colaboradores
                  </span>
                </label>
              </div>

              {/* Botões do Rodapé */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalRegrasAberto(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                >
                  Salvar Regras
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
