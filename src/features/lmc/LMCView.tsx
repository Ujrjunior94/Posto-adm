import React, { useState, useMemo } from 'react';
import {
  LMCRegistro,
  LMCResumoPeriodo,
  Tanque,
  Bico,
  FechamentoCaixa,
  NotaFiscalLMC,
  COMBUSTIVEIS_PRINCIPAIS_LIST,
  CombustivelPrincipal,
} from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import {
  calcularLMC,
  COMBUSTIVEIS_PRINCIPAIS_SPECS,
  formatarMoeda,
} from '../../utils/calculations';
import {
  exportarLmcDiarioPDF,
  exportarLmcPeriodoPDF,
} from '../../utils/pdfGenerator';
import {
  BookOpen,
  Calendar,
  Fuel,
  Plus,
  FileText,
  Printer,
  Download,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Sparkles,
  Search,
  Filter,
  Trash2,
  Edit2,
  ChevronRight,
  Info,
} from 'lucide-react';

const repoLMC = new PostoSubcollectionRepository<LMCRegistro>('lmc');

interface LMCViewProps {
  tanques: Tanque[];
  bicos: Bico[];
  fechamentos: FechamentoCaixa[];
  onReload: () => void;
}

export const LMCView: React.FC<LMCViewProps> = ({
  tanques,
  bicos,
  fechamentos,
  onReload,
}) => {
  const { postoId, userProfile } = useAuth();

  const [abaAtiva, setAbaAtiva] = useState<'DIARIO' | 'QUINZENAL' | 'MENSAL' | 'FOLHA_OFICIAL'>('DIARIO');
  const [registrosLMC, setRegistrosLMC] = useState<LMCRegistro[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros de Período e Combustível
  const hoje = new Date();
  const [mesSelecionado, setMesSelecionado] = useState(
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  );
  const [diaSelecionado, setDiaSelecionado] = useState(
    hoje.toISOString().split('T')[0]
  );
  const [produtoSelecionado, setProdutoSelecionado] = useState<CombustivelPrincipal | 'TODOS'>('TODOS');
  const [quinzenaSelecionada, setQuinzenaSelecionada] = useState<'Q1' | 'Q2'>('Q1');

  // Modal de Lançamento Diário
  const [isModalLMC, setIsModalLMC] = useState(false);
  const [editandoRegistro, setEditandoRegistro] = useState<LMCRegistro | null>(null);

  // Campos do Form LMC
  const [formData, setFormData] = useState(hoje.toISOString().split('T')[0]);
  const [formProduto, setFormProduto] = useState<CombustivelPrincipal>('Gasolina Comum');
  const [formTanqueId, setFormTanqueId] = useState('');
  const [formEstoqueAbertura, setFormEstoqueAbertura] = useState<number>(10000);
  const [formEntradas, setFormEntradas] = useState<number>(0);
  const [formVendas, setFormVendas] = useState<number>(3200);
  const [formAfericoes, setFormAfericoes] = useState<number>(20);
  const [formEstoqueFisico, setFormEstoqueFisico] = useState<number>(6780);
  const [formMedicaoReguaCm, setFormMedicaoReguaCm] = useState<number>(145.2);
  const [formNumeroNF, setFormNumeroNF] = useState('');
  const [formDistribuidora, setFormDistribuidora] = useState('Vibra / Petrobras');
  const [formObservacoes, setFormObservacoes] = useState('');

  // Carrega registros de LMC do Firestore
  const carregarRegistros = async () => {
    setCarregando(true);
    try {
      const data = await repoLMC.getAll(postoId);
      // Se não houver nenhum registro, pré-carrega simulações realistas para o mês atual
      if (data.length === 0) {
        const registrosIniciais = gerarRegistrosExemplo();
        for (const reg of registrosIniciais) {
          await repoLMC.save(postoId, reg);
        }
        setRegistrosLMC(registrosIniciais);
      } else {
        setRegistrosLMC(data.sort((a, b) => b.data.localeCompare(a.data)));
      }
    } catch (err) {
      console.error('Erro ao carregar LMC:', err);
    } finally {
      setCarregando(false);
    }
  };

  React.useEffect(() => {
    carregarRegistros();
  }, [postoId]);

  // Gera dados realistas para demonstração e conferência rápida
  const gerarRegistrosExemplo = (): LMCRegistro[] => {
    const [anoStr, mesStr] = mesSelecionado.split('-');
    const ano = parseInt(anoStr);
    const mes = parseInt(mesStr);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const lista: LMCRegistro[] = [];

    const combustiveis: { nome: CombustivelPrincipal; abert: number; vendMedia: number }[] = [
      { nome: 'Gasolina Comum', abert: 18500, vendMedia: 4200 },
      { nome: 'Gasolina Aditivada', abert: 9200, vendMedia: 1800 },
      { nome: 'Etanol', abert: 12000, vendMedia: 2900 },
      { nome: 'Diesel S10', abert: 22000, vendMedia: 5100 },
      { nome: 'Diesel S500', abert: 14000, vendMedia: 2300 },
    ];

    combustiveis.forEach((comb) => {
      let estoqueAtual = comb.abert;
      for (let dia = 1; dia <= Math.min(diasNoMes, 15); dia++) {
        const dataStr = `${anoStr}-${mesStr}-${String(dia).padStart(2, '0')}`;
        // Recebe caminhão tanque no dia 4 e no dia 11
        const temEntrada = dia === 4 || dia === 11;
        const entradaLitros = temEntrada ? 5000 : 0;
        const vendasDia = Math.round(comb.vendMedia * (0.9 + Math.sin(dia) * 0.15));
        const afericoesDia = 20;

        const calc = calcularLMC(
          estoqueAtual,
          entradaLitros,
          vendasDia,
          afericoesDia,
          estoqueAtual + entradaLitros - vendasDia - afericoesDia + (dia % 2 === 0 ? -12 : 8)
        );

        lista.push({
          id: `lmc-${comb.nome.toLowerCase().replace(/\s+/g, '-')}-${dataStr}`,
          postoId,
          data: dataStr,
          produto: comb.nome,
          tanqueCodigo: `TQ-${comb.nome.substring(0, 3).toUpperCase()}`,
          estoqueAbertura: calc.estoqueAbertura,
          entradas: calc.entradas,
          notasFiscais: temEntrada
            ? [
                {
                  numeroNF: `NF-${98000 + dia}`,
                  distribuidora: 'Petrobras / Vibra Energia',
                  volumeLitros: entradaLitros,
                },
              ]
            : [],
          vendas: calc.vendas,
          afericoes: calc.afericoes,
          estoqueEscritural: calc.estoqueEscritural,
          estoqueFisico: calc.estoqueFisico,
          medicaoReguaCm: Math.round((calc.estoqueFisico / 200) * 10) / 10,
          variacaoLitros: calc.variacaoLitros,
          variacaoPercentual: calc.variacaoPercentual,
          toleranciaANPMaxLitros: calc.toleranciaMaximaLitros,
          statusANP: calc.statusANP,
          fechado: true,
          responsavelNome: userProfile?.nome || 'Gerente Operacional',
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        });

        estoqueAtual = calc.estoqueFisico;
      }
    });

    return lista;
  };

  // Puxa automaticamente do fechamento e dos tanques cadastrados
  const handleAutoPreencherDoPosto = () => {
    // 1. Tenta achar tanque correspondente
    const tq = tanques.find((t) => t.produto === formProduto || t.produto.includes(formProduto));
    if (tq) {
      setFormTanqueId(tq.id);
      setFormEstoqueAbertura(tq.capacidadeOperacional ? Math.round(tq.capacidadeOperacional * 0.7) : 10000);
    }

    // 2. Soma vendas de bicos fechados no dia
    const fechamentosDia = fechamentos.filter((f) => f.data === formData);
    let totalLitrosBicos = 0;
    fechamentosDia.forEach((f) => {
      f.encerrantesBicos?.forEach((b) => {
        if (b.produto === formProduto || b.produto.includes(formProduto)) {
          totalLitrosBicos += b.litrosVendidos || 0;
        }
      });
    });

    if (totalLitrosBicos > 0) {
      setFormVendas(Math.round(totalLitrosBicos));
    }

    // Calcula estoque físico simulado baseado na régua
    const abert = formEstoqueAbertura || 10000;
    const vend = totalLitrosBicos > 0 ? Math.round(totalLitrosBicos) : formVendas;
    const calc = calcularLMC(abert, formEntradas, vend, formAfericoes, abert + formEntradas - vend - formAfericoes - 5);
    setFormEstoqueFisico(calc.estoqueFisico);
  };

  const handleSalvarLMC = async (e: React.FormEvent) => {
    e.preventDefault();
    const calc = calcularLMC(
      formEstoqueAbertura,
      formEntradas,
      formVendas,
      formAfericoes,
      formEstoqueFisico
    );

    const nfs: NotaFiscalLMC[] =
      formEntradas > 0 && formNumeroNF
        ? [
            {
              numeroNF: formNumeroNF,
              distribuidora: formDistribuidora,
              volumeLitros: formEntradas,
            },
          ]
        : [];

    const id =
      editandoRegistro?.id ||
      `lmc-${formProduto.toLowerCase().replace(/\s+/g, '-')}-${formData}`;

    const novoRegistro: LMCRegistro = {
      id,
      postoId,
      data: formData,
      produto: formProduto,
      tanqueId: formTanqueId || undefined,
      tanqueCodigo: formTanqueId ? tanques.find((t) => t.id === formTanqueId)?.codigo : `TQ-${formProduto.substring(0, 3).toUpperCase()}`,
      estoqueAbertura: calc.estoqueAbertura,
      entradas: calc.entradas,
      notasFiscais: nfs,
      vendas: calc.vendas,
      afericoes: calc.afericoes,
      estoqueEscritural: calc.estoqueEscritural,
      estoqueFisico: calc.estoqueFisico,
      medicaoReguaCm: formMedicaoReguaCm,
      variacaoLitros: calc.variacaoLitros,
      variacaoPercentual: calc.variacaoPercentual,
      toleranciaANPMaxLitros: calc.toleranciaMaximaLitros,
      statusANP: calc.statusANP,
      fechado: true,
      responsavelNome: userProfile?.nome || 'Operador LMC',
      observacoes: formObservacoes,
      criadoEm: editandoRegistro?.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await repoLMC.save(postoId, novoRegistro);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'LMC',
      'LMCRegistro',
      id,
      editandoRegistro ? 'UPDATE' : 'CREATE',
      editandoRegistro as any,
      novoRegistro as any
    );

    setIsModalLMC(false);
    setEditandoRegistro(null);
    await carregarRegistros();
    onReload();
  };

  const handleExcluirRegistro = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este lançamento do LMC?')) return;
    await repoLMC.delete(postoId, id);
    await carregarRegistros();
    onReload();
  };

  const abrirModalNovo = (prod = 'Gasolina Comum') => {
    setEditandoRegistro(null);
    setFormData(diaSelecionado);
    setFormProduto(prod as CombustivelPrincipal);
    setFormEstoqueAbertura(10000);
    setFormEntradas(0);
    setFormVendas(3000);
    setFormAfericoes(20);
    setFormEstoqueFisico(6975);
    setFormMedicaoReguaCm(150.0);
    setFormNumeroNF('');
    setFormObservacoes('');
    setIsModalLMC(true);
  };

  const abrirModalEditar = (reg: LMCRegistro) => {
    setEditandoRegistro(reg);
    setFormData(reg.data);
    setFormProduto(reg.produto as CombustivelPrincipal);
    setFormTanqueId(reg.tanqueId || '');
    setFormEstoqueAbertura(reg.estoqueAbertura);
    setFormEntradas(reg.entradas);
    setFormVendas(reg.vendas);
    setFormAfericoes(reg.afericoes);
    setFormEstoqueFisico(reg.estoqueFisico);
    setFormMedicaoReguaCm(reg.medicaoReguaCm || 150.0);
    setFormNumeroNF(reg.notasFiscais?.[0]?.numeroNF || '');
    setFormDistribuidora(reg.notasFiscais?.[0]?.distribuidora || 'Vibra / Petrobras');
    setFormObservacoes(reg.observacoes || '');
    setIsModalLMC(true);
  };

  // Filtros de registros
  const registrosFiltradosMes = useMemo(() => {
    return registrosLMC.filter((r) => r.data && r.data.startsWith(mesSelecionado));
  }, [registrosLMC, mesSelecionado]);

  // Balanço Diário (Dia Selecionado)
  const registrosDoDia = useMemo(() => {
    return registrosFiltradosMes.filter((r) => r.data === diaSelecionado);
  }, [registrosFiltradosMes, diaSelecionado]);

  // Balanço Quinzenal (Q1: 01-15, Q2: 16-31)
  const registrosQuinzena = useMemo(() => {
    return registrosFiltradosMes.filter((r) => {
      const diaNum = parseInt(r.data.split('-')[2]);
      if (quinzenaSelecionada === 'Q1') {
        return diaNum >= 1 && diaNum <= 15;
      } else {
        return diaNum >= 16;
      }
    });
  }, [registrosFiltradosMes, quinzenaSelecionada]);

  // Agrupamentos Quinzenais e Mensais por Combustível
  const resumoPorCombustivel = useMemo(() => {
    const lista = abaAtiva === 'QUINZENAL' ? registrosQuinzena : registrosFiltradosMes;
    const mapa = new Map<string, {
      produto: string;
      estoqueInicial: number;
      totalEntradas: number;
      totalVendas: number;
      totalAfericoes: number;
      estoqueEscrituralFinal: number;
      estoqueFisicoFinal: number;
      variacaoAcumulada: number;
      toleranciaMaxAcumulada: number;
      registrosCount: number;
    }>();

    COMBUSTIVEIS_PRINCIPAIS_LIST.forEach((comb) => {
      mapa.set(comb, {
        produto: comb,
        estoqueInicial: 0,
        totalEntradas: 0,
        totalVendas: 0,
        totalAfericoes: 0,
        estoqueEscrituralFinal: 0,
        estoqueFisicoFinal: 0,
        variacaoAcumulada: 0,
        toleranciaMaxAcumulada: 0,
        registrosCount: 0,
      });
    });

    // Ordena por data para pegar primeiro e último estoque
    const regsOrdenados = [...lista].sort((a, b) => a.data.localeCompare(b.data));

    regsOrdenados.forEach((r) => {
      const item = mapa.get(r.produto) || {
        produto: r.produto,
        estoqueInicial: r.estoqueAbertura,
        totalEntradas: 0,
        totalVendas: 0,
        totalAfericoes: 0,
        estoqueEscrituralFinal: 0,
        estoqueFisicoFinal: 0,
        variacaoAcumulada: 0,
        toleranciaMaxAcumulada: 0,
        registrosCount: 0,
      };

      if (item.registrosCount === 0) {
        item.estoqueInicial = r.estoqueAbertura;
      }

      item.totalEntradas += r.entradas;
      item.totalVendas += r.vendas;
      item.totalAfericoes += r.afericoes;
      item.estoqueEscrituralFinal = r.estoqueEscritural;
      item.estoqueFisicoFinal = r.estoqueFisico;
      item.variacaoAcumulada += r.variacaoLitros;
      item.toleranciaMaxAcumulada += r.toleranciaANPMaxLitros;
      item.registrosCount += 1;

      mapa.set(r.produto, item);
    });

    return Array.from(mapa.values());
  }, [registrosFiltradosMes, registrosQuinzena, abaAtiva]);

  // Totais Gerais do Período
  const totaisGerais = useMemo(() => {
    let entradas = 0;
    let vendas = 0;
    let variacao = 0;
    let dentroTol = 0;
    let foraTol = 0;

    const base = abaAtiva === 'DIARIO' ? registrosDoDia : abaAtiva === 'QUINZENAL' ? registrosQuinzena : registrosFiltradosMes;

    base.forEach((r) => {
      entradas += r.entradas;
      vendas += r.vendas;
      variacao += r.variacaoLitros;
      if (r.statusANP === 'CONFORME') dentroTol++;
      else foraTol++;
    });

    return { entradas, vendas, variacao, dentroTol, foraTol, totalRegs: base.length };
  }, [registrosDoDia, registrosQuinzena, registrosFiltradosMes, abaAtiva]);

  const handleImprimirLMC = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Topo do Livro de Movimentação */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">LMC — Livro de Movimentação de Combustíveis</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                Padrão Oficial ANP
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Controle obrigatório de estoques físicos, escriturais, perdas e sobras com tolerância legal de ±0,6%
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => abrirModalNovo()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Lançamento Diário</span>
          </button>
          <button
            onClick={() => {
              if (registrosDoDia.length > 0) {
                exportarLmcDiarioPDF(registrosDoDia[0]);
              } else if (registrosFiltradosMes.length > 0) {
                exportarLmcDiarioPDF(registrosFiltradosMes[0]);
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-xs transition"
            title="Exportar Folha Oficial LMC em PDF Formatado (ANP)"
          >
            <Download className="w-4 h-4" />
            <span>Exportar PDF Oficial (ANP)</span>
          </button>
          <button
            onClick={handleImprimirLMC}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Navegação de Abas do LMC: Diário, Quinzenal, Mensal e Folha Oficial */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3 print:hidden">
        <div className="flex items-center gap-2 bg-slate-200/60 p-1 rounded-xl">
          <button
            onClick={() => setAbaAtiva('DIARIO')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              abaAtiva === 'DIARIO'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Balanço Diário</span>
          </button>
          <button
            onClick={() => setAbaAtiva('QUINZENAL')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              abaAtiva === 'QUINZENAL'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Balanço Quinzenal (1ª / 2ª Quinzena)</span>
          </button>
          <button
            onClick={() => setAbaAtiva('MENSAL')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              abaAtiva === 'MENSAL'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Balanço Mensal Consolidado</span>
          </button>
          <button
            onClick={() => setAbaAtiva('FOLHA_OFICIAL')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              abaAtiva === 'FOLHA_OFICIAL'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Folha de Registro Oficial ANP</span>
          </button>
        </div>

        {/* Seletores de Data e Mês */}
        <div className="flex items-center gap-3">
          {abaAtiva === 'DIARIO' && (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-2xs">
              <span className="text-slate-500 font-medium">Dia:</span>
              <input
                type="date"
                value={diaSelecionado}
                onChange={(e) => setDiaSelecionado(e.target.value)}
                className="font-semibold text-slate-800 focus:outline-none"
              />
            </div>
          )}

          {abaAtiva === 'QUINZENAL' && (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs shadow-2xs">
              <button
                onClick={() => setQuinzenaSelecionada('Q1')}
                className={`px-3 py-1 rounded-lg font-bold transition ${
                  quinzenaSelecionada === 'Q1'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                1ª Quinzena (01 a 15)
              </button>
              <button
                onClick={() => setQuinzenaSelecionada('Q2')}
                className={`px-3 py-1 rounded-lg font-bold transition ${
                  quinzenaSelecionada === 'Q2'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                2ª Quinzena (16 ao fim)
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-2xs">
            <span className="text-slate-500 font-medium">Mês:</span>
            <input
              type="month"
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(e.target.value)}
              className="font-semibold text-slate-800 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Cards de Métricas Operacionais do Período */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Vendas Totais do Período</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{totaisGerais.vendas.toLocaleString('pt-BR')} L</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Saídas registradas nos bicos</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Entradas / Recebimentos</div>
          <div className="text-xl font-bold text-emerald-600 mt-1">+{totaisGerais.entradas.toLocaleString('pt-BR')} L</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Notas fiscais de descarga</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Perda / Sobra Acumulada</div>
          <div className={`text-xl font-bold mt-1 ${totaisGerais.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {totaisGerais.variacao > 0 ? `+${totaisGerais.variacao.toLocaleString('pt-BR')} L` : `${totaisGerais.variacao.toLocaleString('pt-BR')} L`}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Diferença Física vs Escritural</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Conformidade Metrológica ANP</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-bold text-emerald-700">{totaisGerais.dentroTol} em conformidade</span>
            {totaisGerais.foraTol > 0 && (
              <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">
                {totaisGerais.foraTol} alertas
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Tolerância legal de ±0,6%</div>
        </div>
      </div>

      {/* CONTEÚDO DA ABA: 1. BALANÇO DIÁRIO */}
      {abaAtiva === 'DIARIO' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Balanço Diário — {diaSelecionado.split('-').reverse().join('/')}</span>
            </h2>
            <span className="text-xs text-slate-500">
              {registrosDoDia.length} de 5 combustíveis lançados para este dia
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Combustível</th>
                    <th className="px-3 py-3 text-right">Estoque Abertura</th>
                    <th className="px-3 py-3 text-right">Entradas (NF)</th>
                    <th className="px-3 py-3 text-right">Vendas (Bicos)</th>
                    <th className="px-3 py-3 text-right">Aferições</th>
                    <th className="px-3 py-3 text-right bg-slate-100/70 font-bold">Estoque Escritural</th>
                    <th className="px-3 py-3 text-right bg-blue-50/50 font-bold">Estoque Físico (Régua)</th>
                    <th className="px-3 py-3 text-right font-bold">Variação (L)</th>
                    <th className="px-3 py-3 text-center">Status ANP (±0,6%)</th>
                    <th className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {COMBUSTIVEIS_PRINCIPAIS_LIST.map((prod) => {
                    const reg = registrosDoDia.find((r) => r.produto === prod);
                    if (!reg) {
                      return (
                        <tr key={prod} className="hover:bg-slate-50/60 transition text-slate-400">
                          <td className="px-4 py-3.5 font-bold text-slate-700 flex items-center gap-2">
                            <Fuel className="w-4 h-4 text-slate-400" />
                            <span>{prod}</span>
                          </td>
                          <td colSpan={8} className="px-3 py-3.5 text-center text-slate-400 italic">
                            Nenhum balanço diário registrado para este produto nesta data
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => abrirModalNovo(prod)}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[11px] font-bold transition"
                            >
                              + Lançar
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const isPerda = reg.variacaoLitros < 0;
                    const isConforme = reg.statusANP === 'CONFORME';

                    return (
                      <tr key={reg.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3.5 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <Fuel className="w-4 h-4 text-blue-600" />
                            <div>
                              <div>{reg.produto}</div>
                              <div className="text-[10px] text-slate-400 font-normal">{reg.tanqueCodigo || 'Tanque Padrão'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono text-slate-700">
                          {reg.estoqueAbertura.toLocaleString('pt-BR')} L
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono text-emerald-700 font-semibold">
                          {reg.entradas > 0 ? `+${reg.entradas.toLocaleString('pt-BR')} L` : '0 L'}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono text-slate-800 font-semibold">
                          {reg.vendas.toLocaleString('pt-BR')} L
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono text-slate-500">
                          {reg.afericoes} L
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold bg-slate-100/50 text-slate-900">
                          {reg.estoqueEscritural.toLocaleString('pt-BR')} L
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold bg-blue-50/40 text-blue-900">
                          {reg.estoqueFisico.toLocaleString('pt-BR')} L
                          {reg.medicaoReguaCm && (
                            <div className="text-[10px] text-blue-600 font-normal">{reg.medicaoReguaCm} cm</div>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold">
                          <span
                            className={
                              isPerda
                                ? 'text-red-700'
                                : reg.variacaoLitros > 0
                                ? 'text-emerald-700'
                                : 'text-slate-600'
                            }
                          >
                            {reg.variacaoLitros > 0 ? `+${reg.variacaoLitros} L` : `${reg.variacaoLitros} L`}
                          </span>
                          <div className="text-[10px] text-slate-400 font-normal">
                            ({reg.variacaoPercentual.toFixed(2)}%)
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          {isConforme ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              Conforme (±0,6%)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                              <AlertTriangle className="w-3 h-3" />
                              Fora da Tolerância
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => exportarLmcDiarioPDF(reg)}
                              title="Exportar Folha Diária em PDF"
                              className="p-1.5 hover:bg-blue-100 text-blue-600 rounded-lg transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => abrirModalEditar(reg)}
                              title="Editar Lançamento"
                              className="p-1.5 hover:bg-slate-200 text-slate-600 rounded-lg transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleExcluirRegistro(reg.id)}
                              title="Excluir Lançamento"
                              className="p-1.5 hover:bg-red-100 text-red-600 rounded-lg transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA: 2. BALANÇO QUINZENAL */}
      {abaAtiva === 'QUINZENAL' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <span>
                Balanço da {quinzenaSelecionada === 'Q1' ? '1ª Quinzena (01 a 15)' : '2ª Quinzena (16 ao fim)'} de{' '}
                {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(mesSelecionado + '-01'))}
              </span>
            </h2>
            <span className="text-xs text-slate-500">
              Total de {registrosQuinzena.length} dias compilados
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resumoPorCombustivel.map((item) => {
              const spec = COMBUSTIVEIS_PRINCIPAIS_SPECS[item.produto];
              const pctVariacao = item.totalVendas > 0 ? (item.variacaoAcumulada / item.totalVendas) * 100 : 0;
              const isConforme = Math.abs(pctVariacao) <= 0.6;

              return (
                <div key={item.produto} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Fuel className="w-5 h-5 text-blue-600" />
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">{item.produto}</h3>
                        <p className="text-[10px] text-slate-400">{item.registrosCount} dias com movimentação</p>
                      </div>
                    </div>
                    {isConforme ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Conforme
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                        Fora Tol.
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <div className="text-[10px] text-slate-500">Estoque Inicial:</div>
                      <div className="font-mono font-bold text-slate-800">{item.estoqueInicial.toLocaleString('pt-BR')} L</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <div className="text-[10px] text-slate-500">Estoque Final (Régua):</div>
                      <div className="font-mono font-bold text-blue-700">{item.estoqueFisicoFinal.toLocaleString('pt-BR')} L</div>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <div className="text-[10px] text-emerald-700">Entradas Acumuladas:</div>
                      <div className="font-mono font-bold text-emerald-800">+{item.totalEntradas.toLocaleString('pt-BR')} L</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <div className="text-[10px] text-slate-500">Vendas Acumuladas:</div>
                      <div className="font-mono font-bold text-slate-800">{item.totalVendas.toLocaleString('pt-BR')} L</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <div className="text-[10px] text-slate-500">Perda / Sobra Quinzenal:</div>
                      <div className={`font-mono font-bold ${item.variacaoAcumulada >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {item.variacaoAcumulada > 0 ? `+${item.variacaoAcumulada.toFixed(1)} L` : `${item.variacaoAcumulada.toFixed(1)} L`} ({pctVariacao.toFixed(2)}%)
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const regs = registrosQuinzena.filter(r => r.produto === item.produto);
                          const resumoObj: LMCResumoPeriodo = {
                            periodo: quinzenaSelecionada === 'Q1' ? '1ª Quinzena (01 a 15)' : '2ª Quinzena (16 ao fim)',
                            tipo: 'QUINZENAL',
                            dataInicio: `${mesSelecionado}-${quinzenaSelecionada === 'Q1' ? '01' : '16'}`,
                            dataFim: `${mesSelecionado}-${quinzenaSelecionada === 'Q1' ? '15' : '31'}`,
                            produto: item.produto,
                            estoqueInicial: item.estoqueInicial,
                            totalEntradas: item.totalEntradas,
                            totalVendas: item.totalVendas,
                            totalAfericoes: item.totalAfericoes,
                            estoqueEscrituralFinal: item.estoqueEscrituralFinal,
                            estoqueFisicoFinal: item.estoqueFisicoFinal,
                            perdaSobraAcumulada: item.variacaoAcumulada,
                            percentualVariacao: pctVariacao,
                            limiteToleranciaANPLitros: item.toleranciaMaxAcumulada,
                            statusANP: isConforme ? 'CONFORME' : 'FORA_DA_TOLERANCIA',
                            registrosCount: item.registrosCount,
                          };
                          exportarLmcPeriodoPDF(resumoObj, regs);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg text-[10px] font-bold transition"
                        title="Exportar Balanço Quinzenal em PDF"
                      >
                        <Download className="w-3 h-3" />
                        <span>PDF</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA: 3. BALANÇO MENSAL */}
      {abaAtiva === 'MENSAL' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>
                Balanço Mensal Consolidado —{' '}
                {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(mesSelecionado + '-01'))}
              </span>
            </h2>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Combustível Principal</th>
                  <th className="px-3 py-3 text-right">Estoque Abertura (Dia 01)</th>
                  <th className="px-3 py-3 text-right">Total Entradas (NFs)</th>
                  <th className="px-3 py-3 text-right">Total Vendas (Bicos)</th>
                  <th className="px-3 py-3 text-right">Total Aferições</th>
                  <th className="px-3 py-3 text-right bg-slate-100 font-bold">Estoque Físico Final</th>
                  <th className="px-3 py-3 text-right font-bold">Perda/Sobra Mês</th>
                  <th className="px-3 py-3 text-right">Variação %</th>
                  <th className="px-4 py-3 text-center">Status Fiscal ANP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumoPorCombustivel.map((item) => {
                  const pct = item.totalVendas > 0 ? (item.variacaoAcumulada / item.totalVendas) * 100 : 0;
                  const isConforme = Math.abs(pct) <= 0.6;

                  return (
                    <tr key={item.produto} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3.5 font-bold text-slate-900 flex items-center gap-2">
                        <Fuel className="w-4 h-4 text-blue-600" />
                        <span>{item.produto}</span>
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-slate-700">
                        {item.estoqueInicial.toLocaleString('pt-BR')} L
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-emerald-700 font-semibold">
                        +{item.totalEntradas.toLocaleString('pt-BR')} L
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-slate-900 font-semibold">
                        {item.totalVendas.toLocaleString('pt-BR')} L
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-slate-500">
                        {item.totalAfericoes} L
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono font-bold bg-slate-50 text-blue-900">
                        {item.estoqueFisicoFinal.toLocaleString('pt-BR')} L
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono font-bold">
                        <span className={item.variacaoAcumulada < 0 ? 'text-red-700' : 'text-emerald-700'}>
                          {item.variacaoAcumulada > 0 ? `+${item.variacaoAcumulada.toFixed(1)} L` : `${item.variacaoAcumulada.toFixed(1)} L`}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono font-semibold text-slate-700">
                        {pct.toFixed(3)}%
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {isConforme ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            Aprovado ANP (≤ 0,6%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                            <AlertTriangle className="w-3 h-3" />
                            Desvio Metrológico
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA: 4. FOLHA DE REGISTRO OFICIAL ANP (Para Impressão e Fiscalização) */}
      {abaAtiva === 'FOLHA_OFICIAL' && (
        <div className="bg-white p-8 rounded-2xl border border-slate-300 shadow-md font-sans text-slate-900 print:p-0 print:border-0 print:shadow-none">
          {/* Cabeçalho Oficial do Livro */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-base font-bold uppercase tracking-wide">
                  LIVRO DE MOVIMENTAÇÃO DE COMBUSTÍVEIS (LMC)
                </h1>
                <p className="text-xs text-slate-600">
                  Em conformidade com a Portaria DNC/ANP e Resoluções Regulamentares Vigentes
                </p>
              </div>
              <div className="text-right text-xs">
                <div className="font-bold">Mês de Competência: {mesSelecionado}</div>
                <div className="text-slate-500">Posto ID: {postoId}</div>
              </div>
            </div>
          </div>

          {/* Registros em formato de livro impresso */}
          <div className="space-y-6">
            {COMBUSTIVEIS_PRINCIPAIS_LIST.map((prod) => {
              const regsDoComb = registrosFiltradosMes.filter((r) => r.produto === prod);

              return (
                <div key={prod} className="space-y-2">
                  <div className="bg-slate-100 p-2 rounded text-xs font-bold flex items-center justify-between">
                    <span>PRODUTO: {prod.toUpperCase()}</span>
                    <span>TOTAL REGISTROS: {regsDoComb.length} DIAS</span>
                  </div>

                  <table className="w-full text-left text-[11px] border border-slate-300 border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-300 font-semibold text-slate-800">
                      <tr>
                        <th className="p-1.5 border-r border-slate-200">Data</th>
                        <th className="p-1.5 border-r border-slate-200 text-right">Estoque Abertura</th>
                        <th className="p-1.5 border-r border-slate-200 text-right">Entradas (NF)</th>
                        <th className="p-1.5 border-r border-slate-200 text-right">Vendas do Dia</th>
                        <th className="p-1.5 border-r border-slate-200 text-right">Aferição</th>
                        <th className="p-1.5 border-r border-slate-200 text-right">Estoque Escritural</th>
                        <th className="p-1.5 border-r border-slate-200 text-right">Estoque Físico</th>
                        <th className="p-1.5 border-r border-slate-200 text-right">Perda/Sobra</th>
                        <th className="p-1.5 text-center">Status ANP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {regsDoComb.map((r) => (
                        <tr key={r.id}>
                          <td className="p-1.5 border-r border-slate-200 font-mono">{r.data.split('-').reverse().join('/')}</td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono">{r.estoqueAbertura.toLocaleString('pt-BR')}</td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono">{r.entradas > 0 ? r.entradas.toLocaleString('pt-BR') : '-'}</td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono">{r.vendas.toLocaleString('pt-BR')}</td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono">{r.afericoes || '-'}</td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono font-semibold">{r.estoqueEscritural.toLocaleString('pt-BR')}</td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono font-semibold">{r.estoqueFisico.toLocaleString('pt-BR')}</td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold">
                            {r.variacaoLitros > 0 ? `+${r.variacaoLitros}` : r.variacaoLitros} L
                          </td>
                          <td className="p-1.5 text-center text-[10px] font-bold">
                            {r.statusANP === 'CONFORME' ? 'OK (≤0,6%)' : 'ALERTA'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Rodapé de Assinatura do Responsável */}
          <div className="pt-12 mt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs text-center">
            <div>
              <div className="border-t border-slate-400 pt-1 font-semibold">Assinatura do Gerente Responsável</div>
              <div className="text-[10px] text-slate-500">{userProfile?.nome || 'Responsável Operacional'}</div>
            </div>
            <div>
              <div className="border-t border-slate-400 pt-1 font-semibold">Fiscalização / Conferência Metrológica</div>
              <div className="text-[10px] text-slate-500">Data: ____/____/________</div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LANÇAMENTO / EDIÇÃO DO BALANÇO DIÁRIO */}
      {isModalLMC && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">
                  {editandoRegistro ? 'Editar Balanço Diário LMC' : 'Novo Lançamento Diário LMC'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalLMC(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSalvarLMC} className="space-y-4">
              {/* Botão de Auto-preenchimento Inteligente */}
              <div className="flex items-center justify-between bg-blue-50/70 p-2.5 rounded-xl border border-blue-200">
                <div className="text-xs text-blue-900 font-medium">
                  Puxar dados reais de tanques e bicos do dia
                </div>
                <button
                  type="button"
                  onClick={handleAutoPreencherDoPosto}
                  className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Preencher</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data do Lançamento</label>
                  <input
                    type="date"
                    required
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Combustível Principal</label>
                  <select
                    value={formProduto}
                    onChange={(e) => setFormProduto(e.target.value as CombustivelPrincipal)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {COMBUSTIVEIS_PRINCIPAIS_LIST.map((prod) => (
                      <option key={prod} value={prod}>
                        {prod}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estoque Inicial / Abertura (L)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={formEstoqueAbertura}
                    onChange={(e) => setFormEstoqueAbertura(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Entradas / Descarga (L)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formEntradas}
                    onChange={(e) => setFormEntradas(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="0 se não houver descarga"
                  />
                </div>
              </div>

              {formEntradas > 0 && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Número da NF-e</label>
                    <input
                      type="text"
                      value={formNumeroNF}
                      onChange={(e) => setFormNumeroNF(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="Ex: NF-104928"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Distribuidora</label>
                    <input
                      type="text"
                      value={formDistribuidora}
                      onChange={(e) => setFormDistribuidora(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vendas Totais (Bicos / Encerrantes)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={formVendas}
                    onChange={(e) => setFormVendas(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Aferições de Bicos (L)</label>
                  <input
                    type="number"
                    step="1"
                    value={formAfericoes}
                    onChange={(e) => setFormAfericoes(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-blue-50/40 p-3 rounded-xl border border-blue-200">
                <div>
                  <label className="block text-xs font-bold text-blue-900 mb-1">Estoque Físico Medido (Régua L)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={formEstoqueFisico}
                    onChange={(e) => setFormEstoqueFisico(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg text-xs font-mono font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-900 mb-1">Altura da Régua (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formMedicaoReguaCm}
                    onChange={(e) => setFormMedicaoReguaCm(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg text-xs font-mono font-semibold text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Ex: 145.2 cm"
                  />
                </div>
              </div>

              {/* Prévia do Cálculo em Tempo Real */}
              {(() => {
                const preview = calcularLMC(
                  formEstoqueAbertura,
                  formEntradas,
                  formVendas,
                  formAfericoes,
                  formEstoqueFisico
                );
                return (
                  <div className="p-3 bg-slate-100 rounded-xl space-y-1 text-xs font-mono">
                    <div className="flex justify-between text-slate-700">
                      <span>Estoque Escritural Calculado:</span>
                      <span className="font-bold">{preview.estoqueEscritural.toLocaleString('pt-BR')} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Variação (Físico - Escritural):</span>
                      <span className={`font-bold ${preview.variacaoLitros < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {preview.variacaoLitros > 0 ? `+${preview.variacaoLitros} L` : `${preview.variacaoLitros} L`} ({preview.variacaoPercentual.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Tolerância Máxima ANP (±0,6%):</span>
                      <span>±{preview.toleranciaMaximaLitros.toFixed(1)} L</span>
                    </div>
                    <div className="pt-1 text-[11px] font-sans font-bold">
                      {preview.isConformeANP ? (
                        <span className="text-emerald-700">✓ Conforme com as normas da ANP</span>
                      ) : (
                        <span className="text-red-700">⚠ Atenção: Variação fora da tolerância legal de 0,6%</span>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Observações do Livro</label>
                <textarea
                  rows={2}
                  value={formObservacoes}
                  onChange={(e) => setFormObservacoes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Ex: Descarga de 5.000L conferida sem divergência metrológica."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalLMC(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
                >
                  Salvar no LMC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
