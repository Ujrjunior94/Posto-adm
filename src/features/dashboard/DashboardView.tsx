import React from 'react';
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
  EscalaImportada,
  LMCRegistro,
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
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Sunrise,
  Sun,
  Plus,
} from 'lucide-react';
import { formatarMoeda } from '../../utils/calculations';
import { VendasPorBicoChart } from './VendasPorBicoChart';
import { VendasDiariasCombustivelChart } from './VendasDiariasCombustivelChart';

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
  escalasImportadas?: EscalaImportada[];
  registrosLMC?: LMCRegistro[];
  onNavigate: (aba: string) => void;
}

export const DashboardView: React.FC<DashboardProps> = ({
  funcionarios,
  escalas,
  fechamentos,
  tanques,
  bicos = [],
  afericoes,
  densidades,
  conformidades,
  registrosLMC = [],
  onNavigate,
}) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const horaAtual = new Date().getHours();

  // Determinar turno operacional corrente baseado no relógio
  const turnoAtual =
    horaAtual < 14
      ? { nome: 'Turno 1 — Manhã', horario: '06h00 às 14h00', icone: Sunrise }
      : { nome: 'Turno 2 — Tarde', horario: '14h00 às 22h00', icone: Sun };

  const TurnoIcone = turnoAtual.icone;

  // Cálculos operacionais consolidados
  const frentistasAtivos = funcionarios.filter((f) => f.status === 'ATIVO');
  const escaladosHoje = escalas.filter((e) => e.data === hoje && e.status === 'TRABALHO');
  const folgasHoje = escalas.filter((e) => e.data === hoje && e.status === 'FOLGA');

  const fechamentosHoje = fechamentos.filter((f) => f.data === hoje);
  const totalConferidoHoje = fechamentosHoje.reduce(
    (acc, curr) => acc + (curr.totalConferido || 0),
    0
  );

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

  // Paleta equilibrada por combustível
  const getProdutoColor = (produto: string) => {
    const p = produto.toLowerCase();
    if (p.includes('aditivada')) {
      return {
        bar: 'bg-blue-600',
        text: 'text-blue-700',
        border: 'border-blue-200',
      };
    }
    if (p.includes('etanol') || p.includes('álcool')) {
      return {
        bar: 'bg-emerald-600',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
      };
    }
    if (p.includes('s10') || p.includes('diesel')) {
      return {
        bar: 'bg-amber-600',
        text: 'text-amber-700',
        border: 'border-amber-200',
      };
    }
    if (p.includes('s500')) {
      return {
        bar: 'bg-purple-600',
        text: 'text-purple-700',
        border: 'border-purple-200',
      };
    }
    return {
      bar: 'bg-rose-600',
      text: 'text-rose-700',
      border: 'border-rose-200',
    };
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Operacional Limpo e Executivo */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Matriz Central</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 font-medium text-slate-700">
              <TurnoIcone className="w-3.5 h-3.5 text-blue-600" />
              {turnoAtual.nome} ({turnoAtual.horario})
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            Visão Geral Operacional
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Métricas em tempo real de caixa, frentistas, nível de tanques e aferições do posto.
          </p>
        </div>

        {/* Ações Primárias Diretas */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('ia-escala')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Escanear Escala</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('fechamento')}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Fechamento</span>
          </button>
        </div>
      </div>

      {/* 2. Quatro Indicadores Operacionais Essenciais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Caixa do Dia */}
        <div
          onClick={() => onNavigate('fechamento')}
          className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Caixa de Hoje</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {formatarMoeda(totalConferidoHoje)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>{fechamentosHoje.length} {fechamentosHoje.length === 1 ? 'turno' : 'turnos'}</span>
              {totalFaltasHoje > 0 ? (
                <span className="text-rose-600 font-semibold font-mono">
                  -{formatarMoeda(totalFaltasHoje)} falta
                </span>
              ) : totalSobrasHoje > 0 ? (
                <span className="text-blue-600 font-semibold font-mono">
                  +{formatarMoeda(totalSobrasHoje)} sobra
                </span>
              ) : (
                <span className="text-emerald-600 font-semibold">100% concil.</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Equipe em Pista */}
        <div
          onClick={() => onNavigate('planner')}
          className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Equipe em Pista</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {escaladosHoje.length}
              <span className="text-xs font-normal text-slate-400 ml-1.5">
                de {frentistasAtivos.length} ativos
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span className="text-emerald-700 font-medium">Trabalhando hoje</span>
              <span className="text-slate-500">{folgasHoje.length} folgas</span>
            </div>
          </div>
        </div>

        {/* Card 3: Aferições 20L */}
        <div
          onClick={() => onNavigate('afericoes')}
          className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Aferições 20L</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {afericoesConformes}/{afericoesHoje.length}
              <span className="text-xs font-normal text-slate-400 ml-1.5">conformes</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>Tolerância Inmetro</span>
              <span className="font-mono text-slate-700">±100 ml</span>
            </div>
          </div>
        </div>

        {/* Card 4: Qualidade ANP */}
        <div
          onClick={() => onNavigate('analises')}
          className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Qualidade ANP</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <TestTubes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {densidadesConformes}
              <span className="text-xs font-normal text-slate-400 ml-1.5">laudos válidos</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>Proveta e D32</span>
              {pendenciasConformidade > 0 ? (
                <span className="text-amber-700 font-semibold">{pendenciasConformidade} pend.</span>
              ) : (
                <span className="text-emerald-700 font-semibold">100% OK</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Gráfico de Linha Recharts: Volume de Vendas Diário de Cada Combustível (Acompanhamento LMC) */}
      <VendasDiariasCombustivelChart
        fechamentos={fechamentos}
        registrosLMC={registrosLMC}
        bicos={bicos}
        onNavigateToLMC={() => onNavigate('lmc')}
      />

      {/* 4. Grade Principal em 2 Colunas: Operações de Combustível vs Equipe & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda (7 cols): Tanques & Bicos */}
        <div className="lg:col-span-7 space-y-6">
          {/* Monitor de Tanques */}
          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Nível dos Tanques de Combustível</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('tanques')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1 cursor-pointer"
              >
                <span>Régua e Capacidade</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {tanques.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum tanque cadastrado no momento. Cadastre os tanques na aba "Tanques & Régua".
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
                {tanques.map((t) => {
                  const cores = getProdutoColor(t.produto);
                  const volumeOperacional = t.capacidadeOperacional || t.capacidadeNominal || 0;
                  const percentual =
                    t.capacidadeNominal > 0
                      ? Math.min(100, Math.round((volumeOperacional / t.capacidadeNominal) * 100))
                      : 0;

                  return (
                    <div
                      key={t.id}
                      onClick={() => onNavigate('tanques')}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 transition cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-xs text-slate-900">{t.codigo}</div>
                          <div className={`text-[11px] font-semibold ${cores.text}`}>{t.produto}</div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                            {percentual}%
                          </span>
                        </div>
                      </div>

                      {/* Barra de Nível Limpa */}
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-2.5">
                        <div
                          className={`h-full ${cores.bar} transition-all duration-300`}
                          style={{ width: `${Math.max(percentual, 5)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-2 tabular-nums">
                        <span>{volumeOperacional.toLocaleString('pt-BR')} L</span>
                        <span className="text-slate-400">/ {t.capacidadeNominal.toLocaleString('pt-BR')} L</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Diagnóstico dos Bicos (Lado A e Lado B) */}
          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-slate-900">Bicos de Bomba · Última Aferição</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('afericoes')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1 cursor-pointer"
              >
                <span>Diagrama 20L</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {bicos.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Nenhum bico cadastrado. Cadastre os bicos na seção "Bicos & Aferições".
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mt-4">
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
                      <div
                        key={b.id}
                        onClick={() => onNavigate('afericoes')}
                        className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                          isFora
                            ? 'bg-red-50/60 border-red-200'
                            : isDeriva
                            ? 'bg-amber-50/60 border-amber-200'
                            : ult
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                          <span className="font-mono">Bico #{String(b.numero).padStart(2, '0')}</span>
                          <span className="text-[10px] text-slate-500 font-normal">Lado {b.lado}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">{b.produto}</div>
                        <div className="mt-2 text-xs font-mono font-bold tabular-nums">
                          {ml !== null ? (
                            <span
                              className={
                                isFora
                                  ? 'text-red-700'
                                  : isDeriva
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }
                            >
                              {ml > 0 ? `+${ml}` : ml} ml
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">Pendente</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita (5 cols): Equipe do Dia & Checklist Operacional */}
        <div className="lg:col-span-5 space-y-6">
          {/* Escala em Pista Hoje */}
          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Escala de Hoje ({escaladosHoje.length})</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('planner')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1 cursor-pointer"
              >
                <span>Abrir Planner</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {escaladosHoje.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Nenhum frentista escalado para a data de hoje. Acesse o Planner para organizar a equipe.
              </div>
            ) : (
              <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-1">
                {escaladosHoje.map((esc) => {
                  const func = funcionarios.find((f) => f.id === esc.funcionarioId);
                  const nome = esc.funcionarioNome || func?.nome || 'Colaborador';
                  const funcao = func?.funcao || func?.cargo || 'Frentista';

                  return (
                    <div
                      key={esc.id}
                      className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{nome}</div>
                        <div className="text-[11px] text-slate-500 truncate">{funcao}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-medium text-slate-700 block">
                          {esc.horarioInicio && esc.horarioFim
                            ? `${esc.horarioInicio} - ${esc.horarioFim}`
                            : esc.turno}
                        </span>
                        <span className="text-[10px] text-slate-400">{esc.turno}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Checklist Operacional de Pista */}
          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900">Checklist Operacional Diário</h2>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">Conferência de Caixa</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {fechamentosHoje.length > 0
                      ? `${fechamentosHoje.length} fechamentos registrados hoje.`
                      : 'Nenhum fechamento lançado até o momento.'}
                  </div>
                </div>
                {fechamentosHoje.length > 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                )}
              </div>

              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">Aferições de Bicos 20L</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {afericoesHoje.length > 0
                      ? `${afericoesHoje.length} ensaios no balde 20L realizados.`
                      : 'Realize o teste diário de aferição nos bicos da pista.'}
                  </div>
                </div>
                {afericoesHoje.length > 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                )}
              </div>

              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">Qualidade de Combustível (ANP)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {densidadesHoje.length > 0
                      ? `${densidadesHoje.length} amostras validadas (D32 / proveta).`
                      : 'Registre os ensaios de densidade e teor de álcool.'}
                  </div>
                </div>
                {densidadesHoje.length > 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Análise de Vendas por Bico */}
      <VendasPorBicoChart fechamentos={fechamentos} bicos={bicos} />
    </div>
  );
};
