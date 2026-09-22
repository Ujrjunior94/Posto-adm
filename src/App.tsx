import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SyncProvider, useSync } from './contexts/SyncContext';
import {
  Funcionario,
  Escala,
  FechamentoCaixa,
  OcorrenciaCaixa,
  Tanque,
  Bico,
  Afericao,
  RegistroDensidade,
  Conformidade,
  AuditLog,
  LMCRegistro,
  RateioTurno,
} from './types';
import { PostoSubcollectionRepository, testConnection, registrarAuditoria } from './repositories/firestoreRepository';
import { DashboardView } from './features/dashboard/DashboardView';
import { FuncionariosView } from './features/funcionarios/FuncionariosView';
import { PlannerView } from './features/planner/PlannerView';
import { FechamentoCaixaView } from './features/fechamento/FechamentoCaixaView';
import { SobrasFaltasView } from './features/sobras-faltas/SobrasFaltasView';
import { LMCView } from './features/lmc/LMCView';
import { TanquesView } from './features/tanques/TanquesView';
import { BicosAfericoesView } from './features/afericoes/BicosAfericoesView';
import { AnalisesConformidadeView } from './features/analises/AnalisesConformidadeView';
import { RelatoriosView } from './features/relatorios/RelatoriosView';
import { IAEscalaView } from './features/ia-escala/IAEscalaView';
import {
  LayoutDashboard,
  Users,
  Calendar,
  DollarSign,
  Fuel,
  Gauge,
  TestTubes,
  FileText,
  Sparkles,
  ShieldCheck,
  Wifi,
  WifiOff,
  LogOut,
  User,
  RefreshCw,
  Menu,
  X,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  BookOpen,
  Scale,
  Plus,
  ArrowRight,
  Sun,
  Sunrise,
  Moon,
  Zap,
  Clock,
  ChevronRight,
} from 'lucide-react';

const repoFunc = new PostoSubcollectionRepository<Funcionario>('funcionarios');
const repoEscalas = new PostoSubcollectionRepository<Escala>('escalas');
const repoFech = new PostoSubcollectionRepository<FechamentoCaixa>('fechamentos');
const repoOcorr = new PostoSubcollectionRepository<OcorrenciaCaixa>('ocorrenciasCaixa');
const repoTanques = new PostoSubcollectionRepository<Tanque>('tanques');
const repoBicos = new PostoSubcollectionRepository<Bico>('bicos');
const repoAfericoes = new PostoSubcollectionRepository<Afericao>('afericoes');
const repoDensidades = new PostoSubcollectionRepository<RegistroDensidade>('densidades');
const repoConformidades = new PostoSubcollectionRepository<Conformidade>('conformidades');
const repoAuditoria = new PostoSubcollectionRepository<AuditLog>('auditoria');
const repoLMC = new PostoSubcollectionRepository<LMCRegistro>('lmc');
const repoRateio = new PostoSubcollectionRepository<RateioTurno>('rateios');

interface MenuItemDef {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  tag?: string;
  tagColor?: string;
  description: string;
}

interface MenuCategoryDef {
  title: string;
  items: MenuItemDef[];
}

const MENU_CATEGORIES: MenuCategoryDef[] = [
  {
    title: 'Visão Geral',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard Operacional',
        shortLabel: 'Dashboard',
        icon: LayoutDashboard,
        tag: 'Ao Vivo',
        tagColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        description: 'Métricas em tempo real, tanques e status da pista',
      },
    ],
  },
  {
    title: 'Equipe & Escala',
    items: [
      {
        id: 'planner',
        label: 'Planner & Escalas',
        shortLabel: 'Planner',
        icon: Calendar,
        description: 'Planejamento mensal e folgas da equipe',
      },
      {
        id: 'funcionarios',
        label: 'Funcionários de Pista',
        shortLabel: 'Funcionários',
        icon: Users,
        description: 'Cadastro de frentistas, cargos e turnos',
      },
      {
        id: 'ia-escala',
        label: 'IA — Leitor de Escala',
        shortLabel: 'Escala com IA',
        icon: Sparkles,
        tag: 'IA',
        tagColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        description: 'OCR inteligente de fotos de folhas e quadros',
      },
    ],
  },
  {
    title: 'Caixa & Faturamento',
    items: [
      {
        id: 'fechamento',
        label: 'Fechamento de Caixa',
        shortLabel: 'Fechamento',
        icon: DollarSign,
        description: 'Conferência de encerrantes, cartões e dinheiro',
      },
      {
        id: 'sobras-faltas',
        label: 'Sobras, Faltas & Rateio',
        shortLabel: 'Rateio',
        icon: Scale,
        description: 'Divisão justa de divergências entre operadores',
      },
      {
        id: 'lmc',
        label: 'LMC — Movimentação',
        shortLabel: 'LMC',
        icon: BookOpen,
        description: 'Livro de Movimentação de Combustíveis ANP',
      },
    ],
  },
  {
    title: 'Pátio & Qualidade',
    items: [
      {
        id: 'tanques',
        label: 'Tanques & Régua',
        shortLabel: 'Tanques',
        icon: Fuel,
        description: 'Tabela de arqueação e cálculo de régua',
      },
      {
        id: 'afericoes',
        label: 'Bicos & Aferições',
        shortLabel: 'Aferições',
        icon: Gauge,
        description: 'Balde aferidor 20L e controle Inmetro',
      },
      {
        id: 'analises',
        label: 'Qualidade & ANP',
        shortLabel: 'Qualidade',
        icon: TestTubes,
        description: 'Testes de proveta D32, densidades e conformidade',
      },
    ],
  },
  {
    title: 'Governança',
    items: [
      {
        id: 'relatorios',
        label: 'Relatórios & Auditoria',
        shortLabel: 'Relatórios',
        icon: FileText,
        description: 'Exportação PDF/Excel e rastreabilidade total',
      },
    ],
  },
];

const ALL_MENU_ITEMS: MenuItemDef[] = MENU_CATEGORIES.flatMap((c) => c.items);

const MainApp: React.FC = () => {
  const { currentUser, userProfile, postoId, signInDemo, signInWithGoogle, signOut } = useAuth();
  const { isOnline, syncState, pendingCount, syncNow } = useSync();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modalLimpezaAberto, setModalLimpezaAberto] = useState(false);
  const [limpandoDados, setLimpandoDados] = useState(false);
  const [toastSucesso, setToastSucesso] = useState('');

  // States dos dados operacionais reais em tempo real
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoCaixa[]>([]);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaCaixa[]>([]);
  const [tanques, setTanques] = useState<Tanque[]>([]);
  const [bicos, setBicos] = useState<Bico[]>([]);
  const [afericoes, setAfericoes] = useState<Afericao[]>([]);
  const [densidades, setDensidades] = useState<RegistroDensidade[]>([]);
  const [conformidades, setConformidades] = useState<Conformidade[]>([]);
  const [auditoria, setAuditoria] = useState<AuditLog[]>([]);

  // Turno operacional ao vivo baseado no relógio
  const horaAtual = new Date().getHours();
  const turnoAtual =
    horaAtual >= 6 && horaAtual < 14
      ? { nome: 'Turno 2 (Manhã)', icone: Sunrise, cor: 'text-amber-400 bg-amber-950/40 border-amber-800/60' }
      : horaAtual >= 14 && horaAtual < 22
      ? { nome: 'Turno 3 (Tarde)', icone: Sun, cor: 'text-orange-400 bg-orange-950/40 border-orange-800/60' }
      : { nome: 'Turno 4 (Noite)', icone: Moon, cor: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/60' };

  const TurnoIcone = turnoAtual.icone;

  const currentTabDef = ALL_MENU_ITEMS.find((item) => item.id === activeTab) || ALL_MENU_ITEMS[0];
  const CurrentIcon = currentTabDef.icon;

  const carregarDadosLocais = async () => {
    setFuncionarios(await repoFunc.getAll(postoId));
    setTanques(await repoTanques.getAll(postoId));
    setBicos(await repoBicos.getAll(postoId));
    setEscalas(await repoEscalas.getAll(postoId));
    setFechamentos(await repoFech.getAll(postoId));
    setOcorrencias(await repoOcorr.getAll(postoId));
    setAfericoes(await repoAfericoes.getAll(postoId));
    setDensidades(await repoDensidades.getAll(postoId));
    setConformidades(await repoConformidades.getAll(postoId));
    setAuditoria(await repoAuditoria.getAll(postoId));
  };

  const carregarDados = async () => {
    await carregarDadosLocais();
  };

  // Função para remover todos os dados de demonstração e resetar o posto
  const handleRemoverDadosDemonstracao = async () => {
    setLimpandoDados(true);
    try {
      await Promise.all([
        repoFunc.clearAll(postoId),
        repoEscalas.clearAll(postoId),
        repoFech.clearAll(postoId),
        repoOcorr.clearAll(postoId),
        repoTanques.clearAll(postoId),
        repoBicos.clearAll(postoId),
        repoAfericoes.clearAll(postoId),
        repoDensidades.clearAll(postoId),
        repoConformidades.clearAll(postoId),
        repoAuditoria.clearAll(postoId),
        repoLMC.clearAll(postoId),
        repoRateio.clearAll(postoId),
      ]);

      if (typeof window !== 'undefined' && window.localStorage) {
        const chavesParaRemover: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('meuposto_demo_') || key.startsWith('meuposto_'))) {
            chavesParaRemover.push(key);
          }
        }
        chavesParaRemover.forEach((k) => localStorage.removeItem(k));
      }

      setFuncionarios([]);
      setEscalas([]);
      setFechamentos([]);
      setOcorrencias([]);
      setTanques([]);
      setBicos([]);
      setAfericoes([]);
      setDensidades([]);
      setConformidades([]);
      setAuditoria([]);

      if (userProfile) {
        await registrarAuditoria(
          postoId,
          userProfile.uid,
          userProfile.nome,
          'SISTEMA',
          'BANCO_DE_DADOS',
          postoId,
          'DELETE',
          { acao: 'Remoção de dados de demonstração e reset de coleções' },
          null
        );
      }

      setModalLimpezaAberto(false);
      setToastSucesso('Dados de demonstração removidos com sucesso! Banco limpo para uso operacional.');
      setTimeout(() => setToastSucesso(''), 5000);
    } catch (err) {
      console.error('Erro ao remover dados de demonstração:', err);
      alert('Erro ao limpar dados: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLimpandoDados(false);
    }
  };

  useEffect(() => {
    if (!userProfile) return;

    if (!currentUser) {
      carregarDadosLocais();
      return;
    }

    testConnection();
    carregarDados();

    const unFunc = repoFunc.subscribe(postoId, setFuncionarios);
    const unEsc = repoEscalas.subscribe(postoId, setEscalas);
    const unFech = repoFech.subscribe(postoId, setFechamentos);
    const unOcorr = repoOcorr.subscribe(postoId, setOcorrencias);
    const unTanq = repoTanques.subscribe(postoId, setTanques);
    const unBic = repoBicos.subscribe(postoId, setBicos);
    const unAfer = repoAfericoes.subscribe(postoId, setAfericoes);
    const unDens = repoDensidades.subscribe(postoId, setDensidades);
    const unConf = repoConformidades.subscribe(postoId, setConformidades);
    const unAud = repoAuditoria.subscribe(postoId, setAuditoria);

    return () => {
      unFunc();
      unEsc();
      unFech();
      unOcorr();
      unTanq();
      unBic();
      unAfer();
      unDens();
      unConf();
      unAud();
    };
  }, [postoId, currentUser, userProfile]);

  // Tela de Acesso e Login Ilustrada & Direta
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-4 text-white relative overflow-hidden font-sans">
        {/* Gráfico decorativo de fundo */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-xl w-full bg-slate-900/90 backdrop-blur-md border border-slate-800 p-8 rounded-3xl shadow-2xl space-y-6 relative z-10">
          {/* Cabeçalho Ilustrado */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-xl shadow-blue-500/20 mb-2">
              <Fuel className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              <span>MEU POSTO</span>
              <span className="text-xs font-black px-2 py-0.5 rounded-md bg-blue-600 text-white tracking-widest uppercase">
                2.0
              </span>
            </h1>
            <p className="text-xs md:text-sm text-slate-400 max-w-sm mx-auto">
              Centro de Gestão Operacional de Pista, Pátio, Escalas e Caixa
            </p>
          </div>

          {/* Destaques Técnicos Rápidos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center space-y-1">
              <Sparkles className="w-4 h-4 text-indigo-400 mx-auto" />
              <div className="text-[11px] font-semibold text-slate-200">Escala IA</div>
              <div className="text-[10px] text-slate-400">OCR Gemini 3.8</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center space-y-1">
              <DollarSign className="w-4 h-4 text-emerald-400 mx-auto" />
              <div className="text-[11px] font-semibold text-slate-200">Caixa & Rateio</div>
              <div className="text-[10px] text-slate-400">Sem divergências</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center space-y-1">
              <Gauge className="w-4 h-4 text-amber-400 mx-auto" />
              <div className="text-[11px] font-semibold text-slate-200">Régua & LMC</div>
              <div className="text-[10px] text-slate-400">Padrão ANP</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center space-y-1">
              <Wifi className="w-4 h-4 text-cyan-400 mx-auto" />
              <div className="text-[11px] font-semibold text-slate-200">Offline-First</div>
              <div className="text-[10px] text-slate-400">Nunca trava</div>
            </div>
          </div>

          {/* Seletor Direto de Papéis Operacionais */}
          <div className="space-y-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
              Escolha seu perfil para entrada imediata
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Gerente Geral */}
              <button
                onClick={() => signInDemo('GERENTE')}
                className="p-3 bg-slate-800/80 hover:bg-slate-750 hover:border-blue-500/80 border border-slate-700/80 rounded-xl transition text-left flex items-start gap-3 group active:scale-98"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-white group-hover:text-blue-300 transition">
                    Gerente Geral
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Controle total, LMC, rateios e relatórios
                  </div>
                </div>
              </button>

              {/* Supervisor de Pista */}
              <button
                onClick={() => signInDemo('SUPERVISOR')}
                className="p-3 bg-slate-800/80 hover:bg-slate-750 hover:border-emerald-500/80 border border-slate-700/80 rounded-xl transition text-left flex items-start gap-3 group active:scale-98"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-white group-hover:text-emerald-300 transition">
                    Supervisor de Pista
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Planner, escalas, aferições e equipe
                  </div>
                </div>
              </button>

              {/* Operador de Caixa */}
              <button
                onClick={() => signInDemo('OPERADOR')}
                className="p-3 bg-slate-800/80 hover:bg-slate-750 hover:border-amber-500/80 border border-slate-700/80 rounded-xl transition text-left flex items-start gap-3 group active:scale-98"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition flex items-center justify-center shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-white group-hover:text-amber-300 transition">
                    Operador de Caixa
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Fechamento de turno e sangrias
                  </div>
                </div>
              </button>

              {/* Auditor Master */}
              <button
                onClick={() => signInDemo('MASTER')}
                className="p-3 bg-slate-800/80 hover:bg-slate-750 hover:border-purple-500/80 border border-slate-700/80 rounded-xl transition text-left flex items-start gap-3 group active:scale-98"
              >
                <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-white group-hover:text-purple-300 transition">
                    Auditor Master
                  </div>
                  <div className="text-[10px] text-slate-400">
                    ANP, qualidade, conformidade e logs
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={signInWithGoogle}
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs rounded-xl transition shadow-md flex items-center justify-center gap-2"
            >
              <span>Autenticar com Google Workspace / Firebase</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-900 font-sans print:bg-white print:min-h-0">
      {/* 1. Sidebar Desktop Ilustrada e Organizada por Categorias */}
      <aside className="hidden md:flex flex-col w-68 bg-slate-900 text-slate-300 border-r border-slate-800 print:hidden shrink-0">
        {/* Cabeçalho da Marca & Posto */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-600/30 font-bold shrink-0">
              <Fuel className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-white text-sm tracking-wide flex items-center gap-1.5">
                <span>MEU POSTO</span>
                <span className="text-[9px] font-black px-1.5 py-0.2 bg-blue-600 text-white rounded">
                  2.0
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate">Matriz Central</div>
            </div>
          </div>
        </div>

        {/* Perfil do Usuário e Turno Ativo */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/30 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-700">
                {userProfile.nome.slice(0, 1).toUpperCase()}
              </div>
              <div className="truncate min-w-0">
                <div className="font-semibold text-xs text-white truncate">{userProfile.nome}</div>
                <div className="text-[10px] text-blue-400 font-bold uppercase">{userProfile.role}</div>
              </div>
            </div>
            <button
              onClick={signOut}
              title="Encerrar sessão"
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Chip do Turno Atual */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${turnoAtual.cor}`}>
            <TurnoIcone className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{turnoAtual.nome}</span>
          </div>
        </div>

        {/* Lista de Navegação por Categorias */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {MENU_CATEGORIES.map((category) => (
            <div key={category.title} className="space-y-1">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {category.title}
              </div>
              {category.items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition active:scale-98 ${
                      active
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.tag && (
                      <span
                        className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border shrink-0 ${
                          active
                            ? 'bg-white/20 text-white border-white/30'
                            : item.tagColor || 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {item.tag}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Botão de Remoção de Dados de Demonstração */}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => setModalLimpezaAberto(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition"
              title="Resetar banco de demonstração"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Remover Demonstração</span>
            </button>
          </div>
        </nav>

        {/* Rodapé de Status de Rede e Sincronização */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-[11px] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className={`text-[11px] font-medium ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                {syncState}
              </span>
            </div>
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {pendingCount}
              </span>
            )}
          </div>

          {pendingCount > 0 && (
            <button
              onClick={syncNow}
              className="w-full py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold rounded-lg transition flex items-center justify-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Sincronizar Fila Offline</span>
            </button>
          )}
        </div>
      </aside>

      {/* 2. Topbar Mobile */}
      <header className="md:hidden bg-slate-900 text-white p-3.5 flex items-center justify-between sticky top-0 z-40 print:hidden border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-sm">
            <Fuel className="w-4 h-4" />
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-wide">MEU POSTO</span>
            <span className="text-[9px] font-bold ml-1 px-1 rounded bg-blue-600 text-white">2.0</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] mr-1">
            {isOnline ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-red-400" />
            )}
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Drawer Mobile Ilustrado */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 text-slate-300 p-4 space-y-3 border-b border-slate-800 max-h-[80vh] overflow-y-auto print:hidden">
          {MENU_CATEGORIES.map((category) => (
            <div key={category.title} className="space-y-1">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {category.title}
              </div>
              {category.items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold ${
                      active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                    {item.tag && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        {item.tag}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                setModalLimpezaAberto(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
              <span>Remover Demonstração</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Área Principal com Topbar de Atalhos Rápidos e Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra Superior Global com Indicador de Seção e Ações Rápidas */}
        <header className="hidden md:flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 print:hidden shrink-0">
          {/* Seção Atual com Ícone e Descrição */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <CurrentIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900 leading-tight">
                {currentTabDef.label}
              </div>
              <div className="text-[11px] text-slate-500 leading-tight">
                {currentTabDef.description}
              </div>
            </div>
          </div>

          {/* Atalhos Rápidos Diretos (1-Clique) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('fechamento')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'fechamento'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>+ Fechamento</span>
            </button>

            <button
              onClick={() => setActiveTab('ia-escala')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'ia-escala'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ler Escala (IA)</span>
            </button>

            <button
              onClick={() => setActiveTab('tanques')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'tanques'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-700 border border-slate-200'
              }`}
            >
              <Fuel className="w-3.5 h-3.5" />
              <span>Régua</span>
            </button>

            <button
              onClick={() => setActiveTab('afericoes')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'afericoes'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-cyan-50 text-slate-700 hover:text-cyan-700 border border-slate-200'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>Aferição 20L</span>
            </button>
          </div>
        </header>

        {/* Toast de Sucesso */}
        {toastSucesso && (
          <div className="fixed top-5 right-5 z-50 bg-emerald-700 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toastSucesso}</span>
          </div>
        )}

        {/* Modal de Confirmação de Remoção de Dados de Demonstração */}
        {modalLimpezaAberto && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Remover Dados de Demonstração?</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Esta ação limpará permanentemente todos os registros de demonstração de funcionários, escalas, fechamentos, tanques e bicos do posto atual.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">O que será zerado:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-500">
                  <li>Funcionários e operadores cadastrados</li>
                  <li>Escalas de trabalho e planejamentos</li>
                  <li>Fechamentos de caixa e faltas registradas</li>
                  <li>Tanques de combustível e tabelas de régua</li>
                  <li>Bicos e histórico de aferições</li>
                  <li>Análises de densidade e checklists</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={limpandoDados}
                  onClick={() => setModalLimpezaAberto(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={limpandoDados}
                  onClick={handleRemoverDadosDemonstracao}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition shadow-xs disabled:opacity-50"
                >
                  {limpandoDados ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Limpando dados...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Confirmar e Limpar Tudo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo Principal Renderizado */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full print:p-0 print:m-0 print:max-w-none print:overflow-visible">
          {activeTab === 'dashboard' && (
            <DashboardView
              funcionarios={funcionarios}
              escalas={escalas}
              fechamentos={fechamentos}
              ocorrencias={ocorrencias}
              tanques={tanques}
              bicos={bicos}
              afericoes={afericoes}
              densidades={densidades}
              conformidades={conformidades}
              onNavigate={(aba) => setActiveTab(aba)}
            />
          )}

          {activeTab === 'funcionarios' && (
            <FuncionariosView funcionarios={funcionarios} onReload={carregarDados} />
          )}

          {activeTab === 'fechamento' && (
            <FechamentoCaixaView
              fechamentos={fechamentos}
              ocorrencias={ocorrencias}
              funcionarios={funcionarios}
              escalas={escalas}
              bicos={bicos}
              tanques={tanques}
              onReload={carregarDados}
            />
          )}

          {activeTab === 'sobras-faltas' && (
            <SobrasFaltasView
              escalas={escalas}
              funcionarios={funcionarios}
              fechamentos={fechamentos}
              onReload={carregarDados}
            />
          )}

          {activeTab === 'planner' && (
            <PlannerView
              escalas={escalas}
              funcionarios={funcionarios}
              onReload={carregarDados}
              onNavigateToIAEscala={() => setActiveTab('ia-escala')}
            />
          )}

          {activeTab === 'lmc' && (
            <LMCView
              tanques={tanques}
              bicos={bicos}
              fechamentos={fechamentos}
              onReload={carregarDados}
            />
          )}

          {activeTab === 'tanques' && <TanquesView tanques={tanques} onReload={carregarDados} />}

          {activeTab === 'afericoes' && (
            <BicosAfericoesView
              bicos={bicos}
              afericoes={afericoes}
              tanques={tanques}
              funcionarios={funcionarios}
              onReload={carregarDados}
            />
          )}

          {activeTab === 'analises' && (
            <AnalisesConformidadeView
              densidades={densidades}
              conformidades={conformidades}
              funcionarios={funcionarios}
              onReload={carregarDados}
            />
          )}

          {activeTab === 'relatorios' && (
            <RelatoriosView
              funcionarios={funcionarios}
              escalas={escalas}
              fechamentos={fechamentos}
              ocorrencias={ocorrencias}
              tanques={tanques}
              bicos={bicos}
              afericoes={afericoes}
              densidades={densidades}
              conformidades={conformidades}
              auditoria={auditoria}
              onLimparDemonstracao={() => setModalLimpezaAberto(true)}
            />
          )}

          {activeTab === 'ia-escala' && (
            <IAEscalaView
              funcionarios={funcionarios}
              onReload={carregarDados}
              onNavigateToPlanner={() => setActiveTab('planner')}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <MainApp />
      </SyncProvider>
    </AuthProvider>
  );
}
