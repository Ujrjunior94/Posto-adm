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

// 5 Combustíveis Principais solicitados
export type CombustivelPrincipal =
  | 'Gasolina Comum'
  | 'Gasolina Aditivada'
  | 'Etanol'
  | 'Diesel S10'
  | 'Diesel S500';

export const COMBUSTIVEIS_PRINCIPAIS_LIST: CombustivelPrincipal[] = [
  'Gasolina Comum',
  'Gasolina Aditivada',
  'Etanol',
  'Diesel S10',
  'Diesel S500',
];

// Tipos do LMC (Livro de Movimentação de Combustíveis) - ANP
export interface NotaFiscalLMC {
  numeroNF: string;
  serie?: string;
  distribuidora: string;
  dataEmissao?: string;
  volumeLitros: number;
}

export interface LMCRegistro {
  id: string;
  postoId: string;
  data: string; // YYYY-MM-DD
  produto: CombustivelPrincipal | string;
  tanqueId?: string;
  tanqueCodigo?: string;
  estoqueAbertura: number; // Volume de abertura em Litros
  entradas: number; // Compras/Recebimentos em Litros
  notasFiscais?: NotaFiscalLMC[];
  vendas: number; // Vendas apuradas pelos encerrantes dos bicos em Litros
  afericoes: number; // Litros utilizados em aferição
  estoqueEscritural: number; // Abertura + Entradas - Vendas (em Litros)
  estoqueFisico: number; // Medição da régua / arqueação em Litros
  medicaoReguaCm?: number; // Altura da régua em cm
  variacaoLitros: number; // estoqueFisico - estoqueEscritural (+ sobra, - perda)
  variacaoPercentual: number; // % sobre a movimentação ou estoque
  toleranciaANPMaxLitros: number; // 0,6% sobre o volume movimentado (Regulamentação ANP)
  statusANP: 'CONFORME' | 'PERDA_EXCESSIVA' | 'SOBRA_EXCESSIVA';
  fechado: boolean;
  responsavelNome?: string;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface LMCResumoPeriodo {
  periodo: string; // Ex: '1ª Quinzena (01 a 15/09/2026)', 'Mês de Setembro/2026'
  tipo: 'DIARIO' | 'QUINZENAL' | 'MENSAL';
  dataInicio: string;
  dataFim: string;
  produto: string;
  estoqueInicial: number;
  totalEntradas: number;
  totalVendas: number;
  totalAfericoes: number;
  estoqueEscrituralFinal: number;
  estoqueFisicoFinal: number;
  perdaSobraAcumulada: number;
  percentualVariacao: number;
  limiteToleranciaANPLitros: number;
  statusANP: 'CONFORME' | 'FORA_DA_TOLERANCIA';
  registrosCount: number;
}

// Tipos do Planner de Sobras e Faltas (Vinculado à Escala)
export type TipoDiferencaTurno = 'FALTA' | 'SOBRA' | 'SEM_DIFERENCA';

export interface RateioIntegrante {
  funcionarioId: string;
  funcionarioNome: string;
  cargo?: string;
  presente: boolean; // true = trabalhou no turno, false = faltou / ausente ("x faltou")
  motivoAusencia?: string;
  valorIndividual: number; // Parcela calculada do rateio
  pago: boolean;
  dataPagamento?: string;
  formaPagamento?: 'DESCONTO_FOLHA' | 'DINHEIRO' | 'PIX' | 'DISPENSADO' | 'PENDENTE';
  observacao?: string;
}

export interface RateioTurno {
  id: string;
  postoId: string;
  data: string; // YYYY-MM-DD
  turno: string; // 'Turno 2 (06h - 14h)', 'Turno 3 (14h - 22h)', 'Turno 4 (22h - 06h)'
  tipo: TipoDiferencaTurno;
  valorTotalDiferenca: number; // Valor total da falta ou sobra do caixa do turno
  totalIntegrantesEscalados: number;
  totalIntegrantesPresentes: number;
  totalIntegrantesAusentes: number;
  valorPorIntegrante: number; // valorTotalDiferenca / totalIntegrantesPresentes
  integrantes: RateioIntegrante[];
  fechamentoCaixaId?: string;
  status: 'PENDENTE' | 'PARCIALMENTE_PAGO' | 'QUITADO' | 'DESCONTADO_FOLHA' | 'DISPENSADO';
  motivo?: string;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}
