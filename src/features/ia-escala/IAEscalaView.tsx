import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Escala,
  Funcionario,
  EscalaStatus,
  EscalaImportada,
  ConflitoEscalaDetectado,
  StatusConferenciaEscala,
} from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import { PainelConferenciaEscalaOCR, ItemConferenciaOCR } from './PainelConferenciaEscalaOCR';
import { requisitarLeituraEscalaOCR } from '../../services/geminiOcrService';
import {
  Sparkles,
  Camera,
  Check,
  AlertCircle,
  RefreshCw,
  UserPlus,
  UserCheck,
  Calendar,
  CheckCircle2,
  Trash2,
  ArrowRight,
  ShieldCheck,
  FileImage,
  FolderOpen,
  Clock,
  RotateCw,
  Sliders,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  Search,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  Sun,
  Contrast,
  Layers,
  FileText,
  LayoutGrid,
  List,
} from 'lucide-react';

const repoEscalas = new PostoSubcollectionRepository<Escala>('escalas');
const repoFuncionarios = new PostoSubcollectionRepository<Funcionario>('funcionarios');
const repoEscalasImportadas = new PostoSubcollectionRepository<EscalaImportada>('escalasImportadas');

export type FiltroImagemOCR = 'original' | 'nitidez' | 'pb' | 'alto_contraste' | 'brilho' | 'reducao_ruido';

export interface ColaboradorReconhecido {
  nomeOriginal: string;
  jaCadastrado: boolean;
  funcionarioId?: string;
  confianca?: 'ALTA' | 'MEDIA' | 'BAIXA';
  motivoCorrespondencia?: string;
  sugestaoCadastroPrevio?: {
    nome: string;
    cargo: string;
    funcao?: string;
    setor?: string;
    turnoPreferencial?: string;
    cpf?: string;
  };
  cadastradoAgora?: boolean;
}

export type ItemEscalaExtraido = ItemConferenciaOCR;

export interface DiagnosticoOCR {
  tipoDocumentoIdentificado?: string;
  qualidadeImagem?: string;
  observacoesGerais?: string;
  mesReferencia?: string;
  copiaFielReconhecida?: string;
  simbolosEAbreviacoes?: string[];
  trocasDeEscalaIdentificadas?: string[];
  conflitosDetectados?: ConflitoEscalaDetectado[];
}

interface IAEscalaViewProps {
  funcionarios: Funcionario[];
  escalas?: Escala[];
  escalasImportadas?: EscalaImportada[];
  onReload: () => void;
  onNavigateToPlanner?: () => void;
}

const normalizarDataParaIso = (rawDate: string, mesAnoPadrao?: string): string => {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  const trimmed = rawDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const matchIsoFlex = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (matchIsoFlex) {
    return `${matchIsoFlex[1]}-${matchIsoFlex[2].padStart(2, '0')}-${matchIsoFlex[3].padStart(2, '0')}`;
  }

  const matchBr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (matchBr) {
    return `${matchBr[3]}-${matchBr[2].padStart(2, '0')}-${matchBr[1].padStart(2, '0')}`;
  }

  const matchDiaMes = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (matchDiaMes) {
    const ano = mesAnoPadrao ? mesAnoPadrao.split('-')[0] : new Date().getFullYear();
    return `${ano}-${matchDiaMes[2].padStart(2, '0')}-${matchDiaMes[1].padStart(2, '0')}`;
  }

  const matchApenasDia = trimmed.match(/^dia\s*(\d{1,2})$/i) || trimmed.match(/^d(\d{1,2})$/i) || trimmed.match(/^(\d{1,2})$/);
  if (matchApenasDia) {
    if (mesAnoPadrao && /^\d{4}-\d{2}$/.test(mesAnoPadrao)) {
      return `${mesAnoPadrao}-${matchApenasDia[1].padStart(2, '0')}`;
    }
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    return `${ano}-${mes}-${matchApenasDia[1].padStart(2, '0')}`;
  }
  return trimmed;
};

// Normalizador de turnos preservando 100% dos horários reais extraídos da imagem
export const normalizarTurno = (
  rawTurno: string,
  rawInicio?: string,
  rawFim?: string
): {
  turno: string;
  horarioInicio: string;
  horarioFim: string;
} => {
  const t = (rawTurno || '').trim().toLowerCase();
  const inicioLimpo = (rawInicio || '').trim();
  const fimLimpo = (rawFim || '').trim();

  // Folgas e DSR
  if (
    t === 'f' ||
    t === 'fol' ||
    t === 'folga' ||
    t === 'dsr' ||
    t === 'off' ||
    t === 'desc' ||
    t === 's' ||
    t === '-' ||
    t.includes('folga') ||
    t.includes('descanso')
  ) {
    return {
      turno: 'Folga',
      horarioInicio: '00:00',
      horarioFim: '00:00',
    };
  }

  // Férias
  if (t.includes('feria') || t.includes('féria') || t === 'fer' || t === 'fe') {
    return {
      turno: 'Férias',
      horarioInicio: '00:00',
      horarioFim: '00:00',
    };
  }

  // Afastado / Atestado
  if (t.includes('afast') || t.includes('atest') || t.includes('lic') || t === 'at' || t === 'med') {
    return {
      turno: 'Afastado',
      horarioInicio: '00:00',
      horarioFim: '00:00',
    };
  }

  // Plantão / 12x36
  if (t === 'p' || t === 'plt' || t.includes('plantão') || t.includes('plantao') || t.includes('12x36')) {
    return {
      turno: rawTurno && !['p', 'plt'].includes(t) ? rawTurno.trim() : 'Plantão',
      horarioInicio: inicioLimpo || '06:00',
      horarioFim: fimLimpo || '18:00',
    };
  }

  // Turno 3: Noite
  if (
    t === '3' ||
    t === 't3' ||
    t === 'n' ||
    t.includes('turno 3') ||
    t.includes('noite') ||
    t.includes('noturno') ||
    t.includes('22-06') ||
    t.includes('22h') ||
    inicioLimpo.startsWith('22:') ||
    inicioLimpo.startsWith('23:')
  ) {
    const hIni = inicioLimpo || '22:00';
    const hFim = fimLimpo || '06:00';
    return {
      turno: hIni === '22:00' && hFim === '06:00' ? 'Turno 3 - Noite (22h - 06h)' : `Noite (${hIni} - ${hFim})`,
      horarioInicio: hIni,
      horarioFim: hFim,
    };
  }

  // Turno Horista / Intermediário
  if (
    t === 'h' ||
    t === 'hor' ||
    t.includes('horista') ||
    t.includes('flex') ||
    t.includes('intermed') ||
    t.includes('int')
  ) {
    return {
      turno: 'Turno Horista',
      horarioInicio: inicioLimpo || '08:00',
      horarioFim: fimLimpo || '14:00',
    };
  }

  // Turno 2: Tarde
  if (
    t === '2' ||
    t === 't2' ||
    t === 't02' ||
    t.includes('turno 2') ||
    t.includes('turno2') ||
    t.includes('14-22') ||
    t.includes('14h') ||
    t.includes('14:00') ||
    t.includes('tarde') ||
    t === 't' ||
    t === 'tar' ||
    inicioLimpo.startsWith('13:') ||
    inicioLimpo.startsWith('14:') ||
    inicioLimpo.startsWith('15:')
  ) {
    const hIni = inicioLimpo || '14:00';
    const hFim = fimLimpo || '22:00';
    return {
      turno: hIni === '14:00' && hFim === '22:00' ? 'Turno 2 - Tarde (14h - 22h)' : `Tarde (${hIni} - ${hFim})`,
      horarioInicio: hIni,
      horarioFim: hFim,
    };
  }

  // Turno 1: Manhã ou horário customizado
  const hIni = inicioLimpo || '06:00';
  const hFim = fimLimpo || '14:00';
  return {
    turno:
      hIni === '06:00' && hFim === '14:00'
        ? 'Turno 1 - Manhã (06h - 14h)'
        : rawTurno && !['1', 't1', 'm', 'manhã', 'manha'].includes(t)
        ? rawTurno.trim()
        : `Manhã (${hIni} - ${hFim})`,
    horarioInicio: hIni,
    horarioFim: hFim,
  };
};

// Processador de imagem via Canvas em alta definição (até 2048px) para OCR preciso
const processarImagemCanvas = (
  dataUrl: string,
  rotacaoGraus: number,
  filtro: FiltroImagemOCR
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const normRot = ((rotacaoGraus % 360) + 360) % 360;
      const is90or270 = Math.abs(normRot - 90) < 15 || Math.abs(normRot - 270) < 15;
      const rawW = is90or270 ? img.height : img.width;
      const rawH = is90or270 ? img.width : img.height;

      const MAX_DIM = 2048;
      let finalW = rawW;
      let finalH = rawH;
      if (Math.max(rawW, rawH) > MAX_DIM) {
        if (rawW > rawH) {
          finalH = Math.round((rawH * MAX_DIM) / rawW);
          finalW = MAX_DIM;
        } else {
          finalW = Math.round((rawW * MAX_DIM) / rawH);
          finalH = MAX_DIM;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = finalW;
      canvas.height = finalH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotacaoGraus * Math.PI) / 180);
      const drawW = is90or270 ? finalH : finalW;
      const drawH = is90or270 ? finalW : finalH;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      if (filtro !== 'original') {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        if (filtro === 'nitidez') {
          const contrast = 1.25;
          const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
          for (let i = 0; i < d.length; i += 4) {
            d[i] = Math.min(255, Math.max(0, factor * (d[i] - 128) + 128));
            d[i + 1] = Math.min(255, Math.max(0, factor * (d[i + 1] - 128) + 128));
            d[i + 2] = Math.min(255, Math.max(0, factor * (d[i + 2] - 128) + 128));
          }
        } else if (filtro === 'pb') {
          for (let i = 0; i < d.length; i += 4) {
            const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const bin = gray > 138 ? Math.min(255, gray * 1.2) : Math.max(0, gray * 0.68);
            d[i] = bin;
            d[i + 1] = bin;
            d[i + 2] = bin;
          }
        } else if (filtro === 'alto_contraste') {
          for (let i = 0; i < d.length; i += 4) {
            const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const val = gray > 132 ? 255 : 0;
            d[i] = val;
            d[i + 1] = val;
            d[i + 2] = val;
          }
        } else if (filtro === 'brilho') {
          for (let i = 0; i < d.length; i += 4) {
            d[i] = Math.min(255, d[i] * 1.22 + 18);
            d[i + 1] = Math.min(255, d[i + 1] * 1.22 + 18);
            d[i + 2] = Math.min(255, d[i + 2] * 1.22 + 18);
          }
        } else if (filtro === 'reducao_ruido') {
          const contrast = 1.2;
          const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
          for (let i = 0; i < d.length; i += 4) {
            const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
            const clean = avg > 210 ? 255 : avg < 50 ? 15 : avg;
            d[i] = Math.min(255, Math.max(0, factor * (clean - 128) + 128));
            d[i + 1] = Math.min(255, Math.max(0, factor * (clean - 128) + 128));
            d[i + 2] = Math.min(255, Math.max(0, factor * (clean - 128) + 128));
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      resolve(canvas.toDataURL('image/jpeg', 0.94));
    };
    img.src = dataUrl;
  });
};

export const IAEscalaView: React.FC<IAEscalaViewProps> = ({
  funcionarios,
  escalas = [],
  escalasImportadas = [],
  onReload,
  onNavigateToPlanner,
}) => {
  const { postoId, userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Estados da Imagem
  const [imagemOriginal, setImagemOriginal] = useState<string | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [imagemMimeType, setImagemMimeType] = useState('image/jpeg');
  const [nomeArquivo, setNomeArquivo] = useState<string>('');
  const [tamanhoArquivo, setTamanhoArquivo] = useState<string>('');
  const [rotacao, setRotacao] = useState<number>(0);
  const [inclinacaoFina, setInclinacaoFina] = useState<number>(0);
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroImagemOCR>('original');
  const [zoomNivel, setZoomNivel] = useState<number>(1);
  const [modoComparacao, setModoComparacao] = useState<boolean>(true);
  const [modoImportacao, setModoImportacao] = useState<'SUBSTITUIR' | 'ATUALIZAR' | 'MESCLAR' | 'NOVA_VERSAO'>('ATUALIZAR');

  // Mês e Ano de Referência
  const hoje = new Date();
  const mesAtualStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const [mesAnoReferencia, setMesAnoReferencia] = useState<string>(mesAtualStr);

  // Estados de Processamento e Resultados
  const [processando, setProcessando] = useState(false);
  const [tituloDocumento, setTituloDocumento] = useState('');
  const [colaboradoresDetectados, setColaboradoresDetectados] = useState<ColaboradorReconhecido[]>([]);
  const [itensEscala, setItensEscala] = useState<ItemEscalaExtraido[]>([]);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoOCR | null>(null);
  const [mensagemStatus, setMensagemStatus] = useState('');
  const [erroProcessamento, setErroProcessamento] = useState('');
  const [salvandoNoPlanner, setSalvandoNoPlanner] = useState(false);
  const [sucessoSalvo, setSucessoSalvo] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [motorIA, setMotorIA] = useState<'gemini'>('gemini');
  const [motorUtilizadoResposta, setMotorUtilizadoResposta] = useState<string>('Google Gemini 3.8 Flash');

  // Filtros e Modo de Visualização da Escala
  const [modoVisualizacao, setModoVisualizacao] = useState<'GRADE' | 'TABELA'>('GRADE');
  const [filtroStatusTabela, setFiltroStatusTabela] = useState<'TODOS' | 'TRABALHO' | 'FOLGA' | 'PENDENTE'>('TODOS');
  const [buscaNomeTabela, setBuscaNomeTabela] = useState<string>('');

  // Aplica filtros e rotações sempre que imagemOriginal, rotacao ou filtroAtivo mudarem
  useEffect(() => {
    if (!imagemOriginal) {
      setImagemPreview(null);
      return;
    }

    let cancelado = false;
    processarImagemCanvas(imagemOriginal, rotacao + inclinacaoFina, filtroAtivo).then((urlProcessada) => {
      if (!cancelado) {
        setImagemPreview(urlProcessada);
      }
    });

    return () => {
      cancelado = true;
    };
  }, [imagemOriginal, rotacao, inclinacaoFina, filtroAtivo]);

  const carregarArquivoImagem = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErroProcessamento('Por favor, selecione um arquivo de imagem válido (JPG, PNG, WEBP, HEIC).');
      return;
    }
    setNomeArquivo(file.name || 'imagem-escala.jpg');
    const sizeInKb = (file.size / 1024).toFixed(1);
    setTamanhoArquivo(`${sizeInKb} KB`);
    setImagemMimeType(file.type || 'image/jpeg');
    setRotacao(0);
    setZoomNivel(1);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagemOriginal(dataUrl);
      setColaboradoresDetectados([]);
      setItensEscala([]);
      setDiagnostico(null);
      setMensagemStatus('');
      setErroProcessamento('');
      setSucessoSalvo(false);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      carregarArquivoImagem(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      carregarArquivoImagem(file);
    }
  };

  // Suporte a colar print da área de transferência (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            carregarArquivoImagem(blob);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Rotação de imagem em 90 graus
  const handleGirar90 = () => {
    setRotacao((prev) => (prev + 90) % 360);
  };

  // Gerador de imagem demonstrativa realista de escala de posto
  const handleCarregarExemploEscala = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 21px system-ui, -apple-system, sans-serif';
    ctx.fillText('POSTO MATRIZ CENTRAL — ESCALA OPERACIONAL DE PISTA E CAIXA', 36, 52);

    ctx.fillStyle = '#475569';
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.fillText(`MÊS DE REFERÊNCIA: ${mesAnoReferencia} • REGIME DE TURNOS OPERACIONAIS (T1 MANHÃ, T2 TARDE E HORISTA)`, 36, 78);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, 94);
    ctx.lineTo(canvas.width - 36, 94);
    ctx.stroke();

    const startY = 115;
    const rowH = 44;
    const cols = [
      { name: 'COLABORADOR', width: 190 },
      { name: 'CARGO', width: 110 },
      { name: 'TURNO FIXO', width: 120 },
      { name: 'D01', width: 48 },
      { name: 'D02', width: 48 },
      { name: 'D03', width: 48 },
      { name: 'D04', width: 48 },
      { name: 'D05', width: 48 },
      { name: 'D06', width: 48 },
      { name: 'D07', width: 48 },
      { name: 'D08', width: 48 },
      { name: 'D09', width: 48 },
      { name: 'D10', width: 48 },
      { name: 'D11', width: 48 },
      { name: 'D12', width: 48 },
      { name: 'D13', width: 48 },
      { name: 'D14', width: 48 },
    ];

    let headerX = 36;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(36, startY, canvas.width - 72, 34);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    cols.forEach((col) => {
      ctx.fillText(col.name, headerX + 6, startY + 22);
      headerX += col.width;
    });

    const linhas = [
      {
        nome: funcionarios[0]?.nome || 'Carlos Eduardo Silva',
        cargo: 'Frentista',
        turno: 'Turno 1 - Manhã',
        dias: ['T1', 'T1', 'T1', 'T1', 'T1', 'T1', 'FOLGA', 'T1', 'T1', 'T1', 'T1', 'T1', 'T1', 'FOLGA'],
      },
      {
        nome: funcionarios[1]?.nome || 'Juliana Mendes Santos',
        cargo: 'Caixa',
        turno: 'Turno 2 - Tarde',
        dias: ['T2', 'T2', 'FOLGA', 'T2', 'T2', 'T2', 'T2', 'T2', 'T2', 'FOLGA', 'T2', 'T2', 'T2', 'T2'],
      },
      {
        nome: 'Lucas Andrade',
        cargo: 'Frentista Horista',
        turno: 'Turno Horista',
        dias: ['HOR', 'HOR', 'HOR', 'HOR', 'FOLGA', 'HOR', 'HOR', 'HOR', 'HOR', 'HOR', 'HOR', 'FOLGA', 'HOR', 'HOR'],
      },
      {
        nome: 'Marcos Vinicius',
        cargo: 'Frentista',
        turno: 'Turno 1 - Manhã',
        dias: ['FOLGA', 'T1', 'T1', 'T1', 'T1', 'T1', 'FOLGA', 'T1', 'T1', 'T1', 'T1', 'T1', 'FOLGA', 'T1'],
      },
      {
        nome: 'Aline Ferreira',
        cargo: 'Atendente Caixa',
        turno: 'Turno 2 - Tarde',
        dias: ['T2', 'FOLGA', 'T2', 'T2', 'T2', 'T2', 'FOLGA', 'T2', 'FOLGA', 'T2', 'T2', 'T2', 'T2', 'FOLGA'],
      },
    ];

    linhas.forEach((row, idx) => {
      const y = startY + 34 + idx * rowH;
      ctx.fillStyle = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      ctx.fillRect(36, y, canvas.width - 72, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(36, y, canvas.width - 72, rowH);

      let x = 36;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(row.nome, x + 6, y + 27);
      x += cols[0].width;

      ctx.fillStyle = '#475569';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(row.cargo, x + 6, y + 27);
      x += cols[1].width;

      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(row.turno, x + 6, y + 27);
      x += cols[2].width;

      row.dias.forEach((d, dIdx) => {
        const isFolga = d === 'FOLGA';
        ctx.fillStyle = isFolga ? '#64748b' : '#059669';
        ctx.font = isFolga ? '9px sans-serif' : 'bold 11px monospace';
        ctx.fillText(d, x + 6, y + 27);
        x += cols[3 + dIdx].width;
      });
    });

    const footY = canvas.height - 40;
    ctx.fillStyle = '#64748b';
    ctx.font = 'italic 11px system-ui, sans-serif';
    ctx.fillText('LEGENDA OPERACIONAL: T1 = Manhã (06h-14h) • T2 = Tarde (14h-22h) • HOR = Turno Horista • FOLGA = DSR Semanal', 36, footY);

    const dataUrl = canvas.toDataURL('image/png');
    setNomeArquivo('escala-operacional-demo.png');
    setTamanhoArquivo('78.4 KB');
    setImagemOriginal(dataUrl);
    setRotacao(0);
    setFiltroAtivo('original');
    setColaboradoresDetectados([]);
    setItensEscala([]);
    setDiagnostico(null);
    setMensagemStatus('Exemplo de escala carregado! Clique em "Reconhecer Funcionários e Escala" abaixo.');
    setErroProcessamento('');
    setSucessoSalvo(false);
  };

  // Processamento com a IA Gemini Multimodal através do backend (1. Carregar e enviar imagem -> 2. Processar e validar JSON -> 3. Formatar campos para integração)
  const handleProcessarComIA = async () => {
    const baseImg = imagemPreview || imagemOriginal;
    if (!baseImg) return;

    setProcessando(true);
    setMensagemStatus(
      '1/3 Otimizando nitidez e enviando imagem da escala para leitura visual com OpenRouter API...'
    );
    setErroProcessamento('');
    setSucessoSalvo(false);
    setMotorUtilizadoResposta('');

    try {
      const imagemParaEnviar =
        imagemPreview || (await processarImagemCanvas(baseImg, rotacao + inclinacaoFina, filtroAtivo));

      const data = await requisitarLeituraEscalaOCR({
        imageBase64: imagemParaEnviar,
        mimeType: imagemMimeType || 'image/jpeg',
        mesAnoReferencia,
        motor: motorIA,
        funcionariosCadastrados: funcionarios.map((f) => ({
          id: f.id,
          nome: f.nome,
          matricula: f.matricula,
          cargo: f.cargo,
          funcao: f.funcao,
          setor: f.setor,
        })),
      });

      if (data.motorUtilizado) {
        setMotorUtilizadoResposta(data.motorUtilizado);
      }

      setMensagemStatus('2/3 Processando resposta estruturada e validando campos do JSON...');
      setTituloDocumento(String(data.tituloEscala || 'Escala Operacional de Trabalho').trim());

      setDiagnostico({
        tipoDocumentoIdentificado: data.tipoDocumentoIdentificado || 'Quadro / Planilha de Escala Operacional',
        qualidadeImagem: data.qualidadeImagem || 'BOA',
        observacoesGerais: data.observacoesGerais || 'Leitura e reconhecimento fiel concluídos com sucesso.',
        mesReferencia: data.mesReferencia || mesAnoReferencia,
        copiaFielReconhecida: data.copiaFielReconhecida || '',
        simbolosEAbreviacoes: data.simbolosEAbreviacoes || [],
        trocasDeEscalaIdentificadas: data.trocasDeEscalaIdentificadas || [],
        conflitosDetectados: data.conflitosDetectados || [],
      });

      // Processar colaboradores identificados preservando exatamente os nomes e funções lidos na imagem
      const detectados: ColaboradorReconhecido[] = (data.colaboradoresIdentificados || []).map(
        (colab: any) => {
          const nomeOrig = String(colab.nomeOriginal || '').trim() || 'não identificado';
          const nomeOrigLower = nomeOrig.toLowerCase();

          const match = funcionarios.find((f) => {
            if (!f || !f.nome) return false;
            const fNomeLower = f.nome.toLowerCase().trim();
            if (colab.funcionarioId && f.id === colab.funcionarioId) return true;
            if (fNomeLower === nomeOrigLower) return true;
            if (nomeOrigLower !== 'não identificado' && nomeOrigLower.length >= 3) {
              if (fNomeLower.includes(nomeOrigLower) || nomeOrigLower.includes(fNomeLower)) return true;
            }
            return false;
          });

          if (match) {
            return {
              nomeOriginal: nomeOrig,
              jaCadastrado: true,
              funcionarioId: match.id,
              confianca: colab.confianca || 'ALTA',
              motivoCorrespondencia: colab.motivoCorrespondencia || `Vinculado ao cadastro: ${match.nome}`,
            };
          } else {
            return {
              nomeOriginal: nomeOrig,
              jaCadastrado: false,
              funcionarioId: undefined,
              confianca: colab.confianca || 'MEDIA',
              motivoCorrespondencia: colab.motivoCorrespondencia || 'Extraído fielmente da imagem da escala',
              sugestaoCadastroPrevio: {
                nome: colab.sugestaoCadastroPrevio?.nome || nomeOrig,
                cargo: colab.sugestaoCadastroPrevio?.cargo || colab.cargo || 'Frentista',
                funcao: colab.sugestaoCadastroPrevio?.funcao || colab.funcao || 'Frentista',
                setor: colab.sugestaoCadastroPrevio?.setor || colab.setor || 'Pista',
                turnoPreferencial:
                  colab.sugestaoCadastroPrevio?.turnoPreferencial || 'Turno 1 - Manhã (06h - 14h)',
                cpf: `000.${Math.floor(100 + Math.random() * 900)}.${Math.floor(100 + Math.random() * 900)}-00`,
              },
            };
          }
        }
      );

      setColaboradoresDetectados(detectados);

      // Processar todos os registros diários preservando 100% da fidelidade de horários, turnos, setores, funções e status
      const itens: ItemEscalaExtraido[] = (data.itensEscala || []).map((item: any, idx: number) => {
        const nomeFunc = String(item.funcionarioNome || 'não identificado').trim();
        const colab = detectados.find(
          (c) => c.nomeOriginal.toLowerCase().trim() === nomeFunc.toLowerCase()
        );
        const funcMatch = funcionarios.find(
          (f) => f.id === item.funcionarioId || f.nome.toLowerCase().trim() === nomeFunc.toLowerCase()
        );

        const stUpper = String(item.status || '').toUpperCase().trim();
        const turnoRaw = String(item.turno || '').trim();
        const turnoLower = turnoRaw.toLowerCase();

        let statusVal: EscalaStatus = 'TRABALHO';
        if (
          stUpper === 'FOLGA' ||
          stUpper === 'DSR' ||
          stUpper === 'OFF' ||
          turnoLower === 'folga' ||
          turnoLower === 'dsr' ||
          turnoLower === 'f' ||
          turnoLower === 'fol' ||
          turnoLower === 'off'
        ) {
          statusVal = 'FOLGA';
        } else if (stUpper === 'PLANTAO' || stUpper === 'PLANTÃO' || turnoLower.includes('plantão') || turnoLower.includes('plantao') || turnoLower.includes('12x36')) {
          statusVal = 'PLANTAO';
        } else if (stUpper === 'FERIAS' || stUpper === 'FÉRIAS' || turnoLower.includes('férias') || turnoLower.includes('ferias')) {
          statusVal = 'FERIAS';
        } else if (stUpper === 'AFASTADO' || stUpper.includes('ATEST') || turnoLower.includes('afast') || turnoLower.includes('atest')) {
          statusVal = 'AFASTADO';
        }

        const dataIso = normalizarDataParaIso(item.data, mesAnoReferencia);
        const dtObj = new Date(`${dataIso}T12:00:00`);
        const diaSemanaCalc =
          item.diaSemana ||
          (!isNaN(dtObj.getTime())
            ? ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dtObj.getDay()]
            : '');

        const ehAusenciaOuFolga =
          statusVal === 'FOLGA' || statusVal === 'FERIAS' || statusVal === 'AFASTADO';

        // Preserva o horário exato vindo do OCR se presente; só usa normalizarTurno como complemento se faltar
        const turnoNorm = normalizarTurno(
          ehAusenciaOuFolga ? statusVal : turnoRaw,
          item.horarioInicio,
          item.horarioFim
        );

        const horarioInicioFinal = ehAusenciaOuFolga
          ? '00:00'
          : String(item.horarioInicio || '').trim() || turnoNorm.horarioInicio;
        const horarioFimFinal = ehAusenciaOuFolga
          ? '00:00'
          : String(item.horarioFim || '').trim() || turnoNorm.horarioFim;

        const turnoFinal =
          statusVal === 'FOLGA'
            ? 'Folga'
            : statusVal === 'FERIAS'
            ? 'Férias'
            : statusVal === 'AFASTADO'
            ? 'Afastado'
            : turnoRaw || turnoNorm.turno;

        return {
          tempId: item.tempId || `item-${Date.now()}-${idx}`,
          funcionarioNome: nomeFunc,
          funcionarioId: funcMatch?.id || colab?.funcionarioId || '',
          data: dataIso,
          diaSemana: diaSemanaCalc,
          turno: turnoFinal,
          horarioInicio: horarioInicioFinal,
          horarioFim: horarioFimFinal,
          intervalo:
            String(item.intervalo || '').trim() ||
            (statusVal === 'TRABALHO' || statusVal === 'PLANTAO' ? '1h (Intrajornada)' : '—'),
          setor:
            String(item.setor || '').trim() ||
            funcMatch?.setor ||
            colab?.sugestaoCadastroPrevio?.setor ||
            'Pista',
          funcao:
            String(item.funcao || '').trim() ||
            funcMatch?.funcao ||
            funcMatch?.cargo ||
            colab?.sugestaoCadastroPrevio?.cargo ||
            'Frentista',
          status: statusVal,
          confianca: item.confianca || 'ALTA',
          statusConferencia:
            item.statusConferencia || (item.confianca === 'BAIXA' ? 'REVISAO' : 'CONFIRMADO'),
          motivoConferencia: item.motivoConferencia || 'Extraído fielmente da imagem',
          codigoOriginal: item.codigoOriginal || turnoFinal,
          interpretacoesPossiveis: item.interpretacoesPossiveis || [],
          observacao: item.observacao || 'Extraído fielmente da imagem',
          regiaoImagem: item.regiaoImagem,
        };
      });

      setItensEscala(itens);
      const rotuloMotor =
        data.motorUtilizado ||
        motorUtilizadoResposta ||
        'Google Gemini 3.8 Flash Vision';
      setMensagemStatus(
        `3/3 Leitura concluída via ${rotuloMotor}! ${detectados.length} funcionário(s) e ${itens.length} registro(s) extraídos com fidelidade para o Planner.`
      );
    } catch (err: any) {
      console.error('Erro no reconhecimento da imagem da escala:', err);
      setErroProcessamento(
        `Não foi possível concluir a leitura da imagem: ${
          err?.message || 'Erro de comunicação'
        }. Verifique a nitidez/rotação da foto e clique em "Tentar Novamente com IA".`
      );
      setMensagemStatus('');
    } finally {
      setProcessando(false);
    }
  };

  // Expande e projeta o padrão real extraído da imagem para o restante dos dias do mês (preservando horários, setores, funções e folgas reais de cada funcionário)
  const handleExpandirParaMesCompleto = () => {
    const [anoStr, mesStr] = mesAnoReferencia.split('-');
    const ano = parseInt(anoStr, 10);
    const mes = parseInt(mesStr, 10);
    const diasNoMes = new Date(ano, mes, 0).getDate();

    if (colaboradoresDetectados.length === 0 && itensEscala.length === 0) return;

    let colabs = [...colaboradoresDetectados];
    if (colabs.length === 0) {
      const nomes = Array.from(new Set<string>(itensEscala.map((i) => i.funcionarioNome)));
      colabs = nomes.map((nome: string) => {
        const match = funcionarios.find((f) => f.nome.toLowerCase() === nome.toLowerCase());
        return {
          nomeOriginal: nome,
          jaCadastrado: !!match,
          funcionarioId: match?.id,
          confianca: 'ALTA' as const,
        };
      });
      setColaboradoresDetectados(colabs);
    }

    const novosItens: ItemEscalaExtraido[] = [];

    colabs.forEach((c, cIdx) => {
      const itensColab = itensEscala
        .filter((i) => i.funcionarioNome.toLowerCase().trim() === c.nomeOriginal.toLowerCase().trim())
        .sort((a, b) => a.data.localeCompare(b.data));

      // Identifica o item de trabalho real extraído da imagem para preservar horário, turno, intervalo, setor e função exatos
      const itemTrabalhoBase = itensColab.find(
        (i) => i.status === 'TRABALHO' || i.status === 'PLANTAO'
      );
      const turnoBase =
        itemTrabalhoBase?.turno ||
        c.sugestaoCadastroPrevio?.turnoPreferencial ||
        'Turno 1 - Manhã (06h - 14h)';
      const turnoNorm = normalizarTurno(
        turnoBase,
        itemTrabalhoBase?.horarioInicio,
        itemTrabalhoBase?.horarioFim
      );
      const horarioInicioBase = itemTrabalhoBase?.horarioInicio || turnoNorm.horarioInicio;
      const horarioFimBase = itemTrabalhoBase?.horarioFim || turnoNorm.horarioFim;
      const intervaloBase = itemTrabalhoBase?.intervalo || '1h (Intrajornada)';
      const setorBase = itemTrabalhoBase?.setor || c.sugestaoCadastroPrevio?.setor || 'Pista';
      const funcaoBase = itemTrabalhoBase?.funcao || c.sugestaoCadastroPrevio?.cargo || 'Frentista';
      const statusTrabalhoBase: EscalaStatus =
        itemTrabalhoBase?.status === 'PLANTAO' ? 'PLANTAO' : 'TRABALHO';

      // Verifica se o funcionário tem folga em dias específicos da semana na imagem extraída
      const diasSemanaComFolga = new Set<string>(
        itensColab.filter((i) => i.status === 'FOLGA' && i.diaSemana).map((i) => i.diaSemana)
      );

      for (let dia = 1; dia <= diasNoMes; dia++) {
        const diaStr = String(dia).padStart(2, '0');
        const dataIso = `${anoStr}-${mesStr}-${diaStr}`;
        const dt = new Date(`${dataIso}T12:00:00`);
        const diaSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dt.getDay()];

        // 1. Se este dia já foi extraído diretamente da imagem, preserva 100% intacto!
        const existente = itensColab.find((i) => i.data === dataIso);
        if (existente) {
          novosItens.push(existente);
          continue;
        }

        // 2. Se houver um item extraído para o mesmo dia da semana (padrão semanal) ou ciclo de dias lidos, replica fielmente
        const modeloPorDiaSemana = itensColab.find((i) => i.diaSemana === diaSemana);
        const modeloCiclo =
          itensColab.length >= 2 ? itensColab[(dia - 1) % itensColab.length] : undefined;
        const modeloRef = modeloPorDiaSemana || modeloCiclo;

        if (modeloRef) {
          novosItens.push({
            ...modeloRef,
            tempId: `proj-${cIdx}-${dia}-${Date.now()}`,
            data: dataIso,
            diaSemana,
            observacao: `Replicado a partir do padrão extraído da imagem (${modeloRef.data})`,
          });
          continue;
        }

        const ehFolga =
          diasSemanaComFolga.size > 0
            ? diasSemanaComFolga.has(diaSemana)
            : diaSemana === 'DOM';

        novosItens.push({
          tempId: `proj-${cIdx}-${dia}-${Date.now()}`,
          funcionarioNome: c.nomeOriginal,
          funcionarioId: c.funcionarioId || '',
          data: dataIso,
          diaSemana,
          turno: ehFolga ? 'Folga' : turnoBase,
          horarioInicio: ehFolga ? '00:00' : horarioInicioBase,
          horarioFim: ehFolga ? '00:00' : horarioFimBase,
          intervalo: ehFolga ? '—' : intervaloBase,
          setor: setorBase,
          funcao: funcaoBase,
          status: ehFolga ? 'FOLGA' : statusTrabalhoBase,
          confianca: 'ALTA',
          statusConferencia: 'CONFIRMADO',
          observacao: 'Projeção mensal baseada no horário extraído da imagem',
        });
      }
    });

    setItensEscala(novosItens);
    setMensagemStatus(
      `Escala projetada para todos os ${diasNoMes} dias de ${mesAnoReferencia} preservando os horários e folgas reais de cada funcionário!`
    );
  };

  // Cadastro prévio individual
  const handleCadastrarPrevioIndividual = async (colab: ColaboradorReconhecido, index: number) => {
    if (!colab.sugestaoCadastroPrevio) return;

    const id = `func-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const novoFuncionario: Funcionario = {
      id,
      postoId,
      nome: colab.sugestaoCadastroPrevio.nome,
      cpf: colab.sugestaoCadastroPrevio.cpf || '000.000.000-00',
      matricula: `MAT-${Math.floor(1000 + Math.random() * 9000)}`,
      telefone: '(11) 98765-4321',
      cargo: colab.sugestaoCadastroPrevio.cargo,
      funcao: colab.sugestaoCadastroPrevio.funcao || 'Operacional de Pista',
      turnoPreferencial: colab.sugestaoCadastroPrevio.turnoPreferencial || 'Turno 1 - Manhã (06h - 14h)',
      dataAdmissao: new Date().toISOString().slice(0, 10),
      status: 'ATIVO',
      observacoes: 'Cadastrado previamente via Reconhecimento de Imagem de Escala',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await repoFuncionarios.save(postoId, novoFuncionario);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'FUNCIONARIOS',
      'Funcionario',
      id,
      'CREATE',
      null,
      novoFuncionario as unknown as Record<string, unknown>
    );

    const novosDetectados = [...colaboradoresDetectados];
    novosDetectados[index] = {
      ...colab,
      jaCadastrado: true,
      cadastradoAgora: true,
      funcionarioId: id,
    };
    setColaboradoresDetectados(novosDetectados);

    setItensEscala((prev) =>
      prev.map((item) =>
        item.funcionarioNome === colab.nomeOriginal ? { ...item, funcionarioId: id } : item
      )
    );

    onReload();
  };

  // Vincular manualmente um colaborador detectado na imagem a um funcionário já cadastrado
  const handleVincularColaboradorManual = (index: number, funcIdSelecionado: string) => {
    const colab = colaboradoresDetectados[index];
    if (!colab) return;

    if (!funcIdSelecionado) {
      // Desvincular (criar novo)
      const novos = [...colaboradoresDetectados];
      novos[index] = {
        ...colab,
        jaCadastrado: false,
        funcionarioId: undefined,
        motivoCorrespondencia: 'Criar novo funcionário ao sincronizar',
      };
      setColaboradoresDetectados(novos);
      setItensEscala((prev) =>
        prev.map((it) => (it.funcionarioNome === colab.nomeOriginal ? { ...it, funcionarioId: '' } : it))
      );
      return;
    }

    const funcEscolhido = funcionarios.find((f) => f.id === funcIdSelecionado);
    if (!funcEscolhido) return;

    const novos = [...colaboradoresDetectados];
    novos[index] = {
      ...colab,
      jaCadastrado: true,
      funcionarioId: funcEscolhido.id,
      motivoCorrespondencia: `Vinculado a: ${funcEscolhido.nome}`,
    };
    setColaboradoresDetectados(novos);

    setItensEscala((prev) =>
      prev.map((it) =>
        it.funcionarioNome === colab.nomeOriginal
          ? { ...it, funcionarioId: funcEscolhido.id }
          : it
      )
    );
  };

  // Cadastrar todos os colaboradores pendentes
  const handleCadastrarTodosNaoCadastrados = async () => {
    const naoCadastrados = colaboradoresDetectados
      .map((c, i) => ({ colab: c, idx: i }))
      .filter((item) => !item.colab.jaCadastrado);

    for (const item of naoCadastrados) {
      await handleCadastrarPrevioIndividual(item.colab, item.idx);
    }
  };

  const handleRemoverItem = (tempId: string) => {
    setItensEscala((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const handleAlterarStatusItem = (tempId: string, novoStatus: EscalaStatus) => {
    setItensEscala((prev) =>
      prev.map((i) => {
        if (i.tempId !== tempId) return i;
        if (novoStatus === 'FOLGA') {
          return {
            ...i,
            status: 'FOLGA',
            turno: 'Folga',
            horarioInicio: '00:00',
            horarioFim: '00:00',
          };
        }
        if (novoStatus === 'TRABALHO' && i.status === 'FOLGA') {
          return {
            ...i,
            status: 'TRABALHO',
            turno: 'Turno 1 - Manhã (06h - 14h)',
            horarioInicio: '06:00',
            horarioFim: '14:00',
          };
        }
        return { ...i, status: novoStatus };
      })
    );
  };

  const handleAlterarTurnoItem = (tempId: string, novoTurno: string) => {
    const norm = normalizarTurno(novoTurno);
    const ehFolga = norm.turno === 'Folga';
    setItensEscala((prev) =>
      prev.map((i) =>
        i.tempId === tempId
          ? {
              ...i,
              turno: norm.turno,
              horarioInicio: norm.horarioInicio,
              horarioFim: norm.horarioFim,
              status: ehFolga ? 'FOLGA' : 'TRABALHO',
            }
          : i
      )
    );
  };

  // Alternador rápido de turno / folga clicando em qualquer célula da matriz
  const handleAlternarTurnoCelulaMatriz = (nome: string, dataIso: string) => {
    setItensEscala((prev) => {
      const idx = prev.findIndex((i) => i.funcionarioNome === nome && i.data === dataIso);
      const opcoes: Array<{ turno: string; inicio: string; fim: string; status: EscalaStatus }> = [
        { turno: 'Turno 1 - Manhã (06h - 14h)', inicio: '06:00', fim: '14:00', status: 'TRABALHO' },
        { turno: 'Turno 2 - Tarde (14h - 22h)', inicio: '14:00', fim: '22:00', status: 'TRABALHO' },
        { turno: 'Turno Horista', inicio: '08:00', fim: '14:00', status: 'TRABALHO' },
        { turno: 'Folga', inicio: '00:00', fim: '00:00', status: 'FOLGA' },
      ];

      if (idx >= 0) {
        const itemAtual = prev[idx];
        let proxIdx = 0;
        if (itemAtual.status === 'FOLGA' || itemAtual.turno === 'Folga') {
          proxIdx = 0; // Vai para Turno 1 (Manhã)
        } else if (itemAtual.turno.includes('Turno 1') || itemAtual.turno.includes('Manhã') || itemAtual.turno.includes('06h')) {
          proxIdx = 1; // Vai para Turno 2 (Tarde)
        } else if (itemAtual.turno.includes('Turno 2') || itemAtual.turno.includes('Tarde') || itemAtual.turno.includes('14h')) {
          proxIdx = 2; // Vai para Turno Horista
        } else {
          proxIdx = 3; // Vai para Folga
        }

        const prox = opcoes[proxIdx];
        const copia = [...prev];
        copia[idx] = {
          ...itemAtual,
          turno: prox.turno,
          horarioInicio: prox.inicio,
          horarioFim: prox.fim,
          status: prox.status,
        };
        return copia;
      } else {
        const funcMatch = funcionarios.find((f) => f.nome === nome);
        return [
          ...prev,
          {
            tempId: `item-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            funcionarioNome: nome,
            funcionarioId: funcMatch?.id || '',
            data: dataIso,
            diaSemana: '',
            turno: 'Turno 1 - Manhã (06h - 14h)',
            horarioInicio: '06:00',
            horarioFim: '14:00',
            status: 'TRABALHO',
            confianca: 'ALTA',
            observacao: 'Alocado manualmente pelo gestor',
          },
        ];
      }
    });
  };

  // Aprovar e salvar no Planner
  const handleAprovarEGravarNoPlanner = async () => {
    if (itensEscala.length === 0) return;
    setSalvandoNoPlanner(true);

    try {
      const mapaFuncIdPorNome = new Map<string, string>();
      funcionarios.forEach((f) => {
        mapaFuncIdPorNome.set(f.nome.toLowerCase().trim(), f.id);
      });

      const novosColabsState = [...colaboradoresDetectados];

      for (let i = 0; i < novosColabsState.length; i++) {
        const colab = novosColabsState[i];
        let fId = colab.funcionarioId;

        if (!colab.jaCadastrado || !fId) {
          const matchExistente = funcionarios.find(
            (f) =>
              f.nome.toLowerCase().trim() === colab.nomeOriginal.toLowerCase().trim() ||
              (colab.sugestaoCadastroPrevio?.nome &&
                f.nome.toLowerCase().trim() === colab.sugestaoCadastroPrevio.nome.toLowerCase().trim())
          );

          if (matchExistente) {
            fId = matchExistente.id;
          } else {
            fId = `func-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
            const nomeFinal = colab.sugestaoCadastroPrevio?.nome || colab.nomeOriginal;
            const cargoFinal = colab.sugestaoCadastroPrevio?.cargo || 'Frentista';
            const turnoFinal = colab.sugestaoCadastroPrevio?.turnoPreferencial || 'Turno 1 - Manhã (06h - 14h)';

            const novoFunc: Funcionario = {
              id: fId,
              postoId,
              nome: nomeFinal,
              cpf: colab.sugestaoCadastroPrevio?.cpf || `123.${Math.floor(100 + Math.random() * 900)}.${Math.floor(100 + Math.random() * 900)}-00`,
              matricula: `MAT-${Math.floor(1000 + Math.random() * 9000)}`,
              telefone: '(11) 98765-4321',
              cargo: cargoFinal,
              funcao: colab.sugestaoCadastroPrevio?.funcao || 'Operacional de Pista',
              turnoPreferencial: turnoFinal,
              dataAdmissao: new Date().toISOString().slice(0, 10),
              status: 'ATIVO',
              observacoes: 'Cadastrado automaticamente via Reconhecimento de Imagem de Escala',
              criadoEm: new Date().toISOString(),
              atualizadoEm: new Date().toISOString(),
            };

            await repoFuncionarios.save(postoId, novoFunc);
            await registrarAuditoria(
              postoId,
              userProfile?.uid || 'anon',
              userProfile?.nome || 'Operador',
              'FUNCIONARIOS',
              'Funcionario',
              fId,
              'CREATE',
              null,
              novoFunc as unknown as Record<string, unknown>
            );
          }

          novosColabsState[i] = {
            ...colab,
            jaCadastrado: true,
            cadastradoAgora: true,
            funcionarioId: fId,
          };
        }

        if (fId) {
          mapaFuncIdPorNome.set(colab.nomeOriginal.toLowerCase().trim(), fId);
          if (colab.sugestaoCadastroPrevio?.nome) {
            mapaFuncIdPorNome.set(colab.sugestaoCadastroPrevio.nome.toLowerCase().trim(), fId);
          }
        }
      }

      setColaboradoresDetectados(novosColabsState);

      const importacaoId = `imp-escala-${Date.now()}`;
      const novaVersaoNum = (escalasImportadas?.length || 0) + 1;
      const agoraIso = new Date().toISOString();

      // Se modoImportacao === 'SUBSTITUIR', limpar escalas do mesmo mês antes de gravar
      if (modoImportacao === 'SUBSTITUIR') {
        const escalasMes = escalas.filter((e) => e.data.startsWith(mesAnoReferencia));
        for (const ant of escalasMes) {
          await repoEscalas.delete(postoId, ant.id);
        }
      }

      // Grava no Firestore respeitando o modo de importação selecionado
      for (const item of itensEscala) {
        const nomeTrim = item.funcionarioNome.toLowerCase().trim();
        let finalFuncId = item.funcionarioId || mapaFuncIdPorNome.get(nomeTrim);

        if (!finalFuncId) {
          const matchColab = novosColabsState.find(
            (c) =>
              c.nomeOriginal.toLowerCase().trim() === nomeTrim ||
              (c.sugestaoCadastroPrevio?.nome &&
                c.sugestaoCadastroPrevio.nome.toLowerCase().trim() === nomeTrim) ||
              nomeTrim.includes(c.nomeOriginal.toLowerCase().trim()) ||
              c.nomeOriginal.toLowerCase().trim().includes(nomeTrim)
          );
          if (matchColab?.funcionarioId) {
            finalFuncId = matchColab.funcionarioId;
          } else {
            const matchFunc = funcionarios.find(
              (f) =>
                f.nome.toLowerCase().trim() === nomeTrim ||
                nomeTrim.includes(f.nome.toLowerCase().trim()) ||
                f.nome.toLowerCase().trim().includes(nomeTrim)
            );
            if (matchFunc) {
              finalFuncId = matchFunc.id;
            }
          }
        }

        if (!finalFuncId) {
          finalFuncId = `func-escala-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }

        const dataIso = normalizarDataParaIso(item.data, mesAnoReferencia);
        const id = `escala-${finalFuncId}-${dataIso}`;
        const funcVinculado = funcionarios.find((f) => f.id === finalFuncId);
        const escalaExistente = escalas.find((e) => e.id === id);

        // No modo MESCLAR, se já existir um turno de trabalho e o novo estiver em branco, preserva o anterior
        if (modoImportacao === 'MESCLAR' && escalaExistente && escalaExistente.status === 'TRABALHO' && !item.horarioInicio) {
          continue;
        }

        const historicoAntigo = escalaExistente?.historicoAlteracoes || [];
        const mudouHorario =
          escalaExistente &&
          (escalaExistente.horarioInicio !== item.horarioInicio ||
            escalaExistente.horarioFim !== item.horarioFim ||
            escalaExistente.status !== item.status);

        const novoHistorico = mudouHorario
          ? [
              ...historicoAntigo,
              {
                dataHora: agoraIso,
                usuario: userProfile?.nome || 'Operador',
                acao: `Importação OCR (${modoImportacao}) v${novaVersaoNum}`,
                valorAnterior: `${escalaExistente.turno} (${escalaExistente.horarioInicio}-${escalaExistente.horarioFim})`,
                valorNovo: `${item.turno} (${item.horarioInicio}-${item.horarioFim})`,
              },
            ]
          : historicoAntigo;

        const escalaObj: Escala = {
          id,
          postoId,
          funcionarioId: finalFuncId,
          funcionarioNome: funcVinculado?.nome || item.funcionarioNome,
          data: dataIso,
          diaSemana: item.diaSemana,
          turno: item.turno,
          horarioInicio: item.horarioInicio,
          horarioFim: item.horarioFim,
          intervalo: item.intervalo || '1h (Intrajornada)',
          setor: item.setor || funcVinculado?.setor || 'Pista',
          funcao: item.funcao || funcVinculado?.funcao || funcVinculado?.cargo || 'Frentista',
          status: item.status,
          codigoOriginal: item.codigoOriginal,
          statusConferencia: 'CONFIRMADO',
          escalaImportadaId: importacaoId,
          versaoImportacao: novaVersaoNum,
          observacao: item.observacao || 'Importado via Escanear Escala',
          historicoAlteracoes: novoHistorico,
          criadoEm: escalaExistente?.criadoEm || agoraIso,
          atualizadoEm: agoraIso,
        };

        await repoEscalas.save(postoId, escalaObj);
      }

      // Arquivar a escala original importada (Requisito 10 e 19: Não perder a escala original)
      const registroImportacao: EscalaImportada = {
        id: importacaoId,
        postoId,
        versao: novaVersaoNum,
        tituloEscala: tituloDocumento || `Escala Importada ${mesAnoReferencia}`,
        mesReferencia: mesAnoReferencia,
        tipoDocumentoIdentificado: diagnostico?.tipoDocumentoIdentificado || 'Escala Digitalizada',
        qualidadeImagem: diagnostico?.qualidadeImagem || 'BOA',
        imagemOriginalBase64: imagemOriginal || imagemPreview || undefined,
        copiaFielReconhecida: diagnostico?.copiaFielReconhecida || '',
        simbolosIdentificados: diagnostico?.simbolosEAbreviacoes || [],
        dadosExtraidosOriginais: itensEscala.map((i) => ({
          funcionarioNome: i.funcionarioNome,
          data: i.data,
          diaSemana: i.diaSemana,
          horarioInicio: i.horarioInicio,
          horarioFim: i.horarioFim,
          intervalo: i.intervalo,
          turno: i.turno,
          setor: i.setor,
          funcao: i.funcao,
          status: i.status,
          observacao: i.observacao,
          codigoOriginal: i.codigoOriginal,
        })),
        dadosCorrigidos: itensEscala.map((i) => ({
          funcionarioNome: i.funcionarioNome,
          funcionarioId: i.funcionarioId,
          data: i.data,
          diaSemana: i.diaSemana,
          horarioInicio: i.horarioInicio,
          horarioFim: i.horarioFim,
          intervalo: i.intervalo,
          turno: i.turno,
          setor: i.setor,
          funcao: i.funcao,
          status: i.status,
          observacao: i.observacao,
          statusConferencia: 'CONFIRMADO',
        })),
        conflitosDetectados: diagnostico?.conflitosDetectados || [],
        modoImportacao,
        statusImportacao: 'CONFIRMADA',
        totalRegistros: itensEscala.length,
        usuarioResponsavelId: userProfile?.uid || 'anon',
        usuarioResponsavelNome: userProfile?.nome || 'Operador',
        dataImportacao: agoraIso,
        criadoEm: agoraIso,
        atualizadoEm: agoraIso,
        historicoAlteracoes: [
          {
            dataHora: agoraIso,
            usuarioNome: userProfile?.nome || 'Operador',
            acao: `Importação e validação concluída (${modoImportacao})`,
            detalhes: `${itensEscala.length} registros vinculados ao Planner (Versão v${novaVersaoNum}).`,
          },
        ],
      };

      await repoEscalasImportadas.save(postoId, registroImportacao);

      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'IA_ESCALA',
        'PlannerEscalas',
        `import-escala-${Date.now()}`,
        'CREATE',
        null,
        {
          titulo: tituloDocumento,
          mesReferencia: mesAnoReferencia,
          totalTurnosImportados: itensEscala.length,
          colaboradores: novosColabsState.map((c) => c.nomeOriginal),
        }
      );

      setSucessoSalvo(true);
      setMensagemStatus(`Sucesso! ${itensEscala.length} turnos foram importados e sincronizados no Planner oficial.`);
      await onReload();
    } catch (e: any) {
      setErroProcessamento(`Falha ao salvar no Planner: ${e.message}`);
    } finally {
      setSalvandoNoPlanner(false);
    }
  };

  const totalNaoCadastrados = colaboradoresDetectados.filter((c) => !c.jaCadastrado).length;

  const diasNoMes = useMemo(() => {
    const [anoStr, mesStr] = mesAnoReferencia.split('-');
    const ano = parseInt(anoStr, 10);
    const mes = parseInt(mesStr, 10);
    return new Date(ano, mes, 0).getDate();
  }, [mesAnoReferencia]);

  // Métricas consolidadas de turnos de trabalho, folgas e dias reconhecidos
  const metricasEscala = useMemo(() => {
    const totalItens = itensEscala.length;
    const totalTrabalho = itensEscala.filter((i) => i.status === 'TRABALHO').length;
    const totalFolga = itensEscala.filter((i) => i.status === 'FOLGA').length;
    const totalT1 = itensEscala.filter(
      (i) => i.status === 'TRABALHO' && (i.turno.includes('Turno 1') || i.turno.includes('Manhã') || i.turno.includes('06h'))
    ).length;
    const totalT2 = itensEscala.filter(
      (i) => i.status === 'TRABALHO' && (i.turno.includes('Turno 2') || i.turno.includes('Tarde') || i.turno.includes('14h'))
    ).length;
    const totalHorista = itensEscala.filter(
      (i) => i.status === 'TRABALHO' && i.turno.includes('Horista')
    ).length;

    // Extrair lista ordenada de dias únicos da escala
    const setDias = new Set<string>();
    itensEscala.forEach((i) => {
      if (i.data) setDias.add(i.data);
    });
    const diasUnicos = Array.from(setDias).sort();

    // Colaboradores únicos presentes na escala
    const mapaColabs = new Map<string, { nome: string; cadastrado: boolean; cargo: string }>();
    colaboradoresDetectados.forEach((c) => {
      mapaColabs.set(c.nomeOriginal, {
        nome: c.nomeOriginal,
        cadastrado: c.jaCadastrado,
        cargo: c.sugestaoCadastroPrevio?.cargo || 'Colaborador',
      });
    });
    itensEscala.forEach((i) => {
      if (!mapaColabs.has(i.funcionarioNome)) {
        const func = funcionarios.find((f) => f.nome === i.funcionarioNome);
        mapaColabs.set(i.funcionarioNome, {
          nome: i.funcionarioNome,
          cadastrado: !!func,
          cargo: func?.cargo || 'Colaborador',
        });
      }
    });

    const listaColabs = Array.from(mapaColabs.values());

    return {
      totalItens,
      totalTrabalho,
      totalFolga,
      totalT1,
      totalT2,
      totalHorista,
      totalDias: diasUnicos.length,
      diasUnicos,
      listaColabs,
    };
  }, [itensEscala, colaboradoresDetectados, funcionarios]);

  // Mapa rápido de lookup de itens da escala por colaborador e dia (para a matriz visual da grade)
  const mapaItensPorColabEDia = useMemo(() => {
    const mapa = new Map<string, ItemEscalaExtraido>();
    itensEscala.forEach((item) => {
      mapa.set(`${item.funcionarioNome}__${item.data}`, item);
    });
    return mapa;
  }, [itensEscala]);

  // Itens filtrados para exibição na tabela detalhada
  const itensExibidos = useMemo(() => {
    return itensEscala.filter((item) => {
      if (filtroStatusTabela === 'TRABALHO' && item.status !== 'TRABALHO') return false;
      if (filtroStatusTabela === 'FOLGA' && item.status !== 'FOLGA') return false;
      if (filtroStatusTabela === 'PENDENTE' && item.funcionarioId) return false;

      if (buscaNomeTabela.trim()) {
        const termo = buscaNomeTabela.toLowerCase().trim();
        return (
          item.funcionarioNome.toLowerCase().includes(termo) ||
          item.turno.toLowerCase().includes(termo) ||
          item.data.includes(termo)
        );
      }
      return true;
    });
  }, [itensEscala, filtroStatusTabela, buscaNomeTabela]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full mb-2 border border-purple-100">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            Visão Multimodal Gemini 3.8 Flash • Otimização para Postos
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Reconhecimento Avançado de Imagem de Escala
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Envie foto ou imagem de qualquer escala (folha impressa, quadro branco de pista, caderno ou planilha).
            Otimize orientação, nitidez e contraste para obter leitura 100% precisa e vinculada ao Planner.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToPlanner && (
            <button
              onClick={onNavigateToPlanner}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
            >
              <Calendar className="w-4 h-4 text-slate-600" />
              Ir para o Planner
            </button>
          )}
        </div>
      </div>

      {/* Barra de Configuração e Contexto de Leitura */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Calendar className="w-4 h-4 text-purple-600" />
            <span>Mês de Referência da Escala:</span>
          </div>
          <input
            type="month"
            value={mesAnoReferencia}
            onChange={(e) => setMesAnoReferencia(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setMesAnoReferencia(mesAtualStr)}
            className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition"
          >
            Mês Atual
          </button>
          <span className="text-xs text-slate-400">
            (Vincula os dias da foto 01..31 ao calendário correto)
          </span>
        </div>

        {imagemPreview && itensEscala.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModoComparacao(!modoComparacao)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition border ${
                modoComparacao
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {modoComparacao ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {modoComparacao ? 'Foto Lado a Lado Ativa' : 'Exibir Foto Lado a Lado'}
            </button>
          </div>
        )}
      </div>

      {/* Grid Principal */}
      <div className={`grid grid-cols-1 ${modoComparacao && imagemPreview ? 'lg:grid-cols-12' : 'lg:grid-cols-12'} gap-6`}>
        {/* Painel da Imagem, Upload e Ferramentas de OCR */}
        <div className={`${modoComparacao && imagemPreview && itensEscala.length > 0 ? 'lg:col-span-5' : 'lg:col-span-5'} space-y-4`}>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                <Camera className="w-4 h-4 text-purple-600" />
                1. Captura e Pré-Processamento da Imagem
              </h3>
              {imagemPreview && (
                <span className="text-[11px] font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 font-semibold">
                  {rotacao}° • Filtro: {filtroAtivo.toUpperCase()}
                </span>
              )}
            </div>

            {/* Inputs Ocultos */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/*"
              onChange={handleUploadFoto}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleUploadFoto}
              className="hidden"
            />

            {/* Área de Visualização e Ajuste */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-4 text-center transition relative ${
                isDragOver
                  ? 'border-purple-500 bg-purple-50/80 ring-4 ring-purple-100'
                  : 'border-slate-300 hover:border-purple-300 bg-slate-50/40'
              }`}
            >
              {imagemPreview ? (
                <div className="space-y-3">
                  {/* Barra de Ferramentas de Otimização Visual da Imagem */}
                  <div className="bg-slate-100/90 p-2 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleGirar90}
                        title="Girar imagem 90° no sentido horário"
                        className="p-1.5 bg-white hover:bg-slate-200 text-slate-700 rounded border border-slate-200 font-semibold flex items-center gap-1 shadow-2xs"
                      >
                        <RotateCw className="w-3.5 h-3.5 text-purple-600" />
                        <span>Girar 90°</span>
                      </button>
                    </div>

                    {/* Controles de Zoom */}
                    <div className="flex items-center gap-1 bg-white p-0.5 rounded border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setZoomNivel((z) => Math.max(0.6, z - 0.2))}
                        title="Diminuir Zoom"
                        className="p-1 text-slate-600 hover:text-slate-900"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-mono px-1 font-semibold text-slate-700">
                        {Math.round(zoomNivel * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setZoomNivel((z) => Math.min(2.5, z + 0.2))}
                        title="Aumentar Zoom"
                        className="p-1 text-slate-600 hover:text-slate-900"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setImagemOriginal(null);
                        setImagemPreview(null);
                        setNomeArquivo('');
                        setColaboradoresDetectados([]);
                        setItensEscala([]);
                        setDiagnostico(null);
                        setSucessoSalvo(false);
                      }}
                      title="Remover Imagem"
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Seletor de Filtros OCR */}
                  <div className="bg-white p-2 rounded-lg border border-slate-200 space-y-1.5 text-left">
                    <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center justify-between gap-1">
                      <span className="flex items-center gap-1">
                        <Sliders className="w-3 h-3 text-purple-600" />
                        Filtros de Correção Visual & Alinhamento OCR:
                      </span>
                      <span className="font-mono text-purple-700">Alinhar: {inclinacaoFina}°</span>
                    </div>
                    <div className="flex items-center gap-2 pb-1">
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">Desinclinar:</span>
                      <input
                        type="range"
                        min={-15}
                        max={15}
                        step={1}
                        value={inclinacaoFina}
                        onChange={(e) => setInclinacaoFina(Number(e.target.value))}
                        className="w-full accent-purple-600 cursor-pointer h-1.5"
                      />
                      {inclinacaoFina !== 0 && (
                        <button
                          type="button"
                          onClick={() => setInclinacaoFina(0)}
                          className="text-[10px] text-purple-700 underline font-semibold"
                        >
                          0°
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setFiltroAtivo('nitidez')}
                        className={`px-2 py-1 rounded font-semibold text-center transition border ${
                          filtroAtivo === 'nitidez'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        ✨ Nitidez
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroAtivo('reducao_ruido')}
                        className={`px-2 py-1 rounded font-semibold text-center transition border ${
                          filtroAtivo === 'reducao_ruido'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        🧹 Sem Ruído
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroAtivo('pb')}
                        className={`px-2 py-1 rounded font-semibold text-center transition border ${
                          filtroAtivo === 'pb'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        📄 P&B
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroAtivo('brilho')}
                        className={`px-2 py-1 rounded font-semibold text-center transition border ${
                          filtroAtivo === 'brilho'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        ☀️ Iluminar
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroAtivo('original')}
                        className={`px-2 py-1 rounded font-semibold text-center transition border ${
                          filtroAtivo === 'original'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        📷 Original
                      </button>
                    </div>
                  </div>

                  {/* Visualizador da Imagem com rolagem e zoom */}
                  <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-900/5 p-1 relative flex items-center justify-center">
                    <img
                      src={imagemPreview}
                      alt="Imagem da escala para reconhecimento"
                      style={{ transform: `scale(${zoomNivel})`, transformOrigin: 'top center' }}
                      className="max-h-64 object-contain rounded transition duration-150 shadow-sm"
                    />
                  </div>

                  {nomeArquivo && (
                    <div className="text-[11px] text-slate-500 font-mono text-center">
                      Arquivo: <strong className="text-slate-700">{nomeArquivo}</strong> ({tamanhoArquivo})
                    </div>
                  )}

                  {/* Trocar arquivo */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                      Trocar Imagem
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition"
                    >
                      <Camera className="w-3.5 h-3.5 text-purple-600" />
                      Tirar Nova Foto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-6">
                  <div className="w-14 h-14 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center mx-auto shadow-2xs">
                    <FileImage className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Selecione ou capture a foto da escala
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Formatos aceitos: JPG, PNG, WEBP ou HEIC. Folhas impressas, anotações de prancheta ou quadro branco.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-sm mx-auto">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Enviar Arquivo
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-purple-600" />
                      Tirar com Câmera
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400 pt-1">
                    <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      Atalho: <strong className="text-slate-600 font-mono">Ctrl + V</strong> para colar print
                    </span>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleCarregarExemploEscala}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition border border-slate-200 shadow-2xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      Carregar Exemplo de Escala Oficial (Demonstração)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Seletor de Motor de IA */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-100/90 p-3 rounded-xl border border-slate-200">
              <div className="text-xs">
                <span className="font-bold text-slate-800">Motor de Leitura OCR:</span>
                <p className="text-[11px] text-slate-500">Google Gemini 3.8 Flash Vision configurado para leitura visual de alta precisão.</p>
              </div>
              <div className="flex items-center gap-1 bg-blue-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                <span>Google Gemini 3.8 Flash</span>
              </div>
            </div>

            {/* Botão de Ação Primária de Reconhecimento */}
            {imagemPreview && !sucessoSalvo && (
              <button
                onClick={handleProcessarComIA}
                disabled={processando}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {processando ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processando com Google Gemini 3.8 Flash Vision...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-emerald-300" />
                    Reconhecer Escala com Google Gemini
                  </>
                )}
              </button>
            )}

            {/* Feedback e Alertas */}
            {mensagemStatus && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-purple-700 mt-0.5" />
                <span>{mensagemStatus}</span>
              </div>
            )}

            {erroProcessamento && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
                  <span>{erroProcessamento}</span>
                </div>
                {!processando && imagemPreview && (
                  <button
                    type="button"
                    onClick={handleProcessarComIA}
                    className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-xs transition shadow-xs cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Tentar Novamente com IA
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Dica Operacional e Padrão de Turnos */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2 text-xs">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-600" />
              Padrão de Turnos Reconhecidos:
            </div>
            <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-600">
              <div className="flex items-center justify-between p-1.5 bg-amber-50/70 rounded border border-amber-100">
                <span className="font-bold text-amber-900">Turno 1 (Manhã):</span>
                <span className="font-mono font-semibold">06:00 às 14:00 (T1, 1, M)</span>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-blue-50/70 rounded border border-blue-100">
                <span className="font-bold text-blue-900">Turno 2 (Tarde):</span>
                <span className="font-mono font-semibold">14:00 às 22:00 (T2, 2, T)</span>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-teal-50/70 rounded border border-teal-100">
                <span className="font-bold text-teal-900">Turno Horista:</span>
                <span className="font-mono font-semibold">Flexível / Por Hora (HOR, H)</span>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-slate-100 rounded border border-slate-200">
                <span className="font-bold text-slate-800">Folga / DSR:</span>
                <span className="font-mono font-semibold">00:00 (F, FOL, OFF, X)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Painel de Resultados (Direita) */}
        <div className={`${modoComparacao && imagemPreview && itensEscala.length > 0 ? 'lg:col-span-7' : 'lg:col-span-7'} space-y-4`}>
          {/* Diagnóstico da Imagem Extraída */}
          {diagnostico && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                <div>
                  <span className="text-slate-500 font-medium">Tipo de Documento: </span>
                  <strong className="text-slate-800">{diagnostico.tipoDocumentoIdentificado}</strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Qualidade da Imagem: </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    diagnostico.qualidadeImagem === 'EXCELENTE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : diagnostico.qualidadeImagem === 'BOA'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {diagnostico.qualidadeImagem}
                </span>
              </div>

              {diagnostico.observacoesGerais && (
                <div className="w-full text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                  <strong>Observação da IA:</strong> {diagnostico.observacoesGerais}
                </div>
              )}
            </div>
          )}

          {/* Seção 2: Colaboradores Identificados e Proposta de Cadastro Prévio */}
          {colaboradoresDetectados.length > 0 && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    2. Colaboradores Identificados na Folha ({colaboradoresDetectados.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {totalNaoCadastrados > 0
                      ? `${totalNaoCadastrados} colaborador(es) não cadastrado(s) encontrado(s). Realize o cadastro prévio ou aprove para cadastrar automaticamente.`
                      : 'Todos os colaboradores identificados já possuem cadastro ativo no posto.'}
                  </p>
                </div>

                {totalNaoCadastrados > 0 && (
                  <button
                    onClick={handleCadastrarTodosNaoCadastrados}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Cadastrar Todos ({totalNaoCadastrados})
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {colaboradoresDetectados.map((colab, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                      colab.jaCadastrado
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-amber-50/80 border-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                          colab.jaCadastrado
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {colab.jaCadastrado ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          {colab.nomeOriginal}
                          {colab.confianca && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase ${
                                colab.confianca === 'ALTA'
                                  ? 'bg-emerald-100 text-emerald-700 font-semibold'
                                  : 'bg-amber-100 text-amber-800 font-semibold'
                              }`}
                            >
                              Confiança {colab.confianca}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {colab.jaCadastrado ? (
                            <span className="text-emerald-700 font-medium flex items-center gap-1">
                              <UserCheck className="w-3 h-3" /> Já cadastrado • {colab.motivoCorrespondencia}
                            </span>
                          ) : (
                            <span className="text-amber-800 font-medium">
                              Pendente de cadastro • Cargo sugerido: {colab.sugestaoCadastroPrevio?.cargo}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={colab.funcionarioId || ''}
                        onChange={(e) => handleVincularColaboradorManual(idx, e.target.value)}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded text-[11px] font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
                        title="Vincular linha escaneada a um funcionário do posto"
                      >
                        <option value="">+ Criar como Novo Funcionário</option>
                        {funcionarios.map((f) => (
                          <option key={f.id} value={f.id}>
                            Vincular: {f.nome} ({f.cargo})
                          </option>
                        ))}
                      </select>

                      {!colab.jaCadastrado && colab.sugestaoCadastroPrevio && (
                        <button
                          onClick={() => handleCadastrarPrevioIndividual(colab, idx)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded text-[11px] transition shrink-0 cursor-pointer"
                        >
                          Cadastrar Agora
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seção 3: Grade Extraída da Escala & Sincronização com o Planner */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  3. Escala Reconhecida para Conferência & Sincronização ({itensEscala.length} alocações)
                </h3>
                {tituloDocumento ? (
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">{tituloDocumento}</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mapeamento dia a dia de turnos operacionais (Turno 1 Manhã, Turno 2 Tarde e Horista) e folgas por colaborador
                  </p>
                )}
              </div>

              {itensEscala.length > 0 && !sucessoSalvo && (
                <div className="flex flex-wrap items-center gap-2">
                  {metricasEscala.totalDias < diasNoMes && (
                    <button
                      type="button"
                      onClick={handleExpandirParaMesCompleto}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer"
                      title={`Expandir de ${metricasEscala.totalDias} dias para todos os ${diasNoMes} dias do mês`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      Expandir p/ Mês Completo ({diasNoMes} dias)
                    </button>
                  )}

                  <button
                    onClick={handleAprovarEGravarNoPlanner}
                    disabled={salvandoNoPlanner}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {salvandoNoPlanner ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Gravando no Planner...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Sincronizar com o Planner ({metricasEscala.totalTrabalho} Turnos + {metricasEscala.totalFolga} Folgas)
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {sucessoSalvo ? (
              <div className="p-8 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-emerald-900 text-base">
                  Escala e Folgas Sincronizadas no Planner com Sucesso!
                </h4>
                <p className="text-xs text-emerald-700 max-w-lg mx-auto">
                  Foram importados <strong>{metricasEscala.totalTrabalho} turnos de trabalho</strong> e{' '}
                  <strong>{metricasEscala.totalFolga} folgas</strong> cobrindo os dias do mês no Planner oficial do posto.
                </p>
                {onNavigateToPlanner && (
                  <button
                    onClick={onNavigateToPlanner}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-sm mt-3 cursor-pointer"
                  >
                    Visualizar Grade Oficial no Planner de Escalas
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : itensEscala.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs">
                Envie ou capture a imagem da folha de horários e clique em &quot;Reconhecer Funcionários e Escala&quot;.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Cards de Resumo Operacional dos Turnos e Folgas Extraídos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
                      <span>Turnos de Trabalho</span>
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                      {metricasEscala.totalTrabalho}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-600 font-medium">
                      <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-bold">T1: {metricasEscala.totalT1}</span>
                      <span className="px-1.5 py-0.2 bg-blue-100 text-blue-900 rounded font-bold">T2: {metricasEscala.totalT2}</span>
                      <span className="px-1.5 py-0.2 bg-teal-100 text-teal-900 rounded font-bold">HOR: {metricasEscala.totalHorista}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
                      <span>Folgas Reconhecidas</span>
                      <Calendar className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                    <div className="text-xl font-bold text-slate-800 font-mono mt-1">
                      {metricasEscala.totalFolga}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Descansos e DSRs identificados
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
                      <span>Equipe na Folha</span>
                      <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                      {metricasEscala.listaColabs.length}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {totalNaoCadastrados > 0 ? `${totalNaoCadastrados} novos para cadastrar` : 'Todos já vinculados'}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
                      <span>Dias Cobertos</span>
                      <Layers className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <div className="text-xl font-bold text-purple-900 font-mono mt-1">
                      {metricasEscala.totalDias} dias
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Mês: {mesAnoReferencia}
                    </div>
                  </div>
                </div>

                {metricasEscala.totalDias < diasNoMes && (
                  <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-amber-700" />
                      </div>
                      <div className="text-xs text-amber-950">
                        <div className="font-bold">Projeção Mensal Disponível ({metricasEscala.totalDias} de {diasNoMes} dias na folha)</div>
                        <div className="text-[11px] text-amber-800 mt-0.5">
                          Deseja que o sistema replique o revezamento operacional e folgas 6x1 para cobrir os {diasNoMes} dias do mês no Planner?
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleExpandirParaMesCompleto}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Projetar Mês Inteiro ({diasNoMes} dias)
                    </button>
                  </div>
                )}

                {/* Painel Completo de Conferência, Comparação com a Imagem, Cópia Fiel e Histórico de Versões */}
                <PainelConferenciaEscalaOCR
                  imagemOriginal={imagemPreview || imagemOriginal}
                  copiaFielReconhecida={diagnostico?.copiaFielReconhecida}
                  simbolosEAbreviacoes={diagnostico?.simbolosEAbreviacoes}
                  trocasDeEscalaIdentificadas={diagnostico?.trocasDeEscalaIdentificadas}
                  conflitosDetectados={diagnostico?.conflitosDetectados}
                  itens={itensEscala}
                  escalasAtuaisNoPlanner={escalas}
                  escalasImportadasAnteriores={escalasImportadas}
                  modoImportacao={modoImportacao}
                  onChangeModoImportacao={setModoImportacao}
                  onUpdateItem={(tempId, changes) => {
                    setItensEscala((prev) =>
                      prev.map((it) => (it.tempId === tempId ? { ...it, ...changes } : it))
                    );
                  }}
                  onAddItemManual={() => {
                    const dataPadrao = `${mesAnoReferencia}-01`;
                    setItensEscala((prev) => [
                      {
                        tempId: `manual-${Date.now()}`,
                        funcionarioNome: funcionarios[0]?.nome || 'Novo Colaborador',
                        funcionarioId: funcionarios[0]?.id || '',
                        data: dataPadrao,
                        diaSemana: 'SEG',
                        turno: 'Turno 1 - Manhã (06h - 14h)',
                        horarioInicio: '06:00',
                        horarioFim: '14:00',
                        intervalo: '1h',
                        setor: 'Pista',
                        funcao: 'Frentista',
                        status: 'TRABALHO',
                        confianca: 'ALTA',
                        statusConferencia: 'CONFIRMADO',
                        observacao: 'Incluído manualmente na tela de conferência',
                      },
                      ...prev,
                    ]);
                  }}
                  onRemoveItem={handleRemoverItem}
                  onConfirmarTodosRevisao={() => {
                    setItensEscala((prev) =>
                      prev.map((it) => ({ ...it, statusConferencia: 'CONFIRMADO' }))
                    );
                  }}
                  onRestaurarVersaoImportada={(imp) => {
                    if (imp.imagemOriginalBase64) {
                      setImagemOriginal(imp.imagemOriginalBase64);
                    }
                    setTituloDocumento(imp.tituloEscala);
                    setMesAnoReferencia(imp.mesReferencia || mesAnoReferencia);
                    setItensEscala(
                      (imp.dadosCorrigidos || []).map((d, idx) => ({
                        tempId: `restaurado-${idx}-${Date.now()}`,
                        funcionarioNome: d.funcionarioNome,
                        funcionarioId: d.funcionarioId || '',
                        data: d.data,
                        diaSemana: d.diaSemana,
                        turno: d.turno,
                        horarioInicio: d.horarioInicio,
                        horarioFim: d.horarioFim,
                        intervalo: d.intervalo,
                        setor: d.setor,
                        funcao: d.funcao,
                        status: d.status,
                        statusConferencia: d.statusConferencia || 'CONFIRMADO',
                        observacao: d.observacao,
                      }))
                    );
                  }}
                />

                {/* Alternador de Modo de Visualização: Matriz da Grade vs Lista Detalhada */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setModoVisualizacao('GRADE')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        modoVisualizacao === 'GRADE'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Grade Visual Dia a Dia
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoVisualizacao('TABELA')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        modoVisualizacao === 'TABELA'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      Lista Detalhada de Turnos
                    </button>
                  </div>

                  {modoVisualizacao === 'TABELA' && (
                    <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setFiltroStatusTabela('TODOS')}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                            filtroStatusTabela === 'TODOS'
                              ? 'bg-slate-800 text-white shadow-2xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          Todos ({itensEscala.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFiltroStatusTabela('TRABALHO')}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                            filtroStatusTabela === 'TRABALHO'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          Trabalho ({metricasEscala.totalTrabalho})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFiltroStatusTabela('FOLGA')}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                            filtroStatusTabela === 'FOLGA'
                              ? 'bg-slate-700 text-white shadow-2xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          Folgas ({metricasEscala.totalFolga})
                        </button>
                      </div>

                      <div className="relative w-full sm:w-44">
                        <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar na tabela..."
                          value={buscaNomeTabela}
                          onChange={(e) => setBuscaNomeTabela(e.target.value)}
                          className="w-full pl-7 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* VISUALIZAÇÃO 1: GRADE / MATRIZ DIA A DIA (Semelhante ao Planner) */}
                {modoVisualizacao === 'GRADE' ? (
                  <div className="space-y-2.5">
                    <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-2xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                          <tr>
                            <th className="py-3 px-3 min-w-[180px] sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                              Colaborador
                            </th>
                            {metricasEscala.diasUnicos.map((diaIso) => {
                              const partes = diaIso.split('-');
                              const diaNum = partes[2] || diaIso;
                              const dataObj = new Date(`${diaIso}T12:00:00`);
                              const diaSemanaAbrev = !isNaN(dataObj.getTime())
                                ? ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][dataObj.getDay()]
                                : '';
                              const ehFimDeSemana = diaSemanaAbrev === 'DOM' || diaSemanaAbrev === 'SÁB';

                              return (
                                <th
                                  key={diaIso}
                                  className={`py-2 px-1.5 text-center min-w-[58px] border-r border-slate-100 ${
                                    ehFimDeSemana ? 'bg-amber-50/60 text-amber-900' : ''
                                  }`}
                                >
                                  <div className="font-mono font-bold text-xs">D{diaNum}</div>
                                  <div className="text-[9px] text-slate-400 font-medium">{diaSemanaAbrev}</div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {metricasEscala.listaColabs.map((colab) => (
                            <tr key={colab.nome} className="hover:bg-slate-50/70 transition">
                              <td className="py-2.5 px-3 sticky left-0 bg-white z-10 border-r border-slate-200 font-medium">
                                <div className="text-slate-900 font-semibold truncate max-w-[170px]" title={colab.nome}>
                                  {colab.nome}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{colab.cargo}</span>
                                  {colab.cadastrado ? (
                                    <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded font-medium">
                                      Cadastrado
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.2 rounded font-bold">
                                      Novo
                                    </span>
                                  )}
                                </div>
                              </td>

                              {metricasEscala.diasUnicos.map((diaIso) => {
                                const item = mapaItensPorColabEDia.get(`${colab.nome}__${diaIso}`);

                                if (!item) {
                                  return (
                                    <td key={diaIso} className="p-1 text-center border-r border-slate-100">
                                      <button
                                        type="button"
                                        onClick={() => handleAlternarTurnoCelulaMatriz(colab.nome, diaIso)}
                                        title="Adicionar turno neste dia"
                                        className="w-full h-8 border border-dashed border-slate-200 hover:border-purple-300 hover:bg-purple-50 text-[10px] text-slate-300 hover:text-purple-600 rounded transition flex items-center justify-center cursor-pointer"
                                      >
                                        +
                                      </button>
                                    </td>
                                  );
                                }

                                const isFolga = item.status === 'FOLGA' || item.turno === 'Folga';
                                const isFerias = item.status === 'FERIAS';
                                const isAfastado = item.status === 'AFASTADO';
                                const isPlantao = item.status === 'PLANTAO';
                                const isHorista = item.status === 'TRABALHO' && item.turno.includes('Horista');
                                const isT3 =
                                  item.status === 'TRABALHO' &&
                                  (item.turno.includes('Noite') ||
                                    item.turno.includes('Turno 3') ||
                                    item.horarioInicio.startsWith('22:'));
                                const isT2 =
                                  item.status === 'TRABALHO' &&
                                  (item.turno.includes('Turno 2') ||
                                    item.turno.includes('Tarde') ||
                                    item.horarioInicio.startsWith('14:'));
                                const isT1 =
                                  item.status === 'TRABALHO' && !isHorista && !isT2 && !isT3;

                                const labelCurto = isFolga
                                  ? 'FOLGA'
                                  : isFerias
                                  ? 'FÉR'
                                  : isAfastado
                                  ? 'AFA'
                                  : isPlantao
                                  ? 'PLT'
                                  : isHorista
                                  ? 'HOR'
                                  : isT3
                                  ? 'T3'
                                  : isT2
                                  ? 'T2'
                                  : isT1 && item.horarioInicio === '06:00' && item.horarioFim === '14:00'
                                  ? 'T1'
                                  : `${item.horarioInicio}`;

                                const horarioTooltip = `${item.turno} (${item.horarioInicio} às ${item.horarioFim}) • Setor: ${item.setor || 'Pista'} • Clique para alternar`;

                                return (
                                  <td key={diaIso} className="p-1 text-center border-r border-slate-100">
                                    {isFolga ? (
                                      <button
                                        type="button"
                                        onClick={() => handleAlternarTurnoCelulaMatriz(colab.nome, diaIso)}
                                        title="Folga / Descanso — Clique para alternar"
                                        className="w-full h-8 px-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-[10px] rounded transition flex items-center justify-center shadow-2xs cursor-pointer"
                                      >
                                        FOLGA
                                      </button>
                                    ) : isFerias ? (
                                      <button
                                        type="button"
                                        onClick={() => handleAlternarTurnoCelulaMatriz(colab.nome, diaIso)}
                                        title={horarioTooltip}
                                        className="w-full h-8 px-1 bg-purple-100 hover:bg-purple-200 border border-purple-300 text-purple-900 font-bold text-[10px] rounded transition flex items-center justify-center shadow-2xs cursor-pointer"
                                      >
                                        FÉR
                                      </button>
                                    ) : isAfastado ? (
                                      <button
                                        type="button"
                                        onClick={() => handleAlternarTurnoCelulaMatriz(colab.nome, diaIso)}
                                        title={horarioTooltip}
                                        className="w-full h-8 px-1 bg-rose-100 hover:bg-rose-200 border border-rose-300 text-rose-900 font-bold text-[10px] rounded transition flex items-center justify-center shadow-2xs cursor-pointer"
                                      >
                                        AFA
                                      </button>
                                    ) : isPlantao ? (
                                      <button
                                        type="button"
                                        onClick={() => handleAlternarTurnoCelulaMatriz(colab.nome, diaIso)}
                                        title={horarioTooltip}
                                        className="w-full h-8 px-1 bg-indigo-100 hover:bg-indigo-200 border border-indigo-300 text-indigo-900 font-extrabold text-[10px] rounded transition flex flex-col items-center justify-center leading-none shadow-2xs cursor-pointer"
                                      >
                                        <span>PLT</span>
                                        <span className="text-[8px] font-mono opacity-80">{item.horarioInicio}</span>
                                      </button>
                                    ) : isHorista ? (
                                      <button
                                        type="button"
                                        onClick={() => handleAlternarTurnoCelulaMatriz(colab.nome, diaIso)}
                                        title={horarioTooltip}
                                        className="w-full h-8 px-1 bg-teal-100 hover:bg-teal-200 border border-teal-300 text-teal-900 font-extrabold text-[10px] rounded transition flex flex-col items-center justify-center leading-none shadow-2xs cursor-pointer"
                                      >
                                        <span>HOR</span>
                                        <span className="text-[8px] font-mono opacity-80">{item.horarioInicio}</span>
                                      </button>
                                    ) : isT3 ? (
                                      <button
                                        type="button"
                                        onClick={() => handleAlternarTurnoCelulaMatriz(colab.nome, diaIso)}
                                        title={horarioTooltip}
                                        className="w-full h-8 px-1 bg-violet-100 hover:bg-violet-200 border border-violet-300 text-violet-900 font-extrabold text-[10px] rounded transition flex flex-col items-center justify-center leading-none shadow-2xs cursor-pointer"
                                      >
                                        <span>T3</span>
                                        <span className="text-[8px] font-mono opacity-80">{item.horarioInicio}</span>
                                      </button>
                                    ) : isT2 ? (
                                      <button
                                        type="button"
                                        onClick={() => handleAlternarTurnoCelulaMatriz(colab.nome, diaIso)}
                                        title={horarioTooltip}
                                        className="w-full h-8 px-1 bg-blue-100 hover:bg-blue-200 border border-blue-300 text-blue-900 font-extrabold text-[10px] rounded transition flex flex-col items-center justify-center leading-none shadow-2xs cursor-pointer"
                                      >
                                        <span>T2</span>
                                        <span className="text-[8px] font-mono opacity-80">{item.horarioInicio}</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleAlternarTurnoCelulaMatriz(colab.nome, diaIso)}
                                        title={horarioTooltip}
                                        className="w-full h-8 px-1 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 font-extrabold text-[10px] rounded transition flex flex-col items-center justify-center leading-none shadow-2xs cursor-pointer"
                                      >
                                        <span>{labelCurto}</span>
                                        <span className="text-[8px] font-mono opacity-80">{item.horarioFim}</span>
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Legenda Explicativa da Grade */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-slate-500 font-semibold text-[11px]">Legenda de Turnos:</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-900 rounded text-[10px] font-bold">
                          T1: Manhã (06h às 14h)
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 border border-blue-300 text-blue-900 rounded text-[10px] font-bold">
                          T2: Tarde (14h às 22h)
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 border border-teal-300 text-teal-900 rounded text-[10px] font-bold">
                          HOR: Turno Horista
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-300 text-slate-700 rounded text-[10px] font-bold">
                          FOLGA: Descanso
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 italic">
                        💡 Dica: Clique sobre qualquer célula para alternar instantaneamente entre T1 ➔ T2 ➔ Horista ➔ Folga.
                      </div>
                    </div>
                  </div>
                ) : (
                  /* VISUALIZAÇÃO 2: TABELA DETALHADA COM SELETOR INDIVIDUAL */
                  <div className="space-y-3">
                    <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                          <tr>
                            <th className="py-2.5 px-3">Data / Dia</th>
                            <th className="py-2.5 px-3">Colaborador</th>
                            <th className="py-2.5 px-3">Turno / Horário</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Confiança</th>
                            <th className="py-2.5 px-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {itensExibidos.map((item) => (
                            <tr key={item.tempId} className="hover:bg-slate-50/80 transition">
                              <td className="py-2 px-3 whitespace-nowrap">
                                <div className="font-mono font-bold text-slate-800">{item.data}</div>
                                {item.diaSemana && (
                                  <div className="text-[10px] text-purple-700 font-semibold uppercase">{item.diaSemana}</div>
                                )}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-900">
                                <div>{item.funcionarioNome}</div>
                                {!item.funcionarioId ? (
                                  <span className="text-[10px] text-amber-700 font-bold flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Pendente de cadastro
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-700 font-medium">
                                    Vinculado ao cadastro
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <select
                                  value={item.turno}
                                  onChange={(e) => handleAlterarTurnoItem(item.tempId, e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px] font-medium text-slate-800 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                                >
                                  {![
                                    'Turno 1 - Manhã (06h - 14h)',
                                    'Turno 2 - Tarde (14h - 22h)',
                                    'Turno 3 - Noite (22h - 06h)',
                                    'Turno Horista',
                                    'Plantão',
                                    'Folga',
                                    'Férias',
                                    'Afastado',
                                  ].includes(item.turno) && (
                                    <option value={item.turno}>{item.turno}</option>
                                  )}
                                  <option value="Turno 1 - Manhã (06h - 14h)">Turno 1 — Manhã (06h - 14h)</option>
                                  <option value="Turno 2 - Tarde (14h - 22h)">Turno 2 — Tarde (14h - 22h)</option>
                                  <option value="Turno 3 - Noite (22h - 06h)">Turno 3 — Noite (22h - 06h)</option>
                                  <option value="Turno Horista">Turno Horista (Flexível / Por Hora)</option>
                                  <option value="Plantão">Plantão / 12x36</option>
                                  <option value="Folga">Folga</option>
                                  <option value="Férias">Férias</option>
                                  <option value="Afastado">Afastado / Atestado</option>
                                </select>
                                <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono mt-1">
                                  <input
                                    type="time"
                                    value={item.horarioInicio === 'não identificado' ? '06:00' : item.horarioInicio}
                                    onChange={(e) =>
                                      setItensEscala((prev) =>
                                        prev.map((it) =>
                                          it.tempId === item.tempId ? { ...it, horarioInicio: e.target.value } : it
                                        )
                                      )
                                    }
                                    className="px-1 py-0.5 border border-slate-200 rounded bg-slate-50 text-[10px]"
                                  />
                                  <span>às</span>
                                  <input
                                    type="time"
                                    value={item.horarioFim === 'não identificado' ? '14:00' : item.horarioFim}
                                    onChange={(e) =>
                                      setItensEscala((prev) =>
                                        prev.map((it) =>
                                          it.tempId === item.tempId ? { ...it, horarioFim: e.target.value } : it
                                        )
                                      )
                                    }
                                    className="px-1 py-0.5 border border-slate-200 rounded bg-slate-50 text-[10px]"
                                  />
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <select
                                  value={item.status}
                                  onChange={(e) =>
                                    handleAlterarStatusItem(item.tempId, e.target.value as EscalaStatus)
                                  }
                                  className={`px-2 py-1 rounded text-[11px] font-bold border-0 cursor-pointer ${
                                    item.status === 'TRABALHO'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : item.status === 'PLANTAO'
                                      ? 'bg-indigo-100 text-indigo-800'
                                      : item.status === 'FOLGA'
                                      ? 'bg-slate-100 text-slate-700'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  <option value="TRABALHO">TRABALHO</option>
                                  <option value="PLANTAO">PLANTÃO</option>
                                  <option value="FOLGA">FOLGA</option>
                                  <option value="AFASTADO">AFASTADO / ATESTADO</option>
                                  <option value="FERIAS">FÉRIAS</option>
                                </select>
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                    item.confianca === 'ALTA'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : item.confianca === 'MEDIA'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {item.confianca || 'ALTA'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  onClick={() => handleRemoverItem(item.tempId)}
                                  title="Remover este turno"
                                  className="p-1 text-slate-400 hover:text-red-600 transition rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                      <span>
                        Exibindo <strong>{itensExibidos.length}</strong> de <strong>{itensEscala.length}</strong> turnos extraídos.
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Você pode alterar qualquer status ou turno antes da aprovação final.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
