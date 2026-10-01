import React, { useState } from 'react';
import {
  X,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Scale,
  Thermometer,
  ShieldCheck,
  Fuel,
  Info,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  PADROES_ANP_2026,
  gerarMatrizNBR5992,
  calcularCruzamentoDadosANP,
} from '../../utils/calculations';

interface ModalTabelaOficialANPProps {
  isOpen: boolean;
  onClose: () => void;
  produtoInicial?: string;
  temperaturaInicial?: number;
  densidadeInicial?: number;
}

export const ModalTabelaOficialANP: React.FC<ModalTabelaOficialANPProps> = ({
  isOpen,
  onClose,
  produtoInicial = 'Etanol',
  temperaturaInicial = 26.8,
  densidadeInicial = 0.804,
}) => {
  const [abaAtiva, setAbaAtiva] = useState<'ESPECIFICACOES' | 'MATRIZ_NBR' | 'CRUZAMENTO_NF'>(
    'MATRIZ_NBR'
  );

  // Estados da Matriz
  const [produtoSelecionado, setProdutoSelecionado] = useState<string>(
    produtoInicial.includes('Etanol')
      ? 'Etanol'
      : produtoInicial.includes('Premium')
      ? 'Gasolina Premium'
      : produtoInicial.includes('Gasolina')
      ? 'Gasolina Comum'
      : produtoInicial.includes('S-10') || produtoInicial.includes('S10')
      ? 'Diesel S-10'
      : 'Etanol'
  );
  const [temperaturaMatriz, setTemperaturaMatriz] = useState<number>(temperaturaInicial);
  const [densidadeMatriz, setDensidadeMatriz] = useState<number>(densidadeInicial);

  // Estados do Cruzamento de Dados (NF x Tanque x Proveta)
  const [nfDensidade, setNfDensidade] = useState<number>(809.5);
  const [tanqueDensidade, setTanqueDensidade] = useState<number>(809.0);
  const [provetaDensidade, setProvetaDensidade] = useState<number>(809.7);

  if (!isOpen) return null;

  // Gerar a matriz interativa NBR 5992
  const matriz = gerarMatrizNBR5992(produtoSelecionado, temperaturaMatriz, densidadeMatriz);

  // Cálculo de Cruzamento de Dados
  const resultadoCruzamento = calcularCruzamentoDadosANP(
    produtoSelecionado,
    nfDensidade,
    tanqueDensidade,
    provetaDensidade
  );

  const listaProdutosOficiais = [
    {
      nome: 'Gasolina C Comum',
      norma: 'Res. ANP 807/2020 & Lei 14.993/2024',
      faixaGCm3: '0,7150 - 0,7750',
      faixaKgM3: '715,0 - 775,0',
      requisitos: 'Etanol: 26,0% a 30,0% v/v (D32: 32%)',
      enxofre: '50 mg/kg',
      status: 'Conforme 2026',
    },
    {
      nome: 'Gasolina C Aditivada',
      norma: 'Res. ANP 807/2020 & Lei 14.993/2024',
      faixaGCm3: '0,7150 - 0,7750',
      faixaKgM3: '715,0 - 775,0',
      requisitos: 'Etanol: 26,0% a 30,0% v/v + Deterg.',
      enxofre: '50 mg/kg',
      status: 'Conforme 2026',
    },
    {
      nome: 'Gasolina Premium',
      norma: 'Res. ANP 807/2020 & Lei 14.993/2024',
      faixaGCm3: '0,7700 - 0,8000',
      faixaKgM3: '770,0 - 800,0',
      requisitos: 'Etanol: 25,0% a 30,0% v/v (98 RON)',
      enxofre: '50 mg/kg',
      status: 'Conforme 2026',
    },
    {
      nome: 'Etanol Hidratado Comum',
      norma: 'Res. ANP 907/2022',
      faixaGCm3: '0,8076 - 0,8110',
      faixaKgM3: '807,6 - 811,0',
      requisitos: 'Teor 92,5% - 93,8% °INPM',
      enxofre: 'Isento',
      status: 'Conforme 2026',
    },
    {
      nome: 'Etanol Hidratado Aditivado',
      norma: 'Res. ANP 907/2022',
      faixaGCm3: '0,8076 - 0,8110',
      faixaKgM3: '807,6 - 811,0',
      requisitos: 'Teor 92,5% - 93,8% °INPM + Adit.',
      enxofre: 'Isento',
      status: 'Conforme 2026',
    },
    {
      nome: 'Óleo Diesel S10 Comum',
      norma: 'Res. ANP 968/2024',
      faixaGCm3: '0,8200 - 0,8570',
      faixaKgM3: '820,0 - 857,0',
      requisitos: 'Biodiesel B15 (14%-15%)',
      enxofre: '10 mg/kg',
      status: 'Conforme 2026',
    },
    {
      nome: 'Óleo Diesel S10 Aditivado',
      norma: 'Res. ANP 968/2024',
      faixaGCm3: '0,8200 - 0,8570',
      faixaKgM3: '820,0 - 857,0',
      requisitos: 'Biodiesel B15 + Aditivo',
      enxofre: '10 mg/kg',
      status: 'Conforme 2026',
    },
    {
      nome: 'Óleo Diesel S500',
      norma: 'Res. ANP 968/2024',
      faixaGCm3: '0,8200 - 0,8700',
      faixaKgM3: '820,0 - 870,0',
      requisitos: 'Biodiesel B15 (Agro/Frota)',
      enxofre: '500 mg/kg',
      status: 'Conforme 2026',
    },
    {
      nome: 'Querosene de Aviação (QAV-1)',
      norma: 'Res. ANP 856/2021',
      faixaGCm3: '0,7750 - 0,8400',
      faixaKgM3: '775,0 - 840,0',
      requisitos: 'Aviação Comercial / Executiva',
      enxofre: '3.000 mg/kg',
      status: 'Vigente',
    },
    {
      nome: 'Óleo Diesel Marinho (DMA)',
      norma: 'Res. ANP 968/2024',
      faixaGCm3: '0,8200 - 0,8900',
      faixaKgM3: '820,0 - 890,0',
      requisitos: 'Uso Náutico e Marítimo',
      enxofre: '1.000 mg/kg',
      status: 'Vigente',
    },
  ];

  const handleImprimirLaudo = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho do Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider bg-teal-500/20 text-teal-400 border border-teal-500/30 uppercase">
                VIGÊNCIA 2026 - ANP
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                Normas ABNT NBR 5992 • ASTM D1250 • Res. ANP 907/2022
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-400" />
              Tabela Oficial Completa de Cruzamento & Verificação ANP
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleImprimirLaudo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm"
              title="Baixar ou Imprimir Laudo Oficial em PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Baixar / Imprimir PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Abas de Navegação */}
        <div className="px-4 pt-3 pb-0 bg-slate-900 border-b border-slate-800 flex flex-wrap gap-2 shrink-0">
          <button
            onClick={() => setAbaAtiva('MATRIZ_NBR')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-2 ${
              abaAtiva === 'MATRIZ_NBR'
                ? 'bg-slate-800 text-teal-400 border-teal-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            2. Matriz de Conversão D20 (ABNT)
          </button>

          <button
            onClick={() => setAbaAtiva('ESPECIFICACOES')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-2 ${
              abaAtiva === 'ESPECIFICACOES'
                ? 'bg-slate-800 text-teal-400 border-teal-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <Fuel className="w-3.5 h-3.5" />
            1. Especificações ANP 2026
          </button>

          <button
            onClick={() => setAbaAtiva('CRUZAMENTO_NF')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-2 ${
              abaAtiva === 'CRUZAMENTO_NF'
                ? 'bg-slate-800 text-teal-400 border-teal-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            3. Cruzamento de Dados (NF x Tanque x Proveta) [RESULTADO FINAL]
          </button>
        </div>

        {/* Conteúdo das Abas com Rolagem */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* ========================================================================= */}
          {/* ABA 2: MATRIZ DE CONVERSÃO D20 (ABNT NBR 5992)                             */}
          {/* ========================================================================= */}
          {abaAtiva === 'MATRIZ_NBR' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                    TABELA ABNT NBR 5992 — MATRIZ DE CRUZAMENTO TEMPERATURA X DENSIDADE
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cruzamento de temperatura observada (°C) vs densidade lida (D<sub>t</sub>) para
                    determinação automática da Massa Específica a 20°C (D<sub>20</sub>).
                  </p>
                </div>

                {/* Seletor Rápido de Combustível */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-semibold text-slate-400">Combustível:</span>
                  <select
                    value={produtoSelecionado}
                    onChange={(e) => setProdutoSelecionado(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-400 focus:outline-none"
                  >
                    <option value="Etanol">Etanol (Hidratado EHC)</option>
                    <option value="Gasolina Comum">Gasolina Comum</option>
                    <option value="Gasolina Premium">Gasolina Premium</option>
                    <option value="Diesel S-10">Diesel S-10</option>
                    <option value="Diesel S-500">Diesel S-500</option>
                  </select>
                </div>
              </div>

              {/* Parâmetros do Teste Atual em Pátio */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Densidade Medida Atual (D<sub>t</sub>):</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      step="0.001"
                      value={densidadeMatriz}
                      onChange={(e) => setDensidadeMatriz(parseFloat(e.target.value) || 0.804)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-xs w-28 text-white focus:outline-none focus:border-teal-400"
                    />
                    <span className="text-slate-400">g/cm³</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Temperatura da Amostra:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      value={temperaturaMatriz}
                      onChange={(e) => setTemperaturaMatriz(parseFloat(e.target.value) || 20)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-xs w-24 text-white focus:outline-none focus:border-teal-400"
                    />
                    <span className="text-slate-400">°C</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Faixa Regulamentar Vigente:</span>
                  <div className="mt-1 font-mono font-bold text-teal-400">
                    {(matriz.padrao.densidade20CMin * 1000).toFixed(1)} a{' '}
                    {(matriz.padrao.densidade20CMax * 1000).toFixed(1)} kg/m³
                  </div>
                  <span className="text-[10px] text-slate-500">{matriz.padrao.normaANP}</span>
                </div>
              </div>

              {/* Tabela Interativa NBR 5992 */}
              <div className="overflow-x-auto rounded-xl border border-slate-800 shadow-md">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-300 font-bold border-b border-slate-800">
                      <th className="py-2.5 px-3 text-left font-mono uppercase bg-slate-950/90 text-teal-300 border-r border-slate-800">
                        DENSIDADE LIDA (D<sub>t</sub>)
                      </th>
                      {matriz.temperaturas.map((temp) => (
                        <th
                          key={temp}
                          className={`py-2.5 px-3 font-mono ${
                            Math.abs(temp - temperaturaMatriz) <= 1.5
                              ? 'bg-teal-950/40 text-teal-300 border-b-2 border-b-teal-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {temp} °C
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono">
                    {matriz.linhas.map((linha, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition">
                        <td className="py-2 px-3 text-left font-bold text-slate-200 bg-slate-950/50 border-r border-slate-800">
                          {linha.densidadeLida.toFixed(4)} g/cm³
                        </td>
                        {linha.celulas.map((cel, cIdx) => (
                          <td
                            key={cIdx}
                            className={`py-2 px-2.5 transition relative ${
                              cel.isConforme
                                ? 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                                : 'bg-red-950/40 text-red-300 hover:bg-red-900/50'
                            } ${
                              cel.isCorrente
                                ? 'ring-2 ring-teal-400 font-black shadow-md z-10'
                                : ''
                            }`}
                          >
                            <div className="font-bold text-xs">{cel.d20.toFixed(4)}</div>
                            <div className="text-[10px] opacity-80">
                              ({cel.d20KgM3.toFixed(1)} kg/m³)
                            </div>
                            {cel.isCorrente && (
                              <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legenda Oficial */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-950/40 p-3 rounded-lg border border-slate-800 text-slate-400">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-emerald-900/60 border border-emerald-500 inline-block" />
                    <span>Conforme ANP ({matriz.padrao.densidade20CMin * 1000} - {matriz.padrao.densidade20CMax * 1000} kg/m³)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-red-950/60 border border-red-500 inline-block" />
                    <span>Não Conforme (Fora dos padrões)</span>
                  </div>
                </div>
                <div className="text-[11px] text-teal-400 font-medium">
                  Célula destacada com borda representa a amostra atual medida.
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 1: ESPECIFICAÇÕES ANP 2026 (TABELA COMPLETA OFICIAL DO PDF)           */}
          {/* ========================================================================= */}
          {abaAtiva === 'ESPECIFICACOES' && (
            <div className="space-y-4">
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                  QUADRO REGULATÓRIO OFICIAL DE COMBUSTÍVEIS AUTOMOTIVOS (ANP / 2026)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Limites máximos e mínimos de densidade a 20°C, teores de mistura obrigatórios e
                  especificações vigentes fiscalizadas no Brasil.
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 shadow-md">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-300 font-bold border-b border-slate-800 text-[11px]">
                      <th className="py-2.5 px-3">PRODUTO ANP</th>
                      <th className="py-2.5 px-3">NORMA REGULAMENTAR</th>
                      <th className="py-2.5 px-3">FAIXA D20 (g/cm³)</th>
                      <th className="py-2.5 px-3">FAIXA D20 (kg/m³)</th>
                      <th className="py-2.5 px-3">REQUISITOS / MISTURA</th>
                      <th className="py-2.5 px-3">ENXOFRE MÁX.</th>
                      <th className="py-2.5 px-3 text-center">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {listaProdutosOficiais.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`hover:bg-slate-800/40 transition ${
                          item.nome.includes('Etanol') ? 'bg-teal-950/20' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-bold text-white flex items-center gap-1.5">
                          {item.nome.includes('Etanol') && (
                            <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                          )}
                          {item.nome}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">{item.norma}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-teal-300">
                          {item.faixaGCm3}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-100">
                          {item.faixaKgM3}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-300 font-medium">
                          {item.requisitos}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                          {item.enxofre}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 3: CRUZAMENTO DE DADOS (NF x TANQUE x PROVETA)                        */}
          {/* ========================================================================= */}
          {abaAtiva === 'CRUZAMENTO_NF' && (
            <div className="space-y-5">
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                  CRUZAMENTO METROLÓGICO TRIPLO: NOTA FISCAL vs TANQUE vs PROVETA
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Conforme regulação ANP, a variação da densidade a 20°C entre a Nota Fiscal da
                  distribuidora e o ensaio da proveta no recebimento não pode exceder{' '}
                  <strong className="text-white font-mono">±5,0 kg/m³</strong> (±0,0050 g/cm³).
                </p>
              </div>

              {/* Painel com os 3 Dados de Entrada */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Nota Fiscal */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
                    <span>1. Nota Fiscal (NF-e)</span>
                    <span className="text-[10px] text-teal-400">Faturado</span>
                  </div>
                  <label className="block text-[11px] text-slate-400">
                    Densidade D20 indicada no Laudo/NF:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={nfDensidade}
                      onChange={(e) => setNfDensidade(parseFloat(e.target.value) || 0)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm font-bold text-white w-full focus:outline-none focus:border-teal-400"
                    />
                    <span className="text-xs text-slate-400 font-mono">kg/m³</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Equivalente: {(nfDensidade / 1000).toFixed(4)} g/cm³
                  </span>
                </div>

                {/* 2. Proveta (Medição Física) */}
                <div className="bg-slate-950 p-4 rounded-xl border border-teal-800/80 space-y-2 relative">
                  <div className="flex items-center justify-between text-xs text-teal-400 font-bold uppercase">
                    <span>2. Proveta (Amostra)</span>
                    <span className="text-[10px] bg-teal-900/50 text-teal-300 px-2 py-0.5 rounded">
                      Ensaio de Pátio
                    </span>
                  </div>
                  <label className="block text-[11px] text-slate-400">
                    D20 Calculada a partir de D<sub>t</sub> e T:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={provetaDensidade}
                      onChange={(e) => setProvetaDensidade(parseFloat(e.target.value) || 0)}
                      className="bg-slate-900 border border-teal-500 rounded-lg px-3 py-2 font-mono text-sm font-bold text-teal-300 w-full focus:outline-none"
                    />
                    <span className="text-xs text-slate-400 font-mono">kg/m³</span>
                  </div>
                  <span className="text-[10px] text-teal-400/80 block">
                    Equivalente: {(provetaDensidade / 1000).toFixed(4)} g/cm³
                  </span>
                </div>

                {/* 3. Tanque de Armazenamento */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
                    <span>3. Tanque (Estoque)</span>
                    <span className="text-[10px] text-slate-400">Pós-descarga</span>
                  </div>
                  <label className="block text-[11px] text-slate-400">
                    Densidade no Tanque do Posto:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={tanqueDensidade}
                      onChange={(e) => setTanqueDensidade(parseFloat(e.target.value) || 0)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm font-bold text-white w-full focus:outline-none focus:border-teal-400"
                    />
                    <span className="text-xs text-slate-400 font-mono">kg/m³</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Equivalente: {(tanqueDensidade / 1000).toFixed(4)} g/cm³
                  </span>
                </div>
              </div>

              {/* Parecer do Cruzamento e Auditoria */}
              <div
                className={`p-5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  resultadoCruzamento.isLiberadoDescarga
                    ? 'bg-emerald-950/40 border-emerald-700 text-emerald-100'
                    : 'bg-red-950/40 border-red-700 text-red-100'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {resultadoCruzamento.isLiberadoDescarga ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                    )}
                    <span className="font-extrabold text-sm uppercase tracking-wide">
                      {resultadoCruzamento.isLiberadoDescarga
                        ? 'DESCARGA LIBERADA • CONFORME ANP'
                        : 'BLOQUEIO DE DESCARGA • DIVERGÊNCIA METROLÓGICA'}
                    </span>
                  </div>
                  <p className="text-xs opacity-90 leading-relaxed max-w-2xl">
                    {resultadoCruzamento.parecerCruzamento}
                  </p>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-right shrink-0">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    Diferença Apurada:
                  </span>
                  <span
                    className={`font-mono text-xl font-black ${
                      resultadoCruzamento.isLiberadoDescarga ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    Δ {resultadoCruzamento.diferencaNfProveta.toFixed(1)} kg/m³
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Tolerância Máxima: ± 5,0 kg/m³
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Info className="w-4 h-4 text-teal-400 shrink-0" />
            <span>
              Laudo em conformidade com as exigências da Resolução ANP 907/2022 e ABNT NBR 5992.
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition border border-slate-700"
          >
            Fechar Tabela ANP
          </button>
        </div>
      </div>
    </div>
  );
};
