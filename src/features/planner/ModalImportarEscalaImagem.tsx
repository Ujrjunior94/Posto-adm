import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Funcionario, Escala, EscalaStatus } from '../../types';
import { PostoSubcollectionRepository } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import {
  TURNOS_PADRAO_POSTO,
  TurnoCadastrado,
  RegistroImportadoReconhecido,
  ResultadoImportacaoEscala,
  importarEscalaPorImagem,
  validateRecord,
  StatusRegistroImportado,
} from './importadorEscalaImagemService';
import {
  Camera,
  Upload,
  Sparkles,
  X,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Sliders,
  RotateCw,
  Sun,
  Contrast,
  Layers,
  ArrowRight,
  Filter,
  Search,
  Plus,
  Trash2,
  Table,
  LayoutGrid,
  FileImage,
  ShieldCheck,
  Check,
} from 'lucide-react';

const repoEscala = new PostoSubcollectionRepository<Escala>('escalas');

interface ModalImportarEscalaImagemProps {
  isOpen: boolean;
  onClose: () => void;
  funcionarios: Funcionario[];
  anoMesAtual: string; // "YYYY-MM"
  currentDate: Date;
  onSuccess: () => void;
}

export const ModalImportarEscalaImagem: React.FC<ModalImportarEscalaImagemProps> = ({
  isOpen,
  onClose,
  funcionarios,
  anoMesAtual,
  currentDate,
  onSuccess,
}) => {
  const { postoId, userProfile } = useAuth();

  // Etapas do Fluxo: 'UPLOAD' | 'PROCESSANDO' | 'REVISAO'
  const [etapa, setEtapa] = useState<'UPLOAD' | 'PROCESSANDO' | 'REVISAO'>('UPLOAD');

  // Imagem e Pré-processamento
  const [imagemOriginalUrl, setImagemOriginalUrl] = useState<string | null>(null);
  const [imagemProcessadaUrl, setImagemProcessadaUrl] = useState<string | null>(null);
  const [filtroPreProcessamento, setFiltroPreProcessamento] = useState<
    'normal' | 'alto_contraste' | 'nitidez' | 'pb'
  >('normal');
  const [rotacaoGraus, setRotacaoGraus] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Configuração da IA
  const [motorIA, setMotorIA] = useState<'chatgpt' | 'gemini'>('chatgpt');
  const [motorUtilizado, setMotorUtilizado] = useState<string>('');
  const [mensagemProgresso, setMensagemProgresso] = useState<string>('');
  const [erroProcessamento, setErroProcessamento] = useState<string>('');

  // Registros Reconhecidos e Revisão
  const [registros, setRegistros] = useState<RegistroImportadoReconhecido[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'PENDENTES' | 'CONFIRMADOS'>('TODOS');
  const [buscaFuncionario, setBuscaFuncionario] = useState('');
  const [modoVisaoRevisao, setModoVisaoRevisao] = useState<'TABELA' | 'GRADE'>('TABELA');
  const [salvandoNoPlanner, setSalvandoNoPlanner] = useState(false);

  // Refs de arquivo
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Dados do Mês e Dias
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1 a 12
  const totalDiasMes = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const listaDiasMes = useMemo(() => Array.from({ length: totalDiasMes }, (_, i) => i + 1), [totalDiasMes]);

  const nomeMesFormatado = useMemo(() => {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate);
  }, [currentDate]);

  // Lista de funcionários ativos cadastrados
  const funcionariosCadastrados = useMemo(() => {
    return funcionarios.filter((f) => f && f.status !== 'INATIVO');
  }, [funcionarios]);

  // Reset ao fechar ou abrir modal
  useEffect(() => {
    if (!isOpen) {
      setEtapa('UPLOAD');
      setImagemOriginalUrl(null);
      setImagemProcessadaUrl(null);
      setRegistros([]);
      setErroProcessamento('');
      setMensagemProgresso('');
      setRotacaoGraus(0);
      setFiltroPreProcessamento('normal');
    }
  }, [isOpen]);

  // ============================================================================
  // PRÉ-PROCESSAMENTO DE IMAGEM NO CANVAS (ORIENTAÇÃO, CONTRASTE, NITIDEZ, PB)
  // ============================================================================
  const aplicarPreProcessamento = (
    dataUrl: string,
    filtro: 'normal' | 'alto_contraste' | 'nitidez' | 'pb',
    rotacao: number
  ) => {
    if (!dataUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const isQuarterTurn = (rotacao / 90) % 2 !== 0;
      canvas.width = isQuarterTurn ? img.height : img.width;
      canvas.height = isQuarterTurn ? img.width : img.height;

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotacao * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      if (filtro !== 'normal') {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;

          if (filtro === 'pb') {
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          } else if (filtro === 'alto_contraste') {
            // Curva de alto contraste com limiar inteligente
            const factor = (259 * (128 + 128)) / (255 * (259 - 128));
            const cR = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
            data[i] = cR;
            data[i + 1] = cR;
            data[i + 2] = cR;
          } else if (filtro === 'nitidez') {
            // Aumento de ganho e clareamento de fundo
            const boosted = gray > 140 ? Math.min(255, gray * 1.15) : Math.max(0, gray * 0.85);
            data[i] = boosted;
            data[i + 1] = boosted;
            data[i + 2] = boosted;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      setImagemProcessadaUrl(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = dataUrl;
  };

  const handleCarregarImagem = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagemOriginalUrl(dataUrl);
      setImagemProcessadaUrl(dataUrl);
      setRotacaoGraus(0);
      setFiltroPreProcessamento('normal');
      setErroProcessamento('');
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCarregarImagem(file);
    e.target.value = '';
  };

  const handleRotacionar = () => {
    const novaRotacao = (rotacaoGraus + 90) % 360;
    setRotacaoGraus(novaRotacao);
    if (imagemOriginalUrl) {
      aplicarPreProcessamento(imagemOriginalUrl, filtroPreProcessamento, novaRotacao);
    }
  };

  const handleAlterarFiltro = (filtro: 'normal' | 'alto_contraste' | 'nitidez' | 'pb') => {
    setFiltroPreProcessamento(filtro);
    if (imagemOriginalUrl) {
      aplicarPreProcessamento(imagemOriginalUrl, filtro, rotacaoGraus);
    }
  };

  // ============================================================================
  // FLUXO DE LEITURA POR IA E VALIDAÇÃO INDEPENDENTE
  // ============================================================================
  const handleIniciarLeituraIA = async () => {
    const imgParaEnviar = imagemProcessadaUrl || imagemOriginalUrl;
    if (!imgParaEnviar) {
      setErroProcessamento('Por favor, selecione ou tire a foto da escala primeiro.');
      return;
    }

    if (funcionariosCadastrados.length === 0) {
      setErroProcessamento('Nenhum funcionário ativo cadastrado no Posto ADM. Cadastre os funcionários antes de importar a escala.');
      return;
    }

    setEtapa('PROCESSANDO');
    setErroProcessamento('');
    setMensagemProgresso(
      motorIA === 'chatgpt'
        ? 'ChatGPT (GPT-4o Vision) processando a escala... Mapeando funcionários e turnos cadastrados.'
        : 'Gemini Vision processando a escala... Mapeando funcionários e turnos cadastrados.'
    );

    try {
      const resultado: ResultadoImportacaoEscala = await importarEscalaPorImagem({
        imageBase64: imgParaEnviar,
        mimeType: 'image/jpeg',
        month,
        year,
        funcionarios: funcionariosCadastrados,
        turnos: TURNOS_PADRAO_POSTO,
        motor: motorIA,
      });

      setMotorUtilizado(resultado.motorUtilizado);

      if (resultado.records.length === 0) {
        setErroProcessamento('Nenhum registro legível de escala foi encontrado na imagem. Tente uma foto com melhor iluminação ou ajuste a rotação.');
        setEtapa('UPLOAD');
        return;
      }

      setRegistros(resultado.records);
      setEtapa('REVISAO');
    } catch (err: any) {
      console.error('Erro na importação por IA:', err);
      setErroProcessamento(err?.message || 'Falha na leitura visual da escala. Tente novamente.');
      setEtapa('UPLOAD');
    }
  };

  // ============================================================================
  // EDIÇÃO MANUAL E REVALIDAÇÃO EM TEMPO REAL NA TELA DE REVISÃO (REGRA 13)
  // ============================================================================
  const handleAtualizarRegistro = (
    idRegistro: string,
    alteracoes: Partial<RegistroImportadoReconhecido>
  ) => {
    setRegistros((prev) =>
      prev.map((rec) => {
        if (rec.id !== idRegistro) return rec;
        const atualizado = { ...rec, ...alteracoes };
        // Executa validação estrita independente
        return validateRecord(atualizado, funcionariosCadastrados, TURNOS_PADRAO_POSTO, totalDiasMes);
      })
    );
  };

  const handleRemoverRegistro = (idRegistro: string) => {
    setRegistros((prev) => prev.filter((r) => r.id !== idRegistro));
  };

  const handleAdicionarRegistroManual = () => {
    const primeiroFunc = funcionariosCadastrados[0];
    const novoRec: Partial<RegistroImportadoReconhecido> = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      employeeId: primeiroFunc ? primeiroFunc.id : null,
      employeeName: primeiroFunc ? primeiroFunc.nome : 'Selecione',
      day: 1,
      shiftId: 'Turno 1 - Manhã (06h - 14h)',
      shiftName: '1º Turno (Manhã)',
      shiftSigla: 'T1',
      confidence: 1.0,
      status: primeiroFunc ? 'CONFIRMADO' : 'NAO_IDENTIFICADO',
      observation: 'Adicionado manualmente na conferência.',
      isFolga: false,
    };
    const validado = validateRecord(novoRec, funcionariosCadastrados, TURNOS_PADRAO_POSTO, totalDiasMes);
    setRegistros((prev) => [validado, ...prev]);
  };

  // ============================================================================
  // CONFIRMAÇÃO E SALVAMENTO NO PLANNER (REGRA 14)
  // ============================================================================
  const estatisticas = useMemo(() => {
    const total = registros.length;
    const confirmados = registros.filter((r) => r.status === 'CONFIRMADO').length;
    const revisao = registros.filter((r) => r.status === 'REVISAO').length;
    const naoIdentificados = registros.filter((r) => r.status === 'NAO_IDENTIFICADO').length;
    return { total, confirmados, revisao, naoIdentificados };
  }, [registros]);

  const registrosFiltrados = useMemo(() => {
    return registros.filter((r) => {
      if (filtroStatus === 'PENDENTES' && r.status === 'CONFIRMADO') return false;
      if (filtroStatus === 'CONFIRMADOS' && r.status !== 'CONFIRMADO') return false;
      if (buscaFuncionario) {
        const query = buscaFuncionario.toLowerCase();
        const matchNome = r.employeeName.toLowerCase().includes(query);
        const matchRaw = (r.rawName || '').toLowerCase().includes(query);
        if (!matchNome && !matchRaw) return false;
      }
      return true;
    });
  }, [registros, filtroStatus, buscaFuncionario]);

  const handleConfirmarESalvarPlanner = async () => {
    if (!postoId) {
      setErroProcessamento('Posto não identificado na sessão.');
      return;
    }

    // Filtrar somente registros que possuem funcionário válido cadastrado e turno/folga definidos
    const registrosValidosParaGravar = registros.filter(
      (r) => r.employeeId && (r.shiftId || r.isFolga)
    );

    if (registrosValidosParaGravar.length === 0) {
      setErroProcessamento('Nenhum registro validado com funcionário cadastrado para preencher o Planner.');
      return;
    }

    setSalvandoNoPlanner(true);
    setErroProcessamento('');

    try {
      const agora = new Date().toISOString();
      const escalasParaGravar: Partial<Escala>[] = registrosValidosParaGravar.map((r) => {
        const mStr = String(month).padStart(2, '0');
        const dStr = String(r.day).padStart(2, '0');
        const dataFormatada = `${year}-${mStr}-${dStr}`;
        const isFolga = r.isFolga || r.shiftId === 'FOLGA';

        const func = funcionariosCadastrados.find((f) => f.id === r.employeeId);

        let statusFinal: EscalaStatus = 'TRABALHO';
        if (isFolga) statusFinal = 'FOLGA';
        else if (r.shiftSigla === 'FE') statusFinal = 'FERIAS';
        else if (r.shiftSigla === 'AT') statusFinal = 'AFASTADO';
        else if (r.shiftSigla === 'FA') statusFinal = 'AUSENTE';
        else if (r.shiftSigla === 'PLT') statusFinal = 'PLANTAO';

        return {
          id: `${r.employeeId}_${dataFormatada}`,
          postoId,
          funcionarioId: r.employeeId!,
          funcionarioNome: r.employeeName,
          funcao: func?.funcao || func?.cargo || 'Frentista',
          setor: func?.setor || 'Pista',
          data: dataFormatada,
          turno: isFolga ? 'Folga' : r.shiftId || 'Turno 1 - Manhã (06h - 14h)',
          horarioInicio: isFolga ? '00:00' : r.horarioInicio || '06:00',
          horarioFim: isFolga ? '00:00' : r.horarioFim || '14:00',
          intervalo: '1h',
          status: statusFinal,
          observacao: r.observation ? `[Importado via IA] ${r.observation}` : '[Importado via IA]',
          criadoEm: agora,
          atualizadoEm: agora,
        };
      });

      await repoEscala.saveBatch(postoId, escalasParaGravar as Escala[]);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar escala no Planner:', err);
      setErroProcessamento(`Falha ao salvar no Planner: ${err?.message || 'Erro de comunicação'}`);
    } finally {
      setSalvandoNoPlanner(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* ====================================================================== */}
        {/* CABEÇALHO DO MODAL */}
        {/* ====================================================================== */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Sparkles className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Importar Escala por Imagem
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {nomeMesFormatado}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Validação estrita e conferência contra o cadastro de funcionários e turnos oficiais do Posto ADM.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ====================================================================== */}
        {/* CORPO DO MODAL (FLUXO EM 3 ETAPAS) */}
        {/* ====================================================================== */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
          {/* Mensagens de Alerta ou Erro */}
          {erroProcessamento && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5 font-semibold">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">{erroProcessamento}</div>
            </div>
          )}

          {/* ================================================================== */}
          {/* ETAPA 1: UPLOAD, FOTO & PRÉ-PROCESSAMENTO */}
          {/* ================================================================== */}
          {etapa === 'UPLOAD' && (
            <div className="space-y-5">
              {/* Barra de Seleção de Motor de IA */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Motor de Visão Computacional
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    A IA lê a imagem e os dados são <strong>obrigatoriamente checados</strong> contra os cadastros do Posto ADM.
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setMotorIA('chatgpt')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      motorIA === 'chatgpt'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>ChatGPT (GPT-4o Vision)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMotorIA('gemini')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      motorIA === 'gemini'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Gemini Vision</span>
                  </button>
                </div>
              </div>

              {/* Zona de Drop / Câmera / Arquivo */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleCarregarImagem(file);
                }}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition flex flex-col items-center justify-center gap-4 bg-white ${
                  isDragOver ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {!imagemOriginalUrl ? (
                  <>
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-full">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        Arraste a foto da escala aqui ou clique para selecionar
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Formatos aceitos: <strong>JPG, JPEG, PNG, WEBP</strong>. A imagem pode conter a escala inteira.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                      >
                        <FileImage className="w-4 h-4" />
                        Selecionar Imagem
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-blue-600" />
                        Tirar Foto com o Celular
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="w-full space-y-4">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Imagem carregada e pronta para leitura
                      </div>
                      {/* Ferramentas de Pré-Processamento Visual */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRotacionar}
                          title="Girar 90 graus"
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          Girar 90°
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAlterarFiltro('alto_contraste')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                            filtroPreProcessamento === 'alto_contraste'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          <Contrast className="w-3.5 h-3.5" />
                          Alto Contraste
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAlterarFiltro('nitidez')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                            filtroPreProcessamento === 'nitidez'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          <Sun className="w-3.5 h-3.5" />
                          Nitidez
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAlterarFiltro('normal')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            filtroPreProcessamento === 'normal'
                              ? 'bg-slate-800 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          Original
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                        >
                          Trocar Foto
                        </button>
                      </div>
                    </div>

                    {/* Pré-visualização da imagem tratada */}
                    <div className="bg-slate-900/10 border border-slate-200 rounded-xl p-2 flex items-center justify-center max-h-72 overflow-hidden">
                      <img
                        src={imagemProcessadaUrl || imagemOriginalUrl}
                        alt="Pré-visualização da Escala"
                        className="max-h-64 object-contain rounded shadow-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Informação sobre os cadastros oficiais enviados */}
              <div className="bg-blue-50/70 border border-blue-200 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-blue-900">
                <div className="space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-700" />
                    Base Oficial do Posto ADM Fornecida à IA:
                  </div>
                  <div className="text-[11px] text-blue-800">
                    • <strong>{funcionariosCadastrados.length} Funcionários ativos</strong> cadastrados.<br />
                    • <strong>5 Turnos Oficiais</strong> (T1 Manhã, T2 Tarde, T3 Noite, Horista, Plantão) + Folga (&quot;S&quot;).
                  </div>
                </div>
                {imagemOriginalUrl && (
                  <button
                    type="button"
                    onClick={handleIniciarLeituraIA}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer shrink-0"
                  >
                    <Sparkles className="w-4 h-4 text-emerald-200" />
                    Iniciar Leitura da Escala
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* ETAPA 2: PROCESSANDO LEITURA MULTIMODAL */}
          {/* ================================================================== */}
          {etapa === 'PROCESSANDO' && (
            <div className="py-16 text-center space-y-4 bg-white rounded-2xl border border-slate-200">
              <div className="inline-flex p-4 bg-blue-50 text-blue-600 rounded-full animate-spin">
                <RefreshCw className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">
                  Lendo Escala e Conciliando com os Cadastros...
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {mensagemProgresso}
                </p>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* ETAPA 3: REVISÃO VISUAL DA ESCALA IMPORTADA (REGRA 11, 12, 13) */}
          {/* ================================================================== */}
          {etapa === 'REVISAO' && (
            <div className="space-y-5">
              {/* Barra Superior de Resumo e Estatísticas */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Revisar Escala Reconhecida ({registros.length} registros)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Motor: <strong>{motorUtilizado}</strong>. Revise os dados antes de preencher o Planner.
                  </p>
                </div>

                {/* Badges de Contagem */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    {estatisticas.confirmados} Confirmados
                  </span>
                  {estatisticas.revisao > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      {estatisticas.revisao} Em Revisão
                    </span>
                  )}
                  {estatisticas.naoIdentificados > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-800 border border-red-200">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                      {estatisticas.naoIdentificados} Não Identificados
                    </span>
                  )}
                </div>
              </div>

              {/* Filtros e Ações da Tabela de Revisão */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filtrar por funcionário..."
                      value={buscaFuncionario}
                      onChange={(e) => setBuscaFuncionario(e.target.value)}
                      className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 w-48 sm:w-56"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setFiltroStatus('TODOS')}
                      className={`px-2.5 py-1 rounded-md font-bold transition ${
                        filtroStatus === 'TODOS'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Todos ({estatisticas.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltroStatus('PENDENTES')}
                      className={`px-2.5 py-1 rounded-md font-bold transition ${
                        filtroStatus === 'PENDENTES'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pendentes ({estatisticas.revisao + estatisticas.naoIdentificados})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltroStatus('CONFIRMADOS')}
                      className={`px-2.5 py-1 rounded-md font-bold transition ${
                        filtroStatus === 'CONFIRMADOS'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Confirmados ({estatisticas.confirmados})
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAdicionarRegistroManual}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Registro
                  </button>
                  <button
                    type="button"
                    onClick={() => setEtapa('UPLOAD')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Ler Outra Imagem
                  </button>
                </div>
              </div>

              {/* Tabela de Revisão Estruturada */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto max-h-[460px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                      <tr>
                        <th className="p-3 min-w-[220px] border-r border-slate-200">
                          Funcionário Cadastrado
                        </th>
                        <th className="p-3 min-w-[70px] text-center border-r border-slate-200">
                          Dia
                        </th>
                        <th className="p-3 min-w-[190px] border-r border-slate-200">
                          Turno Cadastrado
                        </th>
                        <th className="p-3 min-w-[90px] text-center border-r border-slate-200">
                          Confiança
                        </th>
                        <th className="p-3 min-w-[130px] border-r border-slate-200">
                          Status
                        </th>
                        <th className="p-3 min-w-[200px] border-r border-slate-200">
                          Observação / IA
                        </th>
                        <th className="p-3 text-center min-w-[60px]">
                          Ação
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {registrosFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            Nenhum registro encontrado para o filtro selecionado.
                          </td>
                        </tr>
                      ) : (
                        registrosFiltrados.map((rec) => {
                          const isConf = rec.status === 'CONFIRMADO';
                          const isRev = rec.status === 'REVISAO';
                          const isNao = rec.status === 'NAO_IDENTIFICADO';

                          const statusBadgeClass = isConf
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : isRev
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : 'bg-red-50 text-red-900 border-red-200';

                          return (
                            <tr
                              key={rec.id}
                              className={`hover:bg-slate-50/80 transition ${
                                isRev ? 'bg-amber-50/20' : isNao ? 'bg-red-50/20' : ''
                              }`}
                            >
                              {/* 1. Selecionar Funcionário (ESTRITAMENTE CADASTRADOS) */}
                              <td className="p-2.5 border-r border-slate-200">
                                <select
                                  value={rec.employeeId || ''}
                                  onChange={(e) => {
                                    const novoId = e.target.value;
                                    const func = funcionariosCadastrados.find((f) => f.id === novoId);
                                    handleAtualizarRegistro(rec.id, {
                                      employeeId: novoId || null,
                                      employeeName: func ? func.nome : 'Não identificado',
                                    });
                                  }}
                                  className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold ${
                                    rec.employeeId
                                      ? 'border-slate-300 bg-white text-slate-900'
                                      : 'border-red-300 bg-red-50 text-red-900'
                                  }`}
                                >
                                  <option value="">-- Selecione o Funcionário --</option>
                                  {funcionariosCadastrados.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.nome} ({f.cargo})
                                    </option>
                                  ))}
                                </select>
                                {rec.rawName && rec.rawName !== rec.employeeName && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Lido na imagem: &quot;{rec.rawName}&quot;
                                  </div>
                                )}
                              </td>

                              {/* 2. Selecionar Dia (1 a N) */}
                              <td className="p-2.5 text-center border-r border-slate-200">
                                <select
                                  value={rec.day}
                                  onChange={(e) =>
                                    handleAtualizarRegistro(rec.id, {
                                      day: parseInt(e.target.value, 10) || 1,
                                    })
                                  }
                                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-center bg-white"
                                >
                                  {listaDiasMes.map((d) => (
                                    <option key={d} value={d}>
                                      Dia {String(d).padStart(2, '0')}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* 3. Selecionar Turno (ESTRITAMENTE CADASTRADOS + FOLGA) */}
                              <td className="p-2.5 border-r border-slate-200">
                                <select
                                  value={rec.isFolga ? 'FOLGA' : rec.shiftId || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const isFolga = val === 'FOLGA';
                                    const turnoObj = TURNOS_PADRAO_POSTO.find((t) => t.id === val);
                                    handleAtualizarRegistro(rec.id, {
                                      shiftId: isFolga ? 'FOLGA' : turnoObj ? turnoObj.id : null,
                                      shiftName: isFolga ? 'Folga' : turnoObj ? turnoObj.nomeCurto : 'Não identificado',
                                      shiftSigla: isFolga ? 'S' : turnoObj ? turnoObj.sigla : '—',
                                      isFolga,
                                      horarioInicio: isFolga ? '00:00' : turnoObj?.inicio || '06:00',
                                      horarioFim: isFolga ? '00:00' : turnoObj?.fim || '14:00',
                                    });
                                  }}
                                  className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold ${
                                    rec.shiftId || rec.isFolga
                                      ? 'border-slate-300 bg-white text-slate-900'
                                      : 'border-red-300 bg-red-50 text-red-900'
                                  }`}
                                >
                                  <option value="">-- Selecione o Turno --</option>
                                  <option value="FOLGA" className="font-bold text-emerald-800">
                                    Folga (S / 6x1)
                                  </option>
                                  {TURNOS_PADRAO_POSTO.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.sigla} — {t.nomeCurto} ({t.inicio} às {t.fim})
                                    </option>
                                  ))}
                                </select>
                                {rec.rawShift && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Lido na imagem: &quot;{rec.rawShift}&quot;
                                  </div>
                                )}
                              </td>

                              {/* 4. Confiança da Leitura */}
                              <td className="p-2.5 text-center border-r border-slate-200">
                                <span className="font-mono text-xs font-bold text-slate-700">
                                  {Math.round(rec.confidence * 100)}%
                                </span>
                              </td>

                              {/* 5. Badge de Status */}
                              <td className="p-2.5 border-r border-slate-200">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${statusBadgeClass}`}
                                >
                                  {isConf && <Check className="w-3 h-3 text-emerald-600" />}
                                  {isRev && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                                  {isNao && <AlertCircle className="w-3 h-3 text-red-600" />}
                                  {isConf ? 'Confirmado' : isRev ? 'Revisão' : 'Não Identificado'}
                                </span>
                              </td>

                              {/* 6. Observação */}
                              <td className="p-2.5 text-[11px] text-slate-500 border-r border-slate-200">
                                {rec.observation || 'Validado com sucesso.'}
                              </td>

                              {/* 7. Ações */}
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoverRegistro(rec.id)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                                  title="Remover este registro"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
        </div>

        {/* ====================================================================== */}
        {/* RODAPÉ DO MODAL COM CONFIRMAÇÃO E SALVAMENTO NO PLANNER (REGRA 14) */}
        {/* ====================================================================== */}
        <div className="bg-slate-900 px-5 sm:px-6 py-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-white">
          <div className="text-xs text-slate-400">
            {etapa === 'REVISAO' ? (
              <span>
                <strong className="text-emerald-400">{estatisticas.confirmados}</strong> registros prontos para gravação no Planner.
                {estatisticas.revisao + estatisticas.naoIdentificados > 0 && (
                  <span className="text-amber-300 ml-2">
                    (⚠ {estatisticas.revisao + estatisticas.naoIdentificados} registros precisam de ajuste)
                  </span>
                )}
              </span>
            ) : (
              <span>Selecione uma foto nítida da escala de trabalho do posto para iniciar.</span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>

            {etapa === 'REVISAO' && (
              <button
                type="button"
                disabled={salvandoNoPlanner || estatisticas.confirmados === 0}
                onClick={handleConfirmarESalvarPlanner}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                {salvandoNoPlanner
                  ? 'Preenchendo Planner...'
                  : `Confirmar e Preencher Planner (${estatisticas.confirmados})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
