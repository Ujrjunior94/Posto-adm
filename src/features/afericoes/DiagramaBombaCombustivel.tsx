import React, { useState, useMemo } from 'react';
import { Bico, Afericao, Tanque, Funcionario } from '../../types';
import { formatarPrecoLitro, calcularPrecoEfetivoBico } from '../../utils/pricing';
import { formatarMoeda } from '../../utils/calculations';
import {
  Gauge,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Plus,
  Activity,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Fuel,
  Info,
  Sparkles,
  History,
  Sliders,
  RefreshCw,
} from 'lucide-react';

interface DiagramaBombaCombustivelProps {
  bicos: Bico[];
  afericoes: Afericao[];
  tanques: Tanque[];
  funcionarios: Funcionario[];
  selectedBicoId: string;
  onSelectBico: (bicoId: string) => void;
  onAbrirModalAfericao: (bicoId: string) => void;
  onAbrirModalPreco: (bico: Bico) => void;
  onAbrirModalNovoBico: () => void;
  onGerarPistaPadrao?: () => void;
}

export type DiagnosticoStatus = 'CALIBRADO' | 'DERIVA_LIMITE' | 'FORA_INMETRO' | 'PENDENTE';

export interface DiagnosticoBico {
  bico: Bico;
  ultimaAfericao: Afericao | null;
  historicoBico: Afericao[];
  desvioMl: number | null;
  toleranciaMl: number;
  statusDiagnostico: DiagnosticoStatus;
  tituloDiagnostico: string;
  recomendacao: string;
  tendenciaMl: number | null;
  perdaOuSobraPor1000L: number;
  impactoFinanceiroPor1000L: number;
  diasDesdeUltima: number | null;
}

export function obterCoresCombustivel(produto: string) {
  const p = produto.toLowerCase();
  if (p.includes('aditivada')) {
    return {
      nomeCurto: 'GAS. ADITIVADA',
      sigla: 'GA',
      bgHeader: 'bg-sky-600',
      bgSoft: 'bg-sky-50',
      border: 'border-sky-200',
      text: 'text-sky-800',
      badge: 'bg-sky-100 text-sky-900 border-sky-300',
      hoseColor: '#0284c7',
      nozzleFill: '#0369a1',
    };
  }
  if (p.includes('etanol') || p.includes('álcool')) {
    return {
      nomeCurto: 'ETANOL HIDR.',
      sigla: 'ET',
      bgHeader: 'bg-emerald-600',
      bgSoft: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-800',
      badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      hoseColor: '#059669',
      nozzleFill: '#047857',
    };
  }
  if (p.includes('s10') || p.includes('s-10')) {
    return {
      nomeCurto: 'DIESEL S10',
      sigla: 'S10',
      bgHeader: 'bg-amber-500',
      bgSoft: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-900',
      badge: 'bg-amber-100 text-amber-900 border-amber-300',
      hoseColor: '#d97706',
      nozzleFill: '#b45309',
    };
  }
  if (p.includes('s500') || p.includes('s-500') || p.includes('diesel')) {
    return {
      nomeCurto: 'DIESEL S500',
      sigla: 'S500',
      bgHeader: 'bg-indigo-600',
      bgSoft: 'bg-indigo-50',
      border: 'border-indigo-200',
      text: 'text-indigo-900',
      badge: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      hoseColor: '#4f46e5',
      nozzleFill: '#4338ca',
    };
  }
  return {
    nomeCurto: 'GAS. COMUM',
    sigla: 'GC',
    bgHeader: 'bg-rose-600',
    bgSoft: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-900',
    badge: 'bg-rose-100 text-rose-900 border-rose-300',
    hoseColor: '#e11d48',
    nozzleFill: '#be123c',
  };
}

export const DiagramaBombaCombustivel: React.FC<DiagramaBombaCombustivelProps> = ({
  bicos,
  afericoes,
  funcionarios,
  selectedBicoId,
  onSelectBico,
  onAbrirModalAfericao,
  onAbrirModalPreco,
  onAbrirModalNovoBico,
  onGerarPistaPadrao,
}) => {
  const [filtroBomba, setFiltroBomba] = useState<string>('TODAS');
  const [filtroStatusDiag, setFiltroStatusDiag] = useState<string>('TODOS');

  // Mapear diagnósticos completos de todos os bicos
  const diagnosticosMap = useMemo(() => {
    const map = new Map<string, DiagnosticoBico>();
    const hojeMs = Date.now();

    bicos.forEach((bico) => {
      const hist = afericoes
        .filter((a) => a.bicoId === bico.id)
        .sort((x, y) => {
          const dtX = `${x.data}T${x.hora || '00:00'}`;
          const dtY = `${y.data}T${y.hora || '00:00'}`;
          return dtY.localeCompare(dtX);
        });

      const ultima = hist[0] || null;
      const penultima = hist[1] || null;

      if (!ultima) {
        map.set(bico.id, {
          bico,
          ultimaAfericao: null,
          historicoBico: [],
          desvioMl: null,
          toleranciaMl: 100,
          statusDiagnostico: 'PENDENTE',
          tituloDiagnostico: 'Sem Aferição Recente',
          recomendacao:
            'Realize a medição com o balde aferidor de 20L para certificar a entrega deste bico.',
          tendenciaMl: null,
          perdaOuSobraPor1000L: 0,
          impactoFinanceiroPor1000L: 0,
          diasDesdeUltima: null,
        });
        return;
      }

      const desvioMl = Math.round(ultima.diferenca * 1000);
      const tolMl = Math.round((ultima.toleranciaConfigurada || 0.1) * 1000);
      const absMl = Math.abs(desvioMl);

      let statusDiagnostico: DiagnosticoStatus = 'CALIBRADO';
      let tituloDiagnostico = 'Calibrado & Operacional';
      let recomendacao = 'Bico operando com precisão dentro da zona ideal do Inmetro.';

      if (absMl > tolMl) {
        statusDiagnostico = 'FORA_INMETRO';
        if (desvioMl > tolMl) {
          tituloDiagnostico = `Crítico: Entrega Excessiva (+${desvioMl} ml)`;
          recomendacao =
            'Bloqueie o bico e acione manutenção: a bomba está entregando combustível além do limite de +100 ml, gerando perda direta de estoque.';
        } else {
          tituloDiagnostico = `Crítico: Falta na Entrega (${desvioMl} ml)`;
          recomendacao =
            'Interdite o bico imediatamente: entrega abaixo de -100 ml em 20L infringe a portaria do Inmetro e sujeita o posto a autuação e lacração.';
        }
      } else if (absMl >= 65) {
        statusDiagnostico = 'DERIVA_LIMITE';
        if (desvioMl > 0) {
          tituloDiagnostico = `Alerta de Deriva (+${desvioMl} ml)`;
          recomendacao =
            'Dentro do limite legal (±100 ml), porém próximo ao teto. Acompanhe no próximo turno para evitar perda de margem.';
        } else {
          tituloDiagnostico = `Alerta de Deriva (${desvioMl} ml)`;
          recomendacao =
            'Dentro do limite legal (±100 ml), mas próximo ao piso de -100 ml. Agende ajuste preventivo do bloco medidor.';
        }
      } else if (desvioMl === 0) {
        tituloDiagnostico = 'Cravado 20,000 L (0 ml)';
        recomendacao = 'Simetria metrológica exata no marco zero da escala do balde aferidor.';
      }

      const tendenciaMl = penultima
        ? desvioMl - Math.round(penultima.diferenca * 1000)
        : null;

      const perdaOuSobraPor1000L = Number(((desvioMl * 50) / 1000).toFixed(2));
      const precoEfetivo = calcularPrecoEfetivoBico(bico).precoFinal;
      const impactoFinanceiroPor1000L = Number((perdaOuSobraPor1000L * precoEfetivo).toFixed(2));

      let diasDesdeUltima: number | null = null;
      if (ultima.data) {
        const dtUltima = new Date(`${ultima.data}T12:00:00`).getTime();
        if (!isNaN(dtUltima)) {
          diasDesdeUltima = Math.max(0, Math.floor((hojeMs - dtUltima) / (1000 * 60 * 60 * 24)));
        }
      }

      map.set(bico.id, {
        bico,
        ultimaAfericao: ultima,
        historicoBico: hist,
        desvioMl,
        toleranciaMl: tolMl,
        statusDiagnostico,
        tituloDiagnostico,
        recomendacao,
        tendenciaMl,
        perdaOuSobraPor1000L,
        impactoFinanceiroPor1000L,
        diasDesdeUltima,
      });
    });

    return map;
  }, [bicos, afericoes]);

  // Agrupar bicos por Bomba (Ilha) garantindo a estrutura de 2 Bombas com 3 bicos de cada lado
  const bombasAgrupadas = useMemo(() => {
    const grupos = new Map<string, { nomeBomba: string; ladoA: Bico[]; ladoB: Bico[] }>();

    const bicosOrdenados = [...bicos].sort((a, b) => a.numero - b.numero);
    bicosOrdenados.forEach((b) => {
      const diag = diagnosticosMap.get(b.id);
      if (filtroStatusDiag !== 'TODOS' && diag?.statusDiagnostico !== filtroStatusDiag) {
        return;
      }

      const chave = b.bomba || 'Bomba 01 (Sêxtupla - Ilha 01)';
      if (!grupos.has(chave)) {
        grupos.set(chave, { nomeBomba: chave, ladoA: [], ladoB: [] });
      }
      const g = grupos.get(chave)!;
      if (b.lado === 'B') {
        g.ladoB.push(b);
      } else {
        g.ladoA.push(b);
      }
    });

    return Array.from(grupos.values()).filter(
      (g) => filtroBomba === 'TODAS' || g.nomeBomba === filtroBomba
    );
  }, [bicos, diagnosticosMap, filtroBomba, filtroStatusDiag]);

  const nomesBombas = useMemo(() => {
    return Array.from(new Set(bicos.map((b) => b.bomba || 'Bomba 01 (Sêxtupla - Ilha 01)')));
  }, [bicos]);

  // Resumo Geral da Pista
  const resumoDiagnostico = useMemo(() => {
    let calibrados = 0;
    let deriva = 0;
    let criticos = 0;
    let pendentes = 0;

    diagnosticosMap.forEach((d) => {
      if (d.statusDiagnostico === 'CALIBRADO') calibrados++;
      else if (d.statusDiagnostico === 'DERIVA_LIMITE') deriva++;
      else if (d.statusDiagnostico === 'FORA_INMETRO') criticos++;
      else pendentes++;
    });

    return { calibrados, deriva, criticos, pendentes, total: bicos.length };
  }, [diagnosticosMap, bicos.length]);

  const bicoSelecionadoDiag = useMemo(() => {
    if (selectedBicoId && diagnosticosMap.has(selectedBicoId)) {
      return diagnosticosMap.get(selectedBicoId)!;
    }
    const primeiro = bicos[0];
    return primeiro ? diagnosticosMap.get(primeiro.id) || null : null;
  }, [selectedBicoId, diagnosticosMap, bicos]);

  // Renderizador do Desenho Técnico Interativo da Bomba Sêxtupla (3 Bicos Lado A | 3 Bicos Lado B)
  const renderDesenhoBombaSextupla = (
    nomeBomba: string,
    indiceBomba: number,
    ladoA: Bico[],
    ladoB: Bico[]
  ) => {
    // Determinar o bico em destaque no visor desta bomba
    const todosDestaBomba = [...ladoA, ...ladoB];
    const bicoVisor =
      todosDestaBomba.find((b) => b.id === bicoSelecionadoDiag?.bico.id) ||
      todosDestaBomba[0] ||
      null;
    const diagVisor = bicoVisor ? diagnosticosMap.get(bicoVisor.id) : null;
    const precoVisor = bicoVisor ? calcularPrecoEfetivoBico(bicoVisor).precoFinal : 5.89;
    const volVisor = diagVisor?.ultimaAfericao ? diagVisor.ultimaAfericao.volumeAferido : 20.0;
    const totalReaisVisor = volVisor * precoVisor;

    // Montar os 3 slots do Lado A e 3 slots do Lado B para o desenho da bomba
    const slotsA = [0, 1, 2].map((idx) => ladoA[idx] || null);
    const slotsB = [0, 1, 2].map((idx) => ladoB[idx] || null);

    return (
      <div className="w-full max-w-[280px] mx-auto flex flex-col items-center select-none">
        {/* Testeira / Cabeçote Superior da Bomba */}
        <div className="w-[92%] bg-gradient-to-b from-amber-500 to-amber-600 text-slate-950 rounded-t-2xl border-2 border-b-0 border-slate-800 px-3 py-2 text-center shadow-md relative overflow-hidden">
          <div className="text-[9px] font-mono font-extrabold uppercase tracking-widest text-amber-950/80">
            BOMBA SÊXTUPLA • 6 BICOS (3A | 3B)
          </div>
          <div className="text-xs font-black tracking-tight text-slate-950 truncate">
            {nomeBomba.split('(')[0].trim() || `BOMBA 0${indiceBomba + 1}`}
          </div>
        </div>

        {/* Gabinete Principal Metálico da Bomba */}
        <div className="w-full bg-slate-900 rounded-2xl border-2 border-slate-700 shadow-xl p-3 text-white relative">
          {/* Painel Eletrônico LCD da Bomba */}
          <div className="bg-slate-950 border-2 border-slate-700 rounded-xl p-2.5 font-mono space-y-1.5 shadow-inner">
            <div className="flex items-center justify-between text-[9px] text-slate-400 border-b border-slate-800 pb-1">
              <span className="font-bold text-amber-400">
                VISOR {nomeBomba.split('(')[0].trim().toUpperCase()}
              </span>
              <span className="text-emerald-400 font-bold">
                {bicoVisor
                  ? `BICO #${String(bicoVisor.numero).padStart(2, '0')} (LADO ${bicoVisor.lado})`
                  : '6 BICOS'}
              </span>
            </div>

            {/* Total R$ Simulado na Bomba */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-1 flex items-center justify-between">
              <span className="text-[8px] text-slate-400 uppercase">TOTAL R$</span>
              <span className="text-xs font-bold text-amber-300 tabular-nums">
                { totalReaisVisor.toFixed(2) }
              </span>
            </div>

            {/* Volume Aferido no Balde 20L */}
            <div className="bg-emerald-950/60 border border-emerald-700/60 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
              <div className="text-left">
                <span className="text-[8px] text-emerald-400/90 uppercase block leading-none">
                  LITROS (20L)
                </span>
                <span className="text-[9px] text-emerald-500/80 font-sans">Balde Inmetro</span>
              </div>
              <div className="text-base font-extrabold text-emerald-300 tabular-nums tracking-tight">
                {volVisor.toFixed(3)} L
              </div>
            </div>

            {/* Desvio Apurado em ml */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 flex items-center justify-between">
              <span className="text-[8px] text-slate-400 uppercase">DESVIO ÚLT. AFERIÇÃO</span>
              <span
                className={`text-xs font-extrabold tabular-nums ${
                  diagVisor?.desvioMl === null || diagVisor?.desvioMl === undefined
                    ? 'text-slate-400'
                    : Math.abs(diagVisor.desvioMl) > 100
                    ? 'text-red-400'
                    : Math.abs(diagVisor.desvioMl) >= 65
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {diagVisor?.desvioMl !== null && diagVisor?.desvioMl !== undefined
                  ? `${diagVisor.desvioMl > 0 ? `+${diagVisor.desvioMl}` : diagVisor.desvioMl} ml`
                  : 'PENDENTE'}
              </span>
            </div>
          </div>

          {/* Desenho SVG da Bomba com 3 Bicos e 3 Mangueiras de Cada Lado (Lado A = Esquerda, Lado B = Direita) */}
          <div className="mt-3 bg-slate-950/70 rounded-xl border border-slate-800 p-2">
            <div className="flex items-center justify-between text-[9px] font-mono font-bold text-slate-400 px-1 mb-1">
              <span className="text-amber-400">◀ 3 BICOS LADO A</span>
              <span className="text-slate-500">BLOCO HIDRÁULICO</span>
              <span className="text-sky-400">3 BICOS LADO B ▶</span>
            </div>

            <svg
              viewBox="0 0 240 215"
              className="w-full h-auto overflow-visible"
              aria-label={`Desenho da ${nomeBomba} com 3 bicos no Lado A e 3 bicos no Lado B`}
            >
              {/* Coluna Hidráulica Central da Bomba */}
              <rect
                x="68"
                y="6"
                width="104"
                height="186"
                rx="8"
                fill="#1e293b"
                stroke="#475569"
                strokeWidth="2"
              />

              {/* Divisória Vertical Interna Lado A | Lado B */}
              <line
                x1="120"
                y1="14"
                x2="120"
                y2="184"
                stroke="#334155"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />

              {/* Cabeçalho Interno A | B */}
              <text
                x="94"
                y="20"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="8"
                fontWeight="bold"
                fontFamily="monospace"
              >
                LADO A
              </text>
              <text
                x="146"
                y="20"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="8"
                fontWeight="bold"
                fontFamily="monospace"
              >
                LADO B
              </text>

              {/* Renderizar os 3 Bicos + Mangueiras do LADO A (Esquerda) */}
              {slotsA.map((bico, idx) => {
                const yBase = 38 + idx * 52; // Posições Y: 38, 90, 142
                const cores = bico
                  ? obterCoresCombustivel(bico.produto)
                  : { hoseColor: '#475569', nozzleFill: '#334155', sigla: '--' };
                const diag = bico ? diagnosticosMap.get(bico.id) : null;
                const isSelected = bico && bicoSelecionadoDiag?.bico.id === bico.id;

                const statusColor = !diag || diag.statusDiagnostico === 'PENDENTE'
                  ? '#94a3b8'
                  : diag.statusDiagnostico === 'FORA_INMETRO'
                  ? '#ef4444'
                  : diag.statusDiagnostico === 'DERIVA_LIMITE'
                  ? '#f59e0b'
                  : '#10b981';

                return (
                  <g
                    key={`lado-a-slot-${idx}`}
                    onClick={() => bico && onSelectBico(bico.id)}
                    className={bico ? 'cursor-pointer' : ''}
                  >
                    {/* Mangueira Curva saindo da bomba para o Lado A (Esquerda) */}
                    <path
                      d={`M 68 ${yBase + 12} C 35 ${yBase + 12}, 32 ${yBase + 32}, 2 ${yBase + 16}`}
                      fill="none"
                      stroke={cores.hoseColor}
                      strokeWidth={isSelected ? '5' : '3.5'}
                      strokeLinecap="round"
                    />

                    {/* Suporte / Gatilho do Bico na Lateral Esquerda da Bomba */}
                    <rect
                      x="42"
                      y={yBase - 4}
                      width="28"
                      height="30"
                      rx="5"
                      fill={isSelected ? '#f8fafc' : '#0f172a'}
                      stroke={cores.hoseColor}
                      strokeWidth={isSelected ? '2.5' : '1.8'}
                    />

                    {/* Desenho da Ponteira do Bico (Nozzle Gun) apontando para a esquerda */}
                    <path
                      d={`M 42 ${yBase + 6} L 26 ${yBase + 2} L 24 ${yBase + 7} L 42 ${yBase + 13} Z`}
                      fill={cores.hoseColor}
                    />

                    {/* Número do Bico dentro do suporte lateral */}
                    <text
                      x="56"
                      y={yBase + 10}
                      textAnchor="middle"
                      fill={isSelected ? '#0f172a' : '#f8fafc'}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {bico ? `B${String(bico.numero).padStart(2, '0')}` : `A${idx + 1}`}
                    </text>
                    <text
                      x="56"
                      y={yBase + 20}
                      textAnchor="middle"
                      fill={isSelected ? '#334155' : '#94a3b8'}
                      fontSize="7"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {cores.sigla}
                    </text>

                    {/* Bloco Medidor Interno Lado A */}
                    <rect
                      x="75"
                      y={yBase - 2}
                      width="38"
                      height="26"
                      rx="4"
                      fill="#0f172a"
                      stroke={isSelected ? '#fbbf24' : '#334155'}
                      strokeWidth="1.2"
                    />
                    <circle cx="83" cy={yBase + 7} r="3" fill={statusColor} />
                    <text
                      x="97"
                      y={yBase + 9}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="7"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {idx + 1}º A
                    </text>
                    <text
                      x="94"
                      y={yBase + 19}
                      textAnchor="middle"
                      fill={statusColor}
                      fontSize="7.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {diag?.desvioMl !== null && diag?.desvioMl !== undefined
                        ? `${diag.desvioMl > 0 ? `+${diag.desvioMl}` : diag.desvioMl}ml`
                        : '---'}
                    </text>
                  </g>
                );
              })}

              {/* Renderizar os 3 Bicos + Mangueiras do LADO B (Direita) */}
              {slotsB.map((bico, idx) => {
                const yBase = 38 + idx * 52; // Posições Y: 38, 90, 142
                const cores = bico
                  ? obterCoresCombustivel(bico.produto)
                  : { hoseColor: '#475569', nozzleFill: '#334155', sigla: '--' };
                const diag = bico ? diagnosticosMap.get(bico.id) : null;
                const isSelected = bico && bicoSelecionadoDiag?.bico.id === bico.id;

                const statusColor = !diag || diag.statusDiagnostico === 'PENDENTE'
                  ? '#94a3b8'
                  : diag.statusDiagnostico === 'FORA_INMETRO'
                  ? '#ef4444'
                  : diag.statusDiagnostico === 'DERIVA_LIMITE'
                  ? '#f59e0b'
                  : '#10b981';

                return (
                  <g
                    key={`lado-b-slot-${idx}`}
                    onClick={() => bico && onSelectBico(bico.id)}
                    className={bico ? 'cursor-pointer' : ''}
                  >
                    {/* Mangueira Curva saindo da bomba para o Lado B (Direita) */}
                    <path
                      d={`M 172 ${yBase + 12} C 205 ${yBase + 12}, 208 ${yBase + 32}, 238 ${yBase + 16}`}
                      fill="none"
                      stroke={cores.hoseColor}
                      strokeWidth={isSelected ? '5' : '3.5'}
                      strokeLinecap="round"
                    />

                    {/* Suporte / Gatilho do Bico na Lateral Direita da Bomba */}
                    <rect
                      x="170"
                      y={yBase - 4}
                      width="28"
                      height="30"
                      rx="5"
                      fill={isSelected ? '#f8fafc' : '#0f172a'}
                      stroke={cores.hoseColor}
                      strokeWidth={isSelected ? '2.5' : '1.8'}
                    />

                    {/* Desenho da Ponteira do Bico (Nozzle Gun) apontando para a direita */}
                    <path
                      d={`M 198 ${yBase + 6} L 214 ${yBase + 2} L 216 ${yBase + 7} L 198 ${yBase + 13} Z`}
                      fill={cores.hoseColor}
                    />

                    {/* Número do Bico dentro do suporte lateral */}
                    <text
                      x="184"
                      y={yBase + 10}
                      textAnchor="middle"
                      fill={isSelected ? '#0f172a' : '#f8fafc'}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {bico ? `B${String(bico.numero).padStart(2, '0')}` : `B${idx + 1}`}
                    </text>
                    <text
                      x="184"
                      y={yBase + 20}
                      textAnchor="middle"
                      fill={isSelected ? '#334155' : '#94a3b8'}
                      fontSize="7"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {cores.sigla}
                    </text>

                    {/* Bloco Medidor Interno Lado B */}
                    <rect
                      x="127"
                      y={yBase - 2}
                      width="38"
                      height="26"
                      rx="4"
                      fill="#0f172a"
                      stroke={isSelected ? '#fbbf24' : '#334155'}
                      strokeWidth="1.2"
                    />
                    <circle cx="157" cy={yBase + 7} r="3" fill={statusColor} />
                    <text
                      x="142"
                      y={yBase + 9}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="7"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {idx + 1}º B
                    </text>
                    <text
                      x="146"
                      y={yBase + 19}
                      textAnchor="middle"
                      fill={statusColor}
                      fontSize="7.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {diag?.desvioMl !== null && diag?.desvioMl !== undefined
                        ? `${diag.desvioMl > 0 ? `+${diag.desvioMl}` : diag.desvioMl}ml`
                        : '---'}
                    </text>
                  </g>
                );
              })}

              {/* Pedestal / Ilha de Concreto na Base da Bomba */}
              <rect
                x="46"
                y="192"
                width="148"
                height="16"
                rx="4"
                fill="#334155"
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <text
                x="120"
                y="203"
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="7.5"
                fontWeight="bold"
                fontFamily="monospace"
              >
                ILHA 0{indiceBomba + 1} • INMETRO ±100ml
              </text>
            </svg>
          </div>
        </div>
      </div>
    );
  };

  // Renderizador de Card Visual de Bico (Lado A ou Lado B)
  const renderCardBico = (bico: Bico, lado: 'A' | 'B', posicaoIdx: number) => {
    const diag = diagnosticosMap.get(bico.id)!;
    const cores = obterCoresCombustivel(bico.produto);
    const isSelected = bicoSelecionadoDiag?.bico.id === bico.id;
    const precoInfo = calcularPrecoEfetivoBico(bico);

    // Posição na mini régua (-150 a +150 ml)
    const desvioClamp = diag.desvioMl !== null ? Math.min(Math.max(diag.desvioMl, -150), 150) : 0;
    const pctPosicao = ((desvioClamp + 150) / 300) * 100;

    const statusBadge = () => {
      switch (diag.statusDiagnostico) {
        case 'CALIBRADO':
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded border border-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              CONFORME
            </span>
          );
        case 'DERIVA_LIMITE':
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
              <AlertTriangle className="w-3 h-3 text-amber-700" />
              LIMÍTROFE
            </span>
          );
        case 'FORA_INMETRO':
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-900 bg-red-100 px-2 py-0.5 rounded border border-red-300 animate-pulse">
              <XCircle className="w-3 h-3 text-red-700" />
              FORA ±100ml
            </span>
          );
        default:
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
              <Clock className="w-3 h-3 text-slate-500" />
              PENDENTE
            </span>
          );
      }
    };

    return (
      <div
        key={bico.id}
        onClick={() => onSelectBico(bico.id)}
        className={`group relative rounded-xl border transition-all cursor-pointer select-none bg-white ${
          isSelected
            ? 'border-slate-900 ring-2 ring-slate-900/15 shadow-md'
            : diag.statusDiagnostico === 'FORA_INMETRO'
            ? 'border-red-300 hover:border-red-400 shadow-xs'
            : diag.statusDiagnostico === 'DERIVA_LIMITE'
            ? 'border-amber-300 hover:border-amber-400 shadow-xs'
            : 'border-slate-200 hover:border-slate-300 shadow-2xs'
        }`}
      >
        {/* Conector visual da mangueira em direção ao desenho central da bomba (Desktop) */}
        <div
          className={`hidden xl:flex items-center absolute top-1/2 -translate-y-1/2 z-0 pointer-events-none ${
            lado === 'A' ? '-right-4 flex-row' : '-left-4 flex-row-reverse'
          }`}
        >
          <div
            className="w-3 h-3 rounded-full border-2 border-white shadow-xs"
            style={{ backgroundColor: cores.hoseColor }}
          />
          <div
            className="w-2.5 h-1"
            style={{ backgroundColor: cores.hoseColor }}
          />
        </div>

        {/* Faixa Superior Colorida por Combustível */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/80 rounded-t-xl">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-lg ${cores.bgHeader} text-white font-mono font-extrabold text-xs flex items-center justify-center shadow-2xs shrink-0`}
            >
              {String(bico.numero).padStart(2, '0')}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-slate-900 truncate">
                  Bico {bico.numero}
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 bg-slate-200/80 text-slate-700 rounded">
                  {posicaoIdx + 1}º Lado {bico.lado}
                </span>
              </div>
              <div className="text-[10px] font-bold tracking-wide text-slate-500 truncate">
                {bico.produto}
              </div>
            </div>
          </div>

          {statusBadge()}
        </div>

        {/* Corpo de Leitura Metrológica da Última Aferição */}
        <div className="p-3 space-y-2">
          {diag.ultimaAfericao && diag.desvioMl !== null ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                    Último Balde 20L
                  </span>
                  <span className="text-sm font-mono font-extrabold text-slate-900 tabular-nums">
                    {diag.ultimaAfericao.volumeAferido.toFixed(3)} L
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                    Desvio Inmetro
                  </span>
                  <span
                    className={`text-base font-mono font-extrabold tabular-nums ${
                      diag.statusDiagnostico === 'FORA_INMETRO'
                        ? 'text-red-700'
                        : diag.statusDiagnostico === 'DERIVA_LIMITE'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {diag.desvioMl > 0 ? `+${diag.desvioMl}` : diag.desvioMl} ml
                  </span>
                </div>
              </div>

              {/* Mini-Régua Metrológica Visual (-100ml | 0 | +100ml) */}
              <div className="space-y-1">
                <div className="relative h-2 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex">
                  <div className="w-[16.66%] bg-red-200/80 border-r border-red-300" />
                  <div className="w-[66.68%] bg-emerald-100/90 relative">
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-emerald-600/50" />
                  </div>
                  <div className="w-[16.66%] bg-red-200/80 border-l border-red-300" />

                  <div
                    style={{ left: `${Math.min(Math.max(pctPosicao, 3), 97)}%` }}
                    className="absolute top-0 bottom-0 -translate-x-1/2 w-2 flex items-center justify-center"
                  >
                    <span
                      className={`w-2 h-2 rounded-full border border-white shadow-xs ${
                        diag.statusDiagnostico === 'FORA_INMETRO'
                          ? 'bg-red-600'
                          : diag.statusDiagnostico === 'DERIVA_LIMITE'
                          ? 'bg-amber-600'
                          : 'bg-emerald-700'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-[9px] font-mono text-slate-400 tabular-nums">
                  <span>-100ml</span>
                  <span className="text-slate-500 font-semibold">0ml</span>
                  <span>+100ml</span>
                </div>
              </div>
            </>
          ) : (
            <div className="py-2 px-3 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center">
              <div className="text-[11px] font-semibold text-slate-600">
                Nenhuma aferição registrada
              </div>
              <div className="text-[10px] text-slate-400">
                Clique em &ldquo;Aferir 20L&rdquo; para testar este bico
              </div>
            </div>
          )}

          {/* Rodapé do Bico: Data/Hora + Botão Rápido de Aferição */}
          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
            <div className="text-[10px] text-slate-500 font-mono truncate">
              {diag.ultimaAfericao ? (
                <span>
                  {diag.ultimaAfericao.data.slice(5)} às {diag.ultimaAfericao.hora}
                </span>
              ) : (
                <span>{formatarPrecoLitro(precoInfo.precoFinal, 2)}/L</span>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectBico(bico.id);
                onAbrirModalAfericao(bico.id);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white border border-amber-200 hover:border-amber-600 transition"
              title="Registrar nova aferição de 20L neste bico"
            >
              <Gauge className="w-3 h-3" />
              <span>Aferir 20L</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (bicos.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
              <Fuel className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Desenho das 2 Bombas (3 Bicos Lado A • 3 Bicos Lado B)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Dados de demonstração limpos. As 2 bombas sêxtuplas estão prontas para receber o cadastro real dos bicos na nuvem 24h.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {onGerarPistaPadrao && (
              <button
                type="button"
                onClick={onGerarPistaPadrao}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
              >
                <Fuel className="w-4 h-4 text-amber-400" />
                <span>Ativar 12 Bicos Limpos (Sem Dados Demo)</span>
              </button>
            )}
            <button
              type="button"
              onClick={onAbrirModalNovoBico}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Bico Individual</span>
            </button>
          </div>
        </div>

        {/* Visualização constante do Desenho das 2 Bombas com 3 Bicos de Cada Lado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {['Bomba 01 (Sêxtupla - Ilha 01)', 'Bomba 02 (Sêxtupla - Ilha 02)'].map(
            (nomeBomba, idxBomba) => (
              <div
                key={nomeBomba}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
              >
                <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 flex items-center justify-center">
                      <Fuel className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{nomeBomba}</div>
                      <div className="text-[11px] text-slate-400">
                        3 Bicos Lado A (Esquerda) • 3 Bicos Lado B (Direita)
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                    Nuvem 24h
                  </span>
                </div>
                <div className="p-5 bg-slate-50 flex flex-col items-center justify-center">
                  {renderDesenhoBombaSextupla(nomeBomba, idxBomba, [], [])}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Barra de Indicadores de Saúde Metrológica das 2 Bombas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() =>
            setFiltroStatusDiag(filtroStatusDiag === 'CALIBRADO' ? 'TODOS' : 'CALIBRADO')
          }
          className={`p-4 rounded-xl border text-left transition ${
            filtroStatusDiag === 'CALIBRADO'
              ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
            <span>Bicos Calibrados (OK)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1 tabular-nums">
            {resumoDiagnostico.calibrados}
            <span className="text-xs font-normal text-slate-400 ml-1">
              / {resumoDiagnostico.total}
            </span>
          </div>
          <span className="text-[11px] text-emerald-700 block mt-0.5">
            Desvio seguro (&le; ±60 ml)
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFiltroStatusDiag(filtroStatusDiag === 'DERIVA_LIMITE' ? 'TODOS' : 'DERIVA_LIMITE')
          }
          className={`p-4 rounded-xl border text-left transition ${
            filtroStatusDiag === 'DERIVA_LIMITE'
              ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-amber-800">
            <span>Em Alerta de Deriva</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-amber-700 mt-1 tabular-nums">
            {resumoDiagnostico.deriva}
          </div>
          <span className="text-[11px] text-amber-700 block mt-0.5">
            Próximo ao limite (±65 a ±100 ml)
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFiltroStatusDiag(filtroStatusDiag === 'FORA_INMETRO' ? 'TODOS' : 'FORA_INMETRO')
          }
          className={`p-4 rounded-xl border text-left transition ${
            filtroStatusDiag === 'FORA_INMETRO'
              ? 'bg-red-50 border-red-500 ring-1 ring-red-500'
              : 'bg-white border-slate-200 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-red-800">
            <span>Críticos / Fora Inmetro</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-red-600 mt-1 tabular-nums">
            {resumoDiagnostico.criticos}
          </div>
          <span className="text-[11px] text-red-600 block mt-0.5">
            Excede ±100 ml (Requer ajuste)
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFiltroStatusDiag(filtroStatusDiag === 'PENDENTE' ? 'TODOS' : 'PENDENTE')
          }
          className={`p-4 rounded-xl border text-left transition ${
            filtroStatusDiag === 'PENDENTE'
              ? 'bg-slate-100 border-slate-500 ring-1 ring-slate-500'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Aferição Pendente</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-slate-800 mt-1 tabular-nums">
            {resumoDiagnostico.pendentes}
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Sem medição registrada
          </span>
        </button>
      </div>

      {/* 2. Barra de Seleção das 2 Bombas (Ilha 01 e Ilha 02) e Padronização */}
      <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500 mr-1">Visualizar Bombas:</span>
          <button
            type="button"
            onClick={() => setFiltroBomba('TODAS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filtroBomba === 'TODAS'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            As 2 Bombas ({bicos.length} Bicos)
          </button>
          {nomesBombas.map((nome) => (
            <button
              key={nome}
              type="button"
              onClick={() => setFiltroBomba(nome)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filtroBomba === nome
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {nome}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {filtroStatusDiag !== 'TODOS' && (
            <button
              type="button"
              onClick={() => setFiltroStatusDiag('TODOS')}
              className="text-xs font-semibold text-blue-600 hover:underline mr-2"
            >
              Mostrar todos ({bicos.length} bicos)
            </button>
          )}

          {onGerarPistaPadrao && (
            <button
              type="button"
              onClick={onGerarPistaPadrao}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition"
              title="Restaurar configuração padrão: 2 Bombas com 3 bicos no Lado A e 3 bicos no Lado B (12 bicos)"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
              <span>Padrão 2 Bombas (3 Bicos/Lado)</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Grid Principal: Desenho das 2 Bombas (3 Bicos Lado A + 3 Bicos Lado B) + Painel de Diagnóstico */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna 1: Diagrama das 2 Bombas Sêxtuplas (8 colunas no desktop) */}
        <div className="lg:col-span-8 space-y-6">
          {bombasAgrupadas.map((bomba, idxBomba) => {
            const todosBicosBomba = [...bomba.ladoA, ...bomba.ladoB];
            const temCritico = todosBicosBomba.some(
              (b) => diagnosticosMap.get(b.id)?.statusDiagnostico === 'FORA_INMETRO'
            );
            const temDeriva = todosBicosBomba.some(
              (b) => diagnosticosMap.get(b.id)?.statusDiagnostico === 'DERIVA_LIMITE'
            );

            return (
              <div
                key={bomba.nomeBomba}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
              >
                {/* Cabeçalho da Bomba (Bomba 01 / Bomba 02) */}
                <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-300 flex items-center justify-center font-mono font-bold">
                      <Fuel className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm tracking-wide text-white">
                          {bomba.nomeBomba}
                        </h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700 font-bold">
                          {bomba.ladoA.length} Bicos Lado A • {bomba.ladoB.length} Bicos Lado B
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Bomba Sêxtupla: 3 bicos à esquerda (Lado A) e 3 bicos à direita (Lado B)
                      </p>
                    </div>
                  </div>

                  <div>
                    {temCritico ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                        <XCircle className="w-3.5 h-3.5" />
                        Requer Manutenção
                      </span>
                    ) : temDeriva ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Monitorar Deriva
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Bomba Conforme
                      </span>
                    )}
                  </div>
                </div>

                {/* Corpo do Esquema: [LADO A: 3 BICOS] — [DESENHO DA BOMBA COM 6 MANGUEIRAS] — [LADO B: 3 BICOS] */}
                <div className="p-3.5 sm:p-5 bg-slate-50/70">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    {/* LADO A DA BOMBA (1 coluna no tablet/desktop -> 3 Bicos empilhados) */}
                    <div className="flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-950">
                          ◀ Lado A (Esquerda)
                        </span>
                        <span className="text-[10px] font-mono font-bold text-amber-900 bg-amber-200/70 px-1.5 py-0.5 rounded">
                          {bomba.ladoA.length} de 3 bicos
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {bomba.ladoA.map((bico, idx) => renderCardBico(bico, 'A', idx))}
                      </div>
                    </div>

                    {/* DESENHO CENTRAL DA BOMBA DE COMBUSTÍVEL COM 3 BICOS DE CADA LADO (1 coluna) */}
                    <div className="flex items-center justify-center py-2">
                      {renderDesenhoBombaSextupla(
                        bomba.nomeBomba,
                        idxBomba,
                        bomba.ladoA,
                        bomba.ladoB
                      )}
                    </div>

                    {/* LADO B DA BOMBA (1 coluna -> 3 Bicos empilhados) */}
                    <div className="flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30">
                        <span className="text-[10px] font-mono font-bold text-sky-900 bg-sky-200/70 px-1.5 py-0.5 rounded">
                          {bomba.ladoB.length} de 3 bicos
                        </span>
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-950">
                          Lado B (Direita) ▶
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {bomba.ladoB.map((bico, idx) => renderCardBico(bico, 'B', idx))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Coluna 2: Painel de Diagnóstico Metrológico e Acompanhamento do Bico Selecionado (4 colunas) */}
        <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
          {bicoSelecionadoDiag ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Cabeçalho do Bico em Diagnóstico */}
              <div className="bg-slate-900 text-white p-5 border-b border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl ${
                        obterCoresCombustivel(bicoSelecionadoDiag.bico.produto).bgHeader
                      } text-white font-mono font-extrabold text-lg flex items-center justify-center shadow-md`}
                    >
                      #{String(bicoSelecionadoDiag.bico.numero).padStart(2, '0')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                          Lado {bicoSelecionadoDiag.bico.lado}
                        </span>
                        <span className="text-xs text-slate-300 font-medium truncate">
                          {bicoSelecionadoDiag.bico.bomba}
                        </span>
                      </div>
                      <h3 className="text-base font-extrabold text-white mt-1">
                        Bico {bicoSelecionadoDiag.bico.numero} — {bicoSelecionadoDiag.bico.produto}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Botões Diretos de Ação no Bico */}
                <div className="grid grid-cols-2 gap-2.5 mt-4">
                  <button
                    type="button"
                    onClick={() => onAbrirModalAfericao(bicoSelecionadoDiag.bico.id)}
                    className="py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Gauge className="w-4 h-4" />
                    <span>Nova Aferição 20L</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAbrirModalPreco(bicoSelecionadoDiag.bico)}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Ajustar Preço / Desc.</span>
                  </button>
                </div>
              </div>

              {/* Parecer de Diagnóstico Técnico */}
              <div className="p-5 space-y-5">
                <div
                  className={`p-4 rounded-xl border ${
                    bicoSelecionadoDiag.statusDiagnostico === 'FORA_INMETRO'
                      ? 'bg-red-50 border-red-200 text-red-950'
                      : bicoSelecionadoDiag.statusDiagnostico === 'DERIVA_LIMITE'
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : bicoSelecionadoDiag.statusDiagnostico === 'CALIBRADO'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {bicoSelecionadoDiag.statusDiagnostico === 'FORA_INMETRO' ? (
                      <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    ) : bicoSelecionadoDiag.statusDiagnostico === 'DERIVA_LIMITE' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    ) : bicoSelecionadoDiag.statusDiagnostico === 'CALIBRADO' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="font-bold text-xs uppercase tracking-wide">
                        Diagnóstico Técnico: {bicoSelecionadoDiag.tituloDiagnostico}
                      </div>
                      <p className="text-xs leading-relaxed opacity-90">
                        {bicoSelecionadoDiag.recomendacao}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Métricas de Impacto Operacional e Financeiro por 1.000 L */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Impacto a cada 1.000 L
                    </span>
                    <div
                      className={`text-sm font-mono font-extrabold mt-1 tabular-nums ${
                        bicoSelecionadoDiag.perdaOuSobraPor1000L > 0
                          ? 'text-amber-700'
                          : bicoSelecionadoDiag.perdaOuSobraPor1000L < 0
                          ? 'text-blue-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {bicoSelecionadoDiag.perdaOuSobraPor1000L > 0
                        ? `+${bicoSelecionadoDiag.perdaOuSobraPor1000L} L entregues`
                        : bicoSelecionadoDiag.perdaOuSobraPor1000L < 0
                        ? `${bicoSelecionadoDiag.perdaOuSobraPor1000L} L retidos`
                        : '0,00 L (Neutro)'}
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {bicoSelecionadoDiag.impactoFinanceiroPor1000L !== 0
                        ? `${formatarMoeda(Math.abs(bicoSelecionadoDiag.impactoFinanceiroPor1000L))} / 1.000L vendidos`
                        : 'Sem perda financeira por desvio'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Estabilidade / Deriva
                    </span>
                    <div className="text-sm font-mono font-extrabold text-slate-900 mt-1 tabular-nums flex items-center gap-1">
                      {bicoSelecionadoDiag.tendenciaMl !== null ? (
                        <>
                          {bicoSelecionadoDiag.tendenciaMl > 0 ? (
                            <TrendingUp className="w-4 h-4 text-amber-600" />
                          ) : bicoSelecionadoDiag.tendenciaMl < 0 ? (
                            <TrendingDown className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Activity className="w-4 h-4 text-emerald-600" />
                          )}
                          <span>
                            {bicoSelecionadoDiag.tendenciaMl > 0
                              ? `+${bicoSelecionadoDiag.tendenciaMl} ml`
                              : `${bicoSelecionadoDiag.tendenciaMl} ml`}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs font-sans font-semibold text-slate-500">
                          {bicoSelecionadoDiag.historicoBico.length === 1
                            ? '1ª leitura base'
                            : 'Sem histórico'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Variação face à penúltima aferição
                    </span>
                  </div>
                </div>

                {/* Acompanhamento: Linha do Tempo das Últimas Aferições deste Bico */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-slate-400" />
                      Histórico do Bico ({bicoSelecionadoDiag.historicoBico.length})
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400">Padrão 20,000 L</span>
                  </div>

                  {bicoSelecionadoDiag.historicoBico.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-400">
                      Nenhuma aferição anterior para o Bico {bicoSelecionadoDiag.bico.numero}.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {bicoSelecionadoDiag.historicoBico.slice(0, 5).map((af, idx) => {
                        const ml = Math.round(af.diferenca * 1000);
                        const tol = Math.round((af.toleranciaConfigurada || 0.1) * 1000);
                        const ok = Math.abs(ml) <= tol;
                        const resp =
                          funcionarios.find((f) => f.id === af.funcionarioId)?.nome || 'Operador';

                        return (
                          <div
                            key={af.id}
                            className={`px-3.5 py-2.5 flex items-center justify-between text-xs ${
                              idx === 0 ? 'bg-slate-50/90 font-semibold' : 'bg-white'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-slate-800 tabular-nums">
                                  {af.data} • {af.hora}
                                </span>
                                {idx === 0 && (
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                                    Atual
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-normal">
                                Resp: {resp}
                              </div>
                            </div>

                            <div className="text-right font-mono tabular-nums">
                              <div className="text-slate-900 font-bold">
                                {af.volumeAferido.toFixed(3)} L
                              </div>
                              <div
                                className={`text-[11px] font-extrabold ${
                                  !ok
                                    ? 'text-red-600'
                                    : Math.abs(ml) >= 65
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                                }`}
                              >
                                {ml > 0 ? `+${ml}` : ml} ml
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
