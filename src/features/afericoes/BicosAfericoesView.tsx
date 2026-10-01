import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Bico, Afericao, Funcionario, Tanque } from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import { calcularAfericao, TOLERANCIA_DESVIO_PADRAO_L, TOLERANCIA_DESVIO_PADRAO_ML } from '../../utils/calculations';
import {
  calcularPrecoEfetivoBico,
  formatarPrecoLitro,
  PRECOS_PADRAO_COMBUSTIVEL,
} from '../../utils/pricing';
import {
  Gauge,
  CheckCircle2,
  XCircle,
  Plus,
  AlertCircle,
  History,
  Pencil,
  Trash2,
  DollarSign,
  Tag,
  Sparkles,
  Filter,
  Search,
  ArrowUpDown,
  Check,
  TrendingDown,
  RotateCcw,
  Fuel,
} from 'lucide-react';
import { ModalEditarAfericao } from './ModalEditarAfericao';
import { ModalConfigurarPrecoBico } from './ModalConfigurarPrecoBico';
import { ModalAlternarPrecosLote } from './ModalAlternarPrecosLote';
import { DesvioAfericaoGauge } from './DesvioAfericaoGauge';
import { DiagramaBombaCombustivel } from './DiagramaBombaCombustivel';

const repoBicos = new PostoSubcollectionRepository<Bico>('bicos');
const repoAfericoes = new PostoSubcollectionRepository<Afericao>('afericoes');

interface BicosAfericoesProps {
  bicos: Bico[];
  afericoes: Afericao[];
  tanques: Tanque[];
  funcionarios: Funcionario[];
  onReload: () => void;
}

export const BicosAfericoesView: React.FC<BicosAfericoesProps> = ({
  bicos,
  afericoes,
  tanques,
  funcionarios,
  onReload,
}) => {
  const { postoId, userProfile } = useAuth();

  // Controle de Abas (Inicia no Mapa Visual de Bombas & Diagnóstico 20L)
  const [abaAtiva, setAbaAtiva] = useState<'PRECOS' | 'AFERICOES'>('AFERICOES');

  // Modais de Preços e Descontos
  const [bicoParaPreco, setBicoParaPreco] = useState<Bico | null>(null);
  const [isModalPrecoBico, setIsModalPrecoBico] = useState(false);
  const [isModalPrecosLote, setIsModalPrecosLote] = useState(false);

  // Filtros da aba de Preços
  const [filtroProduto, setFiltroProduto] = useState<string>('TODOS');
  const [filtroDesconto, setFiltroDesconto] = useState<'TODOS' | 'COM_DESCONTO' | 'SEM_DESCONTO'>('TODOS');
  const [buscaTexto, setBuscaTexto] = useState<string>('');

  // Modais de Aferições
  const [isModalAfericao, setIsModalAfericao] = useState(false);
  const [isModalBico, setIsModalBico] = useState(false);
  const [bicoEditandoCadastro, setBicoEditandoCadastro] = useState<Bico | null>(null);
  const [bicoParaExcluir, setBicoParaExcluir] = useState<Bico | null>(null);
  const [isModalExcluirBico, setIsModalExcluirBico] = useState(false);

  // Estados de Edição e Limpeza de Aferições
  const [afericaoParaEditar, setAfericaoParaEditar] = useState<Afericao | null>(null);
  const [isModalEditarAfericao, setIsModalEditarAfericao] = useState(false);
  const [afericaoParaExcluir, setAfericaoParaExcluir] = useState<Afericao | null>(null);
  const [isModalExcluirAfericao, setIsModalExcluirAfericao] = useState(false);
  const [isModalLimparTudo, setIsModalLimparTudo] = useState(false);
  const [processandoAcao, setProcessandoAcao] = useState(false);

  // Form Aferição (Sempre 20 Litros e Tolerância ± 100 ml)
  const [bicoId, setBicoId] = useState(bicos[0]?.id || '');
  const volumeNominal = 20.0; // Padrão Inmetro de 20 Litros
  const [volumeAferido, setVolumeAferido] = useState<number>(20.0);
  const [toleranciaConfigurada, setToleranciaConfigurada] = useState<number>(TOLERANCIA_DESVIO_PADRAO_L); // ± 100 ml (0.100 L)
  const [funcionarioId, setFuncionarioId] = useState(funcionarios[0]?.id || '');
  const [equipamento, setEquipamento] = useState('Medidor Padrão 20L Inmetro');
  const [observacao, setObservacao] = useState('');

  // Form Novo Bico
  const [numBico, setNumBico] = useState(bicos.length > 0 ? Math.max(...bicos.map((b) => b.numero)) + 1 : 1);
  const [bomba, setBomba] = useState('Bomba 01 (Sêxtupla - Ilha 01)');
  const [tanqueId, setTanqueId] = useState(tanques[0]?.id || '');
  const [produto, setProduto] = useState('Gasolina Comum');
  const [lado, setLado] = useState<'A' | 'B'>('A');
  const [novoBicoPrecoBase, setNovoBicoPrecoBase] = useState<number>(5.89);

  const bicoAtivo = bicos.find((b) => b.id === bicoId) || bicos[0];
  const calculoAfericaoAtiva = calcularAfericao(volumeAferido, 20.0, toleranciaConfigurada);
  const { diferenca, diferencaMl, resultado } = calculoAfericaoAtiva;

  // Lista de produtos existentes
  const produtosExistentes = useMemo(() => {
    return Array.from(new Set(bicos.map((b) => b.produto)));
  }, [bicos]);

  // Estatísticas de Preços e Descontos
  const estatisticasPrecos = useMemo(() => {
    const total = bicos.length;
    const comDesconto = bicos.filter((b) => b.temDesconto);
    const precoMedio =
      total > 0
        ? bicos.reduce((acc, b) => {
            const res = calcularPrecoEfetivoBico(b);
            return acc + res.precoFinal;
          }, 0) / total
        : 0;

    let maiorDesconto = 0;
    bicos.forEach((b) => {
      const res = calcularPrecoEfetivoBico(b);
      if (res.temDesconto && res.descontoReais > maiorDesconto) {
        maiorDesconto = res.descontoReais;
      }
    });

    return {
      total,
      totalComDesconto: comDesconto.length,
      percentualPromocao: total > 0 ? Math.round((comDesconto.length / total) * 100) : 0,
      precoMedio,
      maiorDesconto,
    };
  }, [bicos]);

  // Bicos filtrados para a visão de preços
  const bicosFiltrados = useMemo(() => {
    return bicos.filter((b) => {
      if (filtroProduto !== 'TODOS' && b.produto !== filtroProduto) return false;
      if (filtroDesconto === 'COM_DESCONTO' && !b.temDesconto) return false;
      if (filtroDesconto === 'SEM_DESCONTO' && b.temDesconto) return false;
      if (buscaTexto.trim()) {
        const query = buscaTexto.toLowerCase();
        const matchNumero = `bico ${b.numero}`.includes(query) || `${b.numero}` === query;
        const matchBomba = b.bomba.toLowerCase().includes(query);
        const matchProduto = b.produto.toLowerCase().includes(query);
        const matchMotivo = (b.motivoDesconto || '').toLowerCase().includes(query);
        if (!matchNumero && !matchBomba && !matchProduto && !matchMotivo) return false;
      }
      return true;
    });
  }, [bicos, filtroProduto, filtroDesconto, buscaTexto]);

  // Alternar Desconto de 1 Bico Rapidamente (Toggle 1-clique)
  const handleAlternarDescontoRapido = async (bico: Bico) => {
    const novoTemDesconto = !bico.temDesconto;

    // Se estiver ativando pela primeira vez sem valor de desconto configurado, abre o modal
    if (novoTemDesconto && (!bico.valorDesconto || bico.valorDesconto <= 0)) {
      setBicoParaPreco(bico);
      setIsModalPrecoBico(true);
      return;
    }

    const res = calcularPrecoEfetivoBico({
      produto: bico.produto,
      precoBase: bico.precoBase || bico.precoLitro,
      temDesconto: novoTemDesconto,
      tipoDesconto: bico.tipoDesconto || 'VALOR',
      valorDesconto: bico.valorDesconto || 0.1,
      motivoDesconto: bico.motivoDesconto || 'Promoção Pista',
    });

    const bicoAtualizado: Bico = {
      ...bico,
      temDesconto: novoTemDesconto,
      precoBase: res.precoBase,
      precoLitro: res.precoFinal,
      tipoDesconto: bico.tipoDesconto || 'VALOR',
      valorDesconto: bico.valorDesconto || 0.1,
      motivoDesconto: bico.motivoDesconto || 'Promoção Pista',
      atualizadoEm: new Date().toISOString(),
    };

    try {
      await repoBicos.save(postoId, bicoAtualizado);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'BICOS',
        'Bico',
        bico.id,
        'UPDATE',
        {
          bicoNumero: bico.numero,
          precoLitroAnterior: bico.precoLitro,
          descontoAnterior: bico.temDesconto,
        },
        {
          bicoNumero: bico.numero,
          novoPrecoLitro: res.precoFinal,
          descontoAtivo: novoTemDesconto,
          descontoReais: res.descontoReais,
          motivo: bico.motivoDesconto,
        }
      );
      onReload();
    } catch (err) {
      console.error('Erro ao alternar desconto:', err);
      alert('Erro ao alternar desconto do bico.');
    }
  };

  // Salvar Preço e Desconto Individual
  const handleSalvarPrecoBico = async (bicoAtualizado: Bico) => {
    const bicoAnterior = bicos.find((b) => b.id === bicoAtualizado.id);
    await repoBicos.save(postoId, bicoAtualizado);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'BICOS',
      'Bico',
      bicoAtualizado.id,
      'UPDATE',
      bicoAnterior as unknown as Record<string, unknown>,
      bicoAtualizado as unknown as Record<string, unknown>
    );
    onReload();
  };

  // Salvar Preços e Descontos em Lote
  const handleSalvarPrecosLote = async (bicosAtualizados: Bico[]) => {
    for (const b of bicosAtualizados) {
      await repoBicos.save(postoId, b);
    }
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'BICOS',
      'Bico',
      'LOTE',
      'UPDATE',
      { quantidadeBicosAfetados: bicosAtualizados.length },
      {
        bicos: bicosAtualizados.map((b) => ({
          numero: b.numero,
          produto: b.produto,
          precoBase: b.precoBase,
          precoLitro: b.precoLitro,
          temDesconto: b.temDesconto,
        })),
      }
    );
    onReload();
  };

  // Ligar ou desligar todos os descontos dos bicos filtrados
  const handleAlternarTodosDescontos = async (ativar: boolean) => {
    const confirmMsg = ativar
      ? `Deseja ativar o desconto promocional em todos os ${bicosFiltrados.length} bicos listados?`
      : `Deseja desativar o desconto promocional e restaurar o preço base em todos os ${bicosFiltrados.length} bicos listados?`;

    if (!window.confirm(confirmMsg)) return;

    const atualizados: Bico[] = bicosFiltrados.map((b) => {
      const res = calcularPrecoEfetivoBico({
        produto: b.produto,
        precoBase: b.precoBase || b.precoLitro,
        temDesconto: ativar,
        tipoDesconto: b.tipoDesconto || 'VALOR',
        valorDesconto: b.valorDesconto || 0.1,
        motivoDesconto: b.motivoDesconto || 'Promoção Pista',
      });
      return {
        ...b,
        temDesconto: ativar,
        precoBase: res.precoBase,
        precoLitro: res.precoFinal,
        tipoDesconto: b.tipoDesconto || 'VALOR',
        valorDesconto: b.valorDesconto || 0.1,
        motivoDesconto: b.motivoDesconto || 'Promoção Pista',
        atualizadoEm: new Date().toISOString(),
      };
    });

    await handleSalvarPrecosLote(atualizados);
  };

  // Abrir modal para alterar cadastro completo de um Bico
  const abrirModalEditarBico = (b: Bico) => {
    setBicoEditandoCadastro(b);
    setNumBico(b.numero);
    setBomba(b.bomba);
    setTanqueId(b.tanqueId);
    setProduto(b.produto);
    setLado(b.lado);
    setNovoBicoPrecoBase(b.precoBase || b.precoLitro || 5.89);
    setIsModalBico(true);
  };

  // Salvar Novo Bico ou Alterar Bico Existente
  const handleSalvarBico = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = bicoEditandoCadastro?.id || `bico-${Date.now()}`;
    const precoPadrao = PRECOS_PADRAO_COMBUSTIVEL[produto] || novoBicoPrecoBase || 5.89;

    const novoBico: Bico = {
      ...(bicoEditandoCadastro || {}),
      id,
      postoId,
      numero: numBico,
      bomba,
      tanqueId,
      produto,
      lado,
      status: bicoEditandoCadastro?.status || 'ATIVO',
      precoBase: novoBicoPrecoBase || precoPadrao,
      precoLitro: novoBicoPrecoBase || precoPadrao,
      temDesconto: bicoEditandoCadastro?.temDesconto || false,
      criadoEm: bicoEditandoCadastro?.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await repoBicos.save(postoId, novoBico);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'BICOS',
      'Bico',
      id,
      bicoEditandoCadastro ? 'UPDATE' : 'CREATE',
      bicoEditandoCadastro as unknown as Record<string, unknown>,
      novoBico as unknown as Record<string, unknown>
    );

    setIsModalBico(false);
    setBicoEditandoCadastro(null);
    onReload();
  };

  // Excluir Bico
  const handleConfirmarExclusaoBico = async () => {
    if (!bicoParaExcluir) return;
    setProcessandoAcao(true);
    try {
      await repoBicos.delete(postoId, bicoParaExcluir.id);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'BICOS',
        'Bico',
        bicoParaExcluir.id,
        'DELETE',
        bicoParaExcluir as unknown as Record<string, unknown>,
        null
      );
      setIsModalExcluirBico(false);
      setBicoParaExcluir(null);
      onReload();
    } catch (err) {
      console.error('Erro ao excluir bico:', err);
      alert('Erro ao excluir bico.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Handlers de Aferição
  const handleSalvarAfericao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bicoAtivo) return;

    const id = `afericao-${Date.now()}`;
    const novaAfericao: Afericao = {
      id,
      postoId,
      bicoId: bicoAtivo.id,
      tanqueId: bicoAtivo.tanqueId,
      produto: bicoAtivo.produto,
      funcionarioId,
      data: new Date().toISOString().slice(0, 10),
      hora: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      volumeNominal,
      volumeAferido,
      diferenca,
      toleranciaConfigurada,
      resultado,
      equipamento,
      observacao,
      criadoEm: new Date().toISOString(),
    };

    await repoAfericoes.save(postoId, novaAfericao);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'AFERICOES',
      'Afericao',
      id,
      'CREATE',
      null,
      novaAfericao as unknown as Record<string, unknown>
    );

    setIsModalAfericao(false);
    onReload();
  };

  const handleEditarAfericao = (a: Afericao) => {
    setAfericaoParaEditar(a);
    setIsModalEditarAfericao(true);
  };

  const handleSalvarEdicaoAfericao = async (afericaoAtualizada: Afericao) => {
    await repoAfericoes.save(postoId, afericaoAtualizada);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'AFERICOES',
      'Afericao',
      afericaoAtualizada.id,
      'UPDATE',
      afericaoParaEditar as unknown as Record<string, unknown>,
      afericaoAtualizada as unknown as Record<string, unknown>
    );
    setIsModalEditarAfericao(false);
    setAfericaoParaEditar(null);
    onReload();
  };

  const handleSolicitarExclusao = (a: Afericao) => {
    setAfericaoParaExcluir(a);
    setIsModalExcluirAfericao(true);
  };

  const handleConfirmarExclusao = async () => {
    if (!afericaoParaExcluir) return;
    setProcessandoAcao(true);
    try {
      await repoAfericoes.delete(postoId, afericaoParaExcluir.id);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'AFERICOES',
        'Afericao',
        afericaoParaExcluir.id,
        'DELETE',
        afericaoParaExcluir as unknown as Record<string, unknown>,
        null
      );
      setIsModalExcluirAfericao(false);
      setAfericaoParaExcluir(null);
      onReload();
    } catch (err) {
      console.error('Erro ao excluir aferição:', err);
      alert('Erro ao excluir registro de aferição.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleConfirmarLimpezaGeral = async () => {
    setProcessandoAcao(true);
    try {
      await repoAfericoes.clearAll(postoId);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'AFERICOES',
        'Afericao',
        'TODAS',
        'DELETE',
        { totalRemovidos: afericoes.length },
        null
      );
      setIsModalLimparTudo(false);
      onReload();
    } catch (err) {
      console.error('Erro ao limpar histórico de aferições:', err);
      alert('Erro ao limpar histórico de aferições.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Configurar estrutura limpa de 2 Bombas Sêxtuplas (3 Bicos Lado A e 3 Bicos Lado B = 12 bicos) sem aferições de demonstração
  const handleGerarPistaPadrao = async () => {
    setProcessandoAcao(true);
    try {
      const padraoBicos: Array<{
        num: number;
        bomba: string;
        lado: 'A' | 'B';
        prod: string;
        preco: number;
      }> = [
        // Bomba 01 — 3 Bicos Lado A e 3 Bicos Lado B
        { num: 1, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'A', prod: 'Gasolina Comum', preco: 5.89 },
        { num: 2, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'A', prod: 'Gasolina Aditivada', preco: 6.09 },
        { num: 3, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'A', prod: 'Etanol Hidratado', preco: 3.99 },
        { num: 4, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'B', prod: 'Gasolina Comum', preco: 5.89 },
        { num: 5, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'B', prod: 'Gasolina Aditivada', preco: 6.09 },
        { num: 6, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'B', prod: 'Etanol Hidratado', preco: 3.99 },
        // Bomba 02 — 3 Bicos Lado A e 3 Bicos Lado B
        { num: 7, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'A', prod: 'Gasolina Comum', preco: 5.89 },
        { num: 8, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'A', prod: 'Etanol Hidratado', preco: 3.99 },
        { num: 9, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'A', prod: 'Diesel S10', preco: 6.19 },
        { num: 10, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'B', prod: 'Gasolina Comum', preco: 5.89 },
        { num: 11, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'B', prod: 'Etanol Hidratado', preco: 3.99 },
        { num: 12, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'B', prod: 'Diesel S10', preco: 6.19 },
      ];

      for (const item of padraoBicos) {
        const bId = `bico-${item.num}`;
        const novoB: Bico = {
          id: bId,
          postoId,
          numero: item.num,
          bomba: item.bomba,
          tanqueId: tanques[0]?.id || '',
          produto: item.prod,
          lado: item.lado,
          status: 'ATIVO',
          precoBase: item.preco,
          precoLitro: item.preco,
          temDesconto: false,
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        };
        await repoBicos.save(postoId, novoB);
      }

      onReload();
    } catch (err) {
      console.error('Erro ao configurar bombas:', err);
    } finally {
      setProcessandoAcao(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-amber-600" />
            Mapa Visual de Bombas, Diagnóstico 20L & Preços
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Diagrama interativo de bombas (Lado A e Lado B), diagnóstico metrológico da última aferição de 20L e gestão de preços por bico.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {abaAtiva === 'AFERICOES' && bicos.length === 0 && (
            <button
              type="button"
              onClick={handleGerarPistaPadrao}
              disabled={processandoAcao}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs transition"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              Gerar Bombas Exemplo
            </button>
          )}

          {abaAtiva === 'PRECOS' && (
            <button
              onClick={() => setIsModalPrecosLote(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs border border-blue-200 transition"
              title="Ajustar preço base e descontos de múltiplos bicos"
            >
              <Sparkles className="w-4 h-4 text-blue-600" />
              Alternar em Lote
            </button>
          )}

          <button
            onClick={() => {
              setNumBico(bicos.length > 0 ? Math.max(...bicos.map((b) => b.numero)) + 1 : 1);
              setIsModalBico(true);
            }}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
          >
            + Novo Bico
          </button>

          <button
            onClick={() => setIsModalAfericao(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition shadow-sm text-xs"
          >
            <Plus className="w-4 h-4" />
            Registrar Aferição 20L
          </button>
        </div>
      </div>

      {/* Abas de Navegação */}
      <div className="flex flex-wrap border-b border-slate-200 gap-2 sm:gap-6 bg-white px-6 pt-3 rounded-t-xl border-t border-x">
        <button
          type="button"
          onClick={() => setAbaAtiva('AFERICOES')}
          className={`pb-3 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            abaAtiva === 'AFERICOES'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Fuel className="w-4 h-4" />
          Diagrama da Bomba (Lado A / B) & Diagnóstico 20L
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">
            {bicos.length} bicos • {afericoes.length} aferições
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('PRECOS')}
          className={`pb-3 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            abaAtiva === 'PRECOS'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Alternação de Preço & Descontos por Bico
          {estatisticasPrecos.totalComDesconto > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
              {estatisticasPrecos.totalComDesconto} com desconto
            </span>
          )}
        </button>
      </div>

      {/* CONTEÚDO DA ABA: PREÇOS & DESCONTOS POR BICO */}
      {abaAtiva === 'PRECOS' && (
        <div className="space-y-6">
          {/* Cards de Métricas e Resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold block">Total de Bicos Ativos</span>
              <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
                {estatisticasPrecos.total}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                {produtosExistentes.length} combustíveis diferentes
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs bg-emerald-50/20">
              <span className="text-xs text-emerald-800 font-semibold block flex items-center justify-between">
                <span>Bicos com Desconto</span>
                <Tag className="w-3.5 h-3.5 text-emerald-600" />
              </span>
              <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
                {estatisticasPrecos.totalComDesconto}
                <span className="text-xs font-normal text-emerald-600 ml-1.5">
                  ({estatisticasPrecos.percentualPromocao}% da pista)
                </span>
              </div>
              <span className="text-[11px] text-emerald-600 mt-0.5 block">
                Preços diferenciados ativos
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold block">Preço Médio Praticado</span>
              <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
                {formatarPrecoLitro(estatisticasPrecos.precoMedio, 2)}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">Média geral ponderada</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs bg-amber-50/20">
              <span className="text-xs text-amber-800 font-semibold block flex items-center justify-between">
                <span>Maior Desconto Vigente</span>
                <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
              </span>
              <div className="text-2xl font-bold text-amber-700 mt-1 font-mono">
                {estatisticasPrecos.maiorDesconto > 0
                  ? `-${formatarPrecoLitro(estatisticasPrecos.maiorDesconto, 2)}`
                  : 'R$ 0,00'}
              </div>
              <span className="text-[11px] text-amber-600 mt-0.5 block">
                Abatimento máximo por litro
              </span>
            </div>
          </div>

          {/* Barra de Filtros e Ações Rápidas */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Filtro Produto */}
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={filtroProduto}
                  onChange={(e) => setFiltroProduto(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden"
                >
                  <option value="TODOS">Todos os Combustíveis ({bicos.length})</option>
                  {produtosExistentes.map((p) => (
                    <option key={p} value={p}>
                      {p} ({bicos.filter((b) => b.produto === p).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Desconto */}
              <select
                value={filtroDesconto}
                onChange={(e) => setFiltroDesconto(e.target.value as any)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="COM_DESCONTO">Somente com Desconto Ativo</option>
                <option value="SEM_DESCONTO">Preço Padrão (Sem Desconto)</option>
              </select>

              {/* Busca Textual */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar bico, bomba..."
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 w-44"
                />
              </div>
            </div>

            {/* Ações em Massa para os Bicos Listados */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAlternarTodosDescontos(true)}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                title="Ativar desconto em todos os bicos exibidos"
              >
                Ativar Todos os Descontos
              </button>
              <button
                type="button"
                onClick={() => handleAlternarTodosDescontos(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition"
                title="Desativar descontos e voltar ao preço de tabela em todos os bicos exibidos"
              >
                Desativar Todos
              </button>
            </div>
          </div>

          {/* Grid de Cards de Bicos com Preços & Descontos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {bicosFiltrados.map((b) => {
              const res = calcularPrecoEfetivoBico(b);
              const tanque = tanques.find((t) => t.id === b.tanqueId);

              return (
                <div
                  key={b.id}
                  className={`bg-white rounded-xl border p-4 shadow-sm transition hover:shadow-md flex flex-col justify-between ${
                    res.temDesconto
                      ? 'border-emerald-300 ring-1 ring-emerald-200/60'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Cabeçalho do Card */}
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">
                          Bico {b.numero}
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">
                          Lado {b.lado}
                        </span>
                      </div>

                      {/* Botões de Alterar e Excluir Bico */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => abrirModalEditarBico(b)}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                          title="Alterar Cadastro do Bico"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBicoParaExcluir(b);
                            setIsModalExcluirBico(true);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="Remover Bico"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Dados do Combustível e Bomba */}
                    <div className="mt-2.5">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                        {b.produto}
                      </span>
                      <div className="text-xs text-slate-500 mt-1 truncate">
                        {b.bomba} {tanque ? `• ${tanque.codigo}` : ''}
                      </div>
                    </div>

                    {/* Seção de Preço Base e Desconto */}
                    <div className="mt-3.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200/80 space-y-1 text-xs">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Preço Base (Tabela):</span>
                        <span className="font-mono font-semibold text-slate-700">
                          {formatarPrecoLitro(res.precoBase, 3)}
                        </span>
                      </div>

                      {res.temDesconto ? (
                        <div className="flex items-center justify-between text-emerald-700 font-semibold pt-1 border-t border-slate-200/60">
                          <span className="flex items-center gap-1 text-[11px]">
                            <Tag className="w-3 h-3 text-emerald-600" />
                            Desconto ({res.descontoPercentual}%):
                          </span>
                          <span className="font-mono">
                            -{formatarPrecoLitro(res.descontoReais, 3)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-200/60">
                          <span>Desconto Promocional:</span>
                          <span>Inativo</span>
                        </div>
                      )}

                      {b.motivoDesconto && res.temDesconto && (
                        <div className="text-[10px] text-emerald-800 font-medium truncate pt-0.5" title={b.motivoDesconto}>
                          Motivo: {b.motivoDesconto}
                        </div>
                      )}
                    </div>

                    {/* Preço Efetivo na Bomba */}
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Preço Vigente na Bomba
                        </span>
                        <span
                          className={`text-xl font-extrabold font-mono ${
                            res.temDesconto ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {formatarPrecoLitro(res.precoFinal, 3)}
                          <span className="text-[11px] font-normal text-slate-500 ml-1">/L</span>
                        </span>
                      </div>

                      {res.temDesconto && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold border border-emerald-200">
                          PROMOÇÃO
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações e Alternador Rápido de Preço */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                    {/* Switch de Alternação Rápida */}
                    <div className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                      <span className="text-xs font-semibold text-slate-700">
                        {b.temDesconto ? 'Desconto Ativo' : 'Preço Normal'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAlternarDescontoRapido(b)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          b.temDesconto ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}
                        title={
                          b.temDesconto
                            ? 'Clique para alternar para o preço base sem desconto'
                            : 'Clique para ativar o desconto promocional deste bico'
                        }
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            b.temDesconto ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Botão Configurar Preço e Desconto */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBicoParaPreco(b);
                          setIsModalPrecoBico(true);
                        }}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        Configurar
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setBicoId(b.id);
                          setAbaAtiva('AFERICOES');
                          setIsModalAfericao(true);
                        }}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition"
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        Aferir 20L
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {bicosFiltrados.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200 text-slate-500">
              <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-sm text-slate-700">Nenhum bico encontrado com os filtros selecionados.</p>
              <p className="text-xs text-slate-400 mt-1">Limpe os filtros para visualizar todos os bicos cadastrados.</p>
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA: DIAGRAMA DA BOMBA & AFERIÇÕES REGULATÓRIAS */}
      {abaAtiva === 'AFERICOES' && (
        <div className="space-y-6">
          {/* Diagrama Visual Interativo da Bomba de Combustível (Lado A e Lado B) + Diagnóstico */}
          <DiagramaBombaCombustivel
            bicos={bicos}
            afericoes={afericoes}
            tanques={tanques}
            funcionarios={funcionarios}
            selectedBicoId={bicoId || bicos[0]?.id || ''}
            onSelectBico={(id) => setBicoId(id)}
            onAbrirModalAfericao={(id) => {
              setBicoId(id);
              setIsModalAfericao(true);
            }}
            onAbrirModalPreco={(b) => {
              setBicoParaPreco(b);
              setIsModalPrecoBico(true);
            }}
            onAbrirModalNovoBico={() => {
              setNumBico(bicos.length > 0 ? Math.max(...bicos.map((b) => b.numero)) + 1 : 1);
              setIsModalBico(true);
            }}
            onGerarPistaPadrao={handleGerarPistaPadrao}
          />

          {/* Tabela de Histórico de Aferições */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-700 text-sm">
                <History className="w-4 h-4 text-slate-500" />
                Histórico Recente de Aferições de Pista ({afericoes.length})
              </div>
              <button
                type="button"
                onClick={() => setIsModalLimparTudo(true)}
                disabled={afericoes.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Excluir todas as aferições salvas"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar Histórico
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                  <tr>
                    <th className="px-5 py-3">Data / Hora</th>
                    <th className="px-5 py-3">Bico / Bomba</th>
                    <th className="px-5 py-3">Combustível</th>
                    <th className="px-5 py-3">Responsável</th>
                    <th className="px-5 py-3 text-right">Vol. Lido no Balde</th>
                    <th className="px-5 py-3 text-right">Desvio Apurado</th>
                    <th className="px-5 py-3 text-center">Faixa Inmetro</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {afericoes.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-slate-400">
                        Nenhuma aferição de 20L registrada até o momento.
                      </td>
                    </tr>
                  ) : (
                    afericoes.map((a) => {
                      const bico = bicos.find((b) => b.id === a.bicoId);
                      const func = funcionarios.find((f) => f.id === a.funcionarioId);
                      const diffMl = Math.round(a.diferenca * 1000);
                      const tolMl = Math.round((a.toleranciaConfigurada || 0.1) * 1000);
                      const isOk = Math.abs(diffMl) <= tolMl;

                      return (
                        <tr key={a.id} className="hover:bg-slate-50 transition">
                          <td className="px-5 py-3.5 font-mono">
                            {a.data} {a.hora}
                          </td>
                          <td className="px-5 py-3.5 font-medium text-slate-800">
                            Bico {bico?.numero || '—'} ({bico?.bomba || 'Bomba'})
                          </td>
                          <td className="px-5 py-3.5">{a.produto}</td>
                          <td className="px-5 py-3.5">{func?.nome || 'Não informado'}</td>
                          <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">
                            {a.volumeAferido.toFixed(3)} L
                          </td>
                          <td
                            className={`px-5 py-3.5 text-right font-mono font-extrabold ${
                              diffMl === 0
                                ? 'text-slate-700'
                                : isOk
                                ? 'text-emerald-700'
                                : 'text-red-700'
                            }`}
                          >
                            {diffMl > 0 ? `+${diffMl}` : diffMl} ml
                          </td>
                          <td className="px-5 py-3.5 text-center font-mono text-[11px] text-slate-500">
                            ± {tolMl} ml
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {isOk ? (
                              <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Conforme
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-800 bg-red-50 px-2.5 py-1 rounded-full text-xs font-bold border border-red-200">
                                <XCircle className="w-3.5 h-3.5 text-red-600" /> Fora de ±{tolMl}ml
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditarAfericao(a)}
                                className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition border border-transparent hover:border-amber-200"
                                title="Editar Aferição"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSolicitarExclusao(a)}
                                className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition border border-transparent hover:border-red-200"
                                title="Excluir Aferição"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Configurar Preço e Desconto por Bico */}
      <ModalConfigurarPrecoBico
        isOpen={isModalPrecoBico}
        bico={bicoParaPreco}
        onClose={() => {
          setIsModalPrecoBico(false);
          setBicoParaPreco(null);
        }}
        onSalvar={handleSalvarPrecoBico}
      />

      {/* Modal Alternar Preços em Lote com Desconto Seletivo */}
      <ModalAlternarPrecosLote
        isOpen={isModalPrecosLote}
        bicos={bicos}
        onClose={() => setIsModalPrecosLote(false)}
        onSalvarLote={handleSalvarPrecosLote}
      />

      {/* Modal de Aferição (Sempre 20L e Desvio entre ± 100 ml) */}
      {isModalAfericao && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-200">
                  <Gauge className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Nova Aferição de Bico (Balde 20L)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Volume nominal de 20 Litros com verificação de desvio regulamentar entre ± 100 ml.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalAfericao(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSalvarAfericao} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Bico Selecionado
                  </label>
                  <select
                    value={bicoId}
                    onChange={(e) => setBicoId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                  >
                    {bicos.map((b) => (
                      <option key={b.id} value={b.id}>
                        Bico {b.numero} — {b.produto} ({b.bomba})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Responsável pela Aferição
                  </label>
                  <select
                    value={funcionarioId}
                    onChange={(e) => setFuncionarioId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome} ({f.cargo})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Volume Padrão Nominal 20L e Leitura Real no Balde */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Volume Padrão Nominal
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      disabled
                      value="20,000 Litros"
                      className="w-full px-3 py-2.5 border border-slate-200 bg-slate-100/90 rounded-lg text-xs font-bold font-mono text-slate-700 cursor-not-allowed"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                      Sempre 20L
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Balde aferidor certificado e lacrado pelo Inmetro
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Valor Lido no Balde (Litros)</span>
                    <span className="font-mono font-bold text-amber-700">
                      {volumeAferido.toFixed(3)} L
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={volumeAferido}
                    onChange={(e) => setVolumeAferido(parseFloat(e.target.value) || 20)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                  
                  {/* Botões de Ajuste Rápido em ml */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 mr-0.5">Ajuste:</span>
                    <button
                      type="button"
                      onClick={() => setVolumeAferido((v) => Math.max(0, Math.round((v - 0.05) * 1000) / 1000))}
                      className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700"
                    >
                      -50ml
                    </button>
                    <button
                      type="button"
                      onClick={() => setVolumeAferido((v) => Math.max(0, Math.round((v - 0.01) * 1000) / 1000))}
                      className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700"
                    >
                      -10ml
                    </button>
                    <button
                      type="button"
                      onClick={() => setVolumeAferido(20.0)}
                      className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700 flex items-center gap-1"
                      title="Restaurar para exatos 20,000 L"
                    >
                      <RotateCcw className="w-2.5 h-2.5 text-slate-400" />
                      20L
                    </button>
                    <button
                      type="button"
                      onClick={() => setVolumeAferido((v) => Math.round((v + 0.01) * 1000) / 1000)}
                      className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700"
                    >
                      +10ml
                    </button>
                    <button
                      type="button"
                      onClick={() => setVolumeAferido((v) => Math.round((v + 0.05) * 1000) / 1000)}
                      className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700"
                    >
                      +50ml
                    </button>
                  </div>
                </div>
              </div>

              {/* Componente Gráfico e Metrológico do Desvio entre ± 100 ml */}
              <DesvioAfericaoGauge calculo={calculoAfericaoAtiva} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Equipamento Utilizado
                  </label>
                  <input
                    type="text"
                    value={equipamento}
                    onChange={(e) => setEquipamento(e.target.value)}
                    placeholder="Ex: Medidor Padrão 20L Inmetro"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Observações Operacionais
                  </label>
                  <input
                    type="text"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Lacre Inmetro, bomba lubrificada, etc."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalAfericao(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition flex items-center gap-1.5 shadow-xs"
                >
                  <Gauge className="w-4 h-4" />
                  Salvar Aferição de 20L
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo / Alterar Bico */}
      {isModalBico && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              {bicoEditandoCadastro ? `Alterar Bico ${bicoEditandoCadastro.numero}` : 'Novo Bico de Combustível'}
            </h3>

            <form onSubmit={handleSalvarBico} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Número do Bico
                  </label>
                  <input
                    type="number"
                    required
                    value={numBico}
                    onChange={(e) => setNumBico(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Lado da Bomba
                  </label>
                  <select
                    value={lado}
                    onChange={(e) => setLado(e.target.value as 'A' | 'B')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold"
                  >
                    <option value="A">Lado A</option>
                    <option value="B">Lado B</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Identificação Bomba
                </label>
                <input
                  type="text"
                  required
                  value={bomba}
                  onChange={(e) => setBomba(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Combustível / Produto
                </label>
                <select
                  value={produto}
                  onChange={(e) => {
                    const prod = e.target.value;
                    setProduto(prod);
                    setNovoBicoPrecoBase(PRECOS_PADRAO_COMBUSTIVEL[prod] || 5.89);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="Gasolina Comum">Gasolina Comum</option>
                  <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                  <option value="Etanol Hidratado">Etanol Hidratado</option>
                  <option value="Diesel S10">Diesel S10</option>
                  <option value="Diesel S500">Diesel S500</option>
                  <option value="GNV">GNV</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Preço Base Inicial (R$ / Litro)
                </label>
                <input
                  type="number"
                  step="0.001"
                  required
                  value={novoBicoPrecoBase}
                  onChange={(e) => setNovoBicoPrecoBase(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Tanque Vinculado
                </label>
                <select
                  value={tanqueId}
                  onChange={(e) => setTanqueId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  {tanques.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} ({t.produto})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalBico(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900"
                >
                  Salvar Bico
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão de Bico */}
      {isModalExcluirBico && bicoParaExcluir && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-2.5 bg-red-50 rounded-xl border border-red-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Remover Bico da Pista</h4>
                <p className="text-xs text-slate-500">Confirmação de exclusão</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5 my-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Identificação:</span>
                <strong>Bico {bicoParaExcluir.numero} (Lado {bicoParaExcluir.lado})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Combustível:</span>
                <strong>{bicoParaExcluir.produto}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bomba:</span>
                <span>{bicoParaExcluir.bomba}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Preço Vigente:</span>
                <strong className="font-mono">{formatarPrecoLitro(bicoParaExcluir.precoLitro || bicoParaExcluir.precoBase || 5.89, 3)}</strong>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Tem certeza que deseja remover este bico? Os registros históricos e fechamentos anteriores permanecerão seguros.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsModalExcluirBico(false);
                  setBicoParaExcluir(null);
                }}
                disabled={processandoAcao}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusaoBico}
                disabled={processandoAcao}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {processandoAcao ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Aferição */}
      <ModalEditarAfericao
        isOpen={isModalEditarAfericao}
        afericao={afericaoParaEditar}
        bicos={bicos}
        funcionarios={funcionarios}
        onClose={() => {
          setIsModalEditarAfericao(false);
          setAfericaoParaEditar(null);
        }}
        onSalvar={handleSalvarEdicaoAfericao}
      />

      {/* Modal de Confirmação de Exclusão Individual de Aferição */}
      {isModalExcluirAfericao && afericaoParaExcluir && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-2.5 bg-red-50 rounded-xl border border-red-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Excluir Registro de Aferição</h4>
                <p className="text-xs text-slate-500">Confirmação de segurança</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5 my-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Data / Hora:</span>
                <strong>
                  {afericaoParaExcluir.data} às {afericaoParaExcluir.hora}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Combustível:</span>
                <strong>{afericaoParaExcluir.produto}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Volume Aferido:</span>
                <strong className="font-mono">
                  {afericaoParaExcluir.volumeAferido.toFixed(3)} L (
                  {Math.round(afericaoParaExcluir.diferenca * 1000)} ml)
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Resultado:</span>
                <span
                  className={`font-bold ${
                    afericaoParaExcluir.resultado === 'CONFORME'
                      ? 'text-emerald-700'
                      : 'text-red-700'
                  }`}
                >
                  {afericaoParaExcluir.resultado}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Tem certeza de que deseja remover esta aferição? Esta ação será registrada no log de auditoria.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsModalExcluirAfericao(false);
                  setAfericaoParaExcluir(null);
                }}
                disabled={processandoAcao}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusao}
                disabled={processandoAcao}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {processandoAcao ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Limpeza Geral de Aferições */}
      {isModalLimparTudo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-3 bg-red-100 rounded-xl border border-red-200">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Limpar Todo o Histórico de Aferições?</h4>
                <p className="text-xs text-red-600 font-semibold">Ação irreversível de limpeza</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed my-4">
              Você está prestes a remover permanentemente todos os <strong>{afericoes.length}</strong> registros
              de aferição de bicos cadastrados para este posto. Deseja prosseguir com a exclusão em massa?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalLimparTudo(false)}
                disabled={processandoAcao}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarLimpezaGeral}
                disabled={processandoAcao}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {processandoAcao ? 'Limpando...' : 'Sim, Limpar Todos os Dados'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
