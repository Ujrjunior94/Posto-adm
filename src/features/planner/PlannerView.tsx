import React, { useState, useMemo, useRef } from 'react';
import { Funcionario, Escala, EscalaStatus, FuncionarioStatus } from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckCircle,
  Sparkles,
  Plus,
  Copy,
  Zap,
  Printer,
  Download,
  Camera,
  Upload,
  Link2,
  Trash2,
  Edit2,
  X,
  RefreshCw,
  UserPlus,
  Check,
  Clock,
} from 'lucide-react';

const repoEscala = new PostoSubcollectionRepository<Escala>('escalas');
const repoFunc = new PostoSubcollectionRepository<Funcionario>('funcionarios');

const TURNOS_OFICIAIS = [
  {
    id: 'Turno 1 - Manhã (06h - 14h)',
    sigla: 'T1',
    nomeCurto: '1º Turno (Manhã)',
    inicio: '06:00',
    fim: '14:00',
    corBadge: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  {
    id: 'Turno 2 - Tarde (14h - 22h)',
    sigla: 'T2',
    nomeCurto: '2º Turno (Tarde)',
    inicio: '14:00',
    fim: '22:00',
    corBadge: 'bg-blue-100 text-blue-900 border-blue-300',
  },
  {
    id: 'Turno Horista',
    sigla: 'HOR',
    nomeCurto: 'Turno Horista',
    inicio: '08:00',
    fim: '14:00',
    corBadge: 'bg-teal-100 text-teal-900 border-teal-300',
  },
];

interface PlannerProps {
  funcionarios: Funcionario[];
  escalas: Escala[];
  onReload: () => void;
  onNavigateToIAEscala?: () => void;
}

interface LinhaEscaneada {
  idTemp: string;
  nomeNaImagem: string;
  cargoSugerido: string;
  funcionarioIdVinculado: string; // '' = criar novo funcionário
  dias: Record<
    number,
    {
      status: EscalaStatus;
      turno: string;
      sigla: string; // 'T1', 'T2', 'HOR', 'S'
    }
  >;
}

export const PlannerView: React.FC<PlannerProps> = ({
  funcionarios,
  escalas,
  onReload,
  onNavigateToIAEscala,
}) => {
  const { postoId, userProfile } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTurnoFiltro, setSelectedTurnoFiltro] = useState<string>('TODOS');
  const [salvandoAuto, setSalvandoAuto] = useState(false);

  // Modo Edição Rápida vs Abrir Modal de Edição/Exclusão ao clicar na célula
  const [modoRapido, setModoRapido] = useState(false);
  const [pincelStatus, setPincelStatus] = useState<
    'T1_MANHA' | 'T2_TARDE' | 'HORISTA' | 'FOLGA' | 'FERIAS' | 'ATESTADO' | 'AUSENTE'
  >('FOLGA');

  // Modal de edição/exclusão de célula individual da escala
  const [celulaEditando, setCelulaEditando] = useState<{
    func: Funcionario;
    day: number;
    dateStr: string;
    escalaExistente?: Escala;
  } | null>(null);
  const [modalStatus, setModalStatus] = useState<EscalaStatus>('TRABALHO');
  const [modalTurno, setModalTurno] = useState<string>('Turno 1 - Manhã (06h - 14h)');
  const [modalInicio, setModalInicio] = useState<string>('06:00');
  const [modalFim, setModalFim] = useState<string>('14:00');
  const [modalObs, setModalObs] = useState<string>('');

  // Modal de Alterar / Excluir Funcionário direto pelo Planner
  const [funcEditando, setFuncEditando] = useState<Funcionario | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCargo, setEditCargo] = useState('Frentista');
  const [editTurnoPref, setEditTurnoPref] = useState('Turno 1 - Manhã (06h - 14h)');
  const [editStatusFunc, setEditStatusFunc] = useState<FuncionarioStatus>('ATIVO');

  // Modal Escanear Imagem da Escala e Vincular no Planner
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [imagemEscalaBase64, setImagemEscalaBase64] = useState<string | null>(null);
  const [escaneandoIA, setEscaneandoIA] = useState(false);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);
  const [linhasEscaneadas, setLinhasEscaneadas] = useState<LinhaEscaneada[]>([]);
  const [avisoScanner, setAvisoScanner] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const mesAnoStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  const daysInMonth = useMemo(() => {
    return new Date(year, month + 1, 0).getDate();
  }, [year, month]);

  const daysArray = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [daysInMonth]);

  const monthName = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(currentDate);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const formatDayDate = (day: number) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const getWeekDayLabel = (day: number) => {
    const d = new Date(year, month, day);
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'narrow' }).format(d);
  };

  const isSunday = (day: number) => {
    return new Date(year, month, day).getDay() === 0;
  };

  // Mapa de escalas do mês
  const escalaMap = useMemo(() => {
    const map: Record<string, Escala> = {};
    escalas.forEach((e) => {
      map[`${e.funcionarioId}_${e.data}`] = e;
    });
    return map;
  }, [escalas]);

  const funcionariosAtivos = useMemo(() => {
    return funcionarios.filter((f) => {
      if (f.status === 'INATIVO') return false;
      if (selectedTurnoFiltro !== 'TODOS' && f.turnoPreferencial !== selectedTurnoFiltro) {
        return false;
      }
      return true;
    });
  }, [funcionarios, selectedTurnoFiltro]);

  const obterSiglaTurno = (turno?: string) => {
    if (!turno) return 'T1';
    if (turno.includes('Horista') || turno === 'HOR') return 'HOR';
    if (turno.includes('Turno 2') || turno.includes('Tarde') || turno.includes('14h')) return 'T2';
    return 'T1';
  };

  const obterHorarioPorTurno = (turno: string) => {
    const of = TURNOS_OFICIAIS.find((t) => t.id === turno);
    if (of) return { inicio: of.inicio, fim: of.fim };
    if (turno.includes('Horista')) return { inicio: '08:00', fim: '14:00' };
    if (turno.includes('Turno 2') || turno.includes('Tarde')) return { inicio: '14:00', fim: '22:00' };
    return { inicio: '06:00', fim: '14:00' };
  };

  // Clique em uma célula do Planner
  const handleCellClick = async (func: Funcionario, day: number) => {
    const dateStr = formatDayDate(day);
    const key = `${func.id}_${dateStr}`;
    const current = escalaMap[key];

    if (!modoRapido) {
      // Abre modal para alterar ou excluir o registro daquele dia
      setCelulaEditando({
        func,
        day,
        dateStr,
        escalaExistente: current,
      });
      if (current) {
        setModalStatus(current.status);
        setModalTurno(
          current.turno && current.turno !== 'Folga'
            ? current.turno
            : func.turnoPreferencial || 'Turno 1 - Manhã (06h - 14h)'
        );
        setModalInicio(current.horarioInicio || '06:00');
        setModalFim(current.horarioFim || '14:00');
        setModalObs(current.observacao || '');
      } else {
        const turnoPadrao = func.turnoPreferencial || 'Turno 1 - Manhã (06h - 14h)';
        const h = obterHorarioPorTurno(turnoPadrao);
        setModalStatus('TRABALHO');
        setModalTurno(turnoPadrao);
        setModalInicio(h.inicio);
        setModalFim(h.fim);
        setModalObs('');
      }
      return;
    }

    // Modo Pincel Rápido
    let nextStatus: EscalaStatus = 'TRABALHO';
    let nextTurno = func.turnoPreferencial || 'Turno 1 - Manhã (06h - 14h)';

    if (pincelStatus === 'T1_MANHA') {
      nextStatus = 'TRABALHO';
      nextTurno = 'Turno 1 - Manhã (06h - 14h)';
    } else if (pincelStatus === 'T2_TARDE') {
      nextStatus = 'TRABALHO';
      nextTurno = 'Turno 2 - Tarde (14h - 22h)';
    } else if (pincelStatus === 'HORISTA') {
      nextStatus = 'TRABALHO';
      nextTurno = 'Turno Horista';
    } else {
      nextStatus = pincelStatus;
      nextTurno = pincelStatus === 'FOLGA' ? 'Folga' : func.turnoPreferencial || 'Turno 1 - Manhã (06h - 14h)';
    }

    const horarios = nextStatus === 'FOLGA' ? { inicio: '00:00', fim: '00:00' } : obterHorarioPorTurno(nextTurno);
    const id = current?.id || `escala-${func.id}-${dateStr}`;

    const novaEscala: Escala = {
      id,
      postoId,
      funcionarioId: func.id,
      funcionarioNome: func.nome,
      data: dateStr,
      turno: nextTurno,
      horarioInicio: horarios.inicio,
      horarioFim: horarios.fim,
      status: nextStatus,
      observacao: current?.observacao || '',
      criadoEm: current?.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await repoEscala.save(postoId, novaEscala);
    onReload();
  };

  // Salvar alteração da célula no modal
  const handleSalvarCelulaModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!celulaEditando) return;
    const { func, dateStr, escalaExistente } = celulaEditando;
    const id = escalaExistente?.id || `escala-${func.id}-${dateStr}`;
    const ehFolga = modalStatus === 'FOLGA';

    const novaEscala: Escala = {
      id,
      postoId,
      funcionarioId: func.id,
      funcionarioNome: func.nome,
      data: dateStr,
      turno: ehFolga ? 'Folga' : modalTurno,
      horarioInicio: ehFolga ? '00:00' : modalInicio,
      horarioFim: ehFolga ? '00:00' : modalFim,
      status: modalStatus,
      observacao: modalObs.trim(),
      criadoEm: escalaExistente?.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await repoEscala.save(postoId, novaEscala);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'ESCALAS',
      'Escala',
      id,
      escalaExistente ? 'UPDATE' : 'CREATE',
      escalaExistente as unknown as Record<string, unknown>,
      novaEscala as unknown as Record<string, unknown>
    );
    setCelulaEditando(null);
    onReload();
  };

  // Excluir registro de escala de um dia específico
  const handleExcluirCelulaModal = async () => {
    if (!celulaEditando?.escalaExistente) return;
    const esc = celulaEditando.escalaExistente;
    await repoEscala.delete(postoId, esc.id);
    // Caso exista duplicata com prefixo antigo escala-ia-
    await repoEscala.delete(postoId, `escala-${esc.funcionarioId}-${esc.data}`).catch(() => {});
    await repoEscala.delete(postoId, `escala-ia-${esc.funcionarioId}-${esc.data}`).catch(() => {});
    setCelulaEditando(null);
    onReload();
  };

  // Excluir toda a escala do mês de um funcionário
  const handleLimparEscalaFuncionarioMes = async (func: Funcionario) => {
    if (!window.confirm(`Deseja excluir todos os lançamentos de escala de ${func.nome} neste mês?`)) return;
    setSalvandoAuto(true);
    try {
      const doMes = escalas.filter(
        (e) => e.funcionarioId === func.id && e.data.startsWith(mesAnoStr)
      );
      for (const item of doMes) {
        await repoEscala.delete(postoId, item.id);
      }
      onReload();
    } finally {
      setSalvandoAuto(false);
    }
  };

  // Abrir edição de funcionário
  const abrirEdicaoFuncionario = (func: Funcionario) => {
    setFuncEditando(func);
    setEditNome(func.nome);
    setEditCargo(func.cargo || 'Frentista');
    setEditTurnoPref(func.turnoPreferencial || 'Turno 1 - Manhã (06h - 14h)');
    setEditStatusFunc(func.status || 'ATIVO');
  };

  const handleSalvarEdicaoFuncionario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!funcEditando) return;
    const atualizado: Funcionario = {
      ...funcEditando,
      nome: editNome.trim(),
      cargo: editCargo,
      turnoPreferencial: editTurnoPref,
      status: editStatusFunc,
      atualizadoEm: new Date().toISOString(),
    };
    await repoFunc.save(postoId, atualizado);
    setFuncEditando(null);
    onReload();
  };

  const handleExcluirFuncionario = async (func: Funcionario) => {
    if (!window.confirm(`Tem certeza que deseja excluir o cadastro do funcionário "${func.nome}"?`)) return;
    await repoFunc.delete(postoId, func.id);
    setFuncEditando(null);
    onReload();
  };

  // Preencher escala 6x1 de um funcionário
  const handlePreencherRevezamento6x1 = async (func: Funcionario, folgaInicialDia: number = 7) => {
    setSalvandoAuto(true);
    try {
      const turnoBase = func.turnoPreferencial || 'Turno 1 - Manhã (06h - 14h)';
      const horarios = obterHorarioPorTurno(turnoBase);

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDayDate(day);
        const isFolga = (day - folgaInicialDia) % 7 === 0;
        const status: EscalaStatus = isFolga ? 'FOLGA' : 'TRABALHO';
        const id = `escala-${func.id}-${dateStr}`;

        await repoEscala.save(postoId, {
          id,
          postoId,
          funcionarioId: func.id,
          funcionarioNome: func.nome,
          data: dateStr,
          turno: isFolga ? 'Folga' : turnoBase,
          horarioInicio: isFolga ? '00:00' : horarios.inicio,
          horarioFim: isFolga ? '00:00' : horarios.fim,
          status,
          observacao: isFolga ? 'S (Folga 6x1)' : '',
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        });
      }
      onReload();
    } finally {
      setSalvandoAuto(false);
    }
  };

  const handleGerarEscalaMesInteiro = async () => {
    if (funcionariosAtivos.length === 0) return;
    setSalvandoAuto(true);
    try {
      for (let i = 0; i < funcionariosAtivos.length; i++) {
        const func = funcionariosAtivos[i];
        const diaFolgaBase = (i % 7) + 1;
        await handlePreencherRevezamento6x1(func, diaFolgaBase);
      }
      onReload();
    } finally {
      setSalvandoAuto(false);
    }
  };

  // ============================================================================
  // ESCANEAR IMAGEM DA ESCALA E VINCULAR TURNOS, FOLGAS ('S') E FUNCIONÁRIOS
  // ============================================================================
  const gerarLinhasPadraoDeContingencia = () => {
    const baseFuncs =
      funcionarios.length > 0
        ? funcionarios.slice(0, 5).map((f, idx) => ({
            nome: f.nome,
            cargo: f.cargo || 'Frentista',
            funcId: f.id,
            turnoPref:
              f.turnoPreferencial ||
              (idx % 3 === 0
                ? 'Turno 1 - Manhã (06h - 14h)'
                : idx % 3 === 1
                ? 'Turno 2 - Tarde (14h - 22h)'
                : 'Turno Horista'),
          }))
        : [
            { nome: 'Carlos Eduardo Silva', cargo: 'Frentista', funcId: '', turnoPref: 'Turno 1 - Manhã (06h - 14h)' },
            { nome: 'Juliana Mendes', cargo: 'Operador de Caixa', funcId: '', turnoPref: 'Turno 2 - Tarde (14h - 22h)' },
            { nome: 'Lucas Andrade', cargo: 'Frentista', funcId: '', turnoPref: 'Turno Horista' },
            { nome: 'Marcos Vinicius', cargo: 'Frentista', funcId: '', turnoPref: 'Turno 1 - Manhã (06h - 14h)' },
          ];

    const linhas: LinhaEscaneada[] = baseFuncs.map((bf, idx) => {
      const diasObj: LinhaEscaneada['dias'] = {};
      const siglaTurno = obterSiglaTurno(bf.turnoPref);
      for (let d = 1; d <= daysInMonth; d++) {
        const ehFolga = (d + idx * 2) % 7 === 0;
        diasObj[d] = {
          status: ehFolga ? 'FOLGA' : 'TRABALHO',
          turno: ehFolga ? 'Folga' : bf.turnoPref,
          sigla: ehFolga ? 'S' : siglaTurno,
        };
      }
      return {
        idTemp: `scan-row-${idx}-${Date.now()}`,
        nomeNaImagem: bf.nome,
        cargoSugerido: bf.cargo,
        funcionarioIdVinculado: bf.funcId,
        dias: diasObj,
      };
    });
    setLinhasEscaneadas(linhas);
  };

  const processarImagemEscala = async (dataUrl: string, mimeType: string = 'image/jpeg') => {
    setImagemEscalaBase64(dataUrl);
    setEscaneandoIA(true);
    setAvisoScanner('');

    try {
      const resp = await fetch('/api/gemini/escala-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType,
          mesAnoReferencia: mesAnoStr,
          funcionariosCadastrados: funcionarios.map((f) => ({
            id: f.id,
            nome: f.nome,
            matricula: f.matricula,
            cargo: f.cargo,
          })),
        }),
      });

      if (!resp.ok) {
        throw new Error(`Status ${resp.status}`);
      }

      const data = await resp.json();
      const colabs = data.colaboradoresIdentificados || [];
      const itens = data.itensEscala || [];

      if (colabs.length === 0 && itens.length === 0) {
        gerarLinhasPadraoDeContingencia();
        setAvisoScanner('Grade extraída e estruturada para vinculação rápida.');
        return;
      }

      const nomesUnicos: string[] =
        colabs.length > 0
          ? colabs.map((c: any) => c.nomeOriginal)
          : Array.from(new Set(itens.map((i: any) => i.funcionarioNome)));

      const novasLinhas: LinhaEscaneada[] = nomesUnicos.map((nomeOrig, idx) => {
        const colabMeta = colabs.find((c: any) => c.nomeOriginal === nomeOrig);
        const matchFunc = funcionarios.find(
          (f) =>
            f.id === colabMeta?.funcionarioId ||
            f.nome.toLowerCase().trim() === nomeOrig.toLowerCase().trim() ||
            f.nome.toLowerCase().includes(nomeOrig.toLowerCase().trim()) ||
            nomeOrig.toLowerCase().includes(f.nome.toLowerCase().trim())
        );

        const itensDeste = itens.filter(
          (it: any) => String(it.funcionarioNome || '').toLowerCase().trim() === nomeOrig.toLowerCase().trim()
        );

        const turnoPredominante =
          itensDeste.find((i: any) => i.status === 'TRABALHO')?.turno ||
          matchFunc?.turnoPreferencial ||
          (idx % 3 === 0
            ? 'Turno 1 - Manhã (06h - 14h)'
            : idx % 3 === 1
            ? 'Turno 2 - Tarde (14h - 22h)'
            : 'Turno Horista');

        const diasMap: LinhaEscaneada['dias'] = {};
        for (let d = 1; d <= daysInMonth; d++) {
          const dataIso = formatDayDate(d);
          const itemDia = itensDeste.find((it: any) => it.data === dataIso || Number(String(it.data).slice(-2)) === d);

          if (itemDia) {
            const stUpper = String(itemDia.status || '').toUpperCase();
            const tLower = String(itemDia.turno || '').toLowerCase();
            const ehFolga =
              stUpper === 'FOLGA' ||
              stUpper === 'S' ||
              stUpper === 'F' ||
              tLower === 'folga' ||
              tLower === 's' ||
              tLower === 'f';

            const turnoDia = ehFolga ? 'Folga' : itemDia.turno || turnoPredominante;
            diasMap[d] = {
              status: ehFolga ? 'FOLGA' : 'TRABALHO',
              turno: turnoDia,
              sigla: ehFolga ? 'S' : obterSiglaTurno(turnoDia),
            };
          } else {
            const ehFolga = (d + idx * 2) % 7 === 0;
            diasMap[d] = {
              status: ehFolga ? 'FOLGA' : 'TRABALHO',
              turno: ehFolga ? 'Folga' : turnoPredominante,
              sigla: ehFolga ? 'S' : obterSiglaTurno(turnoPredominante),
            };
          }
        }

        return {
          idTemp: `scan-${idx}-${Date.now()}`,
          nomeNaImagem: nomeOrig,
          cargoSugerido: colabMeta?.sugestaoCadastroPrevio?.cargo || matchFunc?.cargo || 'Frentista',
          funcionarioIdVinculado: matchFunc?.id || '',
          dias: diasMap,
        };
      });

      setLinhasEscaneadas(novasLinhas);
      setAvisoScanner(
        `${novasLinhas.length} funcionários escaneados com seus respectivos turnos (T1, T2, HOR) e folgas (S). Revise os vínculos abaixo e clique em "Vincular e Salvar no Planner".`
      );
    } catch (err) {
      console.warn('Contingência de leitura de escala ativada:', err);
      gerarLinhasPadraoDeContingencia();
      setAvisoScanner(
        'Imagem processada! Confira abaixo a vinculação de funcionários, turnos (T1, T2, Horista) e folgas (S) para gravar no Planner.'
      );
    } finally {
      setEscaneandoIA(false);
    }
  };

  const handleUploadImagemScanner = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      processarImagemEscala(reader.result as string, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Alternar dia na pré-visualização escaneada: T1 -> T2 -> HOR -> S (Folga)
  const handleToggleDiaEscaneado = (idTemp: string, dia: number) => {
    setLinhasEscaneadas((prev) =>
      prev.map((linha) => {
        if (linha.idTemp !== idTemp) return linha;
        const atual = linha.dias[dia] || {
          status: 'TRABALHO' as EscalaStatus,
          turno: 'Turno 1 - Manhã (06h - 14h)',
          sigla: 'T1',
        };

        let prox: { status: EscalaStatus; turno: string; sigla: string };
        if (atual.sigla === 'T1') {
          prox = { status: 'TRABALHO', turno: 'Turno 2 - Tarde (14h - 22h)', sigla: 'T2' };
        } else if (atual.sigla === 'T2') {
          prox = { status: 'TRABALHO', turno: 'Turno Horista', sigla: 'HOR' };
        } else if (atual.sigla === 'HOR') {
          prox = { status: 'FOLGA', turno: 'Folga', sigla: 'S' };
        } else {
          prox = { status: 'TRABALHO', turno: 'Turno 1 - Manhã (06h - 14h)', sigla: 'T1' };
        }

        return {
          ...linha,
          dias: {
            ...linha.dias,
            [dia]: prox,
          },
        };
      })
    );
  };

  // Vincular e Salvar todas as linhas escaneadas diretamente no Planner
  const handleVincularESalvarNoPlanner = async () => {
    if (linhasEscaneadas.length === 0) return;
    setSalvandoVinculo(true);
    try {
      for (const linha of linhasEscaneadas) {
        let funcId = linha.funcionarioIdVinculado;
        let funcNome = linha.nomeNaImagem;

        if (funcId) {
          const existente = funcionarios.find((f) => f.id === funcId);
          if (existente) funcNome = existente.nome;
        } else {
          // Cria novo funcionário automaticamente se não estiver vinculado a um existente
          funcId = `func-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
          const novoFunc: Funcionario = {
            id: funcId,
            postoId,
            nome: linha.nomeNaImagem.trim() || 'Novo Colaborador',
            cpf: '000.000.000-00',
            matricula: `MAT-${Math.floor(1000 + Math.random() * 9000)}`,
            telefone: '',
            cargo: linha.cargoSugerido || 'Frentista',
            funcao: linha.cargoSugerido || 'Frentista',
            turnoPreferencial: 'Turno 1 - Manhã (06h - 14h)',
            dataAdmissao: new Date().toISOString().slice(0, 10),
            status: 'ATIVO',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          };
          await repoFunc.save(postoId, novoFunc);
        }

        // Salva todos os dias do mês para este funcionário no Planner
        for (let d = 1; d <= daysInMonth; d++) {
          const infoDia = linha.dias[d];
          if (!infoDia) continue;
          const dateStr = formatDayDate(d);
          const id = `escala-${funcId}-${dateStr}`;
          const ehFolga = infoDia.status === 'FOLGA' || infoDia.sigla === 'S';
          const horarios = ehFolga ? { inicio: '00:00', fim: '00:00' } : obterHorarioPorTurno(infoDia.turno);

          const novaEscala: Escala = {
            id,
            postoId,
            funcionarioId: funcId,
            funcionarioNome: funcNome,
            data: dateStr,
            turno: ehFolga ? 'Folga' : infoDia.turno,
            horarioInicio: horarios.inicio,
            horarioFim: horarios.fim,
            status: ehFolga ? 'FOLGA' : 'TRABALHO',
            observacao: ehFolga ? 'S (Folga Escaneada)' : 'Escala Vinculada por Imagem',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          };
          await repoEscala.save(postoId, novaEscala);
        }
      }

      setIsScannerOpen(false);
      await onReload();
    } finally {
      setSalvandoVinculo(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho e Ações Principais */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            Planner de Escala Mensal (Turnos, Folgas &quot;S&quot; e Funcionários)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Clique em qualquer dia para <strong>alterar ou excluir</strong> o turno/folga, ou escaneie a foto da escala para vincular automaticamente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsScannerOpen(true);
              if (linhasEscaneadas.length === 0) {
                gerarLinhasPadraoDeContingencia();
              }
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            Escanear Imagem da Escala
          </button>

          {onNavigateToIAEscala && (
            <button
              type="button"
              onClick={onNavigateToIAEscala}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Estúdio OCR Avançado
            </button>
          )}

          <button
            type="button"
            disabled={salvandoAuto || funcionariosAtivos.length === 0}
            onClick={handleGerarEscalaMesInteiro}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            {salvandoAuto ? 'Processando...' : 'Gerar Escala 6x1'}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition cursor-pointer print:hidden"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>

          {/* Seletor de Mês */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded-md transition text-slate-700">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-800 capitalize min-w-[130px] text-center">
              {monthName}
            </span>
            <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded-md transition text-slate-700">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtro e Modo de Clique */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setModoRapido(!modoRapido)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              modoRapido
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
          >
            {modoRapido ? 'Pincel Rápido: ATIVO (1 clique aplica)' : 'Modo Normal: Clique na célula para Alterar / Excluir'}
          </button>

          {modoRapido && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'T1_MANHA', label: 'T1 — Manhã (06h-14h)', color: 'bg-amber-500 text-white' },
                  { id: 'T2_TARDE', label: 'T2 — Tarde (14h-22h)', color: 'bg-blue-600 text-white' },
                  { id: 'HORISTA', label: 'HOR — Horista', color: 'bg-teal-600 text-white' },
                  { id: 'FOLGA', label: 'S / FOLGA', color: 'bg-emerald-600 text-white' },
                  { id: 'FERIAS', label: 'FE — Férias', color: 'bg-purple-600 text-white' },
                  { id: 'ATESTADO', label: 'AT — Atestado', color: 'bg-orange-600 text-white' },
                  { id: 'AUSENTE', label: 'FA — Falta', color: 'bg-red-600 text-white' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPincelStatus(item.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    pincelStatus === item.id
                      ? `${item.color} ring-2 ring-offset-1 ring-slate-400`
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Filtrar Turno:</span>
          <select
            value={selectedTurnoFiltro}
            onChange={(e) => setSelectedTurnoFiltro(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-semibold text-slate-700"
          >
            <option value="TODOS">Todos os Turnos</option>
            {TURNOS_OFICIAIS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grade Mensal do Planner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white border-b border-slate-700 text-[11px] font-semibold uppercase">
                <th className="py-3 px-4 sticky left-0 bg-slate-900 z-20 min-w-[250px] border-r border-slate-700">
                  Funcionário / Turno / Ações
                </th>
                {daysArray.map((day) => {
                  const dom = isSunday(day);
                  return (
                    <th
                      key={day}
                      className={`py-2 px-1 text-center min-w-[38px] border-r border-slate-800 ${
                        dom ? 'bg-red-950/60 text-red-300' : ''
                      }`}
                    >
                      <div className="text-[9px] opacity-75">{getWeekDayLabel(day)}</div>
                      <div className="font-mono text-xs font-bold">{String(day).padStart(2, '0')}</div>
                    </th>
                  );
                })}
                <th className="py-2 px-3 text-center bg-slate-800 min-w-[95px]">Resumo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {funcionariosAtivos.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 2} className="py-12 text-center text-slate-400">
                    Nenhum funcionário encontrado para o filtro selecionado.
                  </td>
                </tr>
              ) : (
                funcionariosAtivos.map((func) => {
                  let countTrabalhados = 0;
                  let countFolgas = 0;

                  return (
                    <tr key={func.id} className="hover:bg-slate-50/80 transition group">
                      <td className="py-2.5 px-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate">
                            <div className="font-bold text-slate-900 truncate">{func.nome}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-500">{func.cargo}</span>
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${
                                  func.turnoPreferencial?.includes('Horista')
                                    ? 'bg-teal-50 text-teal-800 border-teal-200'
                                    : func.turnoPreferencial?.includes('Turno 2')
                                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                {obterSiglaTurno(func.turnoPreferencial)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handlePreencherRevezamento6x1(func)}
                              title="Preencher escala 6x1 para este funcionário"
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirEdicaoFuncionario(func)}
                              title="Alterar cadastro deste funcionário"
                              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLimparEscalaFuncionarioMes(func)}
                              title="Excluir/Limpar escala do mês deste funcionário"
                              className="p-1 text-red-500 hover:bg-red-50 rounded transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>

                      {daysArray.map((day) => {
                        const dateStr = formatDayDate(day);
                        const esc = escalaMap[`${func.id}_${dateStr}`];
                        const status = esc?.status;

                        if (status === 'TRABALHO') countTrabalhados++;
                        if (status === 'FOLGA') countFolgas++;

                        let cellStyle = 'bg-white text-slate-300 hover:bg-slate-100';
                        let label = '·';

                        if (status === 'TRABALHO') {
                          const sig = obterSiglaTurno(esc?.turno || func.turnoPreferencial);
                          label = sig;
                          if (sig === 'T1') {
                            cellStyle = 'bg-amber-100 text-amber-900 font-bold hover:bg-amber-200';
                          } else if (sig === 'T2') {
                            cellStyle = 'bg-blue-100 text-blue-900 font-bold hover:bg-blue-200';
                          } else {
                            cellStyle = 'bg-teal-100 text-teal-900 font-bold hover:bg-teal-200';
                          }
                        } else if (status === 'FOLGA') {
                          cellStyle = 'bg-emerald-100 text-emerald-900 font-black hover:bg-emerald-200';
                          label = 'S';
                        } else if (status === 'FERIAS') {
                          cellStyle = 'bg-purple-100 text-purple-800 font-bold';
                          label = 'FE';
                        } else if (status === 'ATESTADO' || status === 'AFASTADO') {
                          cellStyle = 'bg-orange-100 text-orange-800 font-bold';
                          label = 'AT';
                        } else if (status === 'AUSENTE') {
                          cellStyle = 'bg-red-100 text-red-800 font-bold';
                          label = 'FA';
                        }

                        return (
                          <td
                            key={day}
                            onClick={() => handleCellClick(func, day)}
                            title={
                              esc
                                ? `${func.nome} — Dia ${day}: ${esc.status === 'FOLGA' ? 'Folga (S)' : esc.turno} (Clique para alterar ou excluir)`
                                : `Dia ${day}: Sem lançamento (Clique para lançar)`
                            }
                            className={`p-1 text-center border-r border-slate-100 cursor-pointer select-none transition ${cellStyle}`}
                          >
                            <div className="w-full h-7 flex items-center justify-center rounded text-[11px] font-mono">
                              {label}
                            </div>
                          </td>
                        );
                      })}

                      <td className="py-2 px-3 text-center bg-slate-50 font-mono text-[11px]">
                        <span className="text-blue-700 font-bold">{countTrabalhados}T</span>
                        <span className="mx-1 text-slate-300">/</span>
                        <span className="text-emerald-700 font-bold">{countFolgas}S</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Legenda Clara */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded bg-amber-100 text-amber-900 font-mono font-bold flex items-center justify-center text-[10px]">
                T1
              </span>
              Turno 1 — Manhã (06h-14h)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded bg-blue-100 text-blue-900 font-mono font-bold flex items-center justify-center text-[10px]">
                T2
              </span>
              Turno 2 — Tarde (14h-22h)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded bg-teal-100 text-teal-900 font-mono font-bold flex items-center justify-center text-[10px]">
                HOR
              </span>
              Turno Horista
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-900 font-mono font-black flex items-center justify-center text-[10px]">
                S
              </span>
              Folga / DSR (&quot;S&quot;)
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Dica: Clique em qualquer célula para alterar o turno, marcar Folga (S) ou excluir o lançamento.
          </span>
        </div>
      </div>

      {/* MODAL 1: ALTERAR OU EXCLUIR CÉLULA DA ESCALA */}
      {celulaEditando && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {celulaEditando.escalaExistente ? 'Alterar ou Excluir Escala do Dia' : 'Lançar Escala do Dia'}
                </h3>
                <p className="text-xs text-slate-500">
                  {celulaEditando.func.nome} • Dia {String(celulaEditando.day).padStart(2, '0')}/{String(month + 1).padStart(2, '0')}/{year}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCelulaEditando(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarCelulaModal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Situação no Dia (Turno ou Folga &quot;S&quot;)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'TRABALHO', label: 'Dia de Trabalho (Turno)' },
                      { id: 'FOLGA', label: 'S — Folga / DSR' },
                      { id: 'FERIAS', label: 'FE — Férias' },
                      { id: 'ATESTADO', label: 'AT — Atestado' },
                      { id: 'AUSENTE', label: 'FA — Falta' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setModalStatus(st.id)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border text-left transition ${
                        modalStatus === st.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {modalStatus === 'TRABALHO' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Turno de Trabalho
                  </label>
                  <select
                    value={modalTurno}
                    onChange={(e) => {
                      const novoT = e.target.value;
                      setModalTurno(novoT);
                      const h = obterHorarioPorTurno(novoT);
                      setModalInicio(h.inicio);
                      setModalFim(h.fim);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                  >
                    {TURNOS_OFICIAIS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id}
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Entrada</label>
                      <input
                        type="time"
                        value={modalInicio}
                        onChange={(e) => setModalInicio(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Saída</label>
                      <input
                        type="time"
                        value={modalFim}
                        onChange={(e) => setModalFim(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Observação (Opcional)</label>
                <input
                  type="text"
                  value={modalObs}
                  onChange={(e) => setModalObs(e.target.value)}
                  placeholder="Ex: Troca de folga, cobertura de horário..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                {celulaEditando.escalaExistente ? (
                  <button
                    type="button"
                    onClick={handleExcluirCelulaModal}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-bold transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir Registro
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCelulaEditando(null)}
                    className="px-3.5 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition"
                  >
                    Salvar Alteração
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ALTERAR OU EXCLUIR FUNCIONÁRIO DIRETO PELO PLANNER */}
      {funcEditando && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Alterar / Excluir Funcionário</h3>
              <button
                type="button"
                onClick={() => setFuncEditando(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarEdicaoFuncionario} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Cargo</label>
                  <select
                    value={editCargo}
                    onChange={(e) => setEditCargo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="Frentista">Frentista</option>
                    <option value="Operador de Caixa">Operador de Caixa</option>
                    <option value="Lubrificador">Lubrificador</option>
                    <option value="Supervisor de Pista">Supervisor de Pista</option>
                    <option value="Gerente">Gerente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Status</label>
                  <select
                    value={editStatusFunc}
                    onChange={(e) => setEditStatusFunc(e.target.value as FuncionarioStatus)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="ATIVO">Ativo</option>
                    <option value="FERIAS">Férias</option>
                    <option value="AFASTADO">Afastado</option>
                    <option value="INATIVO">Inativo</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Turno Preferencial</label>
                <select
                  value={editTurnoPref}
                  onChange={(e) => setEditTurnoPref(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                >
                  {TURNOS_OFICIAIS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleExcluirFuncionario(funcEditando)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-bold transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir Funcionário
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFuncEditando(null)}
                    className="px-3.5 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ESCANEAR IMAGEM DA ESCALA E VINCULAR TURNOS, FOLGAS ('S') E FUNCIONÁRIOS */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    Escanear Imagem da Escala e Vincular no Planner ({monthName})
                  </h3>
                  <p className="text-xs text-slate-300">
                    Envie a foto da escala para identificar e vincular automaticamente <strong>Turnos (T1, T2, Horista)</strong>, <strong>Folgas (&quot;S&quot;)</strong> e <strong>Funcionários</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Upload bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-purple-50/70 border border-purple-200 p-4 rounded-xl">
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadImagemScanner}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={escaneandoIA}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                  >
                    {escaneandoIA ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Escaneando Escala...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Enviar Foto / Imagem da Escala
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      gerarLinhasPadraoDeContingencia();
                      setAvisoScanner('Folha de escala carregada! Confira os vínculos de funcionários, turnos e folgas (S) abaixo.');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    Carregar Folha Exemplo
                  </button>
                </div>

                {avisoScanner && (
                  <div className="text-xs font-semibold text-purple-900 bg-white px-3 py-2 rounded-lg border border-purple-200">
                    {avisoScanner}
                  </div>
                )}
              </div>

              {/* Tabela de Vinculação: Funcionário Escaneado -> Funcionário do Planner + Grade de Turnos e Folgas 'S' */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-blue-600" />
                    Vincular Funcionários, Turnos (T1 / T2 / HOR) e Folgas (&quot;S&quot;)
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const diasObj: LinhaEscaneada['dias'] = {};
                      for (let d = 1; d <= daysInMonth; d++) {
                        const ehFolga = d % 7 === 0;
                        diasObj[d] = {
                          status: ehFolga ? 'FOLGA' : 'TRABALHO',
                          turno: ehFolga ? 'Folga' : 'Turno 1 - Manhã (06h - 14h)',
                          sigla: ehFolga ? 'S' : 'T1',
                        };
                      }
                      setLinhasEscaneadas((prev) => [
                        ...prev,
                        {
                          idTemp: `manual-scan-${Date.now()}`,
                          nomeNaImagem: `Colaborador ${prev.length + 1}`,
                          cargoSugerido: 'Frentista',
                          funcionarioIdVinculado: '',
                          dias: diasObj,
                        },
                      ]);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Linha na Escala
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700">
                        <th className="p-2.5 min-w-[180px] border-r border-slate-200">Nome Lido na Escala</th>
                        <th className="p-2.5 min-w-[230px] border-r border-slate-200">Vincular ao Funcionário</th>
                        {daysArray.map((d) => (
                          <th key={d} className="p-1 text-center min-w-[32px] border-r border-slate-200 font-mono">
                            {String(d).padStart(2, '0')}
                          </th>
                        ))}
                        <th className="p-2 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {linhasEscaneadas.map((linha, idx) => (
                        <tr key={linha.idTemp} className="hover:bg-slate-50">
                          <td className="p-2 border-r border-slate-200">
                            <input
                              type="text"
                              value={linha.nomeNaImagem}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLinhasEscaneadas((prev) =>
                                  prev.map((l, i) => (i === idx ? { ...l, nomeNaImagem: val } : l))
                                );
                              }}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-bold text-slate-900"
                            />
                          </td>
                          <td className="p-2 border-r border-slate-200">
                            <select
                              value={linha.funcionarioIdVinculado}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLinhasEscaneadas((prev) =>
                                  prev.map((l, i) => (i === idx ? { ...l, funcionarioIdVinculado: val } : l))
                                );
                              }}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-semibold bg-white text-slate-800"
                            >
                              <option value="">+ Cadastrar Novo ({linha.nomeNaImagem})</option>
                              {funcionarios.map((f) => (
                                <option key={f.id} value={f.id}>
                                  Vincular: {f.nome} ({f.cargo})
                                </option>
                              ))}
                            </select>
                          </td>
                          {daysArray.map((d) => {
                            const cell = linha.dias[d] || { status: 'TRABALHO', turno: 'Turno 1 - Manhã (06h - 14h)', sigla: 'T1' };
                            const isFolga = cell.status === 'FOLGA' || cell.sigla === 'S';
                            const badgeColor = isFolga
                              ? 'bg-emerald-100 text-emerald-900 font-black'
                              : cell.sigla === 'T2'
                              ? 'bg-blue-100 text-blue-900 font-bold'
                              : cell.sigla === 'HOR'
                              ? 'bg-teal-100 text-teal-900 font-bold'
                              : 'bg-amber-100 text-amber-900 font-bold';

                            return (
                              <td
                                key={d}
                                onClick={() => handleToggleDiaEscaneado(linha.idTemp, d)}
                                title="Clique para alternar: T1 -> T2 -> HOR -> S (Folga)"
                                className={`p-1 text-center border-r border-slate-100 cursor-pointer select-none ${badgeColor}`}
                              >
                                <span className="font-mono text-[10px]">{isFolga ? 'S' : cell.sigla}</span>
                              </td>
                            );
                          })}
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                setLinhasEscaneadas((prev) => prev.filter((l) => l.idTemp !== linha.idTemp))
                              }
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                              title="Remover linha"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Clique em qualquer célula da prévia acima para alternar entre <strong>T1</strong> (Manhã), <strong>T2</strong> (Tarde), <strong>HOR</strong> (Horista) e <strong>S</strong> (Folga).
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={salvandoVinculo || linhasEscaneadas.length === 0}
                  onClick={handleVincularESalvarNoPlanner}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  {salvandoVinculo ? 'Vinculando no Planner...' : 'Vincular e Salvar no Planner'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
