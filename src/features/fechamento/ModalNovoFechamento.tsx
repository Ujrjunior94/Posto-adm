import React, { useState, useEffect, useMemo } from 'react';
import {
  FechamentoCaixa,
  ItemEncerranteBico,
  ValoresRecolhimentoCaixa,
  Bico,
  Tanque,
  Funcionario,
  Escala,
  UserProfile,
} from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { formatarMoeda } from '../../utils/calculations';
import {
  Fuel,
  CreditCard,
  QrCode,
  Banknote,
  Building2,
  Receipt,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  Plus,
  ArrowRight,
  Calculator,
  UserCheck,
  Sparkles,
} from 'lucide-react';

const repoFechamento = new PostoSubcollectionRepository<FechamentoCaixa>('fechamentos');
const repoBicos = new PostoSubcollectionRepository<Bico>('bicos');

const PRECOS_PADRAO: Record<string, number> = {
  'Gasolina Comum': 5.89,
  'Gasolina Aditivada': 6.15,
  'Etanol Hidratado': 3.89,
  'Diesel S10': 6.19,
  'Diesel S500': 5.99,
  GNV: 4.79,
};

interface ModalNovoFechamentoProps {
  isOpen: boolean;
  onClose: () => void;
  bicos: Bico[];
  tanques: Tanque[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  fechamentos: FechamentoCaixa[];
  postoId: string;
  userProfile: UserProfile | null;
  fechamentoParaEditar?: FechamentoCaixa | null;
  onFechamentoSalvo: (fechamento: FechamentoCaixa) => void;
  onReload: () => void;
}

export const ModalNovoFechamento: React.FC<ModalNovoFechamentoProps> = ({
  isOpen,
  onClose,
  bicos,
  tanques,
  funcionarios,
  escalas,
  fechamentos,
  postoId,
  userProfile,
  fechamentoParaEditar,
  onFechamentoSalvo,
  onReload,
}) => {
  // Aba ativa de preenchimento (1: Bicos & Encerrantes, 2: Recolhimento Detalhado, 3: Conferência & Balanço)
  const [abaAtiva, setAbaAtiva] = useState<'BICOS' | 'RECOLHIMENTO' | 'CONFERENCIA'>('BICOS');

  // Dados Gerais
  const [dataFechamento, setDataFechamento] = useState(new Date().toISOString().slice(0, 10));
  const [turno, setTurno] = useState('Turno 1 - Manhã (06h - 14h)');
  const [caixaId, setCaixaId] = useState('CX-01 (Pista Principal)');
  const [funcionarioId, setFuncionarioId] = useState(funcionarios[0]?.id || '');
  const [observacao, setObservacao] = useState('');
  const [outrasVendasPista, setOutrasVendasPista] = useState<number>(0);
  const [salvando, setSalvando] = useState(false);

  // Itens dos Encerrantes dos Bicos
  const [itensBicos, setItensBicos] = useState<ItemEncerranteBico[]>([]);

  // Itens Detalhados de Recolhimento
  const [pix, setPix] = useState<number>(0);
  const [cartao, setCartao] = useState<number>(0);
  const [nota, setNota] = useState<number>(0);
  const [deposito, setDeposito] = useState<number>(0);
  const [pixCnpj, setPixCnpj] = useState<number>(0);
  const [despesa, setDespesa] = useState<number>(0);
  const [despesaDescricao, setDespesaDescricao] = useState<string>('');
  const [outros, setOutros] = useState<number>(0);
  const [outrosDescricao, setOutrosDescricao] = useState<string>('');

  // Inicialização inteligente dos bicos e leitura de encerrantes anteriores (ou carregamento para edição)
  useEffect(() => {
    if (!isOpen) return;

    if (fechamentoParaEditar) {
      setDataFechamento(fechamentoParaEditar.data);
      setTurno(fechamentoParaEditar.turno);
      setCaixaId(fechamentoParaEditar.caixaId);
      setFuncionarioId(fechamentoParaEditar.funcionarioId);
      setObservacao(fechamentoParaEditar.observacao || '');
      setOutrasVendasPista(fechamentoParaEditar.outrasVendasPista || 0);
      if (fechamentoParaEditar.encerrantesBicos && fechamentoParaEditar.encerrantesBicos.length > 0) {
        setItensBicos(fechamentoParaEditar.encerrantesBicos);
      }
      const rec = fechamentoParaEditar.recolhimento;
      if (rec) {
        setPix(rec.pix || 0);
        setCartao(rec.cartao || 0);
        setNota(rec.nota || 0);
        setDeposito(rec.deposito || 0);
        setPixCnpj(rec.pixCnpj || 0);
        setDespesa(rec.despesa || 0);
        setDespesaDescricao(rec.despesaDescricao || '');
        setOutros(rec.outros || 0);
        setOutrosDescricao(rec.outrosDescricao || '');
      }
      return;
    }

    // Se houver bicos cadastrados, mapeia com encerrante inicial inteligente
    if (bicos.length > 0) {
      const lista: ItemEncerranteBico[] = bicos.map((b) => {
        // Busca o último fechamento que registrou este bico para usar o encerrante final como inicial
        let inicial = b.ultimoEncerrante || 0;
        if (inicial === 0 && fechamentos.length > 0) {
          for (const f of fechamentos) {
            const achou = f.encerrantesBicos?.find((it) => it.bicoId === b.id);
            if (achou && achou.encerranteFinal > 0) {
              inicial = achou.encerranteFinal;
              break;
            }
          }
        }

        const preco = b.precoLitro || PRECOS_PADRAO[b.produto] || 5.89;

        return {
          bicoId: b.id,
          numeroBico: b.numero,
          bomba: b.bomba,
          produto: b.produto,
          lado: b.lado,
          encerranteInicial: inicial,
          encerranteFinal: inicial, // Inicialmente igual, aguardando digitação do operador
          afericaoLitros: 0,
          litrosVendidos: 0,
          precoLitro: preco,
          valorTotal: 0,
          precoBase: b.precoBase || preco,
          temDesconto: b.temDesconto,
          tipoDesconto: b.tipoDesconto,
          valorDesconto: b.valorDesconto,
          motivoDesconto: b.motivoDesconto,
        };
      });

      setItensBicos(lista);
    } else {
      setItensBicos([]);
    }

    if (!funcionarioId && funcionarios.length > 0) {
      setFuncionarioId(funcionarios[0].id);
    }
  }, [isOpen, bicos, fechamentos, fechamentoParaEditar]);

  // Frentistas escalados no mesmo dia e turno
  const escaladosNoTurno = useMemo(() => {
    return funcionarios.filter((f) => {
      return escalas.some(
        (e) => e.funcionarioId === f.id && e.data === dataFechamento && e.status === 'TRABALHO'
      );
    });
  }, [funcionarios, escalas, dataFechamento]);

  // Atualização de encerrante de um bico específico
  const handleAtualizarBico = (
    index: number,
    campo: 'encerranteInicial' | 'encerranteFinal' | 'afericaoLitros' | 'precoLitro',
    valor: number
  ) => {
    setItensBicos((prev) => {
      const copia = [...prev];
      const item = { ...copia[index], [campo]: Math.max(0, valor || 0) };

      const diferencaLitros = Math.max(0, item.encerranteFinal - item.encerranteInicial);
      const afericao = item.afericaoLitros || 0;
      item.litrosVendidos = Math.round(Math.max(0, diferencaLitros - afericao) * 100) / 100;
      item.valorTotal = Math.round(item.litrosVendidos * item.precoLitro * 100) / 100;

      copia[index] = item;
      return copia;
    });
  };

  // Cadastrar bicos padrão caso o posto ainda não tenha bicos
  const handleCadastrarBicosPadrao = async () => {
    const tGas = tanques.find((t) => t.produto.includes('Gasolina'))?.id || tanques[0]?.id || 'tq-01';
    const tEta = tanques.find((t) => t.produto.includes('Etanol'))?.id || tanques[1]?.id || 'tq-02';
    const tDie = tanques.find((t) => t.produto.includes('Diesel'))?.id || tanques[0]?.id || 'tq-03';

    const bicosCriar: Bico[] = [
      {
        id: `bico-${Date.now()}-1`,
        postoId,
        numero: 1,
        bomba: 'Bomba 01 (Ilha Principal)',
        tanqueId: tGas,
        produto: 'Gasolina Comum',
        lado: 'A',
        status: 'ATIVO',
        precoLitro: 5.89,
        ultimoEncerrante: 125400.0,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      },
      {
        id: `bico-${Date.now()}-2`,
        postoId,
        numero: 2,
        bomba: 'Bomba 01 (Ilha Principal)',
        tanqueId: tEta,
        produto: 'Etanol Hidratado',
        lado: 'B',
        status: 'ATIVO',
        precoLitro: 3.89,
        ultimoEncerrante: 84300.0,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      },
      {
        id: `bico-${Date.now()}-3`,
        postoId,
        numero: 3,
        bomba: 'Bomba 02 (Pista Pesada)',
        tanqueId: tDie,
        produto: 'Diesel S10',
        lado: 'A',
        status: 'ATIVO',
        precoLitro: 6.19,
        ultimoEncerrante: 215900.0,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      },
      {
        id: `bico-${Date.now()}-4`,
        postoId,
        numero: 4,
        bomba: 'Bomba 02 (Pista Pesada)',
        tanqueId: tGas,
        produto: 'Gasolina Aditivada',
        lado: 'B',
        status: 'ATIVO',
        precoLitro: 6.15,
        ultimoEncerrante: 98450.0,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      },
    ];

    for (const b of bicosCriar) {
      await repoBicos.save(postoId, b);
    }
    await onReload();
  };

  // Cálculos consolidados em tempo real
  const totalLitrosCombustivel = useMemo(() => {
    return itensBicos.reduce((acc, it) => acc + (it.litrosVendidos || 0), 0);
  }, [itensBicos]);

  const totalVendasCombustivel = useMemo(() => {
    return Math.round(itensBicos.reduce((acc, it) => acc + (it.valorTotal || 0), 0) * 100) / 100;
  }, [itensBicos]);

  // Total a Prestar Contas (Total das Bombas + Outras Vendas de Pista)
  const totalVendasEsperado = useMemo(() => {
    return Math.round((totalVendasCombustivel + (outrasVendasPista || 0)) * 100) / 100;
  }, [totalVendasCombustivel, outrasVendasPista]);

  // Total Recolhido (Pix, Cartão, Nota, Depósito, Pix CNPJ, Despesas, Outros)
  const totalRecolhimento = useMemo(() => {
    const soma = (pix || 0) + (cartao || 0) + (nota || 0) + (deposito || 0) + (pixCnpj || 0) + (despesa || 0) + (outros || 0);
    return Math.round(soma * 100) / 100;
  }, [pix, cartao, nota, deposito, pixCnpj, despesa, outros]);

  // Diferença: Total Recolhido - Total Esperado das Vendas
  const diferencaApurada = useMemo(() => {
    return Math.round((totalRecolhimento - totalVendasEsperado) * 100) / 100;
  }, [totalRecolhimento, totalVendasEsperado]);

  const tipoDiferenca = useMemo(() => {
    if (Math.abs(diferencaApurada) < 0.01) return 'SEM_DIFERENCA';
    if (diferencaApurada < -0.01) return 'FALTA';
    return 'SOBRA';
  }, [diferencaApurada]);

  // Salvar Fechamento Oficial
  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const id = fechamentoParaEditar?.id || `fech-${Date.now()}`;
      const func = funcionarios.find((f) => f.id === funcionarioId);

      const valoresRecolhimento: ValoresRecolhimentoCaixa = {
        pix: Number(pix) || 0,
        cartao: Number(cartao) || 0,
        nota: Number(nota) || 0,
        deposito: Number(deposito) || 0,
        pixCnpj: Number(pixCnpj) || 0,
        despesa: Number(despesa) || 0,
        despesaDescricao: despesaDescricao.trim() || undefined,
        outros: Number(outros) || 0,
        outrosDescricao: outrosDescricao.trim() || undefined,
        totalRecolhido: totalRecolhimento,
      };

      const novoFechamento: FechamentoCaixa = {
        id,
        postoId,
        data: dataFechamento,
        turno,
        caixaId,
        funcionarioId,
        funcionarioNome: func?.nome || 'Operador',
        totalInformado: totalRecolhimento, // Valor apresentado nos recolhimentos
        totalConferido: totalVendasEsperado, // Valor esperado pelas bombas
        diferenca: diferencaApurada,
        tipoDiferenca,
        encerrantesBicos: itensBicos,
        totalLitrosBicos: Math.round(totalLitrosCombustivel * 100) / 100,
        totalVendasBicos: totalVendasCombustivel,
        outrasVendasPista: Number(outrasVendasPista) || 0,
        recolhimento: valoresRecolhimento,
        observacao: observacao.trim() || undefined,
        conferidoPor: userProfile?.nome || 'Supervisor',
        status: 'CONFERIDO',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      // 1. Grava o fechamento na subcoleção de fechamentos
      await repoFechamento.save(postoId, novoFechamento);

      // 2. Atualiza o último encerrante de cada bico para que o próximo fechamento inicie automaticamente
      for (const item of itensBicos) {
        if (item.encerranteFinal > 0) {
          await repoBicos.update(postoId, item.bicoId, {
            ultimoEncerrante: item.encerranteFinal,
            precoLitro: item.precoLitro,
          });
        }
      }

      // 3. Auditoria completa imutável
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Supervisor',
        'FECHAMENTO_CAIXA',
        'FechamentoCaixa',
        id,
        'CREATE',
        null,
        {
          data: dataFechamento,
          turno,
          caixaId,
          funcionario: func?.nome,
          totalVendasEsperado,
          totalRecolhimento,
          diferenca: diferencaApurada,
          tipoDiferenca,
          itensRecolhimento: valoresRecolhimento,
          quantidadeBicos: itensBicos.length,
        }
      );

      onFechamentoSalvo(novoFechamento);
      await onReload();
      onClose();
    } catch (e: any) {
      console.error('Falha ao salvar fechamento de caixa:', e);
      alert(`Erro ao salvar fechamento: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in">
        {/* Cabeçalho do Modal */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">
                Fechamento Manual de Caixa (Encerrantes & Recolhimento)
              </h3>
              <p className="text-xs text-slate-400">
                Apuração de vendas por bico cadastrado e conferência detalhada dos valores recolhidos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas do Fechamento */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setAbaAtiva('BICOS')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              abaAtiva === 'BICOS'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Fuel className="w-4 h-4" />
            1. Encerrantes dos Bicos ({itensBicos.length})
          </button>
          <button
            onClick={() => setAbaAtiva('RECOLHIMENTO')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              abaAtiva === 'RECOLHIMENTO'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Banknote className="w-4 h-4" />
            2. Recolhimento Detalhado (Pix, Cartão, Nota...)
          </button>
          <button
            onClick={() => setAbaAtiva('CONFERENCIA')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              abaAtiva === 'CONFERENCIA'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calculator className="w-4 h-4" />
            3. Balanço e Conferência
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Identificação Geral do Turno / Caixa */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Data</label>
              <input
                type="date"
                required
                value={dataFechamento}
                onChange={(e) => setDataFechamento(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Turno</label>
              <select
                value={turno}
                onChange={(e) => setTurno(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Turno 1 - Manhã (06h - 14h)">Turno 1 — Manhã (06h - 14h)</option>
                <option value="Turno 2 - Tarde (14h - 22h)">Turno 2 — Tarde (14h - 22h)</option>
                <option value="Turno Horista">Turno Horista</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Caixa / Ponto</label>
              <input
                type="text"
                value={caixaId}
                onChange={(e) => setCaixaId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500"
                placeholder="Ex: CX-01 Pista"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1 flex items-center justify-between">
                <span>Operador / Frentista</span>
                {escaladosNoTurno.length > 0 && (
                  <span className="text-[10px] text-emerald-600 font-normal flex items-center gap-0.5">
                    <UserCheck className="w-3 h-3" /> Escalado
                  </span>
                )}
              </label>
              <select
                value={funcionarioId}
                onChange={(e) => setFuncionarioId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500"
              >
                {funcionarios.map((f) => {
                  const escalado = escaladosNoTurno.some((esc) => esc.id === f.id);
                  return (
                    <option key={f.id} value={f.id}>
                      {f.nome} {escalado ? '★ (Na Escala)' : `(${f.cargo})`}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* ABA 1: ENCERRANTES DOS BICOS */}
          {abaAtiva === 'BICOS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-emerald-600" />
                    Leitura de Encerrantes dos Bicos Cadastrados
                  </h4>
                  <p className="text-xs text-slate-500">
                    Informe o encerrante final de cada bico. O volume vendido e valor total são calculados automaticamente.
                  </p>
                </div>

                {itensBicos.length === 0 && (
                  <button
                    type="button"
                    onClick={handleCadastrarBicosPadrao}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Carregar Bicos Padrão (Demo)
                  </button>
                )}
              </div>

              {itensBicos.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-3">
                  <Fuel className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-medium text-slate-600">
                    Nenhum bico cadastrado no posto até o momento.
                  </p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Cadastre os bicos do seu posto ou clique abaixo para carregar os bicos padrão (Gasolina Comum, Etanol, Diesel S10, Gasolina Aditivada).
                  </p>
                  <button
                    type="button"
                    onClick={handleCadastrarBicosPadrao}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition"
                  >
                    Inicializar Bicos Operacionais
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Bico / Bomba</th>
                        <th className="py-2.5 px-3">Combustível</th>
                        <th className="py-2.5 px-3 min-w-[130px]">Encerrante Inicial (L)</th>
                        <th className="py-2.5 px-3 min-w-[130px]">Encerrante Final (L)</th>
                        <th className="py-2.5 px-2 min-w-[80px]">Aferição (L)</th>
                        <th className="py-2.5 px-3 text-right">Litros Vendidos</th>
                        <th className="py-2.5 px-2 min-w-[90px] text-right">Preço (R$/L)</th>
                        <th className="py-2.5 px-3 text-right">Total (R$)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {itensBicos.map((item, idx) => {
                        const ehGasolina = item.produto.toLowerCase().includes('gasolina');
                        const ehEtanol = item.produto.toLowerCase().includes('etanol');
                        const ehDiesel = item.produto.toLowerCase().includes('diesel');

                        const badgeColor = ehGasolina
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : ehEtanol
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : ehDiesel
                          ? 'bg-slate-100 text-slate-800 border-slate-300'
                          : 'bg-blue-50 text-blue-800 border-blue-200';

                        return (
                          <tr key={item.bicoId} className="hover:bg-slate-50/70 transition">
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center font-mono font-bold text-[11px]">
                                  {item.numeroBico}
                                </span>
                                <div>
                                  <div className="font-bold">Bico {item.numeroBico}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {item.bomba} • Lado {item.lado}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeColor}`}>
                                {item.produto}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                step="0.01"
                                value={item.encerranteInicial}
                                onChange={(e) =>
                                  handleAtualizarBico(idx, 'encerranteInicial', parseFloat(e.target.value))
                                }
                                className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono bg-slate-50"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                step="0.01"
                                value={item.encerranteFinal}
                                onChange={(e) =>
                                  handleAtualizarBico(idx, 'encerranteFinal', parseFloat(e.target.value))
                                }
                                placeholder="Encerrante final"
                                className="w-full px-2 py-1 border border-emerald-400 bg-emerald-50/30 rounded text-xs font-mono font-bold text-slate-900 focus:bg-white"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="0.01"
                                value={item.afericaoLitros || 0}
                                onChange={(e) =>
                                  handleAtualizarBico(idx, 'afericaoLitros', parseFloat(e.target.value))
                                }
                                className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono text-center text-slate-600"
                                title="Litros de aferição descartados de volta ao tanque"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                              {item.litrosVendidos.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              L
                            </td>
                            <td className="py-2 px-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={item.precoLitro}
                                onChange={(e) =>
                                  handleAtualizarBico(idx, 'precoLitro', parseFloat(e.target.value))
                                }
                                className="w-20 px-1.5 py-1 border border-slate-300 rounded text-xs font-mono text-right font-semibold"
                              />
                              {item.temDesconto && (
                                <div className="text-[9px] text-emerald-700 font-bold whitespace-nowrap mt-0.5" title={item.motivoDesconto || 'Desconto ativo'}>
                                  {item.tipoDesconto === 'PERCENTUAL'
                                    ? `-${item.valorDesconto}%`
                                    : `-R$ ${item.valorDesconto?.toFixed(2)}/L`}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 text-sm">
                              {formatarMoeda(item.valorTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-800">
                      <tr>
                        <td colSpan={5} className="py-2.5 px-3 text-right text-xs uppercase font-bold">
                          Totais de Combustível nos Bicos:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sm text-slate-900">
                          {totalLitrosCombustivel.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          L
                        </td>
                        <td></td>
                        <td className="py-2.5 px-3 text-right font-mono text-sm text-emerald-800">
                          {formatarMoeda(totalVendasCombustivel)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Outras Vendas de Pista & Resumo das Bombas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Outras Vendas de Pista / Lubrificantes / Aditivos (R$)
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Valor faturado em produtos adicionais fora das bombas (óleo, aditivos, palhetas, etc.).
                  </p>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={outrasVendasPista}
                      onChange={(e) => setOutrasVendasPista(parseFloat(e.target.value) || 0)}
                      className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono font-semibold"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 uppercase">
                      Total a Prestar Contas (Bombas + Pista)
                    </span>
                    <Fuel className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-900 mt-2">
                    {formatarMoeda(totalVendasEsperado)}
                  </div>
                  <div className="text-xs text-emerald-700 mt-1">
                    {itensBicos.length} bicos apurados • {totalLitrosCombustivel.toFixed(1)} Litros vendidos
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setAbaAtiva('RECOLHIMENTO')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                >
                  Avançar para Recolhimento Detalhado
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ABA 2: VALORES DE RECOLHIMENTO DETALHADO */}
          {abaAtiva === 'RECOLHIMENTO' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  Valores de Recolhimento do Caixa (Meios de Pagamento e Saídas)
                </h4>
                <p className="text-xs text-slate-500">
                  Informe exatamente o que foi recolhido em cada meio de pagamento e os comprovantes de despesas pagas pelo caixa.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Pix */}
                <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-2xs hover:border-purple-400 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-900 uppercase flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-purple-600" />
                      Pix (Pista / Terminal)
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={pix || ''}
                      onChange={(e) => setPix(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-1.5 border border-purple-200 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Comprovantes Pix QR Code de pista</span>
                </div>

                {/* 2. Cartão */}
                <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-2xs hover:border-blue-400 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-900 uppercase flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      Cartão (Débito / Crédito)
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={cartao || ''}
                      onChange={(e) => setCartao(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-1.5 border border-blue-200 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Relatório de fechamento das maquininhas POS</span>
                </div>

                {/* 3. Nota */}
                <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs hover:border-emerald-400 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-emerald-900 uppercase flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      Nota (Dinheiro em Espécie / Prazo)
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={nota || ''}
                      onChange={(e) => setNota(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-1.5 border border-emerald-200 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Cédulas conferidas na gaveta do caixa</span>
                </div>

                {/* 4. Depósito */}
                <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-2xs hover:border-indigo-400 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-900 uppercase flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                      Depósito / Sangria Envelope
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={deposito || ''}
                      onChange={(e) => setDeposito(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-1.5 border border-indigo-200 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Comprovantes de depósito ou cofre boca de lobo</span>
                </div>

                {/* 5. Pix CNPJ */}
                <div className="bg-white p-4 rounded-xl border border-violet-200 shadow-2xs hover:border-violet-400 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-violet-900 uppercase flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-violet-600" />
                      Pix CNPJ (Conta Posto)
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={pixCnpj || ''}
                      onChange={(e) => setPixCnpj(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-1.5 border border-violet-200 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Recebimentos diretos na chave CNPJ do posto</span>
                </div>

                {/* 6. Despesa */}
                <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs hover:border-amber-400 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-900 uppercase flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-amber-600" />
                      Despesa do Caixa
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={despesa || ''}
                      onChange={(e) => setDespesa(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-1.5 border border-amber-200 rounded-lg text-sm font-mono font-bold text-amber-900 focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={despesaDescricao}
                    onChange={(e) => setDespesaDescricao(e.target.value)}
                    placeholder="Motivo da despesa (ex: gelo, limpeza, recibo)"
                    className="w-full mt-2 px-2.5 py-1 border border-slate-200 rounded text-xs text-slate-700 bg-slate-50"
                  />
                </div>

                {/* 7. Outros */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-400 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4 text-slate-500" />
                      Outros (Vales / Cheques / Frotas)
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={outros || ''}
                      onChange={(e) => setOutros(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-slate-400"
                    />
                  </div>
                  <input
                    type="text"
                    value={outrosDescricao}
                    onChange={(e) => setOutrosDescricao(e.target.value)}
                    placeholder="Descrição de outros (ex: vales prefeitura)"
                    className="w-full mt-2 px-2.5 py-1 border border-slate-200 rounded text-xs text-slate-700 bg-slate-50"
                  />
                </div>
              </div>

              {/* Totalizador dos Recolhimentos */}
              <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold">Total de Recolhimento Informado</div>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    {formatarMoeda(totalRecolhimento)}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-300">
                  <div>Pix + CNPJ: <span className="font-bold text-white font-mono">{formatarMoeda((pix || 0) + (pixCnpj || 0))}</span></div>
                  <div>Cartão: <span className="font-bold text-white font-mono">{formatarMoeda(cartao || 0)}</span></div>
                  <div>Espécie: <span className="font-bold text-white font-mono">{formatarMoeda(nota || 0)}</span></div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setAbaAtiva('BICOS')}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Voltar aos Bicos
                </button>
                <button
                  type="button"
                  onClick={() => setAbaAtiva('CONFERENCIA')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                >
                  Avançar para Balanço & Conferência
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ABA 3: BALANÇO E CONFERÊNCIA FINAL */}
          {abaAtiva === 'CONFERENCIA' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-emerald-600" />
                  Conferência e Apuração do Caixa
                </h4>
                <p className="text-xs text-slate-500">
                  Compare o valor esperado apurado pelos encerrantes das bombas com o montante recolhido.
                </p>
              </div>

              {/* Comparativo Vendas Bombas vs Recolhimento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-500 uppercase">1. Total Esperado (Bombas)</span>
                  <div className="text-xl font-bold font-mono text-slate-900 mt-2">
                    {formatarMoeda(totalVendasEsperado)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {totalLitrosCombustivel.toFixed(1)}L em combustíveis + pista
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-500 uppercase">2. Total Recolhido</span>
                  <div className="text-xl font-bold font-mono text-blue-700 mt-2">
                    {formatarMoeda(totalRecolhimento)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Pix, Cartão, Notas, Depósitos e Despesas
                  </div>
                </div>

                <div
                  className={`p-4 rounded-xl border ${
                    tipoDiferenca === 'FALTA'
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : tipoDiferenca === 'SOBRA'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <span className="text-xs font-bold uppercase flex items-center gap-1.5">
                    {tipoDiferenca === 'FALTA' && <AlertTriangle className="w-4 h-4 text-red-600" />}
                    {tipoDiferenca === 'SOBRA' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    {tipoDiferenca === 'SEM_DIFERENCA' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    3. Diferença Apurada
                  </span>
                  <div className="text-xl font-bold font-mono mt-2">
                    {formatarMoeda(diferencaApurada)}
                  </div>
                  <div className="text-xs font-semibold mt-1">
                    {tipoDiferenca === 'FALTA' && 'FALTA DE CAIXA'}
                    {tipoDiferenca === 'SOBRA' && 'SOBRA DE CAIXA'}
                    {tipoDiferenca === 'SEM_DIFERENCA' && 'CAIXA 100% BATIDO'}
                  </div>
                </div>
              </div>

              {/* Mensagem Explicativa se Falta ou Sobra */}
              {tipoDiferenca === 'FALTA' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    Atenção: Foi apurada uma falta de {formatarMoeda(Math.abs(diferencaApurada))} neste fechamento.
                  </div>
                  <p>
                    Ao salvar o fechamento, o sistema permitirá abrir imediatamente uma ocorrência operacional para registro formal e eventual rateio entre os colaboradores escalados no turno.
                  </p>
                </div>
              )}

              {/* Observações Operacionais */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Observações e Justificativas Operacionais
                </label>
                <textarea
                  rows={3}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Justificativas de diferenças, ocorrências no turno, notas a prazo, vales ou comprovantes retidos..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setAbaAtiva('RECOLHIMENTO')}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Voltar ao Recolhimento
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={handleSalvar}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-2"
                  >
                    {salvando ? 'Gravando Fechamento...' : 'Confirmar e Gravar Fechamento Oficial'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
