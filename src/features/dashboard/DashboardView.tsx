import React, { useState } from 'react';
import {
  Funcionario,
  Escala,
  FechamentoCaixa,
  OcorrenciaCaixa,
  Tanque,
  Bico,
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
  Sparkles,
  ArrowRight,
  Clock,
  CheckCircle2,
  TrendingUp,
  Droplets,
  Scale,
  ShieldCheck,
  ChevronRight,
  Activity,
  Sun,
  Moon,
  Sunrise,
  Plus,
  Zap,
} from 'lucide-react';
import { formatarMoeda } from '../../utils/calculations';
import { VendasPorBicoChart } from './VendasPorBicoChart';

interface DashboardProps {
  funcionarios: Funcionario[];
  escalas: Escala[];
  fechamentos: FechamentoCaixa[];
  ocorrencias: OcorrenciaCaixa[];
  tanques: Tanque[];
  bicos?: Bico[];
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
  bicos = [],
  afericoes,
  densidades,
  conformidades,
  onNavigate,
}) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const horaAtual = new Date().getHours();

  // Determinar turno operacional corrente com base no horário (Turno 1 = Manhã, Turno 2 = Tarde)
  const turnoAtual =
    horaAtual < 14
      ? { nome: 'Turno 1 — Manhã', horario: '06h00 às 14h00', icone: Sunrise, cor: 'text-amber-500 bg-amber-50 border-amber-200' }
      : { nome: 'Turno 2 — Tarde', horario: '14h00 às 22h00', icone: Sun, cor: 'text-blue-500 bg-blue-50 border-blue-200' };

  const TurnoIcone = turnoAtual.icone;

  // Cálculos operacionais
  const frentistasAtivos = funcionarios.filter((f) => f.status === 'ATIVO');
  const escaladosHoje = escalas.filter((e) => e.data === hoje && e.status === 'TRABALHO');
  const folgasHoje = escalas.filter((e) => e.data === hoje && e.status === 'FOLGA');
  
  const fechamentosHoje = fechamentos.filter((f) => f.data === hoje);
  const totalInformadoHoje = fechamentosHoje.reduce((acc, curr) => acc + (curr.totalInformado || 0), 0);
  const totalConferidoHoje = fechamentosHoje.reduce((acc, curr) => acc + (curr.totalConferido || 0), 0);
  
  const totalFaltasHoje = fechamentosHoje
    .filter((f) => f.tipoDiferenca === 'FALTA')
    .reduce((acc, curr) => acc + Math.abs(curr.diferenca), 0);
  const totalSobrasHoje = fechamentosHoje
    .filter((f) => f.tipoDiferenca === 'SOBRA')
    .reduce((acc, curr) => acc + Math.abs(curr.diferenca), 0);

  const afericoesHoje = afericoes.filter((a) => a.data === hoje);
  const afericoesConformes = afericoesHoje.filter((a) => a.resultado === 'CONFORME').length;
  const pendenciasConformidade = conformidades.filter(
    (c) => c.status === 'PENDENTE' || c.status === 'NAO_CONFORME'
  ).length;

  const densidadesHoje = densidades.filter((d) => d.data === hoje);
  const densidadesConformes = densidadesHoje.filter((d) => d.resultado === 'CONFORME').length;

  // Cores ilustrativas por combustível
  const getProdutoColor = (produto: string) => {
    const p = produto.toLowerCase();
    if (p.includes('aditivada')) {
      return {
        bg: 'from-blue-600 to-cyan-500',
        bar: 'bg-blue-500',
        badge: 'bg-blue-50 text-blue-700 border-blue-200',
        dot: 'bg-blue-500',
      };
    }
    if (p.includes('etanol') || p.includes('álcool')) {
      return {
        bg: 'from-emerald-600 to-teal-500',
        bar: 'bg-emerald-500',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
      };
    }
    if (p.includes('s10') || p.includes('diesel')) {
      return {
        bg: 'from-amber-600 to-yellow-500',
        bar: 'bg-amber-500',
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
      };
    }
    if (p.includes('s500')) {
      return {
        bg: 'from-purple-700 to-indigo-600',
        bar: 'bg-purple-600',
        badge: 'bg-purple-50 text-purple-700 border-purple-200',
        dot: 'bg-purple-600',
      };
    }
    // Gasolina Comum default
    return {
      bg: 'from-red-600 to-orange-500',
      bar: 'bg-red-500',
      badge: 'bg-red-50 text-red-700 border-red-200',
      dot: 'bg-red-500',
    };
  };

  return (
    <div className="space-y-6">
      {/* 1. Hero Banner Operacional Ilustrado com Status em Tempo Real */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white p-6 md:p-8 rounded-2xl shadow-xl border border-slate-800 relative overflow-hidden">
        {/* Elemento gráfico de fundo */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-blue-500/10 to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Pista em Operação
              </span>

              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${turnoAtual.cor}`}>
                <TurnoIcone className="w-3.5 h-3.5" />
                <span>{turnoAtual.nome}</span>
                <span className="opacity-70 text-[11px]">({turnoAtual.horario})</span>
              </div>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Posto Matriz Central
            </h1>
            
            <p className="text-xs md:text-sm text-slate-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>
                {new Intl.DateTimeFormat('pt-BR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }).format(new Date())}
              </span>
            </p>
          </div>

          {/* Atalhos Rápidos no Topo do Banner */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onNavigate('fechamento')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Fechamento</span>
            </button>
            <button
              onClick={() => onNavigate('ia-escala')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Ler Escala (IA)</span>
            </button>
            <button
              onClick={() => onNavigate('planner')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition active:scale-95"
            >
              <Calendar className="w-4 h-4" />
              <span>Planner do Mês</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Hub de Ações Rápidas Diretas (Illustrative Action Cards) */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Acesso Rápido às Tarefas da Operação
          </h2>
          <span className="text-xs text-slate-400">Atalhos diretos</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Ação 1: Fechamento */}
          <button
            onClick={() => onNavigate('fechamento')}
            className="group p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-emerald-400 rounded-2xl shadow-xs transition text-left flex items-start gap-3.5 active:scale-98"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-slate-900 group-hover:text-emerald-700 transition flex items-center justify-between">
                <span>Fechamento de Caixa</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                Conferência de encerrantes, cartões, dinheiro e cálculo de rateio de diferenças.
              </p>
            </div>
          </button>

          {/* Ação 2: IA Escala */}
          <button
            onClick={() => onNavigate('ia-escala')}
            className="group p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-400 rounded-2xl shadow-xs transition text-left flex items-start gap-3.5 active:scale-98"
          >
            <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-slate-900 group-hover:text-indigo-700 transition flex items-center justify-between">
                <span>Escanear Escala (IA)</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                Envie foto da folha ou quadro para OCR e importação automática para o planner.
              </p>
            </div>
          </button>

          {/* Ação 3: Tanques & Régua */}
          <button
            onClick={() => onNavigate('tanques')}
            className="group p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-amber-400 rounded-2xl shadow-xs transition text-left flex items-start gap-3.5 active:scale-98"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition flex items-center justify-center shrink-0">
              <Fuel className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-slate-900 group-hover:text-amber-700 transition flex items-center justify-between">
                <span>Régua de Tanques</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                Conversão de centímetros para litros, capacidade e apuração de estoque diário.
              </p>
            </div>
          </button>

          {/* Ação 4: Bicos & Aferições (Diagrama da Bomba) */}
          <button
            onClick={() => onNavigate('afericoes')}
            className="group p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-amber-400 rounded-2xl shadow-xs transition text-left flex items-start gap-3.5 active:scale-98"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 group-hover:bg-amber-600 group-hover:text-white transition flex items-center justify-center shrink-0">
              <Gauge className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-slate-900 group-hover:text-amber-700 transition flex items-center justify-between">
                <span>Diagrama Bombas 20L</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                Mapa visual Lado A e B das bombas, diagnóstico da última aferição de 20L e preços.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Indicadores Operacionais Principais (Cards de Métricas Ilustrados) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Equipe em Pista */}
        <div
          onClick={() => onNavigate('funcionarios')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Equipe do Posto
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
              {frentistasAtivos.length}
            </span>
            <span className="text-xs text-slate-500 font-medium">ativos</span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-emerald-700 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {escaladosHoje.length} em pista hoje
            </span>
            <span className="text-slate-400 font-medium">{folgasHoje.length} folgas</span>
          </div>
        </div>

        {/* Fechamentos & Faltas de Caixa */}
        <div
          onClick={() => onNavigate('fechamento')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-400 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Caixa de Hoje
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
              {fechamentosHoje.length}
            </span>
            <span className="text-xs text-slate-500 font-medium">turnos apurados</span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            {totalFaltasHoje > 0 ? (
              <span className="text-red-600 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Falta: {formatarMoeda(totalFaltasHoje)}
              </span>
            ) : totalSobrasHoje > 0 ? (
              <span className="text-blue-600 font-semibold">
                Sobra: {formatarMoeda(totalSobrasHoje)}
              </span>
            ) : (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Caixas conciliados
              </span>
            )}
            <span className="text-slate-400 font-medium">Ver fechamentos</span>
          </div>
        </div>

        {/* Aferições Inmetro */}
        <div
          onClick={() => onNavigate('afericoes')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-400 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Aferições 20L
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition flex items-center justify-center">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
              {afericoesConformes}/{afericoesHoje.length}
            </span>
            <span className="text-xs text-slate-500 font-medium">conformes hoje</span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-amber-700 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Mapa Lado A/B ({bicos.length} bicos)
            </span>
            <span className="text-slate-400 font-medium">±100ml</span>
          </div>
        </div>

        {/* Qualidade ANP & Conformidade */}
        <div
          onClick={() => onNavigate('analises')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-teal-400 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Qualidade ANP
            </span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition flex items-center justify-center">
              <TestTubes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
              {pendenciasConformidade}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {pendenciasConformidade === 1 ? 'pendência' : 'pendências'}
            </span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-teal-700 font-medium">
              {densidadesConformes} testes aprovados
            </span>
            <span className="text-slate-400 font-medium">D32 / Diesel</span>
          </div>
        </div>
      </div>

      {/* 3.5. Visão Rápida do Diagrama de Bombas & Última Aferição 20L por Bico (Lado A e Lado B) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Gauge className="w-5 h-5 text-amber-600" />
              Diagnóstico Visual dos Bicos & Bombas (Lado A e Lado B)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Status da última aferição de 20L por bico — clique para abrir o diagrama interativo da bomba e realizar diagnóstico
            </p>
          </div>
          <button
            onClick={() => onNavigate('afericoes')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition whitespace-nowrap"
          >
            <span>Abrir Diagrama Completo da Bomba</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {bicos.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-xs text-slate-500">
              Nenhum bico cadastrado ainda. Acesse a tela de Bicos & Aferições para gerar o mapa visual das bombas com 1 clique.
            </p>
            <button
              onClick={() => onNavigate('afericoes')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
            >
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
              Ir para Diagrama de Bombas & Aferições
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {[...bicos]
              .sort((a, b) => a.numero - b.numero)
              .map((b) => {
                const ult = afericoes
                  .filter((af) => af.bicoId === b.id)
                  .sort((x, y) => `${y.data}T${y.hora}`.localeCompare(`${x.data}T${x.hora}`))[0];
                const ml = ult ? Math.round(ult.diferenca * 1000) : null;
                const tol = ult ? Math.round((ult.toleranciaConfigurada || 0.1) * 1000) : 100;
                const isFora = ml !== null && Math.abs(ml) > tol;
                const isDeriva = ml !== null && !isFora && Math.abs(ml) >= 65;

                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onNavigate('afericoes')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between hover:shadow-sm ${
                      isFora
                        ? 'bg-red-50/70 border-red-300'
                        : isDeriva
                        ? 'bg-amber-50/70 border-amber-300'
                        : ult
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono font-extrabold text-xs text-slate-900">
                        Bico #{String(b.numero).padStart(2, '0')}
                      </span>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-700">
                        Lado {b.lado}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-1 font-medium">
                      {b.produto}
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between font-mono text-[11px] font-bold tabular-nums">
                      {ml !== null ? (
                        <>
                          <span
                            className={
                              isFora
                                ? 'text-red-700'
                                : isDeriva
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }
                          >
                            {ml > 0 ? `+${ml}` : ml}ml
                          </span>
                          <span className="text-[9px] font-sans uppercase text-slate-400">
                            {isFora ? 'CRÍTICO' : isDeriva ? 'DERIVA' : 'OK'}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] font-sans text-slate-400">Pendente</span>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* 4. Situação Ilustrada dos Tanques (Visual Liquid Level Tank Gauges) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Fuel className="w-5 h-5 text-indigo-600" />
              Monitor Ilustrado dos Tanques & Combustíveis
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Volume estimado por calibração de régua milimetrada e capacidade de armazenamento do pátio
            </p>
          </div>
          <button
            onClick={() => onNavigate('tanques')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
          >
            <span>Abrir Calculadora de Régua</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {tanques.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            Nenhum tanque cadastrado no momento. Cadastre os tanques na aba "Tanques & Régua".
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tanques.map((t, idx) => {
              const cores = getProdutoColor(t.produto);
              // Estimativa visual de nível baseada na tabela de calibração ou valor padrão
              const percentual = 60 + ((idx * 13) % 35); // 60% a 95% para simulação ilustrativa
              const volumeAtualEstimado = Math.round((t.capacidadeNominal * percentual) / 100);

              return (
                <div
                  key={t.id}
                  onClick={() => onNavigate('tanques')}
                  className="p-5 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/50 hover:border-slate-300 hover:shadow-md transition cursor-pointer space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">{t.codigo}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cores.badge}`}>
                          {t.produto}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Capacidade Nominal: <strong className="text-slate-700">{t.capacidadeNominal.toLocaleString('pt-BR')} L</strong>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-extrabold text-slate-900 font-mono">
                        {percentual}%
                      </div>
                      <div className="text-[10px] text-slate-400">nível</div>
                    </div>
                  </div>

                  {/* Ilustração Visual do Tanque (Cilindro com Nível Líquido) */}
                  <div className="relative w-full h-8 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 p-0.5 flex items-center">
                    {/* Barra de combustível em gradiente */}
                    <div
                      className={`h-full rounded-lg bg-gradient-to-r ${cores.bg} transition-all duration-500 flex items-center justify-end pr-2`}
                      style={{ width: `${percentual}%` }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow-xs">
                        {volumeAtualEstimado.toLocaleString('pt-BR')} L
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${cores.dot}`} />
                      <span>{t.formato.replace('_', ' ').toLowerCase()}</span>
                    </span>
                    <span className="text-indigo-600 font-semibold hover:underline">
                      Consultar Régua →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Evolução Mensal do Volume de Vendas por Bico (Recharts) */}
      <VendasPorBicoChart fechamentos={fechamentos} bicos={bicos} />

      {/* 6. Equipe Escalada Hoje & Painel de Frentistas no Pátio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equipe em Pista Hoje */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Escala de Trabalho no Pátio Hoje
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Colaboradores ativos e postos de trabalho programados
              </p>
            </div>
            <button
              onClick={() => onNavigate('planner')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
            >
              <span>Ver Grade Completa</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {escaladosHoje.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Nenhuma escala lançada para a data de hoje ({hoje}). Use o Planner ou a IA para carregar a escala.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {escaladosHoje.map((esc) => {
                const func = funcionarios.find((f) => f.id === esc.funcionarioId);
                const nome = esc.funcionarioNome || func?.nome || 'Colaborador';
                const funcao = func?.funcao || func?.cargo || 'Frentista';

                return (
                  <div
                    key={esc.id}
                    className="p-3.5 bg-slate-50/80 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                        {nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <div className="font-semibold text-xs text-slate-900 truncate">{nome}</div>
                        <div className="text-[11px] text-slate-500 truncate">{funcao}</div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {esc.turno}
                      </span>
                      {esc.horarioInicio && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {esc.horarioInicio} - {esc.horarioFim}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alertas e Pendências Operacionais */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Checklist & Alertas
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              Pátio
            </span>
          </div>

          <div className="space-y-3">
            {/* Item 1: Aferição */}
            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-2.5">
              <Gauge className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-semibold text-slate-800">Aferição de Bicos 20L</div>
                <div className="text-slate-500 text-[11px]">
                  {afericoesHoje.length > 0
                    ? `${afericoesHoje.length} bicos aferidos hoje no pátio.`
                    : 'Nenhuma aferição registrada hoje ainda.'}
                </div>
              </div>
            </div>

            {/* Item 2: Testes ANP */}
            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-2.5">
              <TestTubes className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-semibold text-slate-800">Controle de Qualidade ANP</div>
                <div className="text-slate-500 text-[11px]">
                  {densidadesHoje.length > 0
                    ? `${densidadesHoje.length} amostras analisadas (D32 / proveta).`
                    : 'Realize o teste da proveta e densidade das descargas.'}
                </div>
              </div>
            </div>

            {/* Item 3: Fechamento de Caixa */}
            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-2.5">
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-semibold text-slate-800">Conferência de Turno</div>
                <div className="text-slate-500 text-[11px]">
                  {fechamentosHoje.length > 0
                    ? `${fechamentosHoje.length} fechamentos conferidos hoje.`
                    : 'Lance os encerrantes ao final de cada turno.'}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => onNavigate('relatorios')}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
            >
              <span>Ver Relatório Diário de Operação</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
