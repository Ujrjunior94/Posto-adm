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
  UserRole,
  EscalaImportada,
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
  PanelLeftClose,
  PanelLeftOpen,
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
const repoEscalasImportadas = new PostoSubcollectionRepository<EscalaImportada>('escalasImportadas');

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
  const {
    currentUser,
    userProfile,
    postoId,
    usuariosCadastrados,
    signInDemo,
    signInWithGoogle,
    signInWithCredentials,
    registerAccess,
    signOut,
  } = useAuth();
  const { isOnline, syncState, pendingCount, ultimoPingNuvem, syncNow } = useSync();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [modalLimpezaAberto, setModalLimpezaAberto] = useState(false);
  const [limpandoDados, setLimpandoDados] = useState(false);
  const [toastSucesso, setToastSucesso] = useState('');

  // Estados da tela simplificada de Login e Cadastro de Acesso
  const [modoAcesso, setModoAcesso] = useState<'LOGIN' | 'CADASTRO'>('LOGIN');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  const [cadastroNome, setCadastroNome] = useState('');
  const [cadastroEmail, setCadastroEmail] = useState('');
  const [cadastroSenha, setCadastroSenha] = useState('');
  const [cadastroRole, setCadastroRole] = useState<UserRole>('GERENTE');
  const [erroAuth, setErroAuth] = useState('');
  const [autenticando, setAutenticando] = useState(false);

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
  const [escalasImportadas, setEscalasImportadas] = useState<EscalaImportada[]>([]);

  // Turno operacional ao vivo baseado no relógio (Turno 1 = Manhã, Turno 2 = Tarde)
  const horaAtual = new Date().getHours();
  const turnoAtual =
    horaAtual < 14
      ? { nome: 'Turno 1 — Manhã', icone: Sunrise, cor: 'text-amber-400 bg-amber-950/40 border-amber-800/60' }
      : { nome: 'Turno 2 — Tarde', icone: Sun, cor: 'text-blue-400 bg-blue-950/40 border-blue-800/60' };

  const TurnoIcone = turnoAtual.icone;

  const currentTabDef = ALL_MENU_ITEMS.find((item) => item.id === activeTab) || ALL_MENU_ITEMS[0];
  const CurrentIcon = currentTabDef.icon;

  const carregarDadosNuvem = async () => {
    const [f, t, b, e, fc, oc, af, dn, cf, au, ei] = await Promise.all([
      repoFunc.getAll(postoId),
      repoTanques.getAll(postoId),
      repoBicos.getAll(postoId),
      repoEscalas.getAll(postoId),
      repoFech.getAll(postoId),
      repoOcorr.getAll(postoId),
      repoAfericoes.getAll(postoId),
      repoDensidades.getAll(postoId),
      repoConformidades.getAll(postoId),
      repoAuditoria.getAll(postoId),
      repoEscalasImportadas.getAll(postoId),
    ]);
    setFuncionarios(f);
    setTanques(t);
    setBicos(b);
    setEscalas(e);
    setFechamentos(fc);
    setOcorrencias(oc);
    setAfericoes(af);
    setDensidades(dn);
    setConformidades(cf);
    setAuditoria(au);
    setEscalasImportadas(ei);
  };

  const carregarDados = async () => {
    await carregarDadosNuvem();
  };

  // Função para remover todos os dados de demonstração e zerar as coleções na nuvem Firestore
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
          if (key && (key.startsWith('meuposto_demo_') || key === 'meu_posto_sync_queue')) {
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
          'BANCO_DE_DADOS_NUVEM',
          postoId,
          'DELETE',
          { acao: 'Limpeza completa de dados de demonstração na nuvem 24h' },
          null
        );
      }

      setModalLimpezaAberto(false);
      setToastSucesso('Dados de demonstração limpos na nuvem! Sistema pronto para operação real 24h.');
      setTimeout(() => setToastSucesso(''), 5000);
    } catch (err) {
      console.error('Erro ao remover dados de demonstração:', err);
      alert('Erro ao limpar dados na nuvem: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLimpandoDados(false);
    }
  };

  useEffect(() => {
    if (!userProfile) return;

    testConnection();

    // Conexão 24 horas em tempo real (onSnapshot) diretamente no Google Cloud Firestore
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
    const unEscImp = repoEscalasImportadas.subscribe(postoId, setEscalasImportadas);

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
      unEscImp();
    };
  }, [postoId, userProfile]);

  // Tela de Login Simplificada com Cadastro de Acesso Habilitado
  if (!userProfile) {
    const handleSubmeterLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setErroAuth('');
      setAutenticando(true);
      try {
        await signInWithCredentials(loginEmail, loginSenha);
      } catch (err: unknown) {
        setErroAuth(err instanceof Error ? err.message : 'Erro ao entrar.');
      } finally {
        setAutenticando(false);
      }
    };

    const handleSubmeterCadastro = async (e: React.FormEvent) => {
      e.preventDefault();
      setErroAuth('');
      setAutenticando(true);
      try {
        await registerAccess({
          nome: cadastroNome,
          email: cadastroEmail,
          senha: cadastroSenha,
          role: cadastroRole,
        });
      } catch (err: unknown) {
        setErroAuth(err instanceof Error ? err.message : 'Erro ao cadastrar acesso.');
      } finally {
        setAutenticando(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-6 sm:p-7 rounded-2xl shadow-2xl space-y-5">
          {/* Cabeçalho Enxuto */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Fuel className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-white">MEU POSTO</h1>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-600 text-white uppercase">
                  2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">Acesso ao Sistema Operacional</p>
            </div>
          </div>

          {/* Alternador Entrar / Cadastrar Acesso */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setModoAcesso('LOGIN');
                setErroAuth('');
              }}
              className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                modoAcesso === 'LOGIN'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setModoAcesso('CADASTRO');
                setErroAuth('');
              }}
              className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                modoAcesso === 'CADASTRO'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cadastrar Acesso
            </button>
          </div>

          {/* Alerta de Erro */}
          {erroAuth && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{erroAuth}</span>
            </div>
          )}

          {modoAcesso === 'LOGIN' ? (
            <form onSubmit={handleSubmeterLogin} className="space-y-3.5">
              {usuariosCadastrados.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">
                    Acessos Cadastrados (clique para preencher):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {usuariosCadastrados.slice(0, 4).map((u) => (
                      <button
                        key={u.uid}
                        type="button"
                        onClick={() => {
                          setLoginEmail(u.email);
                          setErroAuth('');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                          loginEmail.toLowerCase() === u.email.toLowerCase()
                            ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                            : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {u.nome} ({u.role})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Senha</label>
                <input
                  type="password"
                  required
                  value={loginSenha}
                  onChange={(e) => setLoginSenha(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={autenticando}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
              >
                {autenticando ? 'Entrando...' : 'Entrar no Sistema'}
              </button>

              <button
                type="button"
                onClick={signInWithGoogle}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Entrar com Conta Google</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmeterCadastro} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={cadastroNome}
                  onChange={(e) => setCadastroNome(e.target.value)}
                  placeholder="Ex: Carlos Eduardo"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail de Acesso</label>
                <input
                  type="email"
                  required
                  value={cadastroEmail}
                  onChange={(e) => setCadastroEmail(e.target.value)}
                  placeholder="carlos@meuposto.com"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Função / Perfil</label>
                  <select
                    value={cadastroRole}
                    onChange={(e) => setCadastroRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="GERENTE">Gerente Geral</option>
                    <option value="SUPERVISOR">Supervisor de Pista</option>
                    <option value="OPERADOR">Operador / Caixa</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Criar Senha</label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={cadastroSenha}
                    onChange={(e) => setCadastroSenha(e.target.value)}
                    placeholder="Mín. 4 dígitos"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={autenticando}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
              >
                {autenticando ? 'Cadastrando...' : 'Criar Acesso e Entrar'}
              </button>
            </form>
          )}

          {/* Barra Compacta de Acesso Rápido sem Senha */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase text-center">
              Acesso Rápido de Pista (1 Clique)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => signInDemo('GERENTE')}
                className="py-2 px-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                Gerente
              </button>
              <button
                type="button"
                onClick={() => signInDemo('SUPERVISOR')}
                className="py-2 px-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                Supervisor
              </button>
              <button
                type="button"
                onClick={() => signInDemo('OPERADOR')}
                className="py-2 px-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                Operador
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-900 font-sans print:bg-white print:min-h-0">
      {/* 1. Sidebar Desktop/Tablet Ilustrada e Organizada por Categorias (Colapsável) */}
      <aside
        className={`hidden md:flex flex-col ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } bg-slate-900 text-slate-300 border-r border-slate-800 print:hidden shrink-0 transition-all duration-200 select-none`}
      >
        {/* Cabeçalho da Marca & Posto com botão para recolher */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-600/30 font-bold shrink-0">
              <Fuel className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-white text-sm tracking-wide flex items-center gap-1.5">
                  <span className="truncate">MEU POSTO</span>
                  <span className="text-[9px] font-black px-1.5 py-0.2 bg-blue-600 text-white rounded shrink-0">
                    2.0
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate">Matriz Central</div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher para modo compacto'}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition shrink-0 cursor-pointer"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Perfil do Usuário e Turno Ativo */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/30 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-700"
                title={`${userProfile.nome} (${userProfile.role})`}
              >
                {userProfile.nome.slice(0, 1).toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div className="truncate min-w-0">
                  <div className="font-semibold text-xs text-white truncate">{userProfile.nome}</div>
                  <div className="text-[10px] text-blue-400 font-bold uppercase">{userProfile.role}</div>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <button
                onClick={signOut}
                title="Encerrar sessão"
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Chip do Turno Atual */}
          {!sidebarCollapsed ? (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${turnoAtual.cor}`}>
              <TurnoIcone className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{turnoAtual.nome}</span>
            </div>
          ) : (
            <div
              className="flex items-center justify-center p-1 rounded-lg border text-amber-400 border-slate-700"
              title={turnoAtual.nome}
            >
              <TurnoIcone className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Lista de Navegação por Categorias */}
        <nav className="flex-1 p-2 space-y-3 overflow-y-auto">
          {MENU_CATEGORIES.map((category) => (
            <div key={category.title} className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-3 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {category.title}
                </div>
              )}
              {category.items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
                    } rounded-xl text-xs font-semibold transition active:scale-98 cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!sidebarCollapsed && item.tag && (
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
              className={`w-full flex items-center ${
                sidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
              } rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition cursor-pointer`}
              title="Resetar banco de demonstração"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Remover Demonstração</span>}
            </button>
          </div>
        </nav>

        {/* Rodapé de Status de Rede e Sincronização 24h na Nuvem */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-[11px] space-y-2">
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-1.5">
              {isOnline ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
              )}
              {!sidebarCollapsed && (
                <span className={`text-[11px] font-bold ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                  {syncState}
                </span>
              )}
            </div>
            {!sidebarCollapsed && (
              <span className="text-[9px] font-mono text-slate-400">
                Sync {ultimoPingNuvem}
              </span>
            )}
          </div>

          {!sidebarCollapsed && pendingCount > 0 && (
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

      {/* 2. Topbar Mobile Otimizada para Touch */}
      <header className="md:hidden bg-slate-900/95 backdrop-blur-md text-white h-14 px-3.5 flex items-center justify-between sticky top-0 z-40 print:hidden border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-xs shrink-0">
            <Fuel className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex items-center gap-1.5 truncate">
            <span className="font-extrabold text-xs tracking-wide">MEU POSTO</span>
            <span className="text-slate-400 text-xs">·</span>
            <span className="text-xs font-semibold text-blue-400 truncate">
              {currentTabDef.shortLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-slate-800/80 border border-slate-700"
            title={isOnline ? 'Nuvem Conectada' : 'Offline'}
          >
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-[10px] font-mono text-slate-300">24h</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir Menu Completo"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-xl text-slate-200 transition cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Drawer Mobile Moderno com Backdrop e Gestão Touch */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex print:hidden">
          {/* Backdrop escurecido */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Painel lateral deslizante */}
          <div className="relative w-80 max-w-[85vw] bg-slate-900 text-slate-200 h-full flex flex-col shadow-2xl border-r border-slate-800 z-10 animate-in slide-in-from-left duration-200">
            {/* Header do Drawer */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                  <Fuel className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-white">MEU POSTO 2.0</div>
                  <div className="text-[10px] text-slate-400">{userProfile.nome} ({userProfile.role})</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista com scroll e alvos de toque generosos */}
            <div className="flex-1 p-3 space-y-4 overflow-y-auto">
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
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition active:scale-98 cursor-pointer ${
                          active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
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

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setModalLimpezaAberto(true);
                  }}
                  className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remover Demonstração</span>
                </button>

                <button
                  type="button"
                  onClick={signOut}
                  className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Encerrar Sessão</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Área Principal com Topbar de Atalhos Rápidos e Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra Superior Global com Indicador de Seção e Ações Rápidas (Desktop/Tablet) */}
        <header className="hidden md:flex items-center justify-between px-4 lg:px-6 py-3 bg-white border-b border-slate-200 print:hidden shrink-0">
          {/* Seção Atual com Ícone e Descrição */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
              <CurrentIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-900 leading-tight truncate">
                {currentTabDef.label}
              </div>
              <div className="text-[11px] text-slate-500 leading-tight truncate">
                {currentTabDef.description}
              </div>
            </div>
          </div>

          {/* Atalhos Rápidos Diretos (1-Clique) e Status Nuvem 24h com visual responsivo */}
          <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
            <div
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap"
              title={`Sincronizado em tempo real no Google Cloud Firestore (${ultimoPingNuvem})`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Nuvem 24h</span>
            </div>

            <button
              onClick={() => setActiveTab('afericoes')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'afericoes'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800 border border-slate-200'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>Bombas 20L</span>
            </button>

            <button
              onClick={() => setActiveTab('fechamento')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'fechamento'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>+ Fechamento</span>
            </button>

            <button
              onClick={() => setActiveTab('analises')}
              className={`hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'analises'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 border border-slate-200'
              }`}
            >
              <TestTubes className="w-3.5 h-3.5" />
              <span>Qualidade ANP</span>
            </button>

            <button
              onClick={() => setActiveTab('tanques')}
              className={`hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'tanques'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200'
              }`}
            >
              <Fuel className="w-3.5 h-3.5" />
              <span>Régua</span>
            </button>

            <button
              onClick={() => setModalLimpezaAberto(true)}
              disabled={limpandoDados}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition whitespace-nowrap cursor-pointer"
              title="Limpar todos os dados de demonstração da nuvem"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar</span>
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

        {/* Barra Visual de Ícones de Representação Operacional (Acesso Direto 1-Clique) */}
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 md:px-6 py-2.5 overflow-x-auto print:hidden shrink-0">
          <div className="flex items-center gap-2 min-w-max max-w-7xl mx-auto">
            {ALL_MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isAtivo = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  title={item.description}
                  className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isAtivo
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition ${
                      isAtivo
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-900 text-blue-400 group-hover:text-amber-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span>{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conteúdo Principal Renderizado */}
        <main className="flex-1 p-3 sm:p-5 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-7xl mx-auto w-full print:p-0 print:m-0 print:max-w-none print:overflow-visible">
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
              escalasImportadas={escalasImportadas}
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
              escalasImportadas={escalasImportadas}
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
              escalas={escalas}
              escalasImportadas={escalasImportadas}
              onReload={carregarDados}
              onNavigateToPlanner={() => setActiveTab('planner')}
            />
          )}
        </main>

        {/* Barra de Navegação Inferior Rápida (Mobile / Tablet de Pista) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3 py-1 flex items-center justify-around print:hidden pb-safe">
          <button
            type="button"
            onClick={() => {
              setActiveTab('dashboard');
              setMobileMenuOpen(false);
            }}
            className={`min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition active:scale-95 cursor-pointer ${
              activeTab === 'dashboard' ? 'text-blue-400 font-bold' : 'text-slate-400'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Início</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('planner');
              setMobileMenuOpen(false);
            }}
            className={`min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition active:scale-95 cursor-pointer ${
              activeTab === 'planner' ? 'text-blue-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span>Planner</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('afericoes');
              setMobileMenuOpen(false);
            }}
            className={`min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition active:scale-95 cursor-pointer ${
              activeTab === 'afericoes' ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Gauge className="w-5 h-5" />
            <span>Bombas</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('fechamento');
              setMobileMenuOpen(false);
            }}
            className={`min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition active:scale-95 cursor-pointer ${
              activeTab === 'fechamento' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <DollarSign className="w-5 h-5" />
            <span>Caixa</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-slate-400 hover:text-white active:scale-95 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
            <span>Menu</span>
          </button>
        </nav>
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
