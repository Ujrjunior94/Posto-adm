import React, { useState } from 'react';
import { RegistroDensidade, Conformidade, Funcionario, TipoTesteANP } from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import {
  PADROES_ANP_2026,
  calcularDensidade20C,
  calcularDetalhesDensidadeOperacional,
  calcularTesteProvetaGasolina,
  calcularTeorAlcoolicoEtanol,
} from '../../utils/calculations';
import { ModalTabelaOficialANP } from './ModalTabelaOficialANP';
import {
  TestTubes,
  CheckSquare,
  Plus,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  FlaskConical,
  Truck,
  Droplets,
  Calendar,
  XCircle,
  FileCheck,
  Calculator,
  ChevronDown,
  ChevronUp,
  Info,
  Scale,
  Thermometer,
  FileSpreadsheet,
  ExternalLink,
  Table,
  Pencil,
  Trash2,
} from 'lucide-react';
import { ModalEditarAnalise } from './ModalEditarAnalise';

const repoDensidade = new PostoSubcollectionRepository<RegistroDensidade>('densidades');
const repoConformidade = new PostoSubcollectionRepository<Conformidade>('conformidades');

interface AnalisesConformidadeProps {
  densidades: RegistroDensidade[];
  conformidades: Conformidade[];
  funcionarios: Funcionario[];
  onReload: () => void;
}

export const AnalisesConformidadeView: React.FC<AnalisesConformidadeProps> = ({
  densidades,
  conformidades,
  funcionarios,
  onReload,
}) => {
  const { postoId, userProfile } = useAuth();
  const [tabPrincipal, setTabPrincipal] = useState<'ANP_2026' | 'CHECKLIST_NR20'>('ANP_2026');
  const [abaTeste, setAbaTeste] = useState<TipoTesteANP>('DENSIDADE_D20');

  // Estado do Teste de Densidade D20
  const [produto, setProduto] = useState('Gasolina Comum');
  const [temperatura, setTemperatura] = useState(25);
  const [densidadeObservada, setDensidadeObservada] = useState(0.742);
  const [responsavelId, setResponsavelId] = useState(funcionarios[0]?.id || '');
  const [obsDensidade, setObsDensidade] = useState('');

  // Estado do Teste da Proveta (Teor de Etanol na Gasolina - Padrão D32 Resolução Ago/2026: 32% ± 1%)
  const [volumeAquosoFinal, setVolumeAquosoFinal] = useState(65.5); // 65.5ml -> (65.5-50)*2 + 1 = 32.0% (Padrão D32 / E32)

  // Estado da Análise de Etanol Hidratado
  const [condutividadeEletrica, setCondutividadeEletrica] = useState(180); // µS/m (máx 350)
  const [phEtanol, setPhEtanol] = useState(7.0); // 6.0 a 8.0

  // Estado de Recebimento de Descarga de Caminhão-Tanque
  const [numeroNotaFiscal, setNumeroNotaFiscal] = useState('');
  const [placaCaminhao, setPlacaCaminhao] = useState('');
  const [distribuidora, setDistribuidora] = useState('Vibra / Petrobras');
  const [compartimento, setCompartimento] = useState('Comp. 01 (5.000 L)');
  const [lacreConferido, setLacreConferido] = useState(true);

  // Estados Operacionais Específicos D32
  const [metodoEnsaioD32, setMetodoEnsaioD32] = useState<'ABNT NBR 5992' | 'ASTM D1250' | 'DIGITAL'>('ABNT NBR 5992');
  const [temperaturaAmbienteD32, setTemperaturaAmbienteD32] = useState(25.0);
  const [expandirMemoriaCalculo, setExpandirMemoriaCalculo] = useState(false);
  const [isModalTabelaOficialAberto, setIsModalTabelaOficialAberto] = useState(false);

  // Form Modal Checklist Conformidade
  const [isModalConformidade, setIsModalConformidade] = useState(false);
  const [categoria, setCategoria] = useState<
    'SEGURANCA' | 'MEIO_AMBIENTE' | 'QUALIDADE' | 'FISCAL' | 'EQUIPAMENTOS' | 'UNIFORMES'
  >('SEGURANCA');
  const [itemChecklist, setItemChecklist] = useState('Extintores de Incêndio Desobstruídos e com Carga Válida (NR-20)');
  const [statusConformidade, setStatusConformidade] = useState<'CONFORME' | 'NAO_CONFORME' | 'PENDENTE'>('CONFORME');
  const [obsConformidade, setObsConformidade] = useState('');

  // Estados para Edição e Exclusão de Laudos de Análise (RegistroDensidade)
  const [analiseParaEditar, setAnaliseParaEditar] = useState<RegistroDensidade | null>(null);
  const [isModalEditarAnalise, setIsModalEditarAnalise] = useState(false);
  const [analiseParaExcluir, setAnaliseParaExcluir] = useState<RegistroDensidade | null>(null);
  const [isModalExcluirAnalise, setIsModalExcluirAnalise] = useState(false);
  const [isModalLimparLaudos, setIsModalLimparLaudos] = useState(false);

  // Estados para Edição e Exclusão de Checklist (Conformidade)
  const [checklistParaEditar, setChecklistParaEditar] = useState<Conformidade | null>(null);
  const [isModalEditarChecklist, setIsModalEditarChecklist] = useState(false);
  const [checklistParaExcluir, setChecklistParaExcluir] = useState<Conformidade | null>(null);
  const [isModalExcluirChecklist, setIsModalExcluirChecklist] = useState(false);
  const [isModalLimparChecklist, setIsModalLimparChecklist] = useState(false);

  const [processandoAcao, setProcessandoAcao] = useState(false);

  // Configuração e referências do produto selecionado segundo a ANP 2026
  const padraoAtual = PADROES_ANP_2026[produto] || PADROES_ANP_2026['Gasolina Comum'];

  // 1. Cálculos D20 com memória de cálculo detalhada para transparência operacional
  const detalhesDensidade = calcularDetalhesDensidadeOperacional(densidadeObservada, temperatura, produto);
  const densidadeCalculada20 = detalhesDensidade.densidadeCalculada20C;
  const isDensidadeConforme = detalhesDensidade.isConforme;

  // 2. Cálculos Teste da Proveta Gasolina (Resolução de Agosto de 2026 D32 / E32)
  const resultadoProveta = calcularTesteProvetaGasolina(
    volumeAquosoFinal,
    produto.includes('Premium') ? 'PREMIUM' : 'COMUM'
  );

  // 3. Cálculos Etanol Hidratado (Res. ANP 907/2022: 807,6 a 811,0 kg/m³ e 92,5% a 93,8% °INPM)
  const resultadoEtanol = calcularTeorAlcoolicoEtanol(densidadeCalculada20);
  const isCondutividadeConforme = condutividadeEletrica <= 350;
  const isPhConforme = phEtanol >= 6.0 && phEtanol <= 8.0;
  const isEtanolTotalConforme = resultadoEtanol.isConforme && isCondutividadeConforme && isPhConforme;

  // Determinação do status global de acordo com o teste ativo
  let statusFinalTeste: 'CONFORME' | 'NAO_CONFORME' = 'CONFORME';
  let parecerTecnicoFinal = '';

  if (abaTeste === 'DENSIDADE_D20') {
    if (produto.includes('Etanol')) {
      statusFinalTeste = isDensidadeConforme && resultadoEtanol.isConforme ? 'CONFORME' : 'NAO_CONFORME';
      parecerTecnicoFinal = (isDensidadeConforme && resultadoEtanol.isConforme)
        ? `APROVADO - Dentro das especificações ANP (${detalhesDensidade.faixaMinimaKgM3.toFixed(1)} - ${detalhesDensidade.faixaMaximaKgM3.toFixed(1)} kg/m³). D20 calculada: ${detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³ | Grau alcoólico: ${resultadoEtanol.grauINPM}% m/m (mín. 92,5% m/m).`
        : `NÃO CONFORME: Densidade D20 (${detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³) fora dos limites ANP (${detalhesDensidade.faixaMinimaKgM3.toFixed(1)} a ${detalhesDensidade.faixaMaximaKgM3.toFixed(1)} kg/m³). Teor em massa apurado: ${resultadoEtanol.grauINPM}% m/m.`;
    } else {
      statusFinalTeste = isDensidadeConforme ? 'CONFORME' : 'NAO_CONFORME';
      parecerTecnicoFinal = isDensidadeConforme
        ? `Densidade D20 (${densidadeCalculada20.toFixed(4)} g/cm³ | ${detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³) dentro do padrão regulamentar ANP 2026 (${padraoAtual.densidade20CMin.toFixed(4)} a ${padraoAtual.densidade20CMax.toFixed(4)} g/cm³). Fator α: ${detalhesDensidade.coeficienteExpansaoTermica}.`
        : `NÃO CONFORME: Densidade D20 (${densidadeCalculada20.toFixed(4)} g/cm³ | ${detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³) fora dos limites ANP 2026 (${padraoAtual.densidade20CMin.toFixed(4)} a ${padraoAtual.densidade20CMax.toFixed(4)} g/cm³).`;
    }
  } else if (abaTeste === 'TESTE_PROVETA_GASOLINA') {
    statusFinalTeste = resultadoProveta.isConforme ? 'CONFORME' : 'NAO_CONFORME';
    parecerTecnicoFinal = `${resultadoProveta.parecer} Teor apurado de ${resultadoProveta.teorEtanolApurado}% (Volume aquoso lido na proveta: ${volumeAquosoFinal} ml | Faixa exigida pela Resolução de Agosto/2026 D32: ${resultadoProveta.teorReferenciaMin}% a ${resultadoProveta.teorReferenciaMax}%).`;
  } else if (abaTeste === 'TEOR_ALCOOLICO_ETANOL') {
    statusFinalTeste = isEtanolTotalConforme ? 'CONFORME' : 'NAO_CONFORME';
    parecerTecnicoFinal = `Conversão da D32 para teor alcoólico em massa: ${resultadoEtanol.grauINPM}° INPM (Padrão ANP: 92,5° a 95,4° INPM) | Teor em volume: ${resultadoEtanol.grauGL}° GL | Condutividade: ${condutividadeEletrica} µS/m | pH: ${phEtanol}. ${resultadoEtanol.parecer}`;
  } else if (abaTeste === 'RECEBIMENTO_DESCARGA') {
    const conformeDescarga = isDensidadeConforme && lacreConferido;
    statusFinalTeste = conformeDescarga ? 'CONFORME' : 'NAO_CONFORME';
    parecerTecnicoFinal = conformeDescarga
      ? `Descarga liberada: Lacres conferidos, D20 ${densidadeCalculada20.toFixed(4)} g/cm³ em conformidade com a NF ${numeroNotaFiscal || 'S/N'}.`
      : `Descarga REPROVADA / BLOQUEADA: Falha de lacre ou desvio de densidade na amostra-testemunha.`;
  }

  // Gravar registro técnico no Firestore / Repositório Local
  const handleSalvarAnaliseANP = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = `anp-${Date.now()}`;
    const responsavelNome = funcionarios.find((f) => f.id === responsavelId)?.nome || 'Operador de Pátio';

    const novoRegistro: RegistroDensidade = {
      id,
      postoId,
      produto,
      tipoTeste: abaTeste,
      temperatura,
      densidadeObservada,
      densidadeCalculada20C: densidadeCalculada20,
      densidadeReferenciaMin: padraoAtual.densidade20CMin,
      densidadeReferenciaMax: padraoAtual.densidade20CMax,
      resultado: statusFinalTeste,
      responsavelId,
      data: new Date().toISOString().slice(0, 10),
      hora: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      volumeAquosoFinal: abaTeste === 'TESTE_PROVETA_GASOLINA' ? volumeAquosoFinal : undefined,
      teorEtanolAnidro: abaTeste === 'TESTE_PROVETA_GASOLINA' ? resultadoProveta.teorEtanolApurado : undefined,
      grauINPM: (abaTeste === 'TEOR_ALCOOLICO_ETANOL' || produto.includes('Etanol')) ? resultadoEtanol.grauINPM : undefined,
      grauGL: (abaTeste === 'TEOR_ALCOOLICO_ETANOL' || produto.includes('Etanol')) ? resultadoEtanol.grauGL : undefined,
      condutividadeEletrica: abaTeste === 'TEOR_ALCOOLICO_ETANOL' ? condutividadeEletrica : undefined,
      ph: abaTeste === 'TEOR_ALCOOLICO_ETANOL' ? phEtanol : undefined,
      aspecto: padraoAtual.aspectoEsperado,
      cor: padraoAtual.corEsperada,
      numeroNotaFiscal: abaTeste === 'RECEBIMENTO_DESCARGA' ? numeroNotaFiscal : undefined,
      placaCaminhao: abaTeste === 'RECEBIMENTO_DESCARGA' ? placaCaminhao : undefined,
      distribuidora: abaTeste === 'RECEBIMENTO_DESCARGA' ? distribuidora : undefined,
      compartimento: abaTeste === 'RECEBIMENTO_DESCARGA' ? compartimento : undefined,
      lacreConferido: abaTeste === 'RECEBIMENTO_DESCARGA' ? lacreConferido : undefined,
      parecerTecnico: parecerTecnicoFinal,
      observacao: obsDensidade,
      criadoEm: new Date().toISOString(),
      // Campos específicos de conformidade regulatória D32
      metodoEnsaioD32: metodoEnsaioD32,
      coeficienteCorrecaoUtilizado: detalhesDensidade.coeficienteExpansaoTermica,
      fatorExpansaoTermica: detalhesDensidade.fatorCorrecaoAplicado,
      densidadeKgM3: detalhesDensidade.densidadeKgM3,
      temperaturaAmbiente: temperaturaAmbienteD32,
    };

    await repoDensidade.save(postoId, novoRegistro);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      responsavelNome,
      'DENSIDADE',
      'RegistroDensidade',
      id,
      'CREATE',
      null,
      novoRegistro as unknown as Record<string, unknown>
    );

    setObsDensidade('');
    setNumeroNotaFiscal('');
    setPlacaCaminhao('');
    onReload();
  };

  // Salvar Item de Checklist
  const handleSalvarConformidade = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = `conf-${Date.now()}`;
    const responsavelNome = funcionarios.find((f) => f.id === responsavelId)?.nome || 'Fiscal de Pátio';

    const novoItem: Conformidade = {
      id,
      postoId,
      data: new Date().toISOString().slice(0, 10),
      categoria,
      item: itemChecklist,
      status: statusConformidade,
      responsavelId,
      observacao: obsConformidade,
      criadoEm: new Date().toISOString(),
    };

    await repoConformidade.save(postoId, novoItem);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      responsavelNome,
      'CONFORMIDADE',
      'Conformidade',
      id,
      'CREATE',
      null,
      novoItem as unknown as Record<string, unknown>
    );

    setIsModalConformidade(false);
    setObsConformidade('');
    onReload();
  };

  // Handlers para Ações em Laudos de Análise (RegistroDensidade)
  const handleEditarAnalise = (d: RegistroDensidade) => {
    setAnaliseParaEditar(d);
    setIsModalEditarAnalise(true);
  };

  const handleSalvarEdicaoAnalise = async (analiseAtualizada: RegistroDensidade) => {
    const responsavelNome = funcionarios.find((f) => f.id === analiseAtualizada.responsavelId)?.nome || userProfile?.nome || 'Operador Técnico';
    await repoDensidade.save(postoId, analiseAtualizada);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      responsavelNome,
      'DENSIDADE',
      'RegistroDensidade',
      analiseAtualizada.id,
      'UPDATE',
      analiseParaEditar as unknown as Record<string, unknown>,
      analiseAtualizada as unknown as Record<string, unknown>
    );
    setIsModalEditarAnalise(false);
    setAnaliseParaEditar(null);
    onReload();
  };

  const handleSolicitarExclusaoAnalise = (d: RegistroDensidade) => {
    setAnaliseParaExcluir(d);
    setIsModalExcluirAnalise(true);
  };

  const handleConfirmarExclusaoAnalise = async () => {
    if (!analiseParaExcluir) return;
    setProcessandoAcao(true);
    try {
      const responsavelNome = userProfile?.nome || 'Operador';
      await repoDensidade.delete(postoId, analiseParaExcluir.id);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        responsavelNome,
        'DENSIDADE',
        'RegistroDensidade',
        analiseParaExcluir.id,
        'DELETE',
        analiseParaExcluir as unknown as Record<string, unknown>,
        null
      );
      setIsModalExcluirAnalise(false);
      setAnaliseParaExcluir(null);
      onReload();
    } catch (err) {
      console.error('Erro ao excluir laudo de análise:', err);
      alert('Erro ao excluir laudo de análise.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleConfirmarLimpezaLaudos = async () => {
    setProcessandoAcao(true);
    try {
      const responsavelNome = userProfile?.nome || 'Operador';
      await repoDensidade.clearAll(postoId);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        responsavelNome,
        'DENSIDADE',
        'RegistroDensidade',
        'TODOS',
        'DELETE',
        { totalRemovidos: densidades.length },
        null
      );
      setIsModalLimparLaudos(false);
      onReload();
    } catch (err) {
      console.error('Erro ao limpar laudos de combustível:', err);
      alert('Erro ao limpar laudos de combustível.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Handlers para Ações em Itens de Checklist (Conformidade)
  const handleEditarChecklist = (c: Conformidade) => {
    setChecklistParaEditar(c);
    setIsModalEditarChecklist(true);
  };

  const handleSalvarEdicaoChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checklistParaEditar) return;
    setProcessandoAcao(true);
    try {
      const responsavelNome = funcionarios.find((f) => f.id === checklistParaEditar.responsavelId)?.nome || userProfile?.nome || 'Fiscal de Pátio';
      await repoConformidade.save(postoId, checklistParaEditar);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        responsavelNome,
        'CONFORMIDADE',
        'Conformidade',
        checklistParaEditar.id,
        'UPDATE',
        null,
        checklistParaEditar as unknown as Record<string, unknown>
      );
      setIsModalEditarChecklist(false);
      setChecklistParaEditar(null);
      onReload();
    } catch (err) {
      console.error('Erro ao atualizar item de checklist:', err);
      alert('Erro ao atualizar item de checklist.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleSolicitarExclusaoChecklist = (c: Conformidade) => {
    setChecklistParaExcluir(c);
    setIsModalExcluirChecklist(true);
  };

  const handleConfirmarExclusaoChecklist = async () => {
    if (!checklistParaExcluir) return;
    setProcessandoAcao(true);
    try {
      const responsavelNome = userProfile?.nome || 'Operador';
      await repoConformidade.delete(postoId, checklistParaExcluir.id);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        responsavelNome,
        'CONFORMIDADE',
        'Conformidade',
        checklistParaExcluir.id,
        'DELETE',
        checklistParaExcluir as unknown as Record<string, unknown>,
        null
      );
      setIsModalExcluirChecklist(false);
      setChecklistParaExcluir(null);
      onReload();
    } catch (err) {
      console.error('Erro ao excluir item de checklist:', err);
      alert('Erro ao excluir item de checklist.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleConfirmarLimpezaChecklist = async () => {
    setProcessandoAcao(true);
    try {
      const responsavelNome = userProfile?.nome || 'Operador';
      await repoConformidade.clearAll(postoId);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        responsavelNome,
        'CONFORMIDADE',
        'Conformidade',
        'TODOS',
        'DELETE',
        { totalRemovidos: conformidades.length },
        null
      );
      setIsModalLimparChecklist(false);
      onReload();
    } catch (err) {
      console.error('Erro ao limpar itens de checklist:', err);
      alert('Erro ao limpar itens de checklist.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Alternância Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-teal-100 text-teal-800 tracking-wider">
              Resolução de Agosto de 2026 (Marco D32 / E32) • ABNT NBR 5992 • ANP
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mt-1">
            <TestTubes className="w-6 h-6 text-teal-600" />
            Laboratório & Calculadora ANP de Combustíveis
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Cálculo oficial de densidade a 20°C (D20), teste da proveta com tolerância D32, conversão da D32 para teor alcoólico em massa (92,5° a 95,4° INPM) e laudos.
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setTabPrincipal('ANP_2026')}
            className={`px-4 py-2 text-xs font-bold rounded-md transition ${
              tabPrincipal === 'ANP_2026'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Calculadora & Testes ANP
          </button>
          <button
            onClick={() => setTabPrincipal('CHECKLIST_NR20')}
            className={`px-4 py-2 text-xs font-bold rounded-md transition ${
              tabPrincipal === 'CHECKLIST_NR20'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Checklist Diário & NR-20
          </button>
        </div>
      </div>

      {tabPrincipal === 'ANP_2026' ? (
        <div className="space-y-6">
          {/* Seletor de Tipo de Teste ANP */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => {
                setAbaTeste('DENSIDADE_D20');
                if (produto.includes('Etanol') || produto.includes('Diesel')) {
                  setProduto('Gasolina Comum');
                }
              }}
              className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                abaTeste === 'DENSIDADE_D20'
                  ? 'bg-teal-50 border-teal-500 shadow-xs ring-1 ring-teal-500'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <FlaskConical className={`w-5 h-5 ${abaTeste === 'DENSIDADE_D20' ? 'text-teal-600' : 'text-slate-400'}`} />
                <span className="text-[10px] font-bold uppercase text-slate-500">Oficial ANP</span>
              </div>
              <div className="mt-3">
                <div className="font-bold text-sm text-slate-900">Densidade D20</div>
                <div className="text-xs text-slate-500">Correção térmica 20°C</div>
              </div>
            </button>

            <button
              onClick={() => {
                setAbaTeste('TESTE_PROVETA_GASOLINA');
                setProduto('Gasolina Comum');
              }}
              className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                abaTeste === 'TESTE_PROVETA_GASOLINA'
                  ? 'bg-teal-50 border-teal-500 shadow-xs ring-1 ring-teal-500'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <Droplets className={`w-5 h-5 ${abaTeste === 'TESTE_PROVETA_GASOLINA' ? 'text-teal-600' : 'text-slate-400'}`} />
                <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">D32 Ago/2026</span>
              </div>
              <div className="mt-3">
                <div className="font-bold text-sm text-slate-900">Teste da Proveta</div>
                <div className="text-xs text-slate-500">Gasolina 32% ± 1% (D32)</div>
              </div>
            </button>

            <button
              onClick={() => {
                setAbaTeste('TEOR_ALCOOLICO_ETANOL');
                setProduto('Etanol Hidratado');
                setDensidadeObservada(0.798);
              }}
              className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                abaTeste === 'TEOR_ALCOOLICO_ETANOL'
                  ? 'bg-teal-50 border-teal-500 shadow-xs ring-1 ring-teal-500'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <TestTubes className={`w-5 h-5 ${abaTeste === 'TEOR_ALCOOLICO_ETANOL' ? 'text-teal-600' : 'text-slate-400'}`} />
                <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">D32 → INPM</span>
              </div>
              <div className="mt-3">
                <div className="font-bold text-sm text-slate-900">Etanol Hidratado</div>
                <div className="text-xs text-slate-500">Conversão D32 para 92,5°-95,4° INPM</div>
              </div>
            </button>

            <button
              onClick={() => setAbaTeste('RECEBIMENTO_DESCARGA')}
              className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                abaTeste === 'RECEBIMENTO_DESCARGA'
                  ? 'bg-teal-50 border-teal-500 shadow-xs ring-1 ring-teal-500'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <Truck className={`w-5 h-5 ${abaTeste === 'RECEBIMENTO_DESCARGA' ? 'text-teal-600' : 'text-slate-400'}`} />
                <span className="text-[10px] font-bold uppercase text-slate-500">Boletim NF</span>
              </div>
              <div className="mt-3">
                <div className="font-bold text-sm text-slate-900">Descarga de Caminhão</div>
                <div className="text-xs text-slate-500">Laudo de recebimento do posto</div>
              </div>
            </button>
          </div>

          {/* Painel Interativo da Calculadora e Formulário */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {abaTeste === 'DENSIDADE_D20' && 'Calculadora Oficial de Densidade Relativa a 20°C (D20)'}
                  {abaTeste === 'TESTE_PROVETA_GASOLINA' && 'Determinação do Teor de Etanol na Gasolina (Teste da Proveta - Padrão D32)'}
                  {abaTeste === 'TEOR_ALCOOLICO_ETANOL' && 'Conversão da D32 para teor alcoólico em massa (92,5° a 95,4° INPM)'}
                  {abaTeste === 'RECEBIMENTO_DESCARGA' && 'Boletim de Conformidade para Descarregamento de Caminhão-Tanque'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {abaTeste === 'TESTE_PROVETA_GASOLINA'
                    ? 'Tolerância da gasolina seguindo a Resolução de Agosto de 2026 D32: 32% ± 1% (31,0% a 33,0%) para Gasolina Comum e Aditivada.'
                    : abaTeste === 'TEOR_ALCOOLICO_ETANOL'
                    ? 'Conversão direta e precisa da D32 para teor alcoólico em massa conforme ABNT NBR 5992 (Faixa exigida: 92,5° a 95,4° INPM).'
                    : 'Parâmetros atualizados e fiscalizados pela Agência Nacional do Petróleo (ANP).'}
                </p>
              </div>

              {/* Seletor de Produto - Somente os 5 Combustíveis Principais Solicitados */}
              <div className="flex flex-wrap gap-1.5">
                {(abaTeste === 'TESTE_PROVETA_GASOLINA'
                  ? ['Gasolina Comum', 'Gasolina Aditivada']
                  : abaTeste === 'TEOR_ALCOOLICO_ETANOL'
                  ? ['Etanol']
                  : ['Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel S10', 'Diesel S500']
                ).map((prod) => (
                  <button
                    key={prod}
                    type="button"
                    onClick={() => {
                      setProduto(prod);
                      // Ajustar densidade típica para teste
                      if (prod.includes('Gasolina')) {
                        setDensidadeObservada(0.7420);
                        setTemperatura(25.0);
                      } else if (prod === 'Etanol' || prod.includes('Etanol')) {
                        setDensidadeObservada(0.8040);
                        setTemperatura(26.8);
                      } else if (prod === 'Diesel S10' || prod.includes('S10') || prod.includes('S-10')) {
                        setDensidadeObservada(0.8350);
                        setTemperatura(20.0);
                      } else if (prod === 'Diesel S500' || prod.includes('S500') || prod.includes('S-500')) {
                        setDensidadeObservada(0.8450);
                        setTemperatura(20.0);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      produto === prod
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {prod}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid da Calculadora: Inputs à esquerda e Resultado/Laudo à direita */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Inputs Técnicos (7 colunas) */}
              <form onSubmit={handleSalvarAnaliseANP} className="lg:col-span-7 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Temperatura */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Temperatura da Amostra (°C)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={temperatura}
                      onChange={(e) => setTemperatura(parseFloat(e.target.value) || 20)}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400">
                      Termômetro de imersão total com certificado INMETRO
                    </span>
                  </div>

                  {/* Densidade Observada / Medida */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Densidade Medida (g/cm³)
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsModalTabelaOficialAberto(true)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2 py-0.5 rounded-md transition shadow-2xs"
                        title="Abrir Tabela Oficial Completa de Cruzamento & Verificação ANP"
                      >
                        <FileSpreadsheet className="w-3 h-3 text-teal-600" />
                        Tabela ANP
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.0001"
                        value={densidadeObservada}
                        onChange={(e) => setDensidadeObservada(parseFloat(e.target.value) || 0)}
                        required
                        className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                      {isDensidadeConforme ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-2.5 top-2.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500 absolute right-2.5 top-2.5" />
                      )}
                    </div>
                    <div className="mt-1 text-[11px] font-mono text-emerald-800 flex items-center gap-1 font-semibold">
                      <span>✓ D20:</span>
                      <strong>{detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³</strong>
                      <span className="text-slate-500 font-normal">
                        (Faixa: {(padraoAtual.densidade20CMin * 1000).toFixed(1)} - {(padraoAtual.densidade20CMax * 1000).toFixed(1)} kg/m³)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Campos Adicionais para Etanol Hidratado conforme Imagens Oficiais */}
                {produto.includes('Etanol') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Teor Alcoólico (% M/M)
                      </label>
                      <input
                        type="text"
                        disabled
                        value={`${resultadoEtanol.grauINPM}`}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-800"
                      />
                      <span className="text-[10px] text-teal-700 font-medium block mt-0.5">
                        Calculado via D20 - Norma ANP 92,5% - 93,8% M/M
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Aspecto Visual
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={padraoAtual.aspectoEsperado}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium"
                      />
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Inspeção visual na proveta contra fundo claro
                      </span>
                    </div>
                  </div>
                )}

                {/* Indicação Rápida de Teor INPM para Etanol */}
                {produto.includes('Etanol') && abaTeste === 'DENSIDADE_D20' && (
                  <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                    resultadoEtanol.isConforme
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-red-50 border-red-200 text-red-950'
                  }`}>
                    <div className="flex items-center gap-2">
                      <TestTubes className="w-4 h-4 text-blue-700 shrink-0" />
                      <div>
                        <div className="font-bold">
                          Teor em Massa Estimado: <span className="font-mono text-sm">{resultadoEtanol.grauINPM}° INPM</span>
                        </div>
                        <div className="text-[11px] opacity-80">
                          Padrão ANP NBR 5992: 92,5° a 95,4° INPM (% m/m) • {resultadoEtanol.grauGL}° GL
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      resultadoEtanol.isConforme ? 'bg-emerald-200 text-emerald-900' : 'bg-red-200 text-red-900'
                    }`}>
                      {resultadoEtanol.isConforme ? 'CONFORME' : 'NÃO CONFORME'}
                    </span>
                  </div>
                )}

                {/* Campos específicos do Teste da Proveta */}
                {abaTeste === 'TESTE_PROVETA_GASOLINA' && (
                  <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-xs text-teal-900 flex items-center gap-1.5">
                        <Droplets className="w-4 h-4 text-teal-700" />
                        Medição na Proveta de 100ml com tampa
                      </div>
                      <span className="text-[10px] font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                        Marco D32 • Ago/2026
                      </span>
                    </div>

                    <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-lg text-xs text-amber-900">
                      <div className="font-bold flex items-center gap-1 text-[11px] text-amber-950">
                        ⚖️ Tolerância da gasolina seguindo a resolução de agosto de 2026 D32:
                      </div>
                      <div className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                        • <strong>Gasolina Comum / Aditivada:</strong> 32% ± 1,0% (Faixa de <strong>31,0% a 33,0%</strong> | Nominal: <strong>32,0%</strong>)<br />
                        • <strong>Gasolina Premium:</strong> 25% ± 1,0% (Faixa de <strong>24,0% a 26,0%</strong> | Nominal: <strong>25,0%</strong>)
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-teal-900 mb-1">
                          Volume Gasolina Inicial (ml)
                        </label>
                        <input
                          type="text"
                          disabled
                          value="50.0 ml"
                          className="w-full px-3 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-xs font-mono text-slate-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-teal-900 mb-1">
                          Solução Aquosa NaCl 10% (ml)
                        </label>
                        <input
                          type="text"
                          disabled
                          value="50.0 ml"
                          className="w-full px-3 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-xs font-mono text-slate-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-teal-900 mb-1">
                        Volume Aquoso Final Lido na Proveta (ml)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="50"
                        max="100"
                        value={volumeAquosoFinal}
                        onChange={(e) => setVolumeAquosoFinal(parseFloat(e.target.value) || 50)}
                        required
                        className="w-full px-3 py-2 border border-teal-300 bg-white rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                      <span className="text-[11px] text-teal-700 block mt-1">
                        Fórmula ANP: % Etanol = ({volumeAquosoFinal} - 50) × 2 + 1 ={' '}
                        <strong className="text-teal-900 font-mono text-xs">{resultadoProveta.teorEtanolApurado}%</strong>{' '}
                        (Tolerância D32: {resultadoProveta.teorReferenciaMin}% a {resultadoProveta.teorReferenciaMax}%)
                      </span>
                    </div>
                  </div>
                )}

                {/* Campos específicos do Etanol Hidratado */}
                {abaTeste === 'TEOR_ALCOOLICO_ETANOL' && (
                  <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-xs text-teal-900 flex items-center gap-1.5">
                        <TestTubes className="w-4 h-4 text-teal-700" />
                        Ensaios de Etanol Hidratado (Resoluções ANP & ABNT NBR 5992)
                      </div>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full">
                        Conversão D32 → INPM
                      </span>
                    </div>

                    <div className="p-2.5 bg-blue-50/90 border border-blue-200 rounded-lg text-xs text-blue-900">
                      <div className="font-bold flex items-center gap-1 text-[11px] text-blue-950">
                        🧪 Conversão da D32 para teor alcoólico em massa:
                      </div>
                      <div className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                        Faixa regulamentar: <strong>92,5° a 95,4° INPM</strong> (% em massa) | Volume correspondente: <strong>94,5° a 96,9° GL</strong> a 20°C.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-teal-900 mb-1">
                          Condutividade Elétrica a 25°C (µS/m)
                        </label>
                        <input
                          type="number"
                          value={condutividadeEletrica}
                          onChange={(e) => setCondutividadeEletrica(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-teal-300 bg-white rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        />
                        <span className="text-[10px] text-teal-700">Máximo permitido: 350 µS/m</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-teal-900 mb-1">
                          Potencial Hidrogeniônico (pH)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={phEtanol}
                          onChange={(e) => setPhEtanol(parseFloat(e.target.value) || 7)}
                          className="w-full px-3 py-2 border border-teal-300 bg-white rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        />
                        <span className="text-[10px] text-teal-700">Faixa permitida: 6,0 a 8,0</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Campos específicos de Descarga de Caminhão-Tanque */}
                {abaTeste === 'RECEBIMENTO_DESCARGA' && (
                  <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
                    <div className="font-semibold text-xs text-blue-900 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-blue-700" />
                      Dados Obrigatórios de Descarregamento
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-blue-900 mb-1">
                          Número da Nota Fiscal (NF-e)
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: 004812"
                          value={numeroNotaFiscal}
                          onChange={(e) => setNumeroNotaFiscal(e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-blue-300 bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-blue-900 mb-1">
                          Placa do Caminhão / Carreta
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: ABC-1D23"
                          value={placaCaminhao}
                          onChange={(e) => setPlacaCaminhao(e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-blue-300 bg-white rounded-lg text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-blue-900 mb-1">
                          Distribuidora de Combustível
                        </label>
                        <input
                          type="text"
                          value={distribuidora}
                          onChange={(e) => setDistribuidora(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-300 bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-blue-900 mb-1">
                          Compartimento do Tanque
                        </label>
                        <input
                          type="text"
                          value={compartimento}
                          onChange={(e) => setCompartimento(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-300 bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="lacreCheck"
                        checked={lacreConferido}
                        onChange={(e) => setLacreConferido(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="lacreCheck" className="text-xs font-semibold text-blue-900 cursor-pointer">
                        Lacres intactos e conferidos com a numeração impressa na Nota Fiscal
                      </label>
                    </div>
                  </div>
                )}

                {/* Seção Operacional de Parâmetros Específicos D32 / Resolução ANP Ago/2026 */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-teal-700" />
                      Parâmetros Operacionais de Ensaio (Regulamentação D32)
                    </div>
                    <span className="text-[10px] font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                      Marco D32 • Ago/2026
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Método de Ensaio Regulamentar
                      </label>
                      <select
                        value={metodoEnsaioD32}
                        onChange={(e) => setMetodoEnsaioD32(e.target.value as 'ABNT NBR 5992' | 'ASTM D1250' | 'DIGITAL')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      >
                        <option value="ABNT NBR 5992">ABNT NBR 5992 (Termodensímetro de Vidro)</option>
                        <option value="ASTM D1250">ASTM D1250 (Tabela de Redução de Petróleo)</option>
                        <option value="DIGITAL">Densímetro Digital de Bancada (Oscilação)</option>
                      </select>
                      <span className="text-[10px] text-slate-400">
                        Norma metrológica oficial auditada pela ANP
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Temperatura Ambiente de Pátio (°C)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={temperaturaAmbienteD32}
                        onChange={(e) => setTemperaturaAmbienteD32(parseFloat(e.target.value) || 25)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-400">
                        Monitoramento térmico do ensaio em pista/laboratório
                      </span>
                    </div>
                  </div>

                  {/* Informações Operacionais da Resolução D32 */}
                  <div className="p-2.5 bg-teal-50/70 border border-teal-200 rounded-lg text-[11px] text-teal-900 space-y-1">
                    <div className="font-bold flex items-center gap-1 text-teal-950">
                      <Info className="w-3.5 h-3.5 text-teal-700" />
                      Critérios Oficiais D32 (Vigência Agosto de 2026):
                    </div>
                    <p className="text-teal-800 leading-relaxed">
                      • <strong>Tolerância de Gasolina:</strong> Mistura padrão de etanol anidro fixada em <strong>32,0%</strong> (tolerância de <strong>31,0% a 33,0%</strong> para comum/aditivada e <strong>24,0% a 26,0%</strong> para premium).<br />
                      • <strong>Conversão D32 do Etanol:</strong> Faixa de densidade reduzida a 20°C convertida para teor em massa de <strong>92,5° a 95,4° INPM</strong> (94,5° a 96,9° GL).
                    </p>
                  </div>
                </div>

                {/* Responsável e Observações */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Responsável pela Análise
                    </label>
                    <select
                      value={responsavelId}
                      onChange={(e) => setResponsavelId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      {funcionarios.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome} ({f.cargo})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Observação Operacional (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Amostra coletada na boca do caminhão"
                      value={obsDensidade}
                      onChange={(e) => setObsDensidade(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Botão de Gravar Laudo */}
                <button
                  type="submit"
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <FileCheck className="w-4 h-4" />
                  Salvar Laudo de Conformidade ANP no Sistema
                </button>
              </form>

              {/* Card de Parecer Técnico e Resultados ANP (5 colunas) */}
              <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xs">
                <div className="space-y-3.5">
                  {/* Banner de Status Oficial com Faixa */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold ${
                      statusFinalTeste === 'CONFORME'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {statusFinalTeste === 'CONFORME' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                      )}
                      <span>
                        {statusFinalTeste === 'CONFORME'
                          ? `✓ APROVADO - Dentro das especificações ANP (${(padraoAtual.densidade20CMin * 1000).toFixed(1)} - ${(padraoAtual.densidade20CMax * 1000).toFixed(1)} kg/m³)`
                          : `✕ NÃO CONFORME - Fora das especificações ANP (${(padraoAtual.densidade20CMin * 1000).toFixed(1)} - ${(padraoAtual.densidade20CMax * 1000).toFixed(1)} kg/m³)`}
                      </span>
                    </div>
                  </div>

                  {/* Card 1: Massa Específica a 20°C (D20) */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wide">
                      <span>{produto.toUpperCase()} - MASSA ESPECÍFICA A 20°C</span>
                      <span className="text-[11px] text-teal-700 font-mono">
                        {densidadeCalculada20.toFixed(4)} g/cm³
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <span
                        className={`text-3xl font-black font-mono ${
                          isDensidadeConforme ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {isDensidadeConforme ? '✓ D20 Conforme' : '✕ Desvio D20'}
                      </span>
                    </div>

                    {/* Barra visual de Faixa Regulamentar */}
                    <div className="space-y-1 pt-1">
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden relative">
                        {/* Faixa ideal */}
                        <div className="absolute inset-y-0 left-[20%] right-[20%] bg-emerald-200 rounded-sm" />
                        {/* Ponto medido */}
                        <div
                          className={`absolute top-0 bottom-0 w-2.5 rounded-full -ml-1 ${
                            isDensidadeConforme ? 'bg-emerald-600' : 'bg-red-600'
                          }`}
                          style={{
                            left: `${Math.max(
                              5,
                              Math.min(
                                95,
                                ((detalhesDensidade.densidadeKgM3 -
                                  padraoAtual.densidade20CMin * 1000 * 0.98) /
                                  (padraoAtual.densidade20CMax * 1000 * 1.02 -
                                    padraoAtual.densidade20CMin * 1000 * 0.98)) *
                                  100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span>Mín: {(padraoAtual.densidade20CMin * 1000).toFixed(1)}</span>
                        <span className="font-semibold text-slate-600">
                          Medido: {detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³
                        </span>
                        <span>Máx: {(padraoAtual.densidade20CMax * 1000).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Grau Alcoólico (INPM) ou Especificação Específica do Combustível */}
                  {produto.includes('Etanol') ? (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wide">
                        <span>GRAU ALCOÓLICO (INPM)</span>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {resultadoEtanol.grauGL}° GL
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-2xl font-black font-mono ${
                            resultadoEtanol.isConforme ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {resultadoEtanol.grauINPM} % m/m
                        </span>
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-sm">
                          [OK]
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Grau alcoólico dentro do especificado (mín. 92.5% m/m - Res. ANP 907/2022)
                      </div>
                    </div>
                  ) : abaTeste === 'TESTE_PROVETA_GASOLINA' ? (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wide">
                        <span>TEOR DE ETANOL NA GASOLINA (PROVETA)</span>
                        <span className="text-[10px] text-teal-700 font-bold">Marco D32</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-2xl font-black font-mono ${
                            resultadoProveta.isConforme ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {resultadoProveta.teorEtanolApurado} % v/v
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-sm ${
                            resultadoProveta.isConforme
                              ? 'text-emerald-800 bg-emerald-100'
                              : 'text-red-800 bg-red-100'
                          }`}
                        >
                          [{resultadoProveta.isConforme ? 'OK' : 'FORA'}]
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Faixa regulamentar: {resultadoProveta.teorReferenciaMin}% a{' '}
                        {resultadoProveta.teorReferenciaMax}% (Nominal{' '}
                        {resultadoProveta.teorReferenciaNominal}%)
                      </div>
                    </div>
                  ) : null}

                  {/* Card 3: Especificações ANP 2026 */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2 text-xs">
                    <div className="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 flex items-center justify-between">
                      <span>ESPECIFICAÇÕES ANP - {padraoAtual.normaANP}</span>
                      <span className="text-[10px] text-teal-700 font-semibold">Ref: 20°C</span>
                    </div>

                    <div className="space-y-1 text-slate-600 font-medium">
                      <div className="flex justify-between py-0.5 border-b border-slate-50">
                        <span>Massa específica a 20°C (mín.):</span>
                        <strong className="font-mono text-slate-800">
                          {(padraoAtual.densidade20CMin * 1000).toFixed(1)} kg/m³
                        </strong>
                      </div>
                      <div className="flex justify-between py-0.5 border-b border-slate-50">
                        <span>Massa específica a 20°C (máx.):</span>
                        <strong className="font-mono text-slate-800">
                          {(padraoAtual.densidade20CMax * 1000).toFixed(1)} kg/m³
                        </strong>
                      </div>

                      {produto.includes('Etanol') && (
                        <>
                          <div className="flex justify-between py-0.5 border-b border-slate-50">
                            <span>Grau alcoólico (INPM) mín.:</span>
                            <strong className="font-mono text-slate-800">92,5% m/m</strong>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-slate-50">
                            <span>Grau alcoólico (INPM) máx.:</span>
                            <strong className="font-mono text-slate-800">93,8% m/m</strong>
                          </div>
                        </>
                      )}

                      <div className="flex justify-between py-0.5">
                        <span>Temperatura de referência:</span>
                        <strong className="font-mono text-slate-800">20°C</strong>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Detalhes do Cálculo (Memória Aritmética) */}
                  <div className="bg-slate-100/80 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-700">
                      <span className="flex items-center gap-1.5 uppercase text-[11px] tracking-wide">
                        <Calculator className="w-3.5 h-3.5 text-teal-700" />
                        Detalhes do Cálculo (NBR 5992)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2 rounded-lg border border-slate-200 font-mono">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Densidade Lida (Dt):</span>
                        <strong className="text-slate-800">{densidadeObservada.toFixed(4)} g/cm³</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Temperatura Lida:</span>
                        <strong className="text-slate-800">{temperatura.toFixed(1)} °C</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Fator Correção (α):</span>
                        <strong className="text-teal-800">
                          {detalhesDensidade.fatorCorrecaoAplicado >= 0 ? '+' : ''}
                          {detalhesDensidade.fatorCorrecaoAplicado.toFixed(4)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Diferença (T - 20°C):</span>
                        <strong className="text-slate-800">
                          {temperatura - 20 >= 0 ? '+' : ''}
                          {(temperatura - 20).toFixed(1)} °C
                        </strong>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-600 bg-teal-50/70 p-2 rounded border border-teal-100 font-mono">
                      {detalhesDensidade.formulaExplicativa}
                    </div>
                  </div>

                  {/* Parecer Técnico Box */}
                  <div
                    className={`p-3 rounded-lg border text-xs leading-relaxed ${
                      statusFinalTeste === 'CONFORME'
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                        : 'bg-red-50/80 border-red-200 text-red-900 font-semibold'
                    }`}
                  >
                    <strong>Parecer Técnico:</strong> {parecerTecnicoFinal}
                  </div>
                </div>

                {/* Botão de Ação para Abrir Tabela Oficial Completa */}
                <button
                  type="button"
                  onClick={() => setIsModalTabelaOficialAberto(true)}
                  className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-teal-400 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 border border-slate-700 shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                  Abrir Tabela Oficial Completa de Cruzamento & Verificação ANP
                </button>

                <div className="text-[11px] text-slate-400 border-t border-slate-200 pt-3">
                  Registro em conformidade com as normas ABNT NBR 5992, ASTM D1250 e fiscalização do posto revendedor.
                </div>
              </div>
            </div>
          </div>

          {/* Tabela de Histórico de Análises de Combustíveis */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="font-semibold text-slate-800 text-sm">
                Histórico de Laudos e Análises ANP Registradas ({densidades.length})
              </span>
              <button
                type="button"
                onClick={() => setIsModalLimparLaudos(true)}
                disabled={densidades.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Excluir todos os laudos registrados"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar Histórico
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Data / Hora</th>
                    <th className="px-5 py-3">Tipo do Ensaio</th>
                    <th className="px-5 py-3">Produto</th>
                    <th className="px-5 py-3">Temperatura</th>
                    <th className="px-5 py-3">Densidade 20°C</th>
                    <th className="px-5 py-3">Parâmetros ANP</th>
                    <th className="px-5 py-3">Resultado</th>
                    <th className="px-5 py-3">Parecer Técnico</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {densidades.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-slate-400">
                        Nenhum laudo de combustível cadastrado até o momento. Utilize a calculadora acima para registrar.
                      </td>
                    </tr>
                  ) : (
                    densidades.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-900">{d.data}</div>
                          <div className="text-[10px] text-slate-400">{d.hora}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                            {d.tipoTeste === 'TESTE_PROVETA_GASOLINA'
                              ? 'PROVETA (D32)'
                              : d.tipoTeste === 'TEOR_ALCOOLICO_ETANOL'
                              ? 'CONVERSÃO D32'
                              : d.tipoTeste === 'RECEBIMENTO_DESCARGA'
                              ? 'DESCARGA NF'
                              : 'DENSIDADE D20'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-800">{d.produto}</td>
                        <td className="px-5 py-3.5 font-mono">
                          <div>{d.temperatura}°C</div>
                          {d.temperaturaAmbiente !== undefined && (
                            <div className="text-[10px] text-slate-400">Amb: {d.temperaturaAmbiente}°C</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-mono font-bold text-teal-800">
                          <div>{d.densidadeCalculada20C.toFixed(4)} g/cm³</div>
                          {d.densidadeKgM3 !== undefined && (
                            <div className="text-[10px] font-normal text-slate-500">{d.densidadeKgM3.toFixed(1)} kg/m³</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {d.metodoEnsaioD32 && (
                            <div className="text-[10px] text-slate-400 font-semibold">{d.metodoEnsaioD32}</div>
                          )}
                          {d.teorEtanolAnidro !== undefined && (
                            <div>D32 / Álcool: <strong>{d.teorEtanolAnidro}%</strong></div>
                          )}
                          {d.grauINPM !== undefined && (
                            <div>D32 → INPM: <strong>{d.grauINPM}°</strong></div>
                          )}
                          {d.numeroNotaFiscal && (
                            <div>NF: <strong>{d.numeroNotaFiscal}</strong></div>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              d.resultado === 'CONFORME'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {d.resultado}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-[11px] text-slate-500 max-w-xs truncate">
                          {d.parecerTecnico || d.observacao || 'Conforme especificação ANP'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditarAnalise(d)}
                              className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition border border-transparent hover:border-teal-200"
                              title="Editar Laudo"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSolicitarExclusaoAnalise(d)}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition border border-transparent hover:border-red-200"
                              title="Excluir Laudo"
                            >
                              <Trash2 className="w-4 h-4" />
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
      ) : (
        /* Aba de Checklist Diário de Conformidade & NR-20 */
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setIsModalConformidade(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition shadow-sm text-sm"
            >
              <Plus className="w-4 h-4" />
              Novo Item de Checklist
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-sm">
                Itens Inspecionados de Pátio e Normas Regulamentadoras (NR-20 / CONAMA) ({conformidades.length})
              </span>
              <button
                type="button"
                onClick={() => setIsModalLimparChecklist(true)}
                disabled={conformidades.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Excluir todos os registros de checklist"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar Checklist
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3">Data</th>
                    <th className="px-6 py-3">Categoria</th>
                    <th className="px-6 py-3">Item Avaliado</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Observação</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {conformidades.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        Nenhum checklist registrado no posto.
                      </td>
                    </tr>
                  ) : (
                    conformidades.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4 font-mono text-xs">{c.data}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                            {c.categoria}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">{c.item}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
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
                        <td className="px-6 py-4 text-xs text-slate-500">{c.observacao || '—'}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditarChecklist(c)}
                              className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition border border-transparent hover:border-teal-200"
                              title="Editar Item"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSolicitarExclusaoChecklist(c)}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition border border-transparent hover:border-red-200"
                              title="Excluir Item"
                            >
                              <Trash2 className="w-4 h-4" />
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

      {/* Modal Novo Item de Conformidade */}
      {isModalConformidade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Novo Registro de Conformidade</h3>
            <form onSubmit={handleSalvarConformidade} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="SEGURANCA">Segurança e Prevenção (NR-20)</option>
                  <option value="MEIO_AMBIENTE">Meio Ambiente e Vazamentos</option>
                  <option value="QUALIDADE">Qualidade e Aferições</option>
                  <option value="FISCAL">Fiscal e Lacre de Bombas</option>
                  <option value="EQUIPAMENTOS">Equipamentos e Mangueiras</option>
                  <option value="UNIFORMES">Uniformes e EPIs</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Item Inspecionado</label>
                <input
                  type="text"
                  value={itemChecklist}
                  onChange={(e) => setItemChecklist(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={statusConformidade}
                  onChange={(e) => setStatusConformidade(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="CONFORME">Conforme</option>
                  <option value="NAO_CONFORME">Não Conforme</option>
                  <option value="PENDENTE">Pendente de Ajuste</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observações</label>
                <textarea
                  value={obsConformidade}
                  onChange={(e) => setObsConformidade(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalConformidade(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  Salvar Inspeção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tabela Oficial ANP (Normas 2026, Matriz NBR 5992 e Cruzamento de Dados) */}
      <ModalTabelaOficialANP
        isOpen={isModalTabelaOficialAberto}
        onClose={() => setIsModalTabelaOficialAberto(false)}
        produtoInicial={produto}
        temperaturaInicial={temperatura}
        densidadeInicial={densidadeObservada}
      />

      {/* Modal de Edição de Laudo de Análise ANP */}
      <ModalEditarAnalise
        isOpen={isModalEditarAnalise}
        analise={analiseParaEditar}
        funcionarios={funcionarios}
        onClose={() => {
          setIsModalEditarAnalise(false);
          setAnaliseParaEditar(null);
        }}
        onSalvar={handleSalvarEdicaoAnalise}
      />

      {/* Modal de Confirmação de Exclusão de Laudo */}
      {isModalExcluirAnalise && analiseParaExcluir && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-2.5 bg-red-50 rounded-xl border border-red-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Excluir Laudo de Combustível</h4>
                <p className="text-xs text-slate-500">Confirmação de segurança</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5 my-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Data / Hora:</span>
                <strong>{analiseParaExcluir.data} às {analiseParaExcluir.hora}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Combustível:</span>
                <strong>{analiseParaExcluir.produto}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ensaio:</span>
                <span className="font-semibold">{analiseParaExcluir.tipoTeste}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Densidade 20°C:</span>
                <strong className="font-mono">{analiseParaExcluir.densidadeCalculada20C.toFixed(4)} g/cm³</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Resultado:</span>
                <span className={`font-bold ${analiseParaExcluir.resultado === 'CONFORME' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {analiseParaExcluir.resultado}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Deseja remover permanentemente este laudo de análise? Esta ação será registrada no log de auditoria.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsModalExcluirAnalise(false);
                  setAnaliseParaExcluir(null);
                }}
                disabled={processandoAcao}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusaoAnalise}
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

      {/* Modal de Confirmação de Limpeza de Todos os Laudos */}
      {isModalLimparLaudos && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-3 bg-red-100 rounded-xl border border-red-200">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Limpar Todos os Laudos de Análise?</h4>
                <p className="text-xs text-red-600 font-semibold">Ação irreversível de limpeza</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed my-4">
              Você está prestes a remover permanentemente todos os <strong>{densidades.length}</strong> registros
              de laudos e ensaios de combustíveis salvos para este posto. Deseja prosseguir com a exclusão total?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalLimparLaudos(false)}
                disabled={processandoAcao}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarLimpezaLaudos}
                disabled={processandoAcao}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {processandoAcao ? 'Limpando...' : 'Sim, Limpar Todos os Laudos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Item de Checklist */}
      {isModalEditarChecklist && checklistParaEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Editar Registro de Conformidade</h3>
              <button
                type="button"
                onClick={() => {
                  setIsModalEditarChecklist(false);
                  setChecklistParaEditar(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSalvarEdicaoChecklist} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                <select
                  value={checklistParaEditar.categoria}
                  onChange={(e) =>
                    setChecklistParaEditar({
                      ...checklistParaEditar,
                      categoria: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="SEGURANCA">Segurança e Prevenção (NR-20)</option>
                  <option value="MEIO_AMBIENTE">Meio Ambiente e Vazamentos (CONAMA)</option>
                  <option value="QUALIDADE">Qualidade e Controle de Combustível</option>
                  <option value="EQUIPAMENTOS">Calibração e Equipamentos</option>
                  <option value="UNIFORMES">EPIs e Uniformes de Frentistas</option>
                  <option value="FISCAL">Documentação Fiscal e Alvarás</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Item Inspecionado</label>
                <input
                  type="text"
                  value={checklistParaEditar.item}
                  onChange={(e) =>
                    setChecklistParaEditar({
                      ...checklistParaEditar,
                      item: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Responsável</label>
                <select
                  value={checklistParaEditar.responsavelId}
                  onChange={(e) =>
                    setChecklistParaEditar({
                      ...checklistParaEditar,
                      responsavelId: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  {funcionarios.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome} ({f.cargo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={checklistParaEditar.status}
                  onChange={(e) =>
                    setChecklistParaEditar({
                      ...checklistParaEditar,
                      status: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="CONFORME">Conforme</option>
                  <option value="NAO_CONFORME">Não Conforme</option>
                  <option value="PENDENTE">Pendente de Ajuste</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observações</label>
                <textarea
                  value={checklistParaEditar.observacao || ''}
                  onChange={(e) =>
                    setChecklistParaEditar({
                      ...checklistParaEditar,
                      observacao: e.target.value,
                    })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalEditarChecklist(false);
                    setChecklistParaEditar(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={processandoAcao}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {processandoAcao ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Checklist */}
      {isModalExcluirChecklist && checklistParaExcluir && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-2.5 bg-red-50 rounded-xl border border-red-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Excluir Item de Checklist</h4>
                <p className="text-xs text-slate-500">Confirmação de segurança</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5 my-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Data:</span>
                <strong>{checklistParaExcluir.data}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Categoria:</span>
                <span className="font-semibold">{checklistParaExcluir.categoria}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Item:</span>
                <strong className="text-slate-900">{checklistParaExcluir.item}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold">{checklistParaExcluir.status}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Deseja realmente remover este registro de inspeção de pátio?
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsModalExcluirChecklist(false);
                  setChecklistParaExcluir(null);
                }}
                disabled={processandoAcao}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusaoChecklist}
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

      {/* Modal de Confirmação de Limpeza de Checklist */}
      {isModalLimparChecklist && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-3 bg-red-100 rounded-xl border border-red-200">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Limpar Todo o Checklist de Pátio?</h4>
                <p className="text-xs text-red-600 font-semibold">Ação irreversível de limpeza</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed my-4">
              Você está prestes a remover permanentemente todos os <strong>{conformidades.length}</strong> registros
              de inspeções de conformidade cadastrados para este posto. Deseja prosseguir com a exclusão total?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalLimparChecklist(false)}
                disabled={processandoAcao}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarLimpezaChecklist}
                disabled={processandoAcao}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {processandoAcao ? 'Limpando...' : 'Sim, Limpar Todo o Checklist'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
