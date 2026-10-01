import React, { useState, useMemo } from 'react';
import {
  FechamentoCaixa,
  OcorrenciaCaixa,
  Funcionario,
  Escala,
  Bico,
  Tanque,
} from '../../types';
import {
  PostoSubcollectionRepository,
  registrarAuditoria,
} from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import { formatarMoeda } from '../../utils/calculations';
import {
  exportarFechamentoCaixaPDF,
  exportarRelatorioFechamentosPDF,
} from '../../utils/pdfGenerator';
import { ModalNovoFechamento } from './ModalNovoFechamento';
import { ModalDetalhesFechamento } from './ModalDetalhesFechamento';
import {
  DollarSign,
  AlertCircle,
  Plus,
  Search,
  Fuel,
  Banknote,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  TrendingDown,
  TrendingUp,
  CreditCard,
  QrCode,
  Building2,
  Printer,
  Download,
  Edit2,
  Trash2,
} from 'lucide-react';

const repoOcorrencia = new PostoSubcollectionRepository<OcorrenciaCaixa>('ocorrenciasCaixa');
const repoFechamento = new PostoSubcollectionRepository<FechamentoCaixa>('fechamentos');

interface FechamentoProps {
  fechamentos: FechamentoCaixa[];
  ocorrencias: OcorrenciaCaixa[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  bicos?: Bico[];
  tanques?: Tanque[];
  onReload: () => void;
}

export const FechamentoCaixaView: React.FC<FechamentoProps> = ({
  fechamentos,
  ocorrencias,
  funcionarios,
  escalas,
  bicos = [],
  tanques = [],
  onReload,
}) => {
  const { postoId, userProfile } = useAuth();

  // Estados dos modais
  const [isModalNovoFechamento, setIsModalNovoFechamento] = useState(false);
  const [fechamentoParaEditar, setFechamentoParaEditar] = useState<FechamentoCaixa | null>(null);
  const [isModalDetalhes, setIsModalDetalhes] = useState(false);
  const [autoPrintModal, setAutoPrintModal] = useState(false);
  const [isModalOcorrencia, setIsModalOcorrencia] = useState(false);
  const [selectedFechamento, setSelectedFechamento] = useState<FechamentoCaixa | null>(null);

  // Filtros de listagem
  const [busca, setBusca] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'FALTA' | 'SOBRA' | 'SEM_DIFERENCA'>('TODOS');

  // Form Ocorrência/Falta
  const [participantesSelecionados, setParticipantesSelecionados] = useState<string[]>([]);
  const [regraDistribuicao, setRegraDistribuicao] = useState<
    'SOMENTE_RESPONSAVEL' | 'DIVISAO_IGUALITARIA' | 'PARTICIPANTES_SELECIONADOS'
  >('SOMENTE_RESPONSAVEL');
  const [obsOcorrencia, setObsOcorrencia] = useState('');
  const [salvandoOcorrencia, setSalvandoOcorrencia] = useState(false);

  // Fechamentos filtrados
  const fechamentosFiltrados = useMemo(() => {
    return fechamentos.filter((f) => {
      const matchBusca =
        !busca.trim() ||
        f.funcionarioNome?.toLowerCase().includes(busca.toLowerCase()) ||
        f.caixaId?.toLowerCase().includes(busca.toLowerCase()) ||
        f.data?.includes(busca) ||
        f.conferidoPor?.toLowerCase().includes(busca.toLowerCase());

      const matchTurno = filtroTurno === 'TODOS' || f.turno.includes(filtroTurno);
      const matchStatus = filtroStatus === 'TODOS' || f.tipoDiferenca === filtroStatus;

      return matchBusca && matchTurno && matchStatus;
    });
  }, [fechamentos, busca, filtroTurno, filtroStatus]);

  // Indicadores Consolidados
  const totalLitrosGeral = useMemo(() => {
    return fechamentos.reduce((acc, f) => acc + (f.totalLitrosBicos || 0), 0);
  }, [fechamentos]);

  const totalVendasBombasGeral = useMemo(() => {
    return fechamentos.reduce((acc, f) => acc + (f.totalConferido || 0), 0);
  }, [fechamentos]);

  const totalRecolhidoGeral = useMemo(() => {
    return fechamentos.reduce((acc, f) => acc + (f.totalInformado || 0), 0);
  }, [fechamentos]);

  const totalFaltasGeral = useMemo(() => {
    return fechamentos
      .filter((f) => f.tipoDiferenca === 'FALTA')
      .reduce((acc, f) => acc + Math.abs(f.diferenca), 0);
  }, [fechamentos]);

  // Frentistas escalados no período da ocorrência selecionada
  const escaladosNoPeriodo = useMemo(() => {
    if (!selectedFechamento) return [];
    return funcionarios.filter((f) => {
      return escalas.some(
        (e) =>
          e.funcionarioId === f.id &&
          e.data === selectedFechamento.data &&
          e.status === 'TRABALHO'
      );
    });
  }, [selectedFechamento, funcionarios, escalas]);

  // Salvar ocorrência de falta
  const handleSalvarOcorrencia = async () => {
    if (!selectedFechamento) return;
    setSalvandoOcorrencia(true);

    try {
      const valorFaltaAbsoluto = Math.abs(selectedFechamento.diferenca);
      const distribuicao: Record<string, number> = {};

      if (regraDistribuicao === 'SOMENTE_RESPONSAVEL') {
        distribuicao[selectedFechamento.funcionarioId] = valorFaltaAbsoluto;
      } else if (
        regraDistribuicao === 'DIVISAO_IGUALITARIA' &&
        participantesSelecionados.length > 0
      ) {
        const parte = Math.round((valorFaltaAbsoluto / participantesSelecionados.length) * 100) / 100;
        participantesSelecionados.forEach((id) => {
          distribuicao[id] = parte;
        });
      }

      const id = `ocorrencia-${Date.now()}`;
      const novaOcorrencia: OcorrenciaCaixa = {
        id,
        fechamentoId: selectedFechamento.id,
        postoId,
        data: selectedFechamento.data,
        turno: selectedFechamento.turno,
        valorFalta: valorFaltaAbsoluto,
        funcionarioPrincipalId: selectedFechamento.funcionarioId,
        participantes: participantesSelecionados,
        regraDistribuicao,
        distribuicao,
        observacao: obsOcorrencia,
        status: 'PENDENTE',
        criadoPor: userProfile?.nome || 'Supervisor',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      await repoOcorrencia.save(postoId, novaOcorrencia);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'OCORRENCIAS_CAIXA',
        'OcorrenciaCaixa',
        id,
        'CREATE',
        null,
        novaOcorrencia as unknown as Record<string, unknown>
      );

      setIsModalOcorrencia(false);
      setSelectedFechamento(null);
      await onReload();
    } catch (err) {
      console.error('Erro ao registrar ocorrência:', err);
      alert('Erro ao registrar ocorrência.');
    } finally {
      setSalvandoOcorrencia(false);
    }
  };

  const handleImprimirComprovante = (fechamento?: FechamentoCaixa) => {
    const alvo =
      fechamento ||
      selectedFechamento ||
      (fechamentosFiltrados.length > 0 ? fechamentosFiltrados[0] : fechamentos[0]);

    if (!alvo) {
      alert('Nenhum fechamento registrado para imprimir comprovante.');
      return;
    }

    setSelectedFechamento(alvo);
    setAutoPrintModal(true);
    setIsModalDetalhes(true);
  };

  const abrirDetalhes = (fechamento: FechamentoCaixa) => {
    setSelectedFechamento(fechamento);
    setAutoPrintModal(false);
    setIsModalDetalhes(true);
  };

  const abrirOcorrenciaParaFechamento = (fechamento: FechamentoCaixa) => {
    setSelectedFechamento(fechamento);
    setParticipantesSelecionados([fechamento.funcionarioId]);
    setIsModalDetalhes(false);
    setIsModalOcorrencia(true);
  };

  const handleEditarFechamento = (fechamento: FechamentoCaixa) => {
    setFechamentoParaEditar(fechamento);
    setIsModalNovoFechamento(true);
  };

  const handleExcluirFechamento = async (fechamento: FechamentoCaixa) => {
    if (!window.confirm(`Deseja realmente excluir este Fechamento de Caixa (${fechamento.data.split('-').reverse().join('/')} - ${fechamento.turno})?`)) return;
    await repoFechamento.delete(postoId, fechamento.id);
    await onReload();
  };

  const handleFechamentoSalvo = (fechamento: FechamentoCaixa) => {
    if (fechamento.tipoDiferenca === 'FALTA') {
      setSelectedFechamento(fechamento);
      setParticipantesSelecionados([fechamento.funcionarioId]);
      setIsModalOcorrencia(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Principal e Ação de Fechamento */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider mb-1">
            <Fuel className="w-4 h-4" />
            Controle Operacional de Pista e Caixa
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600" />
            Fechamento Manual de Caixa
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Apuração exata de vendas pelo encerrante de cada bico cadastrado e conferência detalhada dos
            valores recolhidos (Pix, Cartão, Nota, Depósito, Pix CNPJ, Despesa e Outros).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (fechamentosFiltrados.length === 0) {
                alert('Nenhum fechamento para exportar no período filtrado.');
                return;
              }
              exportarRelatorioFechamentosPDF(fechamentosFiltrados, busca || filtroTurno !== 'TODOS' ? `${filtroTurno}` : 'Geral');
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm rounded-xl transition shadow-2xs hover:shadow-xs"
            title="Exportar relatório consolidado de fechamentos em PDF"
          >
            <Download className="w-5 h-5" />
            Relatório em PDF
          </button>

          <button
            type="button"
            onClick={() => handleImprimirComprovante()}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm rounded-xl border border-slate-300 transition shadow-2xs hover:shadow-xs"
            title="Imprimir comprovante do fechamento de caixa mais recente ou selecionado"
          >
            <Printer className="w-5 h-5 text-emerald-600" />
            Imprimir Comprovante
          </button>

          <button
            onClick={() => {
              setFechamentoParaEditar(null);
              setIsModalNovoFechamento(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition shadow-sm hover:shadow-md"
          >
            <Plus className="w-5 h-5" />
            Registrar Novo Fechamento
          </button>
        </div>
      </div>

      {/* Cards de Métricas Operacionais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Fechamentos Registrados</span>
            <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {fechamentos.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {totalLitrosGeral.toFixed(1)} L em combustíveis apurados
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Vendas das Bombas (Esperado)</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <Fuel className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-2">
            {formatarMoeda(totalVendasBombasGeral)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Apurado nos encerrantes dos bicos
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Total Recolhido Informado</span>
            <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-blue-700 mt-2">
            {formatarMoeda(totalRecolhidoGeral)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Pix, Cartões, Notas, Depósitos e Despesas
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Total de Faltas Apuradas</span>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-red-600 mt-2">
            {formatarMoeda(totalFaltasGeral)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {fechamentos.filter((f) => f.tipoDiferenca === 'FALTA').length} fechamentos com falta
          </span>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between print:hidden">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por operador, caixa, conferente ou data..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={filtroTurno}
            onChange={(e) => setFiltroTurno(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
          >
            <option value="TODOS">Todos os Turnos</option>
            <option value="Manhã">Turno 1 — Manhã</option>
            <option value="Tarde">Turno 2 — Tarde</option>
            <option value="Horista">Turno Horista</option>
          </select>

          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
          >
            <option value="TODOS">Todos os Resultados</option>
            <option value="SEM_DIFERENCA">Caixa Batido</option>
            <option value="FALTA">Com Falta</option>
            <option value="SOBRA">Com Sobra</option>
          </select>
        </div>
      </div>

      {/* Tabela do Histórico de Fechamentos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden print:hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="font-bold text-slate-800 text-xs uppercase flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" />
            Histórico Detalhado de Fechamentos Realizados ({fechamentosFiltrados.length})
          </div>
          <span className="text-[11px] text-slate-400">
            Clique em &ldquo;Detalhes&rdquo; ou &ldquo;Imprimir Comprovante&rdquo; para visualizar o espelho do caixa
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/70 text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Data / Turno</th>
                <th className="px-5 py-3">Operador / Ponto</th>
                <th className="px-5 py-3 text-right">Vendas Bombas (R$)</th>
                <th className="px-5 py-3 text-right">Recolhimento (R$)</th>
                <th className="px-5 py-3 text-right">Diferença</th>
                <th className="px-5 py-3 text-center">Situação</th>
                <th className="px-5 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {fechamentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <Fuel className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    Nenhum fechamento de caixa encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                fechamentosFiltrados.map((f) => {
                  const hasEncerrantes = f.encerrantesBicos && f.encerrantesBicos.length > 0;
                  const rec = f.recolhimento;

                  return (
                    <tr key={f.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{f.data}</div>
                        <div className="text-[11px] text-slate-400">{f.turno}</div>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{f.funcionarioNome}</div>
                        <div className="text-[11px] text-slate-400">{f.caixaId}</div>
                      </td>

                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">
                        {formatarMoeda(f.totalConferido)}
                        {f.totalLitrosBicos ? (
                          <div className="text-[10px] text-slate-400 font-normal">
                            {f.totalLitrosBicos.toFixed(1)} L em {f.encerrantesBicos?.length || 0} bicos
                          </div>
                        ) : null}
                      </td>

                      <td className="px-5 py-3.5 text-right font-mono font-bold text-blue-700">
                        {formatarMoeda(f.totalInformado)}
                        {rec ? (
                          <div className="text-[10px] text-slate-400 font-normal flex items-center justify-end gap-1">
                            <span>Pix: {formatarMoeda(rec.pix + rec.pixCnpj)}</span>
                            <span>•</span>
                            <span>Cartão: {formatarMoeda(rec.cartao)}</span>
                          </div>
                        ) : null}
                      </td>

                      <td className="px-5 py-3.5 text-right font-mono font-bold">
                        <span
                          className={
                            f.diferenca < -0.01
                              ? 'text-red-600'
                              : f.diferenca > 0.01
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }
                        >
                          {formatarMoeda(f.diferenca)}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            f.tipoDiferenca === 'FALTA'
                              ? 'bg-red-100 text-red-800'
                              : f.tipoDiferenca === 'SOBRA'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {f.tipoDiferenca === 'SEM_DIFERENCA' ? 'BATIDO' : f.tipoDiferenca}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => exportarFechamentoCaixaPDF(f)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-semibold transition shadow-2xs"
                            title="Exportar fechamento oficial em PDF formatado"
                          >
                            <Download className="w-3.5 h-3.5 text-teal-600" />
                            PDF
                          </button>

                          <button
                            type="button"
                            onClick={() => handleImprimirComprovante(f)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold transition shadow-2xs"
                            title="Imprimir comprovante deste fechamento"
                          >
                            <Printer className="w-3.5 h-3.5 text-emerald-600" />
                            Imprimir
                          </button>

                          <button
                            type="button"
                            onClick={() => abrirDetalhes(f)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                            title="Ver espelho e detalhes do fechamento"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Detalhes
                          </button>

                          <button
                            type="button"
                            onClick={() => handleEditarFechamento(f)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition"
                            title="Alterar este fechamento de caixa"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Alterar
                          </button>

                          <button
                            type="button"
                            onClick={() => handleExcluirFechamento(f)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition"
                            title="Excluir este fechamento de caixa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir
                          </button>

                          {f.tipoDiferenca === 'FALTA' && (
                            <button
                              type="button"
                              onClick={() => abrirOcorrenciaParaFechamento(f)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition"
                              title="Abrir ocorrência de rateio de falta"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              Ocorrência
                            </button>
                          )}
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

      {/* Modal Novo / Alterar Fechamento */}
      <ModalNovoFechamento
        isOpen={isModalNovoFechamento}
        onClose={() => {
          setIsModalNovoFechamento(false);
          setFechamentoParaEditar(null);
        }}
        bicos={bicos}
        tanques={tanques}
        funcionarios={funcionarios}
        escalas={escalas}
        fechamentos={fechamentos}
        postoId={postoId}
        userProfile={userProfile}
        fechamentoParaEditar={fechamentoParaEditar}
        onFechamentoSalvo={handleFechamentoSalvo}
        onReload={onReload}
      />

      {/* Modal Detalhes e Comprovante do Fechamento */}
      <ModalDetalhesFechamento
        isOpen={isModalDetalhes}
        fechamento={selectedFechamento}
        autoPrint={autoPrintModal}
        onClose={() => {
          setIsModalDetalhes(false);
          setAutoPrintModal(false);
          setSelectedFechamento(null);
        }}
        onAbrirOcorrencia={abrirOcorrenciaParaFechamento}
      />

      {/* Modal Ocorrência de Falta */}
      {isModalOcorrencia && selectedFechamento && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in">
            <h3 className="text-base font-bold text-red-600 mb-1 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Abertura de Ocorrência de Falta de Caixa
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Diferença apurada: <strong className="text-red-700">{formatarMoeda(Math.abs(selectedFechamento.diferenca))}</strong>.
              Consulte os frentistas escalados no turno para formalizar a apuração ou rateio operacional.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Funcionários Escalados no Turno ({escaladosNoPeriodo.length})
                </label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1.5">
                  {escaladosNoPeriodo.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">
                      Nenhum colaborador registrado na escala deste turno.
                    </div>
                  ) : (
                    escaladosNoPeriodo.map((f) => (
                      <label key={f.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={participantesSelecionados.includes(f.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setParticipantesSelecionados((prev) => [...prev, f.id]);
                            } else {
                              setParticipantesSelecionados((prev) => prev.filter((id) => id !== f.id));
                            }
                          }}
                          className="rounded text-red-600 focus:ring-red-500"
                        />
                        <span>
                          {f.nome} ({f.cargo})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Regra de Distribuição da Falta
                </label>
                <select
                  value={regraDistribuicao}
                  onChange={(e) => setRegraDistribuicao(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                >
                  <option value="SOMENTE_RESPONSAVEL">Somente Responsável do Caixa ({selectedFechamento.funcionarioNome})</option>
                  <option value="DIVISAO_IGUALITARIA">Divisão Igualitária entre Selecionados</option>
                  <option value="PARTICIPANTES_SELECIONADOS">Participantes Selecionados com Análise</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Observações da Ocorrência
                </label>
                <textarea
                  rows={2}
                  value={obsOcorrencia}
                  onChange={(e) => setObsOcorrencia(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  placeholder="Relato dos fatos, verificação de conferência, etc."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOcorrencia(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Pular / Cancelar
                </button>
                <button
                  type="button"
                  disabled={salvandoOcorrencia}
                  onClick={handleSalvarOcorrencia}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
                >
                  {salvandoOcorrencia ? 'Gravando...' : 'Registrar Ocorrência'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
