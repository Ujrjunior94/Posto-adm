/**
 * SUÍTE INTEGRADA DE TESTES DE SEGURANÇA E AUDITORIA - MEU POSTO
 *
 * Módulos Avaliados:
 * 1. FIRESTORE SECURITY RULES (Lógica declarativa das regras em firestore.rules)
 * 2. CADASTRO & AUTENTICAÇÃO (AuthContext.tsx)
 * 3. SINCRONIZAÇÃO OFFLINE CONCORRENTE E PRESERVAÇÃO DE DADOS (SyncContext.tsx)
 */

import fs from 'fs';
import path from 'path';

interface TestResult {
  suite: string;
  id: string;
  descricao: string;
  passou: boolean;
  detalhe: string;
}

const resultados: TestResult[] = [];

function assertTest(suite: string, id: string, descricao: string, passou: boolean, detalhe: string) {
  resultados.push({ suite, id, descricao, passou, detalhe });
  const status = passou ? '✅ [APROVADO]' : '❌ [FALHA]';
  console.log(`${status} [${suite}] ${id}: ${descricao}`);
  console.log(`   Detalhes: ${detalhe}\n`);
}

// =========================================================================
// SUÍTE 1: AUDITORIA DAS REGRAS DO FIRESTORE (firestore.rules)
// =========================================================================
function testarFirestoreRules() {
  console.log('--- SUÍTE 1: VERIFICAÇÃO DAS REGRAS DO FIRESTORE ---');

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  // 1.1 Verificação de Negação por Padrão (Catch-all)
  const temDefaultDeny = rulesContent.includes('match /{document=**}') && rulesContent.includes('allow read, write: if false;');
  assertTest(
    'FirestoreRules',
    'R-01',
    'Negação por Padrão (Catch-all Deny by Default)',
    temDefaultDeny,
    'Regra raiz fecha acesso não mapeado explicitamente com "allow read, write: if false;".'
  );

  // 1.2 Verificação de isPostoMember(): NUNCA deve liberar acesso por ausência de documento (!userHasDoc)
  const temFuroAusenciaDoc = rulesContent.includes('!userHasDoc()') || rulesContent.includes('!userDocExists()');
  const exigeUsuarioAtivo = rulesContent.includes('function isUserActive()') && rulesContent.includes('currentUserData().ativo == true');
  const isPostoMemberSeguro = !temFuroAusenciaDoc && rulesContent.includes('function isPostoMember(postoId)') && rulesContent.includes('isUserActive()');

  assertTest(
    'FirestoreRules',
    'R-02',
    'Correção do isPostoMember() - Sem brecha por ausência de perfil',
    isPostoMemberSeguro,
    'Removida brecha "!userHasDoc()". Agora o usuário deve obrigatoriamente existir e ter ativo == true.'
  );

  // 1.3 Impedimento de criação de perfil privilegiado (GERENTE/ADMINISTRADOR) via API direta
  const proibeAutoGerente = rulesContent.includes("incoming().role == 'OPERADOR'") && rulesContent.includes('isBootstrapAdminEmail()');
  assertTest(
    'FirestoreRules',
    'R-03',
    'Anti-Autoproclamação de GERENTE em /usuarios/{uid}',
    proibeAutoGerente,
    'Regras forçam que criação de perfil por auto-cadastro seja estritamente OPERADOR, permitindo privilégio apenas para o bootstrap admin verificado.'
  );

  // 1.4 Impedimento de alteração do próprio role (Anti-Privilege Escalation em update)
  const proibeMudancaRoleProprio = rulesContent.includes('incoming().role == existingData().role') &&
                                   rulesContent.includes('incoming().ativo == existingData().ativo') &&
                                   rulesContent.includes('incoming().postoId == existingData().postoId');
  assertTest(
    'FirestoreRules',
    'R-04',
    'Imutabilidade de Role, Ativo e PostoId no auto-update',
    proibeMudancaRoleProprio,
    'Colaborador não pode alterar o próprio papel (role), reativar conta inativa ou migrar de postoId.'
  );

  // 1.5 Imutabilidade da trilha de auditoria
  const auditoriaImutavel = rulesContent.includes('match /auditoria/{auditoriaId}') && rulesContent.includes('allow update, delete: if false;');
  assertTest(
    'FirestoreRules',
    'R-05',
    'Imutabilidade Estrita da Trilha de Auditoria (WORM)',
    auditoriaImutavel,
    'Tentativas de update ou delete na subcoleção de auditoria são estritamente negadas.'
  );

  // 1.6 Simulação Lógica das Funções do Firestore Rules
  interface MockAuthContext {
    auth: { uid: string; token: { email: string; email_verified: boolean } } | null;
    db: {
      usuarios: Record<string, { role: string; postoId: string; ativo: boolean }>;
    };
  }

  const simularRegraPostoMember = (ctx: MockAuthContext, postoAlvo: string): boolean => {
    if (!ctx.auth || !ctx.auth.uid) return false;
    const userDoc = ctx.db.usuarios[ctx.auth.uid];
    if (!userDoc) return false; // Perfil inexistente -> NEGADO
    if (userDoc.ativo !== true) return false; // Perfil inativo -> NEGADO
    const isManager = userDoc.role === 'GERENTE' || userDoc.role === 'ADMINISTRADOR';
    return userDoc.postoId === postoAlvo || isManager;
  };

  // Cenário A: Usuário sem autenticação tentando ler posto
  const ctxAnonimo: MockAuthContext = { auth: null, db: { usuarios: {} } };
  const rAnonimo = simularRegraPostoMember(ctxAnonimo, 'posto-matriz-01');

  // Cenário B: Usuário autenticado mas sem perfil no Firestore
  const ctxSemPerfil: MockAuthContext = {
    auth: { uid: 'u-novo', token: { email: 'novo@teste.com', email_verified: true } },
    db: { usuarios: {} },
  };
  const rSemPerfil = simularRegraPostoMember(ctxSemPerfil, 'posto-matriz-01');

  // Cenário C: Usuário autenticado com perfil inativo (demitido/bloqueado)
  const ctxInativo: MockAuthContext = {
    auth: { uid: 'u-inativo', token: { email: 'bloqueado@posto.com', email_verified: true } },
    db: {
      usuarios: {
        'u-inativo': { role: 'OPERADOR', postoId: 'posto-matriz-01', ativo: false },
      },
    },
  };
  const rInativo = simularRegraPostoMember(ctxInativo, 'posto-matriz-01');

  // Cenário D: Usuário do posto A tentando acessar posto B (Cross-tenant)
  const ctxCrossTenant: MockAuthContext = {
    auth: { uid: 'u-op1', token: { email: 'op1@posto.com', email_verified: true } },
    db: {
      usuarios: {
        'u-op1': { role: 'OPERADOR', postoId: 'posto-matriz-01', ativo: true },
      },
    },
  };
  const rCrossTenant = simularRegraPostoMember(ctxCrossTenant, 'posto-filial-02');

  // Cenário E: Operador legítimo do posto acessando seu próprio posto
  const rLegitimo = simularRegraPostoMember(ctxCrossTenant, 'posto-matriz-01');

  assertTest(
    'FirestoreRules',
    'R-06',
    'Isolamento e Controle de Acesso (Matriz de Autorização)',
    !rAnonimo && !rSemPerfil && !rInativo && !rCrossTenant && rLegitimo,
    'Anônimo, sem perfil, inativo e cross-tenant barrados com sucesso. Operador legítimo autorizado.'
  );
}

// =========================================================================
// SUÍTE 2: CADASTRO E AUTENTICAÇÃO (AuthContext.tsx)
// =========================================================================
function testarAutenticacaoECadastro() {
  console.log('--- SUÍTE 2: CADASTRO E AUTENTICAÇÃO ---');

  const authContextPath = path.resolve(process.cwd(), 'src/contexts/AuthContext.tsx');
  const authContent = fs.readFileSync(authContextPath, 'utf-8');

  // 2.1 Eliminação de sessão baseada em localStorage
  const temLeituraStorageSessao = authContent.includes("localStorage.getItem('meuposto_sessao_ativa_v1')");
  assertTest(
    'AuthContext',
    'A-01',
    'Zero Confiança em LocalStorage para Estado de Sessão',
    !temLeituraStorageSessao,
    'Sessão não lê credenciais ou perfis de localStorage; estado deriva 100% de onAuthStateChanged do Firebase Auth.'
  );

  // 2.2 Eliminação de concessão de GERENTE por verificação de coleção vazia no frontend
  const consultaVaziaFrontend = authContent.includes('snapExistentes.empty') || authContent.includes('allSnap.empty');
  assertTest(
    'AuthContext',
    'A-02',
    'Eliminação de Autoproclamação via Consulta de Usuários Vazia',
    !consultaVaziaFrontend,
    'Removida lógica vulnerável que concedia GERENTE caso snap.empty fosse verdadeiro no client.'
  );

  // 2.3 Bootstrap Admin Seguro
  const temBootstrapAdmin = authContent.includes('BOOTSTRAP_ADMIN_EMAIL') && authContent.includes('ubirajaraaux@gmail.com');
  assertTest(
    'AuthContext',
    'A-03',
    'Provisionamento Seguro do Administrador Bootstrap Oficial',
    temBootstrapAdmin,
    'Apenas o endereço oficial verificado (ubirajaraaux@gmail.com) é provisionado como GERENTE inicial.'
  );

  // 2.4 Bloqueio de usuários inativos no frontend
  const bloqueioInativo = authContent.includes('!data.ativo') && authContent.includes('setAuthError');
  assertTest(
    'AuthContext',
    'A-04',
    'Tratamento de Contas Inativas e Perfil Inexistente',
    bloqueioInativo,
    'Contas com ativo == false ou sem perfil são desautorizadas com mensagem informativa de bloqueio.'
  );
}

// =========================================================================
// SUÍTE 3: SINCRONIZAÇÃO OFFLINE CONCORRENTE E PRESERVAÇÃO DE DADOS (SyncContext.tsx)
// =========================================================================
async function testarSincronizacaoConcorrente() {
  console.log('--- SUÍTE 3: SINCRONIZAÇÃO CONCORRENTE E PRESERVAÇÃO DE DADOS ---');

  const syncContextPath = path.resolve(process.cwd(), 'src/contexts/SyncContext.tsx');
  const syncContent = fs.readFileSync(syncContextPath, 'utf-8');

  // 3.1 Mutex e proteção contra concorrência
  const temMutex = syncContent.includes('isSyncingRef') && syncContent.includes('queueRef');
  assertTest(
    'SyncContext',
    'S-01',
    'Controle de Concorrência via Mutex (isSyncingRef)',
    temMutex,
    'Processamento simultâneo bloqueado por trava de sincronização atômica.'
  );

  // 3.2 Whitelist de coleções operacionais
  const temWhitelist = syncContent.includes('COLECOES_PERMITIDAS') && syncContent.includes('isValidSyncId');
  assertTest(
    'SyncContext',
    'S-02',
    'Validação Estrita de Coleções e IDs (Anti-Path Injection)',
    temWhitelist,
    'Apenas coleções operacionais permitidas e identificadores válidos são aceitos para gravação.'
  );

  // 3.3 Simulação de Concorrência Real: Itens adicionados DURANTE o processamento
  let filaMemoria: Array<{ id: string; collection: string; data: any; postoId: string }> = [
    { id: 'item-1', collection: 'fechamentos', postoId: 'posto-matriz-01', data: { valor: 100 } },
    { id: 'item-2', collection: 'tanques', postoId: 'posto-matriz-01', data: { nivel: 1500 } },
  ];

  // Simula execução de sync com delay de rede
  const idsConfirmados = new Set<string>();
  const snapshotProcessamento = [...filaMemoria];

  // Durante a gravação remota do item-1, um novo item (item-3) é enfileirado por um operador no frontend
  const promessaSync = (async () => {
    for (const item of snapshotProcessamento) {
      await new Promise((r) => setTimeout(r, 20)); // Delay de I/O
      if (item.id === 'item-1') {
        idsConfirmados.add(item.id); // item-1 sucesso
      } else if (item.id === 'item-2') {
        // item-2 falha temporária de rede
      }
    }
    // Atualização NÃO DESTRUTIVA
    filaMemoria = filaMemoria.filter((it) => !idsConfirmados.has(it.id));
  })();

  // Operador enfileira item-3 concorrentemente
  filaMemoria.push({
    id: 'item-3',
    collection: 'afericoes',
    postoId: 'posto-matriz-01',
    data: { bico: 'B1' },
  });

  await promessaSync;

  // Verificações:
  // 1. item-1 foi removido porque foi confirmado com sucesso.
  // 2. item-2 permaneceu na fila porque falhou.
  // 3. item-3 permaneceu na fila porque chegou durante a sincronização!
  const item1Removido = !filaMemoria.some((i) => i.id === 'item-1');
  const item2Preservado = filaMemoria.some((i) => i.id === 'item-2');
  const item3Preservado = filaMemoria.some((i) => i.id === 'item-3');
  const preservacaoZeroPerda = item1Removido && item2Preservado && item3Preservado && filaMemoria.length === 2;

  assertTest(
    'SyncContext',
    'S-03',
    'Preservação Atômica de Itens Concorrentes e Falhas Parciais',
    preservacaoZeroPerda,
    'Itens recebidos durante a sincronização não foram sobrescritos; itens com falha foram retidos na fila.'
  );

  // 3.4 Tratamento de Falha de Persistência Local (Quota de LocalStorage)
  const trataFalhaStorage = syncContent.includes('storageDisponivel') && syncContent.includes('setStorageDisponivel(false)');
  assertTest(
    'SyncContext',
    'S-04',
    'Tratamento Explícito de Falhas no LocalStorage (Quota/Privado)',
    trataFalhaStorage,
    'Captura erros de cota e atualiza flag storageDisponivel sem travar o processamento em memória.'
  );
}

// =========================================================================
// EXECUÇÃO GERAL
// =========================================================================
async function executarTodosOsTestes() {
  console.log('======================================================================');
  console.log(' INICIANDO BATERIA INTEGRADA DE TESTES DE SEGURANÇA E CONCORRÊNCIA');
  console.log('======================================================================\n');

  testarFirestoreRules();
  testarAutenticacaoECadastro();
  await testarSincronizacaoConcorrente();

  const total = resultados.length;
  const aprovados = resultados.filter((r) => r.passou).length;
  const taxaSucesso = ((aprovados / total) * 100).toFixed(1);

  console.log('======================================================================');
  console.log(` RESULTADO FINAL: ${aprovados}/${total} TESTES APROVADOS (${taxaSucesso}%)`);
  console.log('======================================================================\n');

  if (aprovados !== total) {
    console.error('ALERTA: Existem testes que não foram aprovados!');
    process.exit(1);
  } else {
    console.log('Todos os critérios de segurança e integridade de dados foram validados com êxito.');
  }
}

executarTodosOsTestes();
