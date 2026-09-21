import React, { useState, useMemo, useEffect } from 'react';
import {
  RateioTurno,
  RateioIntegrante,
  TipoDiferencaTurno,
  Escala,
  Funcionario,
  FechamentoCaixa,
} from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import {
  calcularRateioTurno,
  formatarMoeda,
} from '../../utils/calculations';
import { exportarRateioTurnoPDF } from '../../utils/pdfGenerator';
import {
  DollarSign,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  UserX,
  Printer,
  Download,
  Plus,
  Trash2,
  Edit3,
  Search,
  Check,
  ArrowRight,
  Sparkles,
  Receipt,
  FileCheck,
  CreditCard,
  Building,
} from 'lucide-react';

const repoRateio = new PostoSubcollectionRepository<RateioTurno>('rateios');

const TURNOS_OFICIAIS = [
  {
    id: 'Turno 2 (06h - 14h)',
    nome: 'Turno 2',
    horario: '06:00 às 14:00',
    descricao: 'Manhã',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    iconColor: 'text-amber-600',
  },
  {
    id: 'Turno 3 (14h - 22h)',
    nome: 'Turno 3',
    horario: '14:00 às 22:00',
    descricao: 'Tarde',
    badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
    iconColor: 'text-blue-600',
  },
  {
    id: 'Turno 4 (22h - 06h)',
    nome: 'Turno 4',
    horario: '22:00 às 06:00',
    descricao: 'Noite / Madrugada',
    badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
    iconColor: 'text-purple-600',
  },
];

interface SobrasFaltasViewProps {
  funcionarios: Funcionario[];
  escalas: Escala[];
  fechamentos: FechamentoCaixa[];
  onReload: () => void;
}

export const SobrasFaltasView: React.FC<SobrasFaltasViewProps> = ({
  funcionarios,
  escalas,
  fechamentos,
  onReload,
}) => {
  const { postoId, userProfile } = useAuth();

  const [rateios, setRateios] = useState<RateioTurno[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros de visualização
  const hoje = new Date().toISOString().split('T')[0];
  const [dataSelecionada, setDataSelecionada] = useState(hoje);
  const [turnoSelecionado, setTurnoSelecionado] = useState<string>('Turno 2 (06h - 14h)');
  const [visualizacao, setVisualizacao] = useState<'NOVO_RATEIO' | 'HISTORICO' | 'RECIBO_IMPRESSAO'>('NOVO_RATEIO');
  const [rateioParaImprimir, setRateioParaImprimir] = useState<RateioTurno | null>(null);

  // Estado do Formulário de Rateio Atual
  const [tipoDiferenca, setTipoDiferenca] = useState<TipoDiferencaTurno>('FALTA');
  const [valorTotalDiferenca, setValorTotalDiferenca] = useState<number>(120);
  const [motivoDiferenca, setMotivoDiferenca] = useState('');
  const [statusRateio, setStatusRateio] = useState<'PENDENTE' | 'PARCIALMENTE_PAGO' | 'QUITADO' | 'DESCONTADO_FOLHA'>('PENDENTE');

  // Integrantes do Turno Atual
  const [integrantesTurno, setIntegrantesTurno] = useState<
    {
      funcionarioId: string;
      funcionarioNome: string;
      cargo: string;
      presente: boolean; // false se faltou ("x faltou")
      motivoAusencia: string;
      pago: boolean;
      formaPagamento: 'DESCONTO_FOLHA' | 'DINHEIRO' | 'PIX' | 'DISPENSADO' | 'PENDENTE';
    }[]
  >([]);

  // Carrega histórico de rateios
  const carregarRateios = async () => {
    setCarregando(true);
    try {
      const data = await repoRateio.getAll(postoId);
      setRateios(data.sort((a, b) => b.data.localeCompare(a.data)));
    } catch (err) {
      console.error('Erro ao carregar rateios:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarRateios();
  }, [postoId]);

  // Sincroniza integrantes com a ESCALA do dia e turno selecionados
  useEffect(() => {
    // 1. Procura escalas deste dia e turno
    const escalasTurno = escalas.filter(
      (e) =>
        e.data === dataSelecionada &&
        (e.turno === turnoSelecionado || e.turno?.includes(turnoSelecionado.split(' ')[0]))
    );

    if (escalasTurno.length > 0) {
      const lista = escalasTurno.map((esc) => {
        const func = funcionarios.find((f) => f.id === esc.funcionarioId);
        const estaTrabalhando = esc.status === 'TRABALHO';
        return {
          funcionarioId: esc.funcionarioId,
          funcionarioNome: func?.nome || 'Colaborador',
          cargo: func?.cargo || 'Frentista',
          presente: estaTrabalhando,
          motivoAusencia: estaTrabalhando ? '' : esc.status === 'AUSENTE' ? 'Falta não justificada' : esc.status,
          pago: false,
          formaPagamento: 'PENDENTE' as const,
        };
      });
      setIntegrantesTurno(lista);
    } else {
      // Se não tiver escala específica registrada, busca frentistas ativos do posto para preenchimento rápido
      const frentistasAtivos = funcionarios
        .filter((f) => f.status === 'ATIVO')
        .slice(0, 4)
        .map((f) => ({
          funcionarioId: f.id,
          funcionarioNome: f.nome,
          cargo: f.cargo || 'Frentista / Operador',
          presente: true,
          motivoAusencia: '',
          pago: false,
          formaPagamento: 'PENDENTE' as const,
        }));
      setIntegrantesTurno(frentistasAtivos);
    }

    // 2. Tenta puxar a diferença do fechamento de caixa do turno caso exista
    const fechamento = fechamentos.find(
      (f) =>
        f.data === dataSelecionada &&
        (f.turno === turnoSelecionado || f.turno?.includes(turnoSelecionado.split(' ')[0]))
    );
    if (fechamento && fechamento.diferenca !== 0) {
      if (fechamento.diferenca < 0) {
        setTipoDiferenca('FALTA');
        setValorTotalDiferenca(Math.abs(fechamento.diferenca));
      } else {
        setTipoDiferenca('SOBRA');
        setValorTotalDiferenca(fechamento.diferenca);
      }
      setMotivoDiferenca(`Puxado do Fechamento de Caixa #${fechamento.id.substring(0, 8)}`);
    }
  }, [dataSelecionada, turnoSelecionado, escalas, funcionarios, fechamentos]);

  // Alternar presença ("X Faltou" / "Presente")
  const handleTogglePresenca = (funcionarioId: string) => {
    setIntegrantesTurno((prev) =>
      prev.map((item) => {
        if (item.funcionarioId === funcionarioId) {
          const novoPresente = !item.presente;
          return {
            ...item,
            presente: novoPresente,
            motivoAusencia: novoPresente ? '' : 'Faltou ao plantão (excluído do rateio)',
          };
        }
        return item;
      })
    );
  };

  // Alternar pagamento individual
  const handleTogglePago = (funcionarioId: string, forma: 'DESCONTO_FOLHA' | 'DINHEIRO' | 'PIX' | 'DISPENSADO' | 'PENDENTE') => {
    setIntegrantesTurno((prev) =>
      prev.map((item) => {
        if (item.funcionarioId === funcionarioId) {
          const isPago = forma !== 'PENDENTE';
          return {
            ...item,
            pago: isPago,
            formaPagamento: forma,
          };
        }
        return item;
      })
    );
  };

  // Adicionar funcionário manualmente ao rateio do turno
  const handleAdicionarFuncionarioManual = (funcionarioId: string) => {
    const jaExiste = integrantesTurno.some((i) => i.funcionarioId === funcionarioId);
    if (jaExiste) return;

    const func = funcionarios.find((f) => f.id === funcionarioId);
    if (!func) return;

    setIntegrantesTurno((prev) => [
      ...prev,
      {
        funcionarioId: func.id,
        funcionarioNome: func.nome,
        cargo: func.cargo || 'Frentista',
        presente: true,
        motivoAusencia: '',
        pago: false,
        formaPagamento: 'PENDENTE',
      },
    ]);
  };

  // Remover funcionário do rateio
  const handleRemoverFuncionario = (funcionarioId: string) => {
    setIntegrantesTurno((prev) => prev.filter((i) => i.funcionarioId !== funcionarioId));
  };

  // Cálculo do Rateio em tempo real
  const calculoRateio = useMemo(() => {
    return calcularRateioTurno(
      valorTotalDiferenca,
      tipoDiferenca,
      integrantesTurno.map((i) => ({
        id: i.funcionarioId,
        nome: i.funcionarioNome,
        presente: i.presente,
      }))
    );
  }, [valorTotalDiferenca, tipoDiferenca, integrantesTurno]);

  // Salvar Rateio Oficial no Firestore
  const handleSalvarRateio = async () => {
    if (integrantesTurno.length === 0) {
      alert('Adicione ao menos um colaborador ao turno para calcular o rateio.');
      return;
    }

    const integrantesFinais: RateioIntegrante[] = integrantesTurno.map((item) => {
      const calcItem = calculoRateio.distribuicao.find((d) => d.funcionarioId === item.funcionarioId);
      return {
        funcionarioId: item.funcionarioId,
        funcionarioNome: item.funcionarioNome,
        cargo: item.cargo,
        presente: item.presente,
        motivoAusencia: item.motivoAusencia,
        valorIndividual: calcItem ? calcItem.valor : 0,
        pago: item.pago,
        formaPagamento: item.formaPagamento,
        dataPagamento: item.pago ? new Date().toISOString() : undefined,
      };
    });

    const id = `rateio-${dataSelecionada}-${turnoSelecionado.split(' ')[1].toLowerCase()}`;

    const novoRateio: RateioTurno = {
      id,
      postoId,
      data: dataSelecionada,
      turno: turnoSelecionado,
      tipo: tipoDiferenca,
      valorTotalDiferenca,
      totalIntegrantesEscalados: calculoRateio.totalEscalados,
      totalIntegrantesPresentes: calculoRateio.totalPresentes,
      totalIntegrantesAusentes: calculoRateio.totalAusentes,
      valorPorIntegrante: calculoRateio.valorPorIntegrante,
      integrantes: integrantesFinais,
      status: statusRateio,
      motivo: motivoDiferenca,
      criadoPor: userProfile?.nome || 'Gerente Operacional',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await repoRateio.save(postoId, novoRateio);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'SOBRAS_FALTAS',
      'RateioTurno',
      id,
      'CREATE',
      null,
      novoRateio as any
    );

    await carregarRateios();
    onReload();
    alert('Rateio de Sobras e Faltas registrado com sucesso!');
  };

  const handleExcluirRateio = async (id: string) => {
    if (!window.confirm('Deseja excluir este registro de rateio de caixa?')) return;
    await repoRateio.delete(postoId, id);
    await carregarRateios();
    onReload();
  };

  const abrirImpressao = (r: RateioTurno) => {
    setRateioParaImprimir(r);
    setVisualizacao('RECIBO_IMPRESSAO');
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Módulo de Sobras & Faltas */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-md">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Planner de Sobras e Faltas</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                Vinculado à Escala
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Controle de rateio por turno, desconto de ausentes ("X Faltou") e recibo oficial para frentistas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setVisualizacao('NOVO_RATEIO')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              visualizacao === 'NOVO_RATEIO'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Lançar Rateio de Turno</span>
          </button>
          <button
            onClick={() => setVisualizacao('HISTORICO')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              visualizacao === 'HISTORICO'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Histórico de Rateios ({rateios.length})</span>
          </button>
        </div>
      </div>

      {/* TELA 1: NOVO RATEIO DE TURNO */}
      {visualizacao === 'NOVO_RATEIO' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda: Configuração do Turno e Diferença */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>1. Data e Turno do Plantão</span>
              </h2>

              {/* Data */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Data da Escala</label>
                <input
                  type="date"
                  value={dataSelecionada}
                  onChange={(e) => setDataSelecionada(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Seleção de Turno com os 3 Turnos Oficiais */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Turno Oficial do Posto</label>
                <div className="space-y-2">
                  {TURNOS_OFICIAIS.map((t) => {
                    const isSelected = turnoSelecionado === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTurnoSelecionado(t.id)}
                        className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300/50'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">{t.nome}</span>
                            <span className="text-[11px] font-semibold text-slate-500">({t.horario})</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{t.descricao}</div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tipo e Valor da Diferença */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-bold text-slate-900">2. Diferença Apurada no Caixa</h3>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoDiferenca('FALTA')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      tipoDiferenca === 'FALTA'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Falta de Caixa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoDiferenca('SOBRA')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      tipoDiferenca === 'SOBRA'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Sobra de Caixa</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Valor Total da {tipoDiferenca === 'FALTA' ? 'Falta (R$)' : 'Sobra (R$)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={valorTotalDiferenca}
                      onChange={(e) => setValorTotalDiferenca(parseFloat(e.target.value) || 0)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Justificativa</label>
                  <textarea
                    rows={2}
                    value={motivoDiferenca}
                    onChange={(e) => setMotivoDiferenca(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    placeholder="Ex: Diferença apurada na conferência física do turno 2..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Integrantes do Turno, "X Faltou" e Rateio em Tempo Real */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card de Resumo do Rateio Calculado */}
            <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 rounded-2xl p-6 text-white shadow-md">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-100">
                    Cálculo de Rateio do Turno
                  </span>
                  <div className="text-3xl font-black mt-1 font-mono">
                    {formatarMoeda(calculoRateio.valorPorIntegrante)}
                    <span className="text-sm font-normal text-amber-100 ml-2">/ colaborador presente</span>
                  </div>
                  <p className="text-xs text-amber-100/90 mt-1">
                    Valor total de {formatarMoeda(calculoRateio.valorTotal)} dividido igualmente entre{' '}
                    <strong className="underline">{calculoRateio.totalPresentes} presentes</strong> (
                    {calculoRateio.totalAusentes} ausentes excluídos).
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/20 text-xs space-y-1">
                  <div className="flex justify-between gap-4">
                    <span>Total Escalados:</span>
                    <strong>{calculoRateio.totalEscalados}</strong>
                  </div>
                  <div className="flex justify-between gap-4 text-emerald-200">
                    <span>Presentes (Trabalharam):</span>
                    <strong>{calculoRateio.totalPresentes}</strong>
                  </div>
                  <div className="flex justify-between gap-4 text-red-200">
                    <span>Faltaram ("X Faltou"):</span>
                    <strong>{calculoRateio.totalAusentes}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Lista Interativa de Colaboradores Escalados no Turno */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-sm text-slate-900">
                    Integrantes da Escala deste Turno ({integrantesTurno.length})
                  </h3>
                </div>

                {/* Seletor rápido para adicionar mais colaboradores caso necessário */}
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAdicionarFuncionarioManual(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-700 focus:outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>
                    + Adicionar outro colaborador
                  </option>
                  {funcionarios
                    .filter((f) => !integrantesTurno.some((i) => i.funcionarioId === f.id))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome} ({f.cargo || 'Frentista'})
                      </option>
                    ))}
                </select>
              </div>

              {integrantesTurno.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Nenhum colaborador encontrado na escala deste dia e turno.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Selecione colaboradores acima para montar a lista do turno.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {integrantesTurno.map((item) => {
                    const rateioItem = calculoRateio.distribuicao.find((d) => d.funcionarioId === item.funcionarioId);
                    const valorIndividual = rateioItem ? rateioItem.valor : 0;

                    return (
                      <div
                        key={item.funcionarioId}
                        className={`p-4 rounded-xl border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                          item.presente
                            ? 'bg-white border-slate-200 hover:border-amber-300'
                            : 'bg-red-50/50 border-red-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleTogglePresenca(item.funcionarioId)}
                            title={item.presente ? 'Clique para marcar Falta ("X Faltou")' : 'Clique para marcar Presente'}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition shadow-2xs ${
                              item.presente
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-red-600 text-white hover:bg-red-700'
                            }`}
                          >
                            {item.presente ? <UserCheck className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
                          </button>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">{item.funcionarioNome}</span>
                              <span className="text-[10px] text-slate-400 font-semibold uppercase">{item.cargo}</span>
                            </div>
                            <div className="text-xs mt-0.5">
                              {item.presente ? (
                                <span className="text-emerald-700 font-bold flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Presente no Turno
                                </span>
                              ) : (
                                <span className="text-red-700 font-bold flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5" /> X FALTOU — Isento do rateio
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Valor e Forma de Pagamento */}
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400">Cota do Rateio:</div>
                            <div className={`font-mono font-bold text-sm ${item.presente ? 'text-amber-700' : 'text-slate-400 line-through'}`}>
                              {formatarMoeda(valorIndividual)}
                            </div>
                          </div>

                          {/* Seletor de Pagamento */}
                          {item.presente && (
                            <select
                              value={item.formaPagamento}
                              onChange={(e) => handleTogglePago(item.funcionarioId, e.target.value as any)}
                              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            >
                              <option value="PENDENTE">Pendente</option>
                              <option value="DESCONTO_FOLHA">Descontar Folha</option>
                              <option value="DINHEIRO">Pago em Dinheiro</option>
                              <option value="PIX">Pago via PIX</option>
                              <option value="DISPENSADO">Dispensado</option>
                            </select>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoverFuncionario(item.funcionarioId)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition"
                            title="Remover do turno"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Botões de Ação */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  Total de <strong>{calculoRateio.totalPresentes}</strong> frentistas assumirão o rateio de{' '}
                  <strong>{formatarMoeda(calculoRateio.valorPorIntegrante)}</strong> cada.
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSalvarRateio}
                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Salvar Rateio do Turno</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TELA 2: HISTÓRICO DE RATEIOS */}
      {visualizacao === 'HISTORICO' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              <span>Histórico de Rateios de Caixa por Turno</span>
            </h2>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-3 py-3">Turno</th>
                    <th className="px-3 py-3">Tipo</th>
                    <th className="px-3 py-3 text-right">Valor Total</th>
                    <th className="px-3 py-3 text-center">Presentes</th>
                    <th className="px-3 py-3 text-center">Faltaram</th>
                    <th className="px-3 py-3 text-right font-bold">Valor / Pessoa</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rateios.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                        Nenhum rateio registrado até o momento.
                      </td>
                    </tr>
                  ) : (
                    rateios.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3.5 font-mono font-semibold text-slate-800">
                          {r.data.split('-').reverse().join('/')}
                        </td>
                        <td className="px-3 py-3.5 font-bold text-slate-900">{r.turno}</td>
                        <td className="px-3 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.tipo === 'FALTA'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {r.tipo === 'FALTA' ? 'Falta de Caixa' : 'Sobra'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold text-slate-900">
                          {formatarMoeda(r.valorTotalDiferenca)}
                        </td>
                        <td className="px-3 py-3.5 text-center font-bold text-emerald-700">
                          {r.totalIntegrantesPresentes}
                        </td>
                        <td className="px-3 py-3.5 text-center font-bold text-red-600">
                          {r.totalIntegrantesAusentes}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold text-amber-700">
                          {formatarMoeda(r.valorPorIntegrante)}
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => exportarRateioTurnoPDF(r)}
                              className="p-1.5 hover:bg-amber-100 text-amber-700 rounded-lg transition"
                              title="Exportar Termo de Rateio em PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => abrirImpressao(r)}
                              className="p-1.5 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                              title="Visualizar / Imprimir Recibo"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleExcluirRateio(r.id)}
                              className="p-1.5 hover:bg-red-100 text-red-600 rounded-lg transition"
                              title="Excluir Rateio"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TELA 3: RECIBO E TERMO DE RATEIO OFICIAL PARA IMPRESSÃO */}
      {visualizacao === 'RECIBO_IMPRESSAO' && rateioParaImprimir && (
        <div className="space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <button
              onClick={() => setVisualizacao('HISTORICO')}
              className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              ← Voltar ao Histórico
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportarRateioTurnoPDF(rateioParaImprimir)}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-teal-700 transition"
              >
                <Download className="w-4 h-4" />
                <span>Exportar PDF</span>
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-amber-700 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Termo</span>
              </button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-300 shadow-md font-sans text-slate-900 max-w-3xl mx-auto print:p-0 print:border-0 print:shadow-none">
            <div className="border-b-2 border-slate-900 pb-4 mb-6 text-center">
              <h1 className="text-base font-bold uppercase tracking-wider">
                TERMO DE CIÊNCIA E RATEIO DE DIFERENÇA DE CAIXA
              </h1>
              <p className="text-xs text-slate-600">
                Turno de Operação e Prestação de Contas do Posto de Combustíveis
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
              <div>
                <div><strong>Data do Plantão:</strong> {rateioParaImprimir.data.split('-').reverse().join('/')}</div>
                <div><strong>Turno:</strong> {rateioParaImprimir.turno}</div>
                <div><strong>Responsável pela Emissão:</strong> {rateioParaImprimir.criadoPor}</div>
              </div>
              <div className="text-right">
                <div><strong>Tipo de Ocorrência:</strong> {rateioParaImprimir.tipo === 'FALTA' ? 'Falta de Caixa' : 'Sobra'}</div>
                <div><strong>Valor Total da Diferença:</strong> <span className="font-bold text-red-700">{formatarMoeda(rateioParaImprimir.valorTotalDiferenca)}</span></div>
                <div><strong>Valor Individual por Presente:</strong> <span className="font-bold text-amber-800">{formatarMoeda(rateioParaImprimir.valorPorIntegrante)}</span></div>
              </div>
            </div>

            <div className="space-y-3 mb-8">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Quadro de Rateio e Assinaturas dos Integrantes do Turno
              </h2>

              <table className="w-full text-left text-xs border border-slate-300 border-collapse">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                  <tr>
                    <th className="p-2 border-r border-slate-300">Colaborador / Frentista</th>
                    <th className="p-2 border-r border-slate-300 text-center">Presença</th>
                    <th className="p-2 border-r border-slate-300 text-right">Valor Parcela</th>
                    <th className="p-2 border-r border-slate-300">Forma Acordada</th>
                    <th className="p-2 text-center">Assinatura de Ciência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rateioParaImprimir.integrantes.map((i) => (
                    <tr key={i.funcionarioId} className="h-12">
                      <td className="p-2 border-r border-slate-300 font-semibold">{i.funcionarioNome}</td>
                      <td className="p-2 border-r border-slate-300 text-center font-bold">
                        {i.presente ? <span className="text-emerald-700">PRESENTE</span> : <span className="text-red-700">FALTOU</span>}
                      </td>
                      <td className="p-2 border-r border-slate-300 text-right font-mono font-bold">
                        {i.presente ? formatarMoeda(i.valorIndividual) : 'R$ 0,00'}
                      </td>
                      <td className="p-2 border-r border-slate-300 text-[11px]">{i.formaPagamento || 'A Combinar'}</td>
                      <td className="p-2 text-center text-[10px] text-slate-400 border-b border-slate-400">
                        {i.presente ? '___________________________' : 'Ausente'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs text-center">
              <div>
                <div className="border-t border-slate-400 pt-1 font-semibold">Visto do Gerente / Supervisor</div>
                <div className="text-[10px] text-slate-500">{rateioParaImprimir.criadoPor}</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1 font-semibold">Data da Homologação</div>
                <div className="text-[10px] text-slate-500">____/____/________</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
