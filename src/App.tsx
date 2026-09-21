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
      // 1. Limpa todas as coleções operacionais
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

      // 2. Limpa dados armazenados em cache local
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

      // 3. Zera os estados em memória
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

      // 4. Registra auditoria
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
      // Modo Demonstração / Operador Local: carrega dados locais sem tocar na rede do Firestore
      carregarDadosLocais();
      return;
    }

    // Usuário autenticado com Firebase: testa conectividade e acopla listeners em tempo real
    testConnection();
    carregarDados();

    // Listeners do Firestore com cache local
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

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center space-y-6">
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-600 mx-auto flex items-center justify-center text-white font-bold text-xl shadow-lg">
              MP
            </div>
            <h1 className="text-2xl font-bold mt-4 tracking-tight">MEU POSTO 2.0</h1>
            <p className="text-xs text-slate-400 mt-1">
              Sistema Operacional Integrado para Postos de Combustíveis
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={signInWithGoogle}
              className="w-full py-3 px-4 bg-white text-slate-900 font-semibold text-sm rounded-xl hover:bg-slate-100 transition shadow-sm flex items-center justify-center gap-2"
            >
              Entrar com Google Workspace / Firebase
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800"></div>
              </div>
              <div className="relative flex justify-center text-[11px] uppercase">
                <span className="bg-slate-900 px-2 text-slate-500 font-bold">
                  Acesso Rápido por Papel Operacional
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => signInDemo('GERENTE')}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg border border-slate-700 transition"
              >
                Gerente Geral
              </button>
              <button
                onClick={() => signInDemo('SUPERVISOR')}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg border border-slate-700 transition"
              >
                Supervisor de Pista
              </button>
              <button
                onClick={() => signInDemo('OPERADOR')}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg border border-slate-700 transition"
              >
                Operador de Caixa
              </button>
              <button
                onClick={() => signInDemo('MASTER')}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg border border-slate-700 transition"
              >
                Auditor Master
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            Ambiente seguro com criptografia, Firestore isolado e permissões RBAC.
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'fechamento', label: 'Fechamento de Caixa', icon: DollarSign },
    { id: 'sobras-faltas', label: 'Sobras, Faltas & Rateio', icon: Scale },
    { id: 'planner', label: 'Planner & Escalas', icon: Calendar },
    { id: 'funcionarios', label: 'Funcionários', icon: Users },
    { id: 'lmc', label: 'LMC — Movimentação', icon: BookOpen },
    { id: 'tanques', label: 'Tanques & Régua', icon: Fuel },
    { id: 'afericoes', label: 'Bicos & Aferições', icon: Gauge },
    { id: 'analises', label: 'Qualidade & Conformidade', icon: TestTubes },
    { id: 'relatorios', label: 'Relatórios & Auditoria', icon: FileText },
    { id: 'ia-escala', label: 'IA — Escala por Imagem', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-900 font-sans print:bg-white print:min-h-0">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800 print:hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
              MP
            </div>
            <div>
              <div className="font-bold text-white text-sm tracking-wide">MEU POSTO 2.0</div>
              <div className="text-[10px] text-slate-400">Sistema Operacional</div>
            </div>
          </div>
        </div>

        {/* Perfil Ativo */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between">
            <div className="truncate">
              <div className="font-semibold text-xs text-white truncate">{userProfile.nome}</div>
              <div className="text-[10px] text-blue-400 font-bold uppercase">{userProfile.role}</div>
            </div>
            <button
              onClick={signOut}
              title="Sair"
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Itens do Menu */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-4 mt-4 border-t border-slate-800">
            <button
              onClick={() => setModalLimpezaAberto(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition"
              title="Remover todos os dados de demonstração e resetar coleções"
            >
              <Trash2 className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>Remover Demonstração</span>
            </button>
          </div>
        </nav>

        {/* Status de Sincronização / Offline no Rodapé */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 text-[11px] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className={isOnline ? 'text-emerald-400' : 'text-red-400'}>{syncState}</span>
            </div>
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </div>
          {pendingCount > 0 && (
            <button
              onClick={syncNow}
              className="w-full py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] rounded transition flex items-center justify-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Sincronizar Fila
            </button>
          )}
        </div>
      </aside>

      {/* Topbar Mobile */}
      <header className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-40 print:hidden">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center font-bold text-xs">
            MP
          </div>
          <span className="font-bold text-sm">MEU POSTO 2.0</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px]">
            {isOnline ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1 text-slate-300 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 text-slate-300 p-4 space-y-1 border-b border-slate-800 print:hidden">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold ${
                  active ? 'bg-blue-600 text-white' : 'text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                setModalLimpezaAberto(true);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>Remover Demonstração</span>
            </button>
          </div>
        </div>
      )}

      {/* Toast de Sucesso */}
      {toastSucesso && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-700 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastSucesso}</span>
        </div>
      )}

      {/* Modal de Confirmação de Remoção de Dados de Demonstração */}
      {modalLimpezaAberto && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Remover Dados de Demonstração?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Esta ação limpará permanentemente todos os registros de demonstração de funcionários, escalas, fechamentos, tanques e bicos do posto atual.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
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
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={limpandoDados}
                onClick={handleRemoverDadosDemonstracao}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg transition shadow-xs disabled:opacity-50"
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

      {/* Conteúdo Principal */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full print:p-0 print:m-0 print:max-w-none print:overflow-visible">
        {activeTab === 'dashboard' && (
          <DashboardView
            funcionarios={funcionarios}
            escalas={escalas}
            fechamentos={fechamentos}
            ocorrencias={ocorrencias}
            tanques={tanques}
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
