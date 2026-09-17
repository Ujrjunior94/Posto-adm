import React from 'react';
import {
  Funcionario,
  Escala,
  FechamentoCaixa,
  OcorrenciaCaixa,
  Tanque,
  Afericao,
  RegistroDensidade,
  Conformidade,
} from '../../types';
import {
  Users,
  Calendar,
  DollarSign,
  AlertTriangle,
  Fuel,
  Gauge,
  TestTubes,
  CheckSquare,
  TrendingUp,
} from 'lucide-react';
import { formatarMoeda } from '../../utils/calculations';

interface DashboardProps {
  funcionarios: Funcionario[];
  escalas: Escala[];
  fechamentos: FechamentoCaixa[];
  ocorrencias: OcorrenciaCaixa[];
  tanques: Tanque[];
  afericoes: Afericao[];
  densidades: RegistroDensidade[];
  conformidades: Conformidade[];
  onNavigate: (aba: string) => void;
}

export const DashboardView: React.FC<DashboardProps> = ({
  funcionarios,
  escalas,
  fechamentos,
  ocorrencias,
  tanques,
  afericoes,
  densidades,
  conformidades,
  onNavigate,
}) => {
  const hoje = new Date().toISOString().slice(0, 10);

  const frentistasAtivos = funcionarios.filter((f) => f.status === 'ATIVO').length;
  const escaladosHoje = escalas.filter((e) => e.data === hoje && e.status === 'TRABALHO').length;
  const fechamentosHoje = fechamentos.filter((f) => f.data === hoje);
  const totalFaltasHoje = fechamentosHoje
    .filter((f) => f.tipoDiferenca === 'FALTA')
    .reduce((acc, curr) => acc + Math.abs(curr.diferenca), 0);

  const afericoesHoje = afericoes.filter((a) => a.data === hoje);
  const afericoesConformes = afericoesHoje.filter((a) => a.resultado === 'CONFORME').length;
  const pendenciasConformidade = conformidades.filter((c) => c.status === 'PENDENTE' || c.status === 'NAO_CONFORME').length;

  return (
    <div className="space-y-6">
      {/* Banner de Status Operacional do Posto */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-bold tracking-wider text-emerald-400 uppercase">
              Operação em Tempo Real
            </span>
          </div>
          <h2 className="text-2xl font-bold mt-1">Posto Matriz Central</h2>
          <p className="text-xs text-slate-400 mt-1">
            {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date())}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onNavigate('fechamento')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs rounded-lg transition"
          >
            Novo Fechamento
          </button>
          <button
            onClick={() => onNavigate('planner')}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 font-semibold text-xs border border-slate-700 rounded-lg transition"
          >
            Ver Planner
          </button>
        </div>
      </div>

      {/* Indicadores Principais de Pátio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('funcionarios')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-400 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Equipe de Pista</span>
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-3 font-mono">{frentistasAtivos}</div>
          <div className="text-xs text-slate-400 mt-1">{escaladosHoje} escalados hoje em pista</div>
        </div>

        <div
          onClick={() => onNavigate('fechamento')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-emerald-400 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Faltas de Caixa Hoje</span>
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-3 font-mono">
            {formatarMoeda(totalFaltasHoje)}
          </div>
          <div className="text-xs text-slate-400 mt-1">{fechamentosHoje.length} caixas conferidos hoje</div>
        </div>

        <div
          onClick={() => onNavigate('afericoes')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-400 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Aferições de Bicos</span>
            <Gauge className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-3 font-mono">
            {afericoesConformes}/{afericoesHoje.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">Conformes / Total aferidas hoje</div>
        </div>

        <div
          onClick={() => onNavigate('analises')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-teal-400 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Pendências de Pátio</span>
            <AlertTriangle className="w-5 h-5 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-3 font-mono">
            {pendenciasConformidade}
          </div>
          <div className="text-xs text-slate-400 mt-1">Itens de conformidade requerendo ajuste</div>
        </div>
      </div>

      {/* Seção Resumo Tanques */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Fuel className="w-5 h-5 text-indigo-600" />
            Capacidade e Situação dos Tanques
          </h3>
          <button
            onClick={() => onNavigate('tanques')}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            Acessar Calculadora de Régua →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tanques.map((t) => (
            <div key={t.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-slate-800 text-sm">{t.codigo}</span>
                <span className="text-[11px] font-semibold text-slate-600">{t.produto}</span>
              </div>
              <div className="text-xs text-slate-500">
                Capacidade: <strong>{t.capacidadeNominal.toLocaleString('pt-BR')} L</strong>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-indigo-600 h-full w-[65%] rounded-full"></div>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 text-right">Volume estimado por calibração</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
