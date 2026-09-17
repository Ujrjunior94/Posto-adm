export type UserRole = 'MASTER' | 'GERENTE' | 'SUPERVISOR' | 'OPERADOR';

export interface UserProfile {
  uid: string;
  nome: string;
  email: string;
  role: UserRole;
  postoId: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export type FuncionarioStatus = 'ATIVO' | 'INATIVO' | 'FERIAS' | 'AFASTADO';

export interface Funcionario {
  id: string;
  postoId: string;
  nome: string;
  cpf: string;
  matricula: string;
  telefone: string;
  cargo: string;
  funcao: string;
  status: FuncionarioStatus;
  dataAdmissao: string;
  turnoPreferencial: string;
  avatarUrl?: string;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type EscalaStatus = 'TRABALHO' | 'FOLGA' | 'FERIAS' | 'AFASTADO' | 'AUSENTE' | 'SUBSTITUIDO';

export interface Escala {
  id: string;
  postoId: string;
  funcionarioId: string;
  funcionarioNome?: string;
  data: string; // YYYY-MM-DD
  turno: string; // 'Manhã', 'Tarde', 'Noite', '12x36', etc.
  horarioInicio: string;
  horarioFim: string;
  status: EscalaStatus;
  observacao?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface EscalaPattern {
  id: string;
  postoId: string;
  nome: string;
  ciclo: number; // dias no ciclo
  sequencia: EscalaStatus[];
  turnos: string[];
  funcionarios: string[];
  ativo: boolean;
  criadoEm: string;
}

export type TipoDiferenca = 'SEM_DIFERENCA' | 'SOBRA' | 'FALTA';

export interface ItemEncerranteBico {
  bicoId: string;
  numeroBico: number;
  bomba: string;
  produto: string;
  lado: 'A' | 'B';
  encerranteInicial: number;
  encerranteFinal: number;
  afericaoLitros?: number;
  litrosVendidos: number;
  precoLitro: number;
  valorTotal: number;
  precoBase?: number;
  temDesconto?: boolean;
  tipoDesconto?: 'VALOR' | 'PERCENTUAL';
  valorDesconto?: number;
  motivoDesconto?: string;
}

export interface ValoresRecolhimentoCaixa {
  pix: number;
  cartao: number;
  nota: number;
  deposito: number;
  pixCnpj: number;
  despesa: number;
  despesaDescricao?: string;
  outros: number;
  outrosDescricao?: string;
  totalRecolhido: number;
}

export interface FechamentoCaixa {
  id: string;
  postoId: string;
  data: string;
  turno: string;
  caixaId: string;
  funcionarioId: string;
  funcionarioNome?: string;
  totalInformado: number;
  totalConferido: number;
  diferenca: number;
  tipoDiferenca: TipoDiferenca;
  // Detalhamento operacional dos encerrantes de bicos
  encerrantesBicos?: ItemEncerranteBico[];
  totalLitrosBicos?: number;
  totalVendasBicos?: number;
  outrasVendasPista?: number;
  // Detalhamento operacional dos recolhimentos
  recolhimento?: ValoresRecolhimentoCaixa;
  observacao?: string;
  conferidoPor: string;
  status: 'ABERTO' | 'CONFERIDO' | 'CONTESTADO';
  criadoEm: string;
  atualizadoEm: string;
}

export type RegraDistribuicao = 'SOMENTE_RESPONSAVEL' | 'PARTICIPANTES_SELECIONADOS' | 'DISTRIBUICAO_PROPORCIONAL' | 'DIVISAO_IGUALITARIA' | 'PERSONALIZADA';

export interface OcorrenciaCaixa {
  id: string;
  fechamentoId: string;
  postoId: string;
  data: string;
  turno: string;
  valorFalta: number;
  funcionarioPrincipalId: string;
  participantes: string[]; // funcionario IDs
  regraDistribuicao: RegraDistribuicao;
  distribuicao: Record<string, number>; // funcionarioId -> valor individual
  observacao?: string;
  status: 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO';
  criadoPor: string;
  confirmadoPor?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface PontoCalibracao {
  altura: number; // cm
  volume: number; // litros
}

export interface Tanque {
  id: string;
  postoId: string;
  codigo: string;
  produto: string;
  capacidadeNominal: number;
  capacidadeOperacional: number;
  unidade: string;
  formato: 'CILINDRICO_HORIZONTAL' | 'CILINDRICO_VERTICAL' | 'ESFERICO' | 'RETANGULAR' | 'OUTRO';
  ativo: boolean;
  tabelaRegua: PontoCalibracao[];
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Bico {
  id: string;
  postoId: string;
  numero: number;
  bomba: string;
  tanqueId: string;
  produto: string;
  lado: 'A' | 'B';
  status: 'ATIVO' | 'MANUTENCAO' | 'INATIVO';
  precoLitro?: number; // Preço vigente final programado na bomba (com desconto, se ativo)
  precoBase?: number; // Preço de tabela base sem desconto
  temDesconto?: boolean; // Alternador de desconto (ativo / inativo)
  tipoDesconto?: 'VALOR' | 'PERCENTUAL'; // 'VALOR' (R$/L) ou 'PERCENTUAL' (%)
  valorDesconto?: number; // Valor do desconto (ex: 0.15 para R$ 0,15/L ou 3.0 para 3%)
  motivoDesconto?: string; // Motivo da promoção (ex: 'Pista 1 Fidelidade', 'App Posto', 'Desconto Noturno')
  dataInicioDesconto?: string;
  dataFimDesconto?: string;
  ultimoEncerrante?: number;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type AfericaoResultado = 'CONFORME' | 'NAO_CONFORME' | 'PENDENTE';

export interface Afericao {
  id: string;
  postoId: string;
  bicoId: string;
  tanqueId: string;
  produto: string;
  funcionarioId: string;
  data: string;
  hora: string;
  volumeNominal: number; // padrão 20.000L
  volumeAferido: number;
  diferenca: number; // volumeAferido - volumeNominal (ml ou L)
  toleranciaConfigurada: number; // ex: +-60ml ou +-0.060L
  resultado: AfericaoResultado;
  equipamento: string;
  observacao?: string;
  criadoEm: string;
}

export type TipoTesteANP = 'DENSIDADE_D20' | 'TESTE_PROVETA_GASOLINA' | 'TEOR_ALCOOLICO_ETANOL' | 'RECEBIMENTO_DESCARGA';

export interface RegistroDensidade {
  id: string;
  postoId: string;
  produto: string;
  tipoTeste?: TipoTesteANP;
  temperatura: number;
  massa?: number;
  volume?: number;
  densidadeObservada: number;
  densidadeCalculada20C: number;
  densidadeReferenciaMin: number;
  densidadeReferenciaMax: number;
  resultado: 'CONFORME' | 'NAO_CONFORME';
  responsavelId: string;
  data: string;
  hora: string;
  // Campos ANP 2026 adicionais
  volumeAquosoFinal?: number; // Para teste da proveta em gasolina (ml)
  teorEtanolAnidro?: number; // % apurado (26% a 28% comum, 24% a 26% premium)
  grauINPM?: number; // Teor em massa para etanol hidratado (92,5° a 95,4°)
  grauGL?: number; // Teor em volume para etanol hidratado (94,5° a 96,9°)
  condutividadeEletrica?: number; // máx 350 µS/m a 25°C
  ph?: number; // 6,0 a 8,0 para etanol
  aspecto?: string; // Límpido e isento de impurezas
  cor?: string; // Incolor, amarelada, etc.
  numeroNotaFiscal?: string; // Para recebimento de caminhão tanque
  placaCaminhao?: string;
  distribuidora?: string;
  compartimento?: string;
  lacreConferido?: boolean;
  parecerTecnico?: string;
  observacao?: string;
  // Campos específicos de conformidade regulatória para produto D32
  metodoEnsaioD32?: string;
  coeficienteCorrecaoUtilizado?: number;
  fatorExpansaoTermica?: number;
  densidadeKgM3?: number;
  temperaturaAmbiente?: number;
  loteD32?: string;
  certificadoInmetro?: string;
  toleranciaD32Texto?: string;
  statusD32?: 'CONFORME' | 'FORA_DA_TOLERANCIA';
  criadoEm: string;
}

export type TipoAnalise = 'DENSIDADE' | 'AFERICAO' | 'TANQUE' | 'BICO' | 'COMBUSTIVEL' | 'CONFORMIDADE' | 'OUTRA';

export interface Analise {
  id: string;
  postoId: string;
  tipo: TipoAnalise;
  produto: string;
  tanqueId?: string;
  bicoId?: string;
  data: string;
  hora: string;
  responsavelId: string;
  resultado: string;
  status: 'APROVADO' | 'REPROVADO' | 'EM_ANALISE';
  observacao?: string;
  evidencias?: string[];
  criadoEm: string;
}

export type ConformidadeStatus = 'CONFORME' | 'NAO_CONFORME' | 'PENDENTE' | 'NAO_APLICAVEL';

export interface Conformidade {
  id: string;
  postoId: string;
  data: string;
  categoria: 'SEGURANCA' | 'MEIO_AMBIENTE' | 'QUALIDADE' | 'FISCAL' | 'EQUIPAMENTOS' | 'UNIFORMES';
  item: string;
  status: ConformidadeStatus;
  responsavelId: string;
  observacao?: string;
  evidencia?: string;
  criadoEm: string;
}

export type AuditAcao = 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTIVATE' | 'DEACTIVATE' | 'CONFIRM' | 'CANCEL' | 'SYNC';

export interface AuditLog {
  id: string;
  postoId: string;
  usuarioId: string;
  usuarioNome: string;
  modulo: string;
  entidade: string;
  entidadeId: string;
  acao: AuditAcao;
  dadosAnteriores?: Record<string, unknown> | null;
  dadosNovos?: Record<string, unknown> | null;
  timestamp: string;
  dispositivo?: string;
}

export interface DailyOperationalBalance {
  data: string;
  funcionariosEscalados: number;
  turnos: string[];
  fechamentosTotal: number;
  fechamentosConferidos: number;
  faltasValorTotal: number;
  sobrasValorTotal: number;
  ocorrenciasPendentes: number;
  afericoesTotal: number;
  afericoesConformes: number;
  afericoesNaoConformes: number;
  densidadesRealizadas: number;
  analisesRealizadas: number;
  conformidadePendencias: number;
}
