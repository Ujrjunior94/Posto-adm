import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { FechamentoCaixa, LMCRegistro, Bico } from '../../types';
import {
  TrendingUp,
  Fuel,
  Calendar,
  ArrowRight,
  Droplet,
  Award,
  BookOpen,
  Filter,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { formatarMoeda } from '../../utils/calculations';

interface VendasDiariasCombustivelChartProps {
  fechamentos: FechamentoCaixa[];
  registrosLMC?: LMCRegistro[];
  bicos?: Bico[];
  onNavigateToLMC?: () => void;
  className?: string;
}

// Configuração visual e padronização dos 5 combustíveis principais
export const COMBUSTIVEIS_PALETA: Record<
  string,
  {
    nome: string;
    cor: string;
    bgBadge: string;
    textBadge: string;
    borderBadge: string;
    dotBorder: string;
  }
> = {
  'Gasolina Comum': {
    nome: 'Gasolina Comum',
    cor: '#f97316', // Laranja quente
    bgBadge: 'bg-orange-50',
    textBadge: 'text-orange-700',
    borderBadge: 'border-orange-200',
    dotBorder: '#ea580c',
  },
  'Gasolina Aditivada': {
    nome: 'Gasolina Aditivada',
    cor: '#2563eb', // Azul Royal
    bgBadge: 'bg-blue-50',
    textBadge: 'text-blue-700',
    borderBadge: 'border-blue-200',
    dotBorder: '#1d4ed8',
  },
  'Etanol': {
    nome: 'Etanol',
    cor: '#10b981', // Verde Esmeralda
    bgBadge: 'bg-emerald-50',
    textBadge: 'text-emerald-700',
    borderBadge: 'border-emerald-200',
    dotBorder: '#059669',
  },
  'Diesel S10': {
    nome: 'Diesel S10',
    cor: '#eab308', // Dourado / Âmbar
    bgBadge: 'bg-amber-50',
    textBadge: 'text-amber-800',
    borderBadge: 'border-amber-200',
    dotBorder: '#ca8a04',
  },
  'Diesel S500': {
    nome: 'Diesel S500',
    cor: '#8b5cf6', // Roxo / Violeta
    bgBadge: 'bg-purple-50',
    textBadge: 'text-purple-700',
    borderBadge: 'border-purple-200',
    dotBorder: '#7c3aed',
  },
};

const COMBUSTIVEIS_LISTA = [
  'Gasolina Comum',
  'Gasolina Aditivada',
  'Etanol',
  'Diesel S10',
  'Diesel S500',
];

/**
 * Normaliza qualquer nomenclatura de combustível para os nomes canônicos do posto
 */
export function normalizarCombustivel(nome: string): string {
  if (!nome) return 'Outros';
  const n = nome.toLowerCase().trim();
  if (n.includes('aditivada')) return 'Gasolina Aditivada';
  if (n.includes('gasolina') || n.includes('grid')) return 'Gasolina Comum';
  if (n.includes('etanol') || n.includes('álcool') || n.includes('alcool')) return 'Etanol';
  if (n.includes('s10') || n.includes('s-10')) return 'Diesel S10';
  if (n.includes('s500') || n.includes('s-500')) return 'Diesel S500';
  if (n.includes('gnv')) return 'GNV';
  return nome.trim();
}

interface PontoDiario {
  dataIso: string; // "2026-10-22"
  dataLabel: string; // "22/10"
  diaSemana: string; // "Qui"
  dataCompleta: string; // "22/10/2026"
  totalDia: number; // Soma de todos os combustíveis no dia
  [combustivel: string]: string | number;
}

export const VendasDiariasCombustivelChart: React.FC<VendasDiariasCombustivelChartProps> = ({
  fechamentos,
  registrosLMC = [],
  bicos = [],
  onNavigateToLMC,
  className = '',
}) => {
  // Controles de Visualização
  const [periodoDias, setPeriodoDias] = useState<number | 'MES'>(14);
  const [combustivelAtivo, setCombustivelAtivo] = useState<string>('TODOS');
  const [combustiveisVisiveis, setCombustiveisVisiveis] = useState<Record<string, boolean>>({
    'Gasolina Comum': true,
    'Gasolina Aditivada': true,
    'Etanol': true,
    'Diesel S10': true,
    'Diesel S500': true,
  });

  // Alterna visibilidade de uma linha individual
  const toggleLinhaCombustivel = (comb: string) => {
    setCombustiveisVisiveis((prev) => ({
      ...prev,
      [comb]: !prev[comb],
    }));
  };

  // Verifica se há dados reais gravados em fechamentos ou LMC
  const temDadosReais = useMemo(() => {
    const hasFech = fechamentos.some(
      (f) =>
        f.encerrantesBicos &&
        f.encerrantesBicos.some((b) => Number(b.litrosVendidos || 0) > 0)
    );
    const hasLmc = registrosLMC.some((r) => Number(r.vendas || 0) > 0);
    return hasFech || hasLmc;
  }, [fechamentos, registrosLMC]);

  // Montagem da série diária contínua e agregação dos volumes
  const dadosGrafico = useMemo<PontoDiario[]>(() => {
    const hoje = new Date();
    const diasArray: { dataIso: string; label: string; diaSemana: string; dataCompleta: string }[] = [];

    const diasSemanaNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    if (periodoDias === 'MES') {
      // Todos os dias do mês atual até hoje
      const ano = hoje.getFullYear();
      const mes = hoje.getMonth();
      const diaAtual = hoje.getDate();
      for (let dia = 1; dia <= diaAtual; dia++) {
        const d = new Date(ano, mes, dia);
        const dataIso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const label = `${String(dia).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')}`;
        diasArray.push({
          dataIso,
          label,
          diaSemana: diasSemanaNomes[d.getDay()],
          dataCompleta: d.toLocaleDateString('pt-BR'),
        });
      }
    } else {
      // Janela de X dias retroativos até hoje
      const numDias = periodoDias;
      for (let i = numDias - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(hoje.getDate() - i);
        const ano = d.getFullYear();
        const mes = d.getMonth() + 1;
        const dia = d.getDate();
        const dataIso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const label = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
        diasArray.push({
          dataIso,
          label,
          diaSemana: diasSemanaNomes[d.getDay()],
          dataCompleta: d.toLocaleDateString('pt-BR'),
        });
      }
    }

    // Estrutura de agregação diária
    return diasArray.map((diaObj) => {
      const ponto: PontoDiario = {
        dataIso: diaObj.dataIso,
        dataLabel: diaObj.label,
        diaSemana: diaObj.diaSemana,
        dataCompleta: diaObj.dataCompleta,
        totalDia: 0,
      };

      // Inicializa os combustíveis canônicos com zero
      COMBUSTIVEIS_LISTA.forEach((c) => {
        ponto[c] = 0;
      });

      if (!temDadosReais) {
        // Modelo operacional demonstrativo realista quando o banco ainda não possui fechamentos gravados
        const d = new Date(diaObj.dataIso);
        const diaNum = parseInt(diaObj.dataIso.split('-')[2], 10) || 1;
        const diaSemanaIdx = d.getDay();
        const fatorFimSemana = diaSemanaIdx === 5 || diaSemanaIdx === 6 ? 1.14 : diaSemanaIdx === 0 ? 0.88 : 1.0;
        const oscilacao = Math.sin(diaNum * 1.25) * 190;

        ponto['Gasolina Comum'] = Math.round((3120 + oscilacao * 1.4) * fatorFimSemana);
        ponto['Gasolina Aditivada'] = Math.round((1140 + oscilacao * 0.6) * fatorFimSemana);
        ponto['Etanol'] = Math.round((2380 - oscilacao * 0.8) * fatorFimSemana);
        ponto['Diesel S10'] = Math.round((4820 + oscilacao * 1.8) * (diaSemanaIdx === 0 ? 0.65 : 1.05));
        ponto['Diesel S500'] = Math.round((1230 + oscilacao * 0.4) * (diaSemanaIdx === 0 ? 0.6 : 1.0));
        ponto.totalDia =
          (ponto['Gasolina Comum'] as number) +
          (ponto['Gasolina Aditivada'] as number) +
          (ponto['Etanol'] as number) +
          (ponto['Diesel S10'] as number) +
          (ponto['Diesel S500'] as number);

        return ponto;
      }

      // 1. Acumula vendas diárias a partir dos fechamentos de caixa reais
      fechamentos.forEach((f) => {
        if (!f.data || f.data !== diaObj.dataIso) return;
        if (f.encerrantesBicos && f.encerrantesBicos.length > 0) {
          f.encerrantesBicos.forEach((item) => {
            const prodNorm = normalizarCombustivel(item.produto);
            const litros = Number(item.litrosVendidos) || 0;
            if (litros > 0) {
              const atual = (ponto[prodNorm] as number) || 0;
              ponto[prodNorm] = Math.round(atual + litros);
              ponto.totalDia = Math.round(ponto.totalDia + litros);
            }
          });
        }
      });

      // 2. Integra registros do LMC oficial (se não houver fechamento ou se LMC tiver dado lançado)
      registrosLMC.forEach((reg) => {
        if (!reg.data || reg.data !== diaObj.dataIso) return;
        const prodNorm = normalizarCombustivel(String(reg.produto));
        const litrosLmc = Number(reg.vendas) || 0;
        if (litrosLmc > 0) {
          const valorExistente = (ponto[prodNorm] as number) || 0;
          if (valorExistente === 0) {
            ponto[prodNorm] = Math.round(litrosLmc);
            ponto.totalDia = Math.round(ponto.totalDia + litrosLmc);
          } else if (litrosLmc > valorExistente) {
            const diff = litrosLmc - valorExistente;
            ponto[prodNorm] = Math.round(litrosLmc);
            ponto.totalDia = Math.round(ponto.totalDia + diff);
          }
        }
      });

      return ponto;
    });
  }, [fechamentos, registrosLMC, periodoDias, temDadosReais]);

  // Estatísticas executivas do período para leitura imediata
  const estatisticas = useMemo(() => {
    let volumeTotalGeral = 0;
    const volumePorCombustivel: Record<string, number> = {};
    let diaPico = { dataLabel: '—', volume: 0, combustivel: '' };

    COMBUSTIVEIS_LISTA.forEach((c) => {
      volumePorCombustivel[c] = 0;
    });

    dadosGrafico.forEach((p) => {
      let volumeDiaTotal = 0;

      COMBUSTIVEIS_LISTA.forEach((c) => {
        const vol = (p[c] as number) || 0;
        volumePorCombustivel[c] += vol;
        volumeDiaTotal += vol;

        if (combustivelAtivo !== 'TODOS') {
          if (c === combustivelAtivo && vol > diaPico.volume) {
            diaPico = { dataLabel: p.dataLabel, volume: vol, combustivel: c };
          }
        }
      });

      if (combustivelAtivo === 'TODOS' && volumeDiaTotal > diaPico.volume) {
        diaPico = { dataLabel: p.dataLabel, volume: volumeDiaTotal, combustivel: 'Todos' };
      }

      volumeTotalGeral += volumeDiaTotal;
    });

    // Combustível líder
    let liderNome = COMBUSTIVEIS_LISTA[0];
    let liderVol = 0;
    Object.entries(volumePorCombustivel).forEach(([c, vol]) => {
      if (vol > liderVol) {
        liderVol = vol;
        liderNome = c;
      }
    });

    const numDias = dadosGrafico.length || 1;
    const mediaDiaria = Math.round(
      combustivelAtivo === 'TODOS'
        ? volumeTotalGeral / numDias
        : (volumePorCombustivel[combustivelAtivo] || 0) / numDias
    );

    const volumeSelecionado =
      combustivelAtivo === 'TODOS'
        ? volumeTotalGeral
        : volumePorCombustivel[combustivelAtivo] || 0;

    const percentualLider =
      volumeTotalGeral > 0 ? Math.round((liderVol / volumeTotalGeral) * 100) : 0;

    return {
      volumeTotalGeral,
      volumeSelecionado,
      mediaDiaria,
      liderNome,
      liderVol,
      percentualLider,
      diaPico,
      volumePorCombustivel,
    };
  }, [dadosGrafico, combustivelAtivo]);

  // Lista de combustíveis a renderizar no gráfico
  const combustiveisParaExibir = useMemo(() => {
    if (combustivelAtivo !== 'TODOS') {
      return [combustivelAtivo];
    }
    return COMBUSTIVEIS_LISTA.filter((c) => combustiveisVisiveis[c] !== false);
  }, [combustivelAtivo, combustiveisVisiveis]);

  // Tooltip customizado elegante com padrão de cartão executivo
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const ponto = dadosGrafico.find((d) => d.dataLabel === label);
    const dataCompleta = ponto?.dataCompleta || label;
    const diaSemana = ponto?.diaSemana ? `(${ponto.diaSemana})` : '';

    let somaLitros = 0;
    payload.forEach((entry: any) => {
      somaLitros += Number(entry.value) || 0;
    });

    return (
      <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700 text-xs space-y-2 min-w-[240px]">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
          <div className="font-extrabold text-sm flex items-center gap-1.5 text-slate-100">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>
              {dataCompleta} {diaSemana}
            </span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-400/30">
            Saída Diária
          </span>
        </div>

        <div className="space-y-1.5 pt-0.5">
          {payload.map((entry: any) => {
            const combNome = entry.name || entry.dataKey;
            const config = COMBUSTIVEIS_PALETA[combNome] || { cor: entry.color };
            const valor = Number(entry.value) || 0;
            const perc =
              somaLitros > 0 ? Math.round((valor / somaLitros) * 100) : 0;

            return (
              <div
                key={entry.dataKey}
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: config.cor }}
                  />
                  <span className="text-slate-300 font-medium truncate">
                    {combNome}
                  </span>
                </div>
                <div className="text-right shrink-0 font-mono">
                  <span className="font-bold text-white">
                    {valor.toLocaleString('pt-BR')} L
                  </span>
                  {payload.length > 1 && (
                    <span className="text-[10px] text-slate-400 ml-1.5">
                      ({perc}%)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {payload.length > 1 && (
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-400">Total do Dia:</span>
            <span className="text-emerald-400 font-mono">
              {somaLitros.toLocaleString('pt-BR')} L
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-xs p-5 md:p-6 space-y-6 ${className}`}
    >
      {/* 1. Cabeçalho Executivo do Gráfico de Linha */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Volume de Vendas Diário por Combustível
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Movimentação LMC
                </span>
                {temDadosReais ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Tempo Real
                  </span>
                ) : (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                    title="Exemplo operacional ativo até o lançamento dos fechamentos de caixa ou escrituração no LMC"
                  >
                    Exemplo Operacional
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Acompanhe as saídas diárias em litros sem precisar abrir a escrituração do LMC.
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Período e Atalho LMC */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Janela Temporal */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPeriodoDias(7)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodoDias === 7
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriodoDias(14)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodoDias === 14
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              14 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriodoDias(30)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodoDias === 30
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriodoDias('MES')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodoDias === 'MES'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mês Atual
            </button>
          </div>

          {/* Atalho Opcional para o LMC Oficial */}
          {onNavigateToLMC && (
            <button
              type="button"
              onClick={onNavigateToLMC}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Abrir Livro de Movimentação de Combustíveis oficial"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>Livro LMC</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Filtro Interativo por Combustível com Badges Coloridos */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-600 flex items-center gap-1 mr-1">
            <Fuel className="w-3.5 h-3.5 text-slate-500" />
            Combustível:
          </span>

          <button
            type="button"
            onClick={() => setCombustivelAtivo('TODOS')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              combustivelAtivo === 'TODOS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Todos ({COMBUSTIVEIS_LISTA.length})
          </button>

          {COMBUSTIVEIS_LISTA.map((comb) => {
            const config = COMBUSTIVEIS_PALETA[comb];
            const isAtivo = combustivelAtivo === comb;
            const volume = estatisticas.volumePorCombustivel[comb] || 0;

            return (
              <button
                key={comb}
                type="button"
                onClick={() => setCombustivelAtivo(isAtivo ? 'TODOS' : comb)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  isAtivo
                    ? 'ring-2 ring-blue-500 shadow-xs text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
                style={{
                  backgroundColor: isAtivo ? config.cor : undefined,
                  borderColor: isAtivo ? config.cor : undefined,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: isAtivo ? '#ffffff' : config.cor }}
                />
                <span>{comb}</span>
                <span
                  className={`text-[10px] font-mono ${
                    isAtivo ? 'text-white/80' : 'text-slate-400'
                  }`}
                >
                  {volume > 0 ? `${(volume / 1000).toFixed(1)}k L` : '0L'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Indicador de Alternância Multilinhas */}
        {combustivelAtivo === 'TODOS' && (
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">
            <span>Dica: clique no combustível para isolar a linha</span>
          </div>
        )}
      </div>

      {/* 3. 4 Cartões Executivos de Resumo do Período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Volume Total Selecionado */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
            {combustivelAtivo === 'TODOS' ? 'Volume Total do Período' : `Volume: ${combustivelAtivo}`}
          </span>
          <div className="mt-1 text-xl font-extrabold text-slate-900 font-mono">
            {estatisticas.volumeSelecionado.toLocaleString('pt-BR')}{' '}
            <span className="text-xs font-sans text-slate-500 font-normal">Litros</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span>Últimos {dadosGrafico.length} dias</span>
          </div>
        </div>

        {/* Card 2: Média Diária */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
            Média Diária de Saída
          </span>
          <div className="mt-1 text-xl font-extrabold text-blue-700 font-mono">
            {estatisticas.mediaDiaria.toLocaleString('pt-BR')}{' '}
            <span className="text-xs font-sans text-slate-500 font-normal">L/dia</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Ritmo contínuo de pista
          </div>
        </div>

        {/* Card 3: Combustível Líder */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center justify-between">
            <span>Mais Vendido</span>
            <Award className="w-3.5 h-3.5 text-amber-500" />
          </span>
          <div className="mt-1 text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor:
                  COMBUSTIVEIS_PALETA[estatisticas.liderNome]?.cor || '#3b82f6',
              }}
            />
            <span className="truncate">{estatisticas.liderNome}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">
            {estatisticas.liderVol.toLocaleString('pt-BR')} L ({estatisticas.percentualLider}% do total)
          </div>
        </div>

        {/* Card 4: Pico de Venda */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center justify-between">
            <span>Pico Diário</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          </span>
          <div className="mt-1 text-xl font-extrabold text-emerald-700 font-mono">
            {estatisticas.diaPico.volume > 0
              ? `${estatisticas.diaPico.volume.toLocaleString('pt-BR')} L`
              : '0 L'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {estatisticas.diaPico.volume > 0
              ? `Atingido em ${estatisticas.diaPico.dataLabel}`
              : 'Sem movimentação'}
          </div>
        </div>
      </div>

      {/* 4. Canvas Gráfico Recharts de Linhas */}
      <div className="h-80 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={dadosGrafico}
            margin={{ top: 15, right: 15, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#e2e8f0"
            />
            <XAxis
              dataKey="dataLabel"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              tickFormatter={(val) =>
                val >= 1000 ? `${(val / 1000).toFixed(0)}k L` : `${val} L`
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              onClick={(e: any) => {
                if (e && e.dataKey) {
                  toggleLinhaCombustivel(e.dataKey);
                }
              }}
              formatter={(value) => {
                const config = COMBUSTIVEIS_PALETA[value];
                const isVisivel = combustiveisVisiveis[value] !== false;
                return (
                  <span
                    className={`text-xs font-semibold cursor-pointer ${
                      isVisivel ? 'text-slate-800' : 'text-slate-400 line-through'
                    }`}
                  >
                    {config?.nome || value}
                  </span>
                );
              }}
            />

            {/* Linhas de Cada Combustível */}
            {combustiveisParaExibir.map((comb) => {
              const config = COMBUSTIVEIS_PALETA[comb] || {
                cor: '#3b82f6',
                dotBorder: '#1d4ed8',
              };

              return (
                <Line
                  key={comb}
                  type="monotone"
                  dataKey={comb}
                  name={comb}
                  stroke={config.cor}
                  strokeWidth={combustivelAtivo === comb ? 3.5 : 2.5}
                  dot={{
                    r: 3.5,
                    stroke: config.dotBorder,
                    strokeWidth: 1.5,
                    fill: '#ffffff',
                  }}
                  activeDot={{
                    r: 6.5,
                    stroke: '#ffffff',
                    strokeWidth: 2.5,
                    fill: config.cor,
                  }}
                  animationDuration={800}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 5. Rodapé Operacional com Legenda Rápida e Status */}
      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Dados sincronizados em tempo real dos encerrantes de bico e fechamentos de caixa.
          </span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          {dadosGrafico.length} dias analisados · {fechamentos.length} fechamentos lidos
        </div>
      </div>
    </div>
  );
};
