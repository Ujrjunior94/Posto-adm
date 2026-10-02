import React, { useState, useMemo } from 'react';
import {
  RegistroDensidade,
  TipoTesteANP,
  Conformidade,
  ConformidadeStatus,
  Funcionario,
} from '../../types';
import {
  PostoSubcollectionRepository,
  registrarAuditoria,
} from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import {
  obterPadraoANP,
  calcularDetalhesDensidadeOperacional,
  calcularTesteProvetaGasolina,
  calcularTeorAlcoolicoEtanol,
  gerarMatrizNBR5992,
} from '../../utils/calculations';
import {
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Save,
  SlidersHorizontal,
  ClipboardCheck,
  Thermometer,
  FlaskConical,
  Droplets,
  Truck,
  Flame,
  Zap,
  Leaf,
} from 'lucide-react';

const repoDensidades = new PostoSubcollectionRepository<RegistroDensidade>('densidades');
const repoConformidades = new PostoSubcollectionRepository<Conformidade>('conformidades');

interface AnalisesProps {
  densidades: RegistroDensidade[];
  conformidades: Conformidade[];
  funcionarios: Funcionario[];
  onReload: () => void;
}

const COMBUSTIVEIS_LIST = [
  'Gasolina Comum',
  'Gasolina Aditivada',
  'Etanol',
  'Diesel S10',
  'Diesel S500',
];

export const AnalisesConformidadeView: React.FC<AnalisesProps> = ({
  densidades,
  conformidades,
  funcionarios,
  onReload,
}) => {
  const { postoId, userProfile } = useAuth();

  // Alternador Principal: Versão Simples (padrão) vs Detalhar Informações
  const [detalharInformacoes, setDetalharInformacoes] = useState(false);

  // Aba secundária quando desejar ver Checklist de Conformidades do Posto
  const [secaoAtiva, setSecaoAtiva] = useState<'CALCULADORA' | 'CONFORMIDADES'>('CALCULADORA');

  // Modo de Teste na Calculadora ANP
  const [tipoTeste, setTipoTeste] = useState<TipoTesteANP>('DENSIDADE_D20');
  const [produto, setProduto] = useState<string>('Gasolina Comum');

  // Estado de Edição de Registro de Densidade / Análise
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Entradas Diretas da Calculadora
  const [temperatura, setTemperatura] = useState<number>(25.0);
  const [densidadeObservada, setDensidadeObservada] = useState<number>(0.738);
  const [volumeAquosoFinal, setVolumeAquosoFinal] = useState<number>(66.0);
  const [condutividadeEletrica, setCondutividadeEletrica] = useState<number>(180);
  const [ph, setPh] = useState<number>(6.5);
  const [aspecto, setAspecto] = useState<string>('Límpido e Isento (L.I.I.)');

  // Campos Detalhados (visíveis ao clicar em "Detalhar Informações")
  const [responsavelId, setResponsavelId] = useState<string>(funcionarios[0]?.id || '');
  const [dataTeste, setDataTeste] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [horaTeste, setHoraTeste] = useState<string>(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
  const [numeroNotaFiscal, setNumeroNotaFiscal] = useState<string>('');
  const [placaCaminhao, setPlacaCaminhao] = useState<string>('');
  const [distribuidora, setDistribuidora] = useState<string>('');
  const [observacao, setObservacao] = useState<string>('');
  const [salvando, setSalvando] = useState<boolean>(false);

  // Estados para Cadastro / Edição de Checklist de Conformidade
  const [editandoConfId, setEditandoConfId] = useState<string | null>(null);
  const [confCategoria, setConfCategoria] = useState<Conformidade['categoria']>('QUALIDADE');
  const [confItem, setConfItem] = useState<string>('');
  const [confStatus, setConfStatus] = useState<ConformidadeStatus>('CONFORME');
  const [confObs, setConfObs] = useState<string>('');

  // Troca de produto com ajuste automático de densidade inicial quando não está em edição
  const handleTrocarProduto = (novoProd: string) => {
    setProduto(novoProd);
    if (editandoId) return;
    const padrao = obterPadraoANP(novoProd);
    const media = Number(((padrao.densidade20CMin + padrao.densidade20CMax) / 2).toFixed(4));
    setDensidadeObservada(media);
  };

  // Cálculo em tempo real
  const calculoAtual = useMemo(() => {
    const padrao = obterPadraoANP(produto);
    const calcDens = calcularDetalhesDensidadeOperacional(densidadeObservada, temperatura, produto);
    const aspectoConforme = aspecto.toLowerCase().includes('límpido') || aspecto.toLowerCase().includes('limpido');

    if (tipoTeste === 'TESTE_PROVETA_GASOLINA') {
      const resProv = calcularTesteProvetaGasolina(
        volumeAquosoFinal,
        produto.includes('Premium') ? 'PREMIUM' : produto.includes('Aditivada') ? 'ADITIVADA' : 'COMUM'
      );
      const isConforme = resProv.isConforme && aspectoConforme;
      return {
        isConforme,
        tituloResultado: 'Teor de Etanol Anidro na Gasolina',
        valorPrincipal: `${resProv.teorEtanolApurado.toFixed(1)}%`,
        subvalor: `Camada aquosa lida: ${resProv.volumeAquosoFinal} mL`,
        faixaPermitida: `Faixa ANP: ${resProv.teorReferenciaMin}% a ${resProv.teorReferenciaMax}% (Meta ${resProv.teorReferenciaNominal}%)`,
        parecerCurto: isConforme ? resProv.parecer : !aspectoConforme ? 'Reprovado por aspecto visual fora do padrão.' : resProv.parecer,
        formulaDetalhada: `Teor (%) = [(${resProv.volumeAquosoFinal} mL - 50 mL) × 2] + 1 = ${resProv.teorEtanolApurado}%`,
        d20Calculada: calcDens.densidadeCalculada20C,
        d20KgM3: calcDens.densidadeKgM3,
        teorEtanolAnidro: resProv.teorEtanolApurado,
        grauINPM: undefined as number | undefined,
        grauGL: undefined as number | undefined,
        padrao,
        calcDens,
      };
    }

    if (tipoTeste === 'TEOR_ALCOOLICO_ETANOL') {
      const resEta = calcularTeorAlcoolicoEtanol(calcDens.densidadeCalculada20C);
      const condOk = condutividadeEletrica <= (padrao.condutividadeEletricaMax || 350);
      const phOk = ph >= (padrao.phMin || 6.0) && ph <= (padrao.phMax || 8.0);
      const isConforme = resEta.isConforme && condOk && phOk && aspectoConforme;

      return {
        isConforme,
        tituloResultado: 'Teor Alcoólico e Densidade a 20°C',
        valorPrincipal: `${resEta.grauINPM.toFixed(1)} °INPM`,
        subvalor: `Densidade 20°C: ${calcDens.densidadeCalculada20C.toFixed(4)} g/cm³ (${calcDens.densidadeKgM3.toFixed(1)} kg/m³)`,
        faixaPermitida: 'Faixa ANP: 92,5 a 93,8 °INPM | 0,8076 a 0,8110 g/cm³',
        parecerCurto: isConforme
          ? `Etanol aprovado (${resEta.grauINPM.toFixed(1)} °INPM • ${calcDens.densidadeCalculada20C.toFixed(4)} g/cm³).`
          : !condOk
          ? `Condutividade (${condutividadeEletrica} µS/m) acima do limite de 350 µS/m.`
          : !phOk
          ? `pH (${ph}) fora da faixa de 6,0 a 8,0.`
          : resEta.parecer,
        formulaDetalhada: `${calcDens.formulaExplicativa} → Conversão NBR 5992 = ${resEta.grauINPM.toFixed(1)} °INPM (${resEta.grauGL.toFixed(1)} °GL)`,
        d20Calculada: calcDens.densidadeCalculada20C,
        d20KgM3: calcDens.densidadeKgM3,
        teorEtanolAnidro: undefined,
        grauINPM: resEta.grauINPM,
        grauGL: resEta.grauGL,
        padrao,
        calcDens,
      };
    }

    // DENSIDADE_D20 ou RECEBIMENTO_DESCARGA
    const isConforme = calcDens.isConforme && aspectoConforme;
    return {
      isConforme,
      tituloResultado:
        tipoTeste === 'RECEBIMENTO_DESCARGA'
          ? 'Densidade a 20°C na Descarga (Caminhão)'
          : 'Densidade Convertida a 20°C (D20)',
      valorPrincipal: `${calcDens.densidadeCalculada20C.toFixed(4)} g/cm³`,
      subvalor: `Equivalente a ${calcDens.densidadeKgM3.toFixed(1)} kg/m³ (lida a ${temperatura}°C)`,
      faixaPermitida: `Faixa ANP: ${padrao.densidade20CMin.toFixed(4)} a ${padrao.densidade20CMax.toFixed(4)} g/cm³ (${calcDens.faixaMinimaKgM3} a ${calcDens.faixaMaximaKgM3} kg/m³)`,
      parecerCurto: isConforme
        ? calcDens.parecerOperacional
        : !aspectoConforme
        ? 'Reprovado por aspecto visual fora do padrão.'
        : calcDens.parecerOperacional,
      formulaDetalhada: calcDens.formulaExplicativa,
      d20Calculada: calcDens.densidadeCalculada20C,
      d20KgM3: calcDens.densidadeKgM3,
      teorEtanolAnidro: undefined,
      grauINPM: undefined,
      grauGL: undefined,
      padrao,
      calcDens,
    };
  }, [
    produto,
    tipoTeste,
    temperatura,
    densidadeObservada,
    volumeAquosoFinal,
    condutividadeEletrica,
    ph,
    aspecto,
  ]);

  // Matriz NBR 5992 (gerada para exibição quando "Detalhar Informações" estiver ativo)
  const matrizNBR = useMemo(() => {
    return gerarMatrizNBR5992(produto, temperatura, densidadeObservada);
  }, [produto, temperatura, densidadeObservada]);

  const limparFormulario = () => {
    setEditandoId(null);
    setNumeroNotaFiscal('');
    setPlacaCaminhao('');
    setDistribuidora('');
    setObservacao('');
    setAspecto('Límpido e Isento (L.I.I.)');
    setDataTeste(new Date().toISOString().slice(0, 10));
    setHoraTeste(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  };

  // Carregar registro para Alterar (Editar)
  const handleEditarRegistro = (reg: RegistroDensidade) => {
    setEditandoId(reg.id);
    setProduto(reg.produto);
    setTipoTeste(reg.tipoTeste || 'DENSIDADE_D20');
    setTemperatura(reg.temperatura);
    setDensidadeObservada(reg.densidadeObservada);
    if (reg.volumeAquosoFinal !== undefined) setVolumeAquosoFinal(reg.volumeAquosoFinal);
    if (reg.condutividadeEletrica !== undefined) setCondutividadeEletrica(reg.condutividadeEletrica);
    if (reg.ph !== undefined) setPh(reg.ph);
    setAspecto(reg.aspecto || 'Límpido e Isento (L.I.I.)');
    setResponsavelId(reg.responsavelId || funcionarios[0]?.id || '');
    setDataTeste(reg.data || new Date().toISOString().slice(0, 10));
    setHoraTeste(reg.hora || '08:00');
    setNumeroNotaFiscal(reg.numeroNotaFiscal || '');
    setPlacaCaminhao(reg.placaCaminhao || '');
    setDistribuidora(reg.distribuidora || '');
    setObservacao(reg.observacao || '');
    if (reg.numeroNotaFiscal || reg.placaCaminhao || reg.observacao) {
      setDetalharInformacoes(true);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Excluir registro de análise
  const handleExcluirRegistro = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de análise?')) return;
    await repoDensidades.delete(postoId, id);
    if (editandoId === id) {
      limparFormulario();
    }
    await onReload();
  };

  // Salvar ou Atualizar Registro
  const handleSalvarRegistro = async () => {
    setSalvando(true);
    try {
      const id = editandoId || `dens-${Date.now()}`;
      const padrao = calculoAtual.padrao;

      const novoRegistro: RegistroDensidade = {
        id,
        postoId,
        produto,
        tipoTeste,
        temperatura: Number(temperatura),
        densidadeObservada: Number(densidadeObservada),
        densidadeCalculada20C: calculoAtual.d20Calculada,
        densidadeReferenciaMin: padrao.densidade20CMin,
        densidadeReferenciaMax: padrao.densidade20CMax,
        resultado: calculoAtual.isConforme ? 'CONFORME' : 'NAO_CONFORME',
        responsavelId: responsavelId || userProfile?.uid || 'op',
        data: dataTeste,
        hora: horaTeste,
        volumeAquosoFinal: tipoTeste === 'TESTE_PROVETA_GASOLINA' ? volumeAquosoFinal : undefined,
        teorEtanolAnidro: calculoAtual.teorEtanolAnidro,
        grauINPM: calculoAtual.grauINPM,
        grauGL: calculoAtual.grauGL,
        condutividadeEletrica: tipoTeste === 'TEOR_ALCOOLICO_ETANOL' ? condutividadeEletrica : undefined,
        ph: tipoTeste === 'TEOR_ALCOOLICO_ETANOL' ? ph : undefined,
        aspecto,
        cor: padrao.corEsperada,
        numeroNotaFiscal: numeroNotaFiscal.trim() || undefined,
        placaCaminhao: placaCaminhao.trim() || undefined,
        distribuidora: distribuidora.trim() || undefined,
        parecerTecnico: calculoAtual.parecerCurto,
        observacao: observacao.trim() || undefined,
        densidadeKgM3: calculoAtual.d20KgM3,
        criadoEm: new Date().toISOString(),
      };

      await repoDensidades.save(postoId, novoRegistro);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'LABORATORIO_ANP',
        'RegistroDensidade',
        id,
        editandoId ? 'UPDATE' : 'CREATE',
        null,
        novoRegistro as unknown as Record<string, unknown>
      );

      limparFormulario();
      await onReload();
    } catch (e: any) {
      alert(`Erro ao salvar análise: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  // Salvar ou Alterar item de Conformidade
  const handleSalvarConformidade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confItem.trim()) return;
    const id = editandoConfId || `conf-${Date.now()}`;
    const novaConf: Conformidade = {
      id,
      postoId,
      data: new Date().toISOString().slice(0, 10),
      categoria: confCategoria,
      item: confItem.trim(),
      status: confStatus,
      responsavelId: userProfile?.uid || funcionarios[0]?.id || 'op',
      observacao: confObs.trim() || undefined,
      criadoEm: new Date().toISOString(),
    };
    await repoConformidades.save(postoId, novaConf);
    setEditandoConfId(null);
    setConfItem('');
    setConfObs('');
    await onReload();
  };

  const handleExcluirConformidade = async (id: string) => {
    if (!window.confirm('Deseja excluir este item de conformidade?')) return;
    await repoConformidades.delete(postoId, id);
    await onReload();
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho com Alternador Claro: Versão Simples vs Botão para Detalhar Informações */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                Laboratório &amp; Calculadora ANP de Combustíveis
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  detalharInformacoes
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-teal-100 text-teal-800'
                }`}
              >
                {detalharInformacoes ? 'Visão Detalhada' : 'Versão Simples'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cálculo direto de densidade a 20°C, proveta de gasolina e grau alcoólico.
            </p>
          </div>
        </div>

        {/* Botões de Controle de Modo (Simples vs Detalhar Informações) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setDetalharInformacoes(false)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                !detalharInformacoes
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Versão Simples
            </button>
            <button
              type="button"
              onClick={() => setDetalharInformacoes(true)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                detalharInformacoes
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Detalhar Informações
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              setSecaoAtiva(secaoAtiva === 'CALCULADORA' ? 'CONFORMIDADES' : 'CALCULADORA')
            }
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              secaoAtiva === 'CONFORMIDADES'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            {secaoAtiva === 'CONFORMIDADES'
              ? 'Voltar à Calculadora'
              : `Checklist (${conformidades.length})`}
          </button>
        </div>
      </div>

      {secaoAtiva === 'CALCULADORA' ? (
        <>
          {/* Barra de Seleção Rápida do Tipo de Cálculo com Ícones Representativos */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {(
              [
                {
                  id: 'DENSIDADE_D20',
                  titulo: '1. Densidade a 20°C',
                  sub: 'Termodensímetro (°C + g/cm³)',
                  icon: Thermometer,
                },
                {
                  id: 'TESTE_PROVETA_GASOLINA',
                  titulo: '2. Proveta Gasolina',
                  sub: 'Teor de Etanol (100 mL)',
                  icon: FlaskConical,
                },
                {
                  id: 'TEOR_ALCOOLICO_ETANOL',
                  titulo: '3. Etanol (°INPM)',
                  sub: 'Grau Alcoólico e D20',
                  icon: Droplets,
                },
                {
                  id: 'RECEBIMENTO_DESCARGA',
                  titulo: '4. Descarga de NF',
                  sub: 'Amostra do Caminhão',
                  icon: Truck,
                },
              ] as const
            ).map((aba) => {
              const ativa = tipoTeste === aba.id;
              const AbaIcon = aba.icon;
              return (
                <button
                  key={aba.id}
                  type="button"
                  onClick={() => {
                    setTipoTeste(aba.id);
                    if (aba.id === 'TESTE_PROVETA_GASOLINA' && !produto.includes('Gasolina')) {
                      handleTrocarProduto('Gasolina Comum');
                    } else if (aba.id === 'TEOR_ALCOOLICO_ETANOL') {
                      handleTrocarProduto('Etanol');
                    }
                  }}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                    ativa
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      ativa ? 'bg-white/20 text-white' : 'bg-teal-50 text-teal-700'
                    }`}
                  >
                    <AbaIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-xs sm:text-sm truncate">{aba.titulo}</div>
                    <div className={`text-[11px] mt-0.5 truncate ${ativa ? 'text-teal-100' : 'text-slate-400'}`}>
                      {aba.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Grid Principal: Entradas Diretas + Resultado Claro */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Coluna Esquerda: Entradas */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  {editandoId ? 'Alterando Registro Selecionado' : 'Dados da Medição'}
                </h3>
                {editandoId && (
                  <button
                    type="button"
                    onClick={limparFormulario}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Cancelar Edição
                  </button>
                )}
              </div>

              {/* Combustível com Ícones Representativos */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                  Combustível Analisado
                </label>
                <div className="flex flex-wrap gap-2">
                  {COMBUSTIVEIS_LIST.map((c) => {
                    const sel = produto === c;
                    const IconComb = c.includes('Aditivada')
                      ? Zap
                      : c.includes('Etanol')
                      ? Leaf
                      : c.includes('Diesel')
                      ? Truck
                      : Flame;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleTrocarProduto(c)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          sel
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <IconComb className={`w-3.5 h-3.5 ${sel ? 'text-amber-400' : 'text-slate-500'}`} />
                        <span>{c}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Campos Essenciais (Sempre visíveis na Versão Simples) */}
              {tipoTeste === 'TESTE_PROVETA_GASOLINA' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Leitura da Camada Aquosa (mL)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="50"
                      max="100"
                      value={volumeAquosoFinal}
                      onChange={(e) => setVolumeAquosoFinal(parseFloat(e.target.value) || 50)}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-mono font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Aspecto Visual
                    </label>
                    <select
                      value={aspecto}
                      onChange={(e) => setAspecto(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold bg-white"
                    >
                      <option value="Límpido e Isento (L.I.I.)">Límpido e Isento (L.I.I.)</option>
                      <option value="Turvo">Turvo / Com Água Livre</option>
                      <option value="Com Impurezas">Com Impurezas</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Temperatura Lida (°C)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={temperatura}
                      onChange={(e) => setTemperatura(parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-mono font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Densidade Lida (g/cm³ ou kg/m³)
                    </label>
                    <input
                      type="number"
                      step="0.0005"
                      value={densidadeObservada}
                      onChange={(e) => setDensidadeObservada(parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-mono font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Campos Extras Exibidos Quando "Detalhar Informações" Está Ativo */}
              {detalharInformacoes && (
                <div className="pt-4 border-t border-slate-200 space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-teal-800">
                      Parâmetros Detalhados e Rastreabilidade
                    </span>
                  </div>

                  {tipoTeste === 'TEOR_ALCOOLICO_ETANOL' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Condutividade Elétrica (µS/m — máx. 350)
                        </label>
                        <input
                          type="number"
                          value={condutividadeEletrica}
                          onChange={(e) => setCondutividadeEletrica(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          pH da Amostra (6,0 a 8,0)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={ph}
                          onChange={(e) => setPh(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Data do Ensaio
                      </label>
                      <input
                        type="date"
                        value={dataTeste}
                        onChange={(e) => setDataTeste(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Nota Fiscal
                      </label>
                      <input
                        type="text"
                        value={numeroNotaFiscal}
                        onChange={(e) => setNumeroNotaFiscal(e.target.value)}
                        placeholder="Ex: NF 45920"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Placa / Distribuidora
                      </label>
                      <input
                        type="text"
                        value={placaCaminhao}
                        onChange={(e) => setPlacaCaminhao(e.target.value)}
                        placeholder="Ex: ABC-1D23"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Observações Técnicas
                      </label>
                      <input
                        type="text"
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Anotações sobre lacre, amostra-testemunha, etc."
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Responsável
                      </label>
                      <select
                        value={responsavelId}
                        onChange={(e) => setResponsavelId(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                      >
                        {funcionarios.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Botão rápido na parte inferior do card para alternar detalhes */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDetalharInformacoes(!detalharInformacoes)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900 cursor-pointer"
                >
                  {detalharInformacoes ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Voltar para Versão Simples (ocultar informações extras)
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Detalhar Informações (fórmula, tabela NBR 5992, NF e especificações)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Coluna Direita: Resultado Direto e Claro */}
            <div className="lg:col-span-5">
              <div
                className={`rounded-2xl p-6 border-2 shadow-xs h-full flex flex-col justify-between space-y-4 ${
                  calculoAtual.isConforme
                    ? 'bg-emerald-50/70 border-emerald-300'
                    : 'bg-red-50/70 border-red-300'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Resultado Imediato
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
                        calculoAtual.isConforme
                          ? 'bg-emerald-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {calculoAtual.isConforme ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          CONFORME
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4" />
                          NÃO CONFORME
                        </>
                      )}
                    </span>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200/80">
                    <div className="text-xs font-semibold text-slate-500">
                      {calculoAtual.tituloResultado} — {produto}
                    </div>
                    <div
                      className={`text-3xl font-mono font-black mt-1 ${
                        calculoAtual.isConforme ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {calculoAtual.valorPrincipal}
                    </div>
                    <div className="text-xs font-medium text-slate-600 mt-1">
                      {calculoAtual.subvalor}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 mt-2.5 pt-2 border-t border-slate-100">
                      {calculoAtual.faixaPermitida}
                    </div>
                  </div>

                  {/* Quando "Detalhar Informações" está ativo, mostra a memória de cálculo e especificações técnicas */}
                  {detalharInformacoes && (
                    <div className="p-3.5 bg-white/90 rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="font-bold text-slate-800">Memória de Cálculo Aplicada:</div>
                      <div className="font-mono text-[11px] text-slate-700 bg-slate-50 p-2 rounded border border-slate-200">
                        {calculoAtual.formulaDetalhada}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        <strong>Norma:</strong> {calculoAtual.padrao.normaANP} •{' '}
                        <strong>Cor esperada:</strong> {calculoAtual.padrao.corEsperada}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200/60">
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={handleSalvarRegistro}
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {salvando
                      ? 'Salvando...'
                      : editandoId
                      ? 'Salvar Alterações do Registro'
                      : 'Salvar Registro no Histórico'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Seção Extra Exibida SOMENTE quando o usuário clica em "Detalhar Informações" */}
          {detalharInformacoes && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Tabela de Conversão Termodensimétrica (ABNT NBR 5992 — {produto})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cruzamento de Densidade Lida vs. Temperatura convertida para 20°C
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center text-xs border-collapse border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold">
                      <th className="p-2 border border-slate-200">Dens. Lida \ Temp.</th>
                      {matrizNBR.temperaturas.map((t) => (
                        <th key={t} className="p-2 border border-slate-200 font-mono">
                          {t}°C
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrizNBR.linhas.map((linha) => (
                      <tr key={linha.densidadeLida}>
                        <td className="p-2 border border-slate-200 font-mono font-bold bg-slate-50">
                          {linha.densidadeLida.toFixed(4)}
                        </td>
                        {linha.celulas.map((cel) => (
                          <td
                            key={cel.temperatura}
                            className={`p-2 border border-slate-200 font-mono ${
                              cel.isCorrente
                                ? 'ring-2 ring-teal-600 font-black bg-teal-50 text-teal-950'
                                : cel.isConforme
                                ? 'text-emerald-800 bg-emerald-50/30'
                                : 'text-red-700 bg-red-50/40'
                            }`}
                          >
                            {cel.d20.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Histórico de Análises Realizadas com Alterar e Excluir */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Histórico de Análises Registradas ({densidades.length})
              </h3>
              <span className="text-xs text-slate-400">
                Altere ou exclua qualquer registro abaixo
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                    <th className="py-3 px-4">Data / Hora</th>
                    <th className="py-3 px-4">Combustível</th>
                    <th className="py-3 px-4 text-right">Temp. (°C)</th>
                    <th className="py-3 px-4 text-right">Dens. Lida</th>
                    <th className="py-3 px-4 text-right">Resultado 20°C / Proveta</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {densidades.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        Nenhuma análise registrada até o momento.
                      </td>
                    </tr>
                  ) : (
                    densidades.map((d) => {
                      const isConf = d.resultado === 'CONFORME';
                      return (
                        <tr key={d.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {d.data ? d.data.split('-').reverse().join('/') : '—'} {d.hora || ''}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">{d.produto}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700">
                            {d.temperatura}°C
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700">
                            {d.densidadeObservada.toFixed(4)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {d.tipoTeste === 'TESTE_PROVETA_GASOLINA' && d.teorEtanolAnidro !== undefined
                              ? `${d.teorEtanolAnidro}% Etanol`
                              : d.tipoTeste === 'TEOR_ALCOOLICO_ETANOL' && d.grauINPM !== undefined
                              ? `${d.grauINPM.toFixed(1)} °INPM (${d.densidadeCalculada20C.toFixed(4)})`
                              : `${d.densidadeCalculada20C.toFixed(4)} g/cm³`}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isConf
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {isConf ? 'CONFORME' : 'NÃO CONFORME'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditarRegistro(d)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
                                title="Alterar este registro"
                              >
                                <Edit2 className="w-3 h-3" />
                                Alterar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExcluirRegistro(d.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
                                title="Excluir este registro"
                              >
                                <Trash2 className="w-3 h-3" />
                                Excluir
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
        </>
      ) : (
        /* Aba de Checklist de Conformidade Operacional com Alterar e Excluir */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <h3 className="text-sm font-bold text-slate-900">
            Checklist de Conformidade Operacional e Ambiental
          </h3>

          <form onSubmit={handleSalvarConformidade} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Categoria</label>
              <select
                value={confCategoria}
                onChange={(e) => setConfCategoria(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold"
              >
                <option value="QUALIDADE">Qualidade ANP</option>
                <option value="SEGURANCA">Segurança NR-20</option>
                <option value="MEIO_AMBIENTE">Meio Ambiente</option>
                <option value="EQUIPAMENTOS">Equipamentos</option>
                <option value="FISCAL">Fiscal</option>
              </select>
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Item Verificado</label>
              <input
                type="text"
                required
                value={confItem}
                onChange={(e) => setConfItem(e.target.value)}
                placeholder="Ex: Kit de análise ANP aferido e lacrado"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Status</label>
              <select
                value={confStatus}
                onChange={(e) => setConfStatus(e.target.value as ConformidadeStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold"
              >
                <option value="CONFORME">Conforme</option>
                <option value="NAO_CONFORME">Não Conforme</option>
                <option value="PENDENTE">Pendente</option>
              </select>
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <button
                type="submit"
                className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
              >
                {editandoConfId ? 'Salvar Alteração' : '+ Registrar Item'}
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="py-2.5 px-4">Data</th>
                  <th className="py-2.5 px-4">Categoria</th>
                  <th className="py-2.5 px-4">Item</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  <th className="py-2.5 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conformidades.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono">{c.data.split('-').reverse().join('/')}</td>
                    <td className="py-2.5 px-4 font-semibold">{c.categoria}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">{c.item}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.status === 'CONFORME'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.status === 'NAO_CONFORME'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditandoConfId(c.id);
                            setConfCategoria(c.categoria);
                            setConfItem(c.item);
                            setConfStatus(c.status);
                            setConfObs(c.observacao || '');
                          }}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[11px] font-bold"
                        >
                          Alterar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExcluirConformidade(c.id)}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[11px] font-bold"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
