import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Bico, Afericao, Funcionario, Tanque } from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import {
  calcularAfericao,
  TOLERANCIA_DESVIO_PADRAO_L,
  TOLERANCIA_DESVIO_PADRAO_ML,
  formatarMoeda,
} from '../../utils/calculations';
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
  Database,
  Camera,
  FileText,
  Save,
  FlaskConical,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { ModalEditarAfericao } from './ModalEditarAfericao';
import { ModalConfigurarPrecoBico } from './ModalConfigurarPrecoBico';
import { ModalAlternarPrecosLote } from './ModalAlternarPrecosLote';
import { DesvioAfericaoGauge } from './DesvioAfericaoGauge';
import { DiagramaBombaCombustivel } from './DiagramaBombaCombustivel';
import { PainelCadastroERelatorioFoto } from './PainelCadastroERelatorioFoto';

const repoTanques = new PostoSubcollectionRepository<Tanque>('tanques');
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
  const [abaAtiva, setAbaAtiva] = useState<
    'AFERICOES' | 'CADASTRO_TANQUES_BICOS' | 'RELATORIO_FOTO' | 'PRECOS'
  >('AFERICOES');

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
  const [encerranteFinalAfericao, setEncerranteFinalAfericao] = useState<string>('');
  const [lacreInmetroAfericao, setLacreInmetroAfericao] = useState<string>('');
  const [fotoAfericaoBase64, setFotoAfericaoBase64] = useState<string>('');
  const [resumoFotoAfericao, setResumoFotoAfericao] = useState<string>('');
  const [lendoFotoModal, setLendoFotoModal] = useState<boolean>(false);
  const modalFotoInputRef = useRef<HTMLInputElement | null>(null);

  // Form Novo Bico
  const [numBico, setNumBico] = useState(bicos.length > 0 ? Math.max(...bicos.map((b) => b.numero)) + 1 : 1);
  const [bomba, setBomba] = useState('Bomba 01 (Sêxtupla - Ilha 01)');
  const [tanqueId, setTanqueId] = useState(tanques[0]?.id || '');
  const [produto, setProduto] = useState('Gasolina Comum');
  const [lado, setLado] = useState<'A' | 'B'>('A');
  const [novoBicoPrecoBase, setNovoBicoPrecoBase] = useState<number>(5.89);

  // Sincroniza IDs selecionados quando dados da nuvem chegam via onSnapshot
  useEffect(() => {
    if (!bicoId && bicos.length > 0) {
      setBicoId(bicos[0].id);
    }
  }, [bicos, bicoId]);

  useEffect(() => {
    if (!tanqueId && tanques.length > 0) {
      setTanqueId(tanques[0].id);
    }
  }, [tanques, tanqueId]);

  useEffect(() => {
    if (!funcionarioId && funcionarios.length > 0) {
      setFuncionarioId(funcionarios[0].id);
    }
  }, [funcionarios, funcionarioId]);

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

  // Auditoria e Métricas de Aferições: Bicos, Valores e Impacto em 1.000 L
  const auditoriaAfericoesMetricas = useMemo(() => {
    const mapaCombustivel = new Map<
      string,
      {
        produto: string;
        bicosNumeros: Set<number>;
        qtdTestes: number;
        volumeTotal: number;
        valorTotal: number;
        desvioTotalMl: number;
        conformes: number;
      }
    >();

    const mapaBico = new Map<
      number,
      {
        bicoNumero: number;
        bicoId: string;
        bombaNome: string;
        ladoBomba: string;
        produto: string;
        tanqueCodigo: string;
        encerranteFinal?: number;
        lacreInmetro?: string;
        qtdTestes: number;
        volumeTotal: number;
        precoLitro: number;
        valorTotal: number;
        desvioTotalMl: number;
        conformes: number;
        naoConformes: number;
      }
    >();

    let valorTotalGeral = 0;
    let volumeTotalGeral = 0;
    let desvioTotalMlGeral = 0;

    afericoes.forEach((a) => {
      const prod = a.produto || 'Combustível';
      const volNominal = Number(a.volumeNominal) || 20;
      const vol = Number(a.volumeAferido) || 20;
      const desvioMl = Math.round((Number(a.diferenca) || 0) * 1000);
      const isConforme = a.resultado === 'CONFORME';

      const bicoNum =
        a.bicoNumero ??
        (a.bicoId ? parseInt(a.bicoId.replace(/\D/g, ''), 10) : undefined) ??
        1;
      const bicoCad = bicos.find((b) => b.id === a.bicoId || b.numero === bicoNum);
      const precoLitro = bicoCad
        ? calcularPrecoEfetivoBico(bicoCad).precoFinal
        : PRECOS_PADRAO_COMBUSTIVEL[prod] || 5.89;
      const valorTeste = volNominal * precoLitro;

      valorTotalGeral += valorTeste;
      volumeTotalGeral += vol;
      desvioTotalMlGeral += desvioMl;

      // Mapa por Combustível
      const comb = mapaCombustivel.get(prod) || {
        produto: prod,
        bicosNumeros: new Set<number>(),
        qtdTestes: 0,
        volumeTotal: 0,
        valorTotal: 0,
        desvioTotalMl: 0,
        conformes: 0,
      };
      comb.bicosNumeros.add(bicoNum);
      comb.qtdTestes += 1;
      comb.volumeTotal += vol;
      comb.valorTotal += valorTeste;
      comb.desvioTotalMl += desvioMl;
      if (isConforme) comb.conformes += 1;
      mapaCombustivel.set(prod, comb);

      // Mapa por Bico
      const bicoEx = mapaBico.get(bicoNum) || {
        bicoNumero: bicoNum,
        bicoId: a.bicoId || `bico-${bicoNum}`,
        bombaNome: a.bombaNome || bicoCad?.bomba || 'Bomba 01',
        ladoBomba: a.ladoBomba || bicoCad?.lado || 'A',
        produto: prod,
        tanqueCodigo: a.tanqueCodigo || a.tanqueId || bicoCad?.tanqueCodigo || 'TQ',
        encerranteFinal: a.encerranteFinal ?? (a as any).encerranteLeitura,
        lacreInmetro: a.lacreInmetro || bicoCad?.lacreBomba,
        qtdTestes: 0,
        volumeTotal: 0,
        precoLitro,
        valorTotal: 0,
        desvioTotalMl: 0,
        conformes: 0,
        naoConformes: 0,
      };
      bicoEx.qtdTestes += 1;
      bicoEx.volumeTotal += vol;
      bicoEx.valorTotal += valorTeste;
      bicoEx.desvioTotalMl += desvioMl;
      if (isConforme) bicoEx.conformes += 1;
      else bicoEx.naoConformes += 1;
      if (a.encerranteFinal) bicoEx.encerranteFinal = a.encerranteFinal;
      if (a.lacreInmetro) bicoEx.lacreInmetro = a.lacreInmetro;
      mapaBico.set(bicoNum, bicoEx);
    });

    const listaCombustivel = Array.from(mapaCombustivel.values()).map((c) => {
      const desvioMedioMl = c.qtdTestes > 0 ? Math.round(c.desvioTotalMl / c.qtdTestes) : 0;
      const impactoLitros1000L = Number(((desvioMedioMl * 50) / 1000).toFixed(2));
      const precoMedio = c.volumeTotal > 0 ? c.valorTotal / c.volumeTotal : 5.89;
      const impactoFinanceiro1000L = Number((impactoLitros1000L * precoMedio).toFixed(2));
      return {
        ...c,
        desvioMedioMl,
        precoMedio,
        impactoLitros1000L,
        impactoFinanceiro1000L,
      };
    });

    const listaBicos = Array.from(mapaBico.values())
      .map((b) => {
        const desvioMedioMl = b.qtdTestes > 0 ? Math.round(b.desvioTotalMl / b.qtdTestes) : 0;
        const impactoLitros1000L = Number(((desvioMedioMl * 50) / 1000).toFixed(2));
        const impactoFinanceiro1000L = Number((impactoLitros1000L * b.precoLitro).toFixed(2));
        return {
          ...b,
          desvioMedioMl,
          impactoLitros1000L,
          impactoFinanceiro1000L,
        };
      })
      .sort((a, b) => a.bicoNumero - b.bicoNumero);

    const totalTestes = afericoes.length;
    const desvioMedioGeral = totalTestes > 0 ? Math.round(desvioTotalMlGeral / totalTestes) : 0;
    const impactoGeralLitros1000L = Number(((desvioMedioGeral * 50) / 1000).toFixed(2));
    const precoMedioGeral = volumeTotalGeral > 0 ? valorTotalGeral / volumeTotalGeral : 5.89;
    const impactoGeralFinanceiro1000L = Number((impactoGeralLitros1000L * precoMedioGeral).toFixed(2));

    return {
      totalTestes,
      volumeTotalGeral,
      valorTotalGeral,
      desvioMedioGeral,
      impactoGeralLitros1000L,
      impactoGeralFinanceiro1000L,
      listaCombustivel,
      listaBicos,
    };
  }, [afericoes, bicos]);

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

  // Salvar Novo Bico ou Alterar Bico Existente (garantindo que o Tanque vinculado também exista na nuvem)
  const handleSalvarBico = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = bicoEditandoCadastro?.id || `bico-${numBico}-${Date.now()}`;
    const precoPadrao = PRECOS_PADRAO_COMBUSTIVEL[produto] || novoBicoPrecoBase || 5.89;

    // Garantir tanque vinculado salvo na nuvem
    let tanqueVinc =
      tanques.find((t) => t.id === tanqueId) ||
      tanques.find((t) => t.produto.toLowerCase() === produto.toLowerCase());

    if (!tanqueVinc) {
      const codNovo = `TQ-0${tanques.length + 1}`;
      tanqueVinc = {
        id: `tq-${Date.now()}`,
        postoId,
        codigo: codNovo,
        produto,
        capacidadeNominal: 20000,
        capacidadeOperacional: 19000,
        unidade: 'Litros',
        formato: 'CILINDRICO_HORIZONTAL',
        ativo: true,
        tabelaRegua: [
          { altura: 0, volume: 0 },
          { altura: 100, volume: 9600 },
          { altura: 200, volume: 20000 },
        ],
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };
      await repoTanques.save(postoId, tanqueVinc);
    }

    const novoBico: Bico = {
      ...(bicoEditandoCadastro || {}),
      id,
      postoId,
      numero: numBico,
      bomba,
      tanqueId: tanqueVinc.id,
      tanqueCodigo: tanqueVinc.codigo,
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

  // Ler foto dentro do modal de Nova Aferição 20L
  const handleLerFotoModalAfericao = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLendoFotoModal(true);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Comprimir imagem
      const img = new Image();
      const compressed: string = await new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 680;
          let w = img.width;
          let h = img.height;
          if (w > maxW) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.72));
          } else {
            resolve(base64);
          }
        };
        img.onerror = () => resolve(base64);
        img.src = base64;
      });

      setFotoAfericaoBase64(compressed);

      const res = await fetch('/api/gemini/afericao-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: compressed,
          mimeType: 'image/jpeg',
          bicosCadastrados: bicos,
          tanquesCadastrados: tanques,
        }),
      });
      const data = await res.json();
      if (res.ok && data) {
        const primeiro = Array.isArray(data.bicosEAfericoes) ? data.bicosEAfericoes[0] : null;
        if (primeiro) {
          if (primeiro.volumeAferido) setVolumeAferido(Number(primeiro.volumeAferido));
          if (primeiro.encerranteFinal) setEncerranteFinalAfericao(String(primeiro.encerranteFinal));
          if (primeiro.lacreInmetro) setLacreInmetroAfericao(String(primeiro.lacreInmetro));
          const bMatch = bicos.find((b) => b.numero === Number(primeiro.numeroBico));
          if (bMatch) setBicoId(bMatch.id);
        }
        if (data.equipamentoIdentificado) setEquipamento(data.equipamentoIdentificado);
        const resumo = primeiro?.detalhesFotoBico || data.resumoGeralFoto || '';
        setResumoFotoAfericao(resumo);
        if (resumo) setObservacao(resumo);
      }
    } catch (err) {
      console.error('Erro ao ler foto no modal:', err);
    } finally {
      setLendoFotoModal(false);
    }
  };

  // Handlers de Aferição
  const handleSalvarAfericao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bicoAtivo) return;

    const tqObj = tanques.find((t) => t.id === bicoAtivo.tanqueId);
    const funcObj = funcionarios.find((f) => f.id === funcionarioId);
    const encNum = encerranteFinalAfericao ? parseFloat(encerranteFinalAfericao) : undefined;

    const id = `afericao-${Date.now()}`;
    const novaAfericao: Afericao = {
      id,
      postoId,
      bicoId: bicoAtivo.id,
      bicoNumero: bicoAtivo.numero,
      bombaNome: bicoAtivo.bomba,
      ladoBomba: bicoAtivo.lado,
      tanqueId: bicoAtivo.tanqueId,
      tanqueCodigo: bicoAtivo.tanqueCodigo || tqObj?.codigo || 'TQ-01',
      produto: bicoAtivo.produto,
      funcionarioId: funcionarioId || 'operador',
      responsavelNome: funcObj?.nome || userProfile?.nome || 'Operador',
      data: new Date().toISOString().slice(0, 10),
      hora: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      volumeNominal,
      volumeAferido,
      diferenca,
      toleranciaConfigurada,
      resultado,
      equipamento,
      encerranteFinal: encNum,
      lacreInmetro: lacreInmetroAfericao || bicoAtivo.lacreBomba || undefined,
      fotoEvidenciaBase64: fotoAfericaoBase64 || undefined,
      resumoFotoIA: resumoFotoAfericao || undefined,
      origemRegistro: fotoAfericaoBase64 ? 'FOTO_IA' : 'MANUAL',
      observacao: observacao || resumoFotoAfericao || undefined,
      criadoEm: new Date().toISOString(),
    };

    await repoAfericoes.save(postoId, novaAfericao);

    // Se informou encerrante ou lacre, atualiza no cadastro do bico também
    if (encNum !== undefined || lacreInmetroAfericao) {
      await repoBicos.save(postoId, {
        ...bicoAtivo,
        ultimoEncerrante: encNum ?? bicoAtivo.ultimoEncerrante,
        lacreBomba: lacreInmetroAfericao || bicoAtivo.lacreBomba,
        atualizadoEm: new Date().toISOString(),
      });
    }

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

    setFotoAfericaoBase64('');
    setResumoFotoAfericao('');
    setEncerranteFinalAfericao('');
    setLacreInmetroAfericao('');
    setObservacao('');
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

  // Configurar e Salvar estrutura limpa de 5 Tanques + 2 Bombas Sêxtuplas (12 bicos) na nuvem 24h
  const handleGerarPistaPadrao = async () => {
    setProcessandoAcao(true);
    try {
      const padraoTanques = [
        { id: 'tq-01', cod: 'TQ-01', prod: 'Gasolina Comum', capNom: 30000, capOp: 28500 },
        { id: 'tq-02', cod: 'TQ-02', prod: 'Gasolina Aditivada', capNom: 15000, capOp: 14250 },
        { id: 'tq-03', cod: 'TQ-03', prod: 'Etanol Hidratado', capNom: 20000, capOp: 19000 },
        { id: 'tq-04', cod: 'TQ-04', prod: 'Diesel S10', capNom: 30000, capOp: 28500 },
        { id: 'tq-05', cod: 'TQ-05', prod: 'Diesel S500', capNom: 15000, capOp: 14250 },
      ];

      const tanquesSalvos: Tanque[] = [];
      for (const tItem of padraoTanques) {
        const existente = tanques.find((t) => t.codigo === tItem.cod || t.produto === tItem.prod);
        const tObj: Tanque = {
          id: existente?.id || tItem.id,
          postoId,
          codigo: tItem.cod,
          produto: tItem.prod,
          capacidadeNominal: tItem.capNom,
          capacidadeOperacional: tItem.capOp,
          unidade: 'Litros',
          formato: 'CILINDRICO_HORIZONTAL',
          ativo: true,
          tabelaRegua: existente?.tabelaRegua?.length
            ? existente.tabelaRegua
            : [
                { altura: 0, volume: 0 },
                { altura: 50, volume: Math.round(tItem.capNom * 0.18) },
                { altura: 100, volume: Math.round(tItem.capNom * 0.48) },
                { altura: 150, volume: Math.round(tItem.capNom * 0.78) },
                { altura: 200, volume: tItem.capNom },
              ],
          criadoEm: existente?.criadoEm || new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        };
        await repoTanques.save(postoId, tObj);
        tanquesSalvos.push(tObj);
      }

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
        const tqVinc =
          tanquesSalvos.find((t) => t.produto.toLowerCase() === item.prod.toLowerCase()) ||
          tanquesSalvos[0];
        const novoB: Bico = {
          id: bId,
          postoId,
          numero: item.num,
          bomba: item.bomba,
          tanqueId: tqVinc?.id || '',
          tanqueCodigo: tqVinc?.codigo || 'TQ-01',
          produto: item.prod,
          lado: item.lado,
          status: 'ATIVO',
          precoBase: item.preco,
          precoLitro: item.preco,
          temDesconto: false,
          lacreBomba: `INM-${202600 + item.num}`,
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        };
        await repoBicos.save(postoId, novoB);
      }

      onReload();
    } catch (err) {
      console.error('Erro ao configurar bombas e tanques:', err);
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

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setAbaAtiva('CADASTRO_TANQUES_BICOS')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Salvar Cadastro Bicos e Tanques
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('RELATORIO_FOTO')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold rounded-lg text-xs transition shadow-xs cursor-pointer"
          >
            <Camera className="w-4 h-4 text-amber-400" />
            Relatório de Aferição com Foto
          </button>

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
              setBicoEditandoCadastro(null);
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

      {/* Abas de Navegação (Rolagem fluida no mobile) */}
      <div className="flex items-center border-b border-slate-200 gap-2 sm:gap-5 bg-white px-4 sm:px-6 pt-3 rounded-t-xl border-t border-x print:hidden overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setAbaAtiva('AFERICOES')}
          className={`pb-3 px-2 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
            abaAtiva === 'AFERICOES'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Fuel className="w-4 h-4" />
          Diagrama da Bomba & Diagnóstico 20L
          <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-amber-100 text-amber-900">
            {bicos.length} bicos • {afericoes.length} aferições
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('CADASTRO_TANQUES_BICOS')}
          className={`pb-3 px-2 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
            abaAtiva === 'CADASTRO_TANQUES_BICOS'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Database className="w-4 h-4" />
          Cadastro de Bicos & Tanques
          <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-blue-100 text-blue-900">
            {tanques.length} tanques • {bicos.length} bicos
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('RELATORIO_FOTO')}
          className={`pb-3 px-2 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
            abaAtiva === 'RELATORIO_FOTO'
              ? 'border-amber-600 text-amber-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Camera className="w-4 h-4" />
          Relatório de Aferição com Foto (IA)
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('PRECOS')}
          className={`pb-3 px-2 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
            abaAtiva === 'PRECOS'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Preços & Descontos por Bico
          {estatisticasPrecos.totalComDesconto > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-emerald-100 text-emerald-800">
              {estatisticasPrecos.totalComDesconto} com desconto
            </span>
          )}
        </button>
      </div>

      {/* CONTEÚDO DAS ABAS: CADASTRO DE BICOS/TANQUES OU RELATÓRIO DE AFERIÇÃO COM FOTO */}
      {(abaAtiva === 'CADASTRO_TANQUES_BICOS' || abaAtiva === 'RELATORIO_FOTO') && (
        <PainelCadastroERelatorioFoto
          key={abaAtiva}
          bicos={bicos}
          tanques={tanques}
          afericoes={afericoes}
          funcionarios={funcionarios}
          modoInicial={abaAtiva === 'CADASTRO_TANQUES_BICOS' ? 'CADASTRO' : 'RELATORIO_FOTO'}
          onReload={onReload}
        />
      )}

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

          {/* PAINEL DE AUDITORIA DE AFERIÇÕES: INFORMAÇÕES DE BICOS, VALOR TOTAL E IMPACTO EM 1.000 L */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  Auditoria de Aferições: Bicos Aferidos, Valores e Impacto em 1.000 L
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Cálculo automático de diferença de litros e projeção financeira para cada 1.000 L abastecidos com base nos ensaios volumétricos da coleção 'afericoes'.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {auditoriaAfericoesMetricas.totalTestes} ensaios 20L
                </span>
              </div>
            </div>

            {/* 4 Cards de Indicadores de Auditoria */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-bold uppercase text-slate-500">
                  Total de Aferições 20L
                </div>
                <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
                  {auditoriaAfericoesMetricas.totalTestes} testes
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Volume Aferido: {auditoriaAfericoesMetricas.volumeTotalGeral.toFixed(3)} L
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <div className="text-[11px] font-bold uppercase text-emerald-800 flex items-center justify-between">
                  <span>Valor Total das Aferições</span>
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-emerald-800 font-mono mt-1">
                  {formatarMoeda(auditoriaAfericoesMetricas.valorTotalGeral)}
                </div>
                <div className="text-[11px] text-emerald-700 mt-1">
                  Volume total valorado por bico
                </div>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200">
                <div className="text-[11px] font-bold uppercase text-blue-800">
                  Desvio Médio da Pista (20L)
                </div>
                <div className="text-2xl font-bold text-blue-950 font-mono mt-1">
                  {auditoriaAfericoesMetricas.desvioMedioGeral > 0 ? '+' : ''}
                  {auditoriaAfericoesMetricas.desvioMedioGeral} ml
                </div>
                <div className="text-[11px] text-blue-700 mt-1">
                  Tolerância legal Inmetro: ± 100 ml
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                <div className="text-[11px] font-bold uppercase text-amber-900 flex items-center justify-between">
                  <span>Impacto Médio / 1.000 L</span>
                  <Gauge className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="text-2xl font-bold font-mono mt-1 text-amber-900">
                  {auditoriaAfericoesMetricas.impactoGeralLitros1000L > 0 ? '+' : ''}
                  {auditoriaAfericoesMetricas.impactoGeralLitros1000L.toFixed(2)} L
                </div>
                <div className="text-[11px] text-amber-800 mt-1">
                  Equiv: {formatarMoeda(auditoriaAfericoesMetricas.impactoGeralFinanceiro1000L)} / 1.000 L
                </div>
              </div>
            </div>

            {/* TABELA 1: CÁLCULO TOTAL DE IMPACTO POR CADA TIPO DE COMBUSTÍVEL EM 1.000 L */}
            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <FlaskConical className="w-4 h-4 text-blue-600" />
                  Cálculo Total de Impacto de Litros por cada Tipo de Combustível em 1.000 L de Abastecimento
                </h4>
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  Fórmula: (Desvio 20L ÷ 20L) × 1.000L = Desvio (ml) × 50 ÷ 1.000
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Tipo de Combustível</th>
                      <th className="py-2.5 px-3">Bicos Aferidos</th>
                      <th className="py-2.5 px-3">Testes</th>
                      <th className="py-2.5 px-3">Volume Total</th>
                      <th className="py-2.5 px-3">Preço Médio</th>
                      <th className="py-2.5 px-3 font-bold text-emerald-800">Valor Total da Aferição</th>
                      <th className="py-2.5 px-3">Desvio Médio</th>
                      <th className="py-2.5 px-3 bg-blue-50 text-blue-950 font-bold">
                        Impacto Litros / 1.000 L
                      </th>
                      <th className="py-2.5 px-3 bg-blue-50 text-blue-950 font-bold">
                        Impacto R$ / 1.000 L
                      </th>
                      <th className="py-2.5 px-3">Conformidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditoriaAfericoesMetricas.listaCombustivel.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-6 text-center text-slate-400">
                          Nenhum teste de aferição registrado até o momento.
                        </td>
                      </tr>
                    ) : (
                      auditoriaAfericoesMetricas.listaCombustivel.map((c) => (
                        <tr key={c.produto} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{c.produto}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                            {Array.from(c.bicosNumeros)
                              .sort((a: number, b: number) => Number(a) - Number(b))
                              .map((n) => `Bico ${String(n).padStart(2, '0')}`)
                              .join(', ')}
                          </td>
                          <td className="py-2.5 px-3 font-mono">{c.qtdTestes} teste(s)</td>
                          <td className="py-2.5 px-3 font-mono font-semibold">{c.volumeTotal.toFixed(3)} L</td>
                          <td className="py-2.5 px-3 font-mono">{formatarMoeda(c.precoMedio)}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                            {formatarMoeda(c.valorTotal)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold">
                            <span
                              className={
                                c.desvioMedioMl > 0
                                  ? 'text-amber-700'
                                  : c.desvioMedioMl < 0
                                  ? 'text-blue-700'
                                  : 'text-slate-700'
                              }
                            >
                              {c.desvioMedioMl > 0 ? '+' : ''}
                              {c.desvioMedioMl} ml
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold bg-blue-50/40">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                                c.impactoLitros1000L > 0
                                  ? 'bg-amber-100 text-amber-900'
                                  : c.impactoLitros1000L < 0
                                  ? 'bg-blue-100 text-blue-900'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {c.impactoLitros1000L > 0 ? '+' : ''}
                              {c.impactoLitros1000L.toFixed(2)} L
                              <span className="ml-1 text-[9px] font-normal opacity-75">
                                ({c.impactoLitros1000L > 0 ? 'Sobra' : c.impactoLitros1000L < 0 ? 'Déficit' : 'Exato'})
                              </span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold bg-blue-50/40 text-slate-800">
                            {c.impactoFinanceiro1000L > 0 ? '+' : ''}
                            {formatarMoeda(c.impactoFinanceiro1000L)} / 1.000L
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                c.conformes === c.qtdTestes
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {c.conformes} de {c.qtdTestes} conf.
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {auditoriaAfericoesMetricas.listaCombustivel.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                      <tr>
                        <td className="py-2.5 px-3 uppercase text-[11px]">Total Pista</td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {auditoriaAfericoesMetricas.listaBicos.length} bicos
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {auditoriaAfericoesMetricas.totalTestes} testes
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {auditoriaAfericoesMetricas.volumeTotalGeral.toFixed(3)} L
                        </td>
                        <td className="py-2.5 px-3">—</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-800">
                          {formatarMoeda(auditoriaAfericoesMetricas.valorTotalGeral)}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {auditoriaAfericoesMetricas.desvioMedioGeral > 0 ? '+' : ''}
                          {auditoriaAfericoesMetricas.desvioMedioGeral} ml
                        </td>
                        <td className="py-2.5 px-3 font-mono bg-blue-100/60 text-blue-950 font-bold">
                          {auditoriaAfericoesMetricas.impactoGeralLitros1000L > 0 ? '+' : ''}
                          {auditoriaAfericoesMetricas.impactoGeralLitros1000L.toFixed(2)} L / 1.000L
                        </td>
                        <td className="py-2.5 px-3 font-mono bg-blue-100/60 text-blue-950 font-bold">
                          {auditoriaAfericoesMetricas.impactoGeralFinanceiro1000L > 0 ? '+' : ''}
                          {formatarMoeda(auditoriaAfericoesMetricas.impactoGeralFinanceiro1000L)} / 1.000L
                        </td>
                        <td className="py-2.5 px-3 text-emerald-800">
                          {auditoriaAfericoesMetricas.listaCombustivel.reduce((acc, c) => acc + c.conformes, 0)} conf.
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* TABELA 2: INFORMAÇÕES DE BICOS AFERIDOS & VALOR TOTAL POR BICO */}
            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Informações de Bicos Aferidos & Valor Total da Aferição por Bico
                </h4>
                <span className="text-[11px] text-slate-500">
                  Número, bomba, tanque, encerrante atual, lacre e impacto metrológico individual
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Bico / Bomba</th>
                      <th className="py-2.5 px-3">Combustível</th>
                      <th className="py-2.5 px-3">Tanque</th>
                      <th className="py-2.5 px-3">Encerrante Atual</th>
                      <th className="py-2.5 px-3">Lacre Inmetro</th>
                      <th className="py-2.5 px-3">Testes</th>
                      <th className="py-2.5 px-3">Volume Total</th>
                      <th className="py-2.5 px-3">Preço (R$/L)</th>
                      <th className="py-2.5 px-3 font-bold text-emerald-900">Valor Total do Bico</th>
                      <th className="py-2.5 px-3">Desvio Médio</th>
                      <th className="py-2.5 px-3">Impacto / 1.000 L</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditoriaAfericoesMetricas.listaBicos.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-6 text-center text-slate-400">
                          Nenhum bico com aferição registrada.
                        </td>
                      </tr>
                    ) : (
                      auditoriaAfericoesMetricas.listaBicos.map((b) => (
                        <tr key={b.bicoNumero} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-900">
                            Bico {String(b.bicoNumero).padStart(2, '0')}
                            <span className="block text-[10px] font-normal text-slate-500">{b.bombaNome}</span>
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800">{b.produto}</td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{b.tanqueCodigo}</td>
                          <td className="py-2 px-3 font-mono text-[11px]">
                            {b.encerranteFinal ? b.encerranteFinal.toLocaleString('pt-BR') : '—'}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                            {b.lacreInmetro || 'Conferido'}
                          </td>
                          <td className="py-2 px-3 font-mono">{b.qtdTestes}x</td>
                          <td className="py-2 px-3 font-mono font-semibold">{b.volumeTotal.toFixed(3)} L</td>
                          <td className="py-2 px-3 font-mono">{formatarMoeda(b.precoLitro)}</td>
                          <td className="py-2 px-3 font-mono font-bold text-emerald-700">
                            {formatarMoeda(b.valorTotal)}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold">
                            <span
                              className={
                                b.desvioMedioMl > 0
                                  ? 'text-amber-700'
                                  : b.desvioMedioMl < 0
                                  ? 'text-blue-700'
                                  : 'text-slate-700'
                              }
                            >
                              {b.desvioMedioMl > 0 ? '+' : ''}
                              {b.desvioMedioMl} ml
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px]">
                            <span
                              className={
                                b.impactoLitros1000L > 0
                                  ? 'text-amber-800 font-bold'
                                  : b.impactoLitros1000L < 0
                                  ? 'text-blue-800 font-bold'
                                  : 'text-slate-600'
                              }
                            >
                              {b.impactoLitros1000L > 0 ? '+' : ''}
                              {b.impactoLitros1000L.toFixed(2)} L
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {b.impactoFinanceiro1000L > 0 ? '+' : ''}
                              {formatarMoeda(b.impactoFinanceiro1000L)}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                b.naoConformes === 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {b.naoConformes === 0 ? 'CONFORME' : 'FORA LIMITE'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {auditoriaAfericoesMetricas.listaBicos.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                      <tr>
                        <td className="py-2 px-3 uppercase text-[11px]" colSpan={5}>
                          Total de {auditoriaAfericoesMetricas.listaBicos.length} bicos aferidos
                        </td>
                        <td className="py-2 px-3 font-mono">{auditoriaAfericoesMetricas.totalTestes}</td>
                        <td className="py-2 px-3 font-mono">
                          {auditoriaAfericoesMetricas.volumeTotalGeral.toFixed(3)} L
                        </td>
                        <td className="py-2 px-3">—</td>
                        <td className="py-2 px-3 font-mono text-emerald-800">
                          {formatarMoeda(auditoriaAfericoesMetricas.valorTotalGeral)}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {auditoriaAfericoesMetricas.desvioMedioGeral > 0 ? '+' : ''}
                          {auditoriaAfericoesMetricas.desvioMedioGeral} ml
                        </td>
                        <td className="py-2 px-3 font-mono text-blue-900">
                          {auditoriaAfericoesMetricas.impactoGeralLitros1000L > 0 ? '+' : ''}
                          {auditoriaAfericoesMetricas.impactoGeralLitros1000L.toFixed(2)} L
                        </td>
                        <td className="py-2 px-3 text-emerald-800">
                          {auditoriaAfericoesMetricas.listaBicos.filter((b) => b.naoConformes === 0).length} conf.
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

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
              {/* Leitura Inteligente por Foto dentro do Modal */}
              <div className="p-3.5 bg-slate-900 text-white rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      Preencher Aferição com Foto (Visor / Balde 20L / Laudo)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {fotoAfericaoBase64
                        ? 'Foto anexada e lida! Os dados serão incluídos no Relatório de Aferição.'
                        : 'Anexe uma foto para extrair automaticamente os dados e salvar como evidência.'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={modalFotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLerFotoModalAfericao}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => modalFotoInputRef.current?.click()}
                    disabled={lendoFotoModal}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {lendoFotoModal ? 'Lendo Foto...' : fotoAfericaoBase64 ? 'Trocar Foto' : 'Enviar Foto'}
                  </button>
                </div>
              </div>

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
                    Encerrante da Bomba (Opcional / Foto)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={encerranteFinalAfericao}
                    onChange={(e) => setEncerranteFinalAfericao(e.target.value)}
                    placeholder="Ex: 145820.50"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Nº Lacre / Selo Inmetro (Opcional / Foto)
                  </label>
                  <input
                    type="text"
                    value={lacreInmetroAfericao}
                    onChange={(e) => setLacreInmetroAfericao(e.target.value)}
                    placeholder="Ex: INM-202601"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                  />
                </div>
              </div>

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
