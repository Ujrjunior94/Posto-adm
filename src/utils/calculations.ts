/**
 * Utilitários matemáticos e de validação operacional para Postos de Combustíveis
 */

/**
 * Validação de CPF com dígitos verificadores
 */
export function validarCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i)) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i)) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(clean.charAt(10));
}

export function formatarCPF(cpf: string): string {
  const clean = cpf.replace(/\D/g, '');
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Interpolação Linear para Leitura de Régua de Tanques
 * Dada uma tabela de calibração [{altura, volume}, ...]
 */
export interface PontoTabela {
  altura: number;
  volume: number;
}

export interface ResultadoInterpolacao {
  leitura: number;
  volumeEstimado: number;
  pontosUtilizados: [PontoTabela, PontoTabela] | [PontoTabela];
  metodo: 'EXATO' | 'INTERPOLACAO_LINEAR' | 'EXTRAPOLACAO_MAX' | 'EXTRAPOLACAO_MIN';
}

export function calcularVolumePorRegua(
  leitura: number,
  tabela: PontoTabela[]
): ResultadoInterpolacao | null {
  if (!tabela || tabela.length === 0 || isNaN(leitura) || leitura < 0) {
    return null;
  }

  // Ordenar por altura crescente
  const ordenada = [...tabela].sort((a, b) => a.altura - b.altura);

  // Caso 1: Leitura exatamente igual a um ponto
  const pontoExato = ordenada.find((p) => Math.abs(p.altura - leitura) < 0.001);
  if (pontoExato) {
    return {
      leitura,
      volumeEstimado: pontoExato.volume,
      pontosUtilizados: [pontoExato],
      metodo: 'EXATO',
    };
  }

  // Caso 2: Menor que o primeiro ponto
  if (leitura < ordenada[0].altura) {
    const p1 = ordenada[0];
    const p2 = ordenada.length > 1 ? ordenada[1] : ordenada[0];
    // Se altura 0 = 0 volume
    const vol = (leitura / p1.altura) * p1.volume;
    return {
      leitura,
      volumeEstimado: Math.max(0, Math.round(vol * 100) / 100),
      pontosUtilizados: [p1, p2],
      metodo: 'EXTRAPOLACAO_MIN',
    };
  }

  // Caso 3: Maior que o último ponto
  if (leitura > ordenada[ordenada.length - 1].altura) {
    const ultimo = ordenada[ordenada.length - 1];
    return {
      leitura,
      volumeEstimado: ultimo.volume,
      pontosUtilizados: [ultimo],
      metodo: 'EXTRAPOLACAO_MAX',
    };
  }

  // Caso 4: Entre dois pontos (Interpolação linear)
  for (let i = 0; i < ordenada.length - 1; i++) {
    const pInf = ordenada[i];
    const pSup = ordenada[i + 1];

    if (leitura >= pInf.altura && leitura <= pSup.altura) {
      const fracao = (leitura - pInf.altura) / (pSup.altura - pInf.altura);
      const volumeEstimado = pInf.volume + fracao * (pSup.volume - pInf.volume);
      return {
        leitura,
        volumeEstimado: Math.round(volumeEstimado * 100) / 100,
        pontosUtilizados: [pInf, pSup],
        metodo: 'INTERPOLACAO_LINEAR',
      };
    }
  }

  return null;
}

/**
 * Cálculo de Diferença de Fechamento de Caixa
 * Regra do negócio: diferenca = totalConferido - totalInformado
 */
export function calcularDiferencaCaixa(totalConferido: number, totalInformado: number) {
  const diferenca = Math.round((totalConferido - totalInformado) * 100) / 100;
  let tipoDiferenca: 'SEM_DIFERENCA' | 'SOBRA' | 'FALTA' = 'SEM_DIFERENCA';

  if (diferenca > 0.01) {
    tipoDiferenca = 'SOBRA';
  } else if (diferenca < -0.01) {
    tipoDiferenca = 'FALTA';
  }

  return {
    diferenca,
    tipoDiferenca,
  };
}

/**
 * Constantes da Aferição de Bico Metrológica
 * Padrão: Sempre 20 Litros (Balde aferidor de 20L Inmetro)
 * Tolerância: Desvio entre -100 ml e +100 ml (± 100 ml)
 */
export const VOLUME_NOMINAL_AFERICAO = 20.0;
export const TOLERANCIA_DESVIO_PADRAO_ML = 100; // ± 100 ml
export const TOLERANCIA_DESVIO_PADRAO_L = 0.1; // ± 0.100 L

export interface ResultadoCalculoAfericao {
  volumeNominal: number; // Sempre 20.0
  volumeAferido: number;
  diferenca: number; // em litros ex: +0.040 L ou -0.060 L
  diferencaMl: number; // desvio em ml ex: +40 ou -60
  desvioMl: number; // alias para diferencaMl
  toleranciaMl: number; // 100
  isConforme: boolean;
  resultado: 'CONFORME' | 'NAO_CONFORME';
  tipoDesvio: 'EXATO' | 'EXCESSO' | 'FALTA';
  percentualDesvio: number; // percentual em relação aos 20L
  mensagemDesvio: string;
}

/**
 * Cálculo de Aferição de Bico com Balde Padrão de 20 Litros
 * volumeNominal: SEMPRE 20.000 L
 * volumeAferido: leitura apurada no balde aferidor (ex: 20.040 L)
 * tolerância máxima: ± 100 ml (0.100 L)
 * desvio = volumeAferido - 20.000 L (em ml: entre -100 ml e +100 ml para estar conforme)
 */
export function calcularAfericao(
  volumeAferido: number,
  volumeNominal = 20.0,
  toleranciaMax = 0.1 // Padrão ± 100 ml (0.100 L)
): ResultadoCalculoAfericao {
  const volNominal = 20.0; // Aferição sempre de 20 litros
  const diferenca = Math.round((volumeAferido - volNominal) * 1000) / 1000;
  const desvioMl = Math.round(diferenca * 1000);
  const tolMl = Math.round(toleranciaMax * 1000) || 100;
  const isConforme = Math.abs(desvioMl) <= tolMl;

  let tipoDesvio: 'EXATO' | 'EXCESSO' | 'FALTA' = 'EXATO';
  if (desvioMl > 0) tipoDesvio = 'EXCESSO';
  else if (desvioMl < 0) tipoDesvio = 'FALTA';

  const percentualDesvio = Number(((diferenca / volNominal) * 100).toFixed(2));

  let mensagemDesvio = '';
  if (desvioMl === 0) {
    mensagemDesvio = 'Desvio exato de 0 ml (100% aferido nos 20,000 L)';
  } else if (isConforme) {
    mensagemDesvio = `Desvio de ${desvioMl > 0 ? `+${desvioMl}` : desvioMl} ml (Dentro da tolerância permitida de ± ${tolMl} ml)`;
  } else if (desvioMl > tolMl) {
    mensagemDesvio = `Desvio de +${desvioMl} ml ultrapassou o limite de +${tolMl} ml (Entrega a mais / prejuízo do posto)`;
  } else {
    mensagemDesvio = `Desvio de ${desvioMl} ml ultrapassou o limite de -${tolMl} ml (Entrega a menos / prejuízo do consumidor)`;
  }

  return {
    volumeNominal: volNominal,
    volumeAferido,
    diferenca,
    diferencaMl: desvioMl,
    desvioMl,
    toleranciaMl: tolMl,
    isConforme,
    resultado: isConforme ? 'CONFORME' : 'NAO_CONFORME',
    tipoDesvio,
    percentualDesvio,
    mensagemDesvio,
  };
}

/**
 * Padrões Oficiais de Qualidade de Combustíveis ANP (Resoluções ANP nº 807/2020, 968/2024 e atualizações de 2026)
 */
export interface PadraoCombustivelANP {
  produto: string;
  normaANP?: string;
  densidade20CMin: number; // g/cm³ ou kg/m³ / 1000
  densidade20CMax: number;
  coeficienteTermico: number; // por °C (ou taxa linear de expansão)
  requisitosMistura?: string;
  enxofreMax?: string;
  statusRegulatorio?: string;
  teorEtanolAnidroMin?: number; // % vol (teste da proveta)
  teorEtanolAnidroMax?: number; // % vol
  teorEtanolAnidroNominal?: number;
  grauINPMMin?: number; // % massa para etanol hidratado
  grauINPMMax?: number;
  grauGLMin?: number; // % volume para etanol hidratado
  grauGLMax?: number;
  condutividadeEletricaMax?: number; // µS/m a 25°C
  phMin?: number;
  phMax?: number;
  aspectoEsperado: string;
  corEsperada: string;
}

export const PADROES_ANP_2026: Record<string, PadraoCombustivelANP> = {
  'Gasolina Comum': {
    produto: 'Gasolina Comum',
    normaANP: 'Res. ANP 807/2020 & Lei 14.993/2024',
    densidade20CMin: 0.7150, // 715,0 a 775,0 kg/m³
    densidade20CMax: 0.7750,
    coeficienteTermico: 0.00076,
    requisitosMistura: 'Etanol: 26,0% a 30,0% v/v (D32: 32%)',
    enxofreMax: '50 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    teorEtanolAnidroMin: 31.0, // Resolução de Agosto de 2026 (D32 / E32): 32% ± 1%
    teorEtanolAnidroMax: 33.0,
    teorEtanolAnidroNominal: 32.0, // 32% nominal (D32)
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Incolor a amarelada',
  },
  'Gasolina C Comum': {
    produto: 'Gasolina C Comum',
    normaANP: 'Res. ANP 807/2020 & Lei 14.993/2024',
    densidade20CMin: 0.7150,
    densidade20CMax: 0.7750,
    coeficienteTermico: 0.00076,
    requisitosMistura: 'Etanol: 26,0% a 30,0% v/v (D32: 32%)',
    enxofreMax: '50 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    teorEtanolAnidroMin: 31.0,
    teorEtanolAnidroMax: 33.0,
    teorEtanolAnidroNominal: 32.0,
    aspectoEsperado: 'Límpido e isento de impurezas mecânicas',
    corEsperada: 'Incolor a amarelada',
  },
  'Gasolina Aditivada': {
    produto: 'Gasolina Aditivada',
    normaANP: 'Res. ANP 807/2020 & Lei 14.993/2024',
    densidade20CMin: 0.7150,
    densidade20CMax: 0.7750,
    coeficienteTermico: 0.00076,
    requisitosMistura: 'Etanol: 26,0% a 30,0% v/v + Deterg.',
    enxofreMax: '50 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    teorEtanolAnidroMin: 31.0,
    teorEtanolAnidroMax: 33.0,
    teorEtanolAnidroNominal: 32.0,
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Coloração característica da distribuidora (exceto azul)',
  },
  'Gasolina C Aditivada': {
    produto: 'Gasolina C Aditivada',
    normaANP: 'Res. ANP 807/2020 & Lei 14.993/2024',
    densidade20CMin: 0.7150,
    densidade20CMax: 0.7750,
    coeficienteTermico: 0.00076,
    requisitosMistura: 'Etanol: 26,0% a 30,0% v/v + Deterg.',
    enxofreMax: '50 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    teorEtanolAnidroMin: 31.0,
    teorEtanolAnidroMax: 33.0,
    teorEtanolAnidroNominal: 32.0,
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Coloração característica da distribuidora (exceto azul)',
  },
  'Gasolina Premium': {
    produto: 'Gasolina Premium',
    normaANP: 'Res. ANP 807/2020 & Lei 14.993/2024',
    densidade20CMin: 0.7700, // 770,0 a 800,0 kg/m³
    densidade20CMax: 0.8000,
    coeficienteTermico: 0.00076,
    requisitosMistura: 'Etanol: 25,0% a 30,0% v/v (98 RON)',
    enxofreMax: '50 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    teorEtanolAnidroMin: 24.0,
    teorEtanolAnidroMax: 26.0,
    teorEtanolAnidroNominal: 25.0,
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Incolor a amarelada',
  },
  'Etanol': {
    produto: 'Etanol',
    normaANP: 'Res. ANP 907/2022',
    densidade20CMin: 0.8076, // 807,6 a 811,0 kg/m³ (Res. ANP 907/2022)
    densidade20CMax: 0.8110,
    coeficienteTermico: 0.00084, // ABNT NBR 5992 linear (+0.00084 g/cm³/°C)
    requisitosMistura: 'Teor 92,5% - 93,8% °INPM',
    enxofreMax: 'Isento',
    statusRegulatorio: 'Conforme 2026',
    grauINPMMin: 92.5,
    grauINPMMax: 93.8,
    grauGLMin: 94.5,
    grauGLMax: 96.9,
    condutividadeEletricaMax: 350,
    phMin: 6.0,
    phMax: 8.0,
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Incolor',
  },
  'Etanol Hidratado': {
    produto: 'Etanol Hidratado',
    normaANP: 'Res. ANP 907/2022',
    densidade20CMin: 0.8076, // 807,6 a 811,0 kg/m³
    densidade20CMax: 0.8110,
    coeficienteTermico: 0.00084,
    requisitosMistura: 'Teor 92,5% - 93,8% °INPM',
    enxofreMax: 'Isento',
    statusRegulatorio: 'Conforme 2026',
    grauINPMMin: 92.5,
    grauINPMMax: 93.8,
    grauGLMin: 94.5,
    grauGLMax: 96.9,
    condutividadeEletricaMax: 350,
    phMin: 6.0,
    phMax: 8.0,
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Incolor',
  },
  'Etanol Hidratado Comum': {
    produto: 'Etanol Hidratado Comum',
    normaANP: 'Res. ANP 907/2022',
    densidade20CMin: 0.8076,
    densidade20CMax: 0.8110,
    coeficienteTermico: 0.00084,
    requisitosMistura: 'Teor 92,5% - 93,8% °INPM',
    enxofreMax: 'Isento',
    statusRegulatorio: 'Conforme 2026',
    grauINPMMin: 92.5,
    grauINPMMax: 93.8,
    grauGLMin: 94.5,
    grauGLMax: 96.9,
    condutividadeEletricaMax: 350,
    phMin: 6.0,
    phMax: 8.0,
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Incolor',
  },
  'Etanol Hidratado Aditivado': {
    produto: 'Etanol Hidratado Aditivado',
    normaANP: 'Res. ANP 907/2022',
    densidade20CMin: 0.8076,
    densidade20CMax: 0.8110,
    coeficienteTermico: 0.00084,
    requisitosMistura: 'Teor 92,5% - 93,8% °INPM + Adit.',
    enxofreMax: 'Isento',
    statusRegulatorio: 'Conforme 2026',
    grauINPMMin: 92.5,
    grauINPMMax: 93.8,
    grauGLMin: 94.5,
    grauGLMax: 96.9,
    condutividadeEletricaMax: 350,
    phMin: 6.0,
    phMax: 8.0,
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Incolor a levemente colorido',
  },
  'Diesel S-10': {
    produto: 'Diesel S-10',
    normaANP: 'Res. ANP 968/2024',
    densidade20CMin: 0.8200, // 820,0 a 850,0 kg/m³
    densidade20CMax: 0.8500,
    coeficienteTermico: 0.00070,
    requisitosMistura: 'Biodiesel B15 (14%-15%)',
    enxofreMax: '10 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    aspectoEsperado: 'Límpido, translúcido e isento de impurezas',
    corEsperada: 'Incolor a levemente amarelado',
  },
  'Óleo Diesel S10 Comum': {
    produto: 'Óleo Diesel S10 Comum',
    normaANP: 'Res. ANP 968/2024',
    densidade20CMin: 0.8200,
    densidade20CMax: 0.8500,
    coeficienteTermico: 0.00070,
    requisitosMistura: 'Biodiesel B15 (14%-15%)',
    enxofreMax: '10 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    aspectoEsperado: 'Límpido, translúcido e isento de impurezas',
    corEsperada: 'Incolor a levemente amarelado',
  },
  'Óleo Diesel S10 Aditivado': {
    produto: 'Óleo Diesel S10 Aditivado',
    normaANP: 'Res. ANP 968/2024',
    densidade20CMin: 0.8200,
    densidade20CMax: 0.8500,
    coeficienteTermico: 0.00070,
    requisitosMistura: 'Biodiesel B15 + Aditivo',
    enxofreMax: '10 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    aspectoEsperado: 'Límpido, translúcido e isento de impurezas',
    corEsperada: 'Incolor a levemente amarelado',
  },
  'Diesel S-500': {
    produto: 'Diesel S-500',
    normaANP: 'Res. ANP 968/2024',
    densidade20CMin: 0.8200, // 820,0 a 865,0 kg/m³
    densidade20CMax: 0.8650,
    coeficienteTermico: 0.00070,
    requisitosMistura: 'Biodiesel B15 (Agro/Frota)',
    enxofreMax: '500 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Avermelhada',
  },
  'Óleo Diesel S500': {
    produto: 'Óleo Diesel S500',
    normaANP: 'Res. ANP 968/2024',
    densidade20CMin: 0.8200,
    densidade20CMax: 0.8650,
    coeficienteTermico: 0.00070,
    requisitosMistura: 'Biodiesel B15 (Agro/Frota)',
    enxofreMax: '500 mg/kg',
    statusRegulatorio: 'Conforme 2026',
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Avermelhada',
  },
  'Querosene de Aviação (QAV-1)': {
    produto: 'Querosene de Aviação (QAV-1)',
    normaANP: 'Res. ANP 856/2021',
    densidade20CMin: 0.7750,
    densidade20CMax: 0.8400,
    coeficienteTermico: 0.00075,
    requisitosMistura: 'Aviação Comercial / Executiva',
    enxofreMax: '3.000 mg/kg',
    statusRegulatorio: 'Vigente',
    aspectoEsperado: 'Límpido e brilhante, isento de água e partículas',
    corEsperada: 'Incolor a palha',
  },
  'Óleo Diesel Marinho (DMA)': {
    produto: 'Óleo Diesel Marinho (DMA)',
    normaANP: 'Res. ANP 968/2024',
    densidade20CMin: 0.8200,
    densidade20CMax: 0.8900,
    coeficienteTermico: 0.00072,
    requisitosMistura: 'Uso Náutico e Marítimo',
    enxofreMax: '1.000 mg/kg',
    statusRegulatorio: 'Vigente',
    aspectoEsperado: 'Límpido e isento de impurezas',
    corEsperada: 'Amarelada a marrom claro',
  },
};

/**
 * Estrutura detalhada e transparente do cálculo operacional de densidade
 */
export interface DetalhesCalculoDensidade {
  densidadeObservada: number; // g/cm³
  temperaturaAmostra: number; // °C
  diferencaTemperatura20C: number; // T - 20°C
  coeficienteExpansaoTermica: number; // 0.0012 p/ Gasolina, 0.00108 p/ Etanol, etc.
  fatorCorrecaoAplicado: number; // 1 + coef * (T - 20)
  densidadeCalculada20C: number; // g/cm³
  densidadeKgM3: number; // kg/m³
  faixaMinima: number;
  faixaMaxima: number;
  faixaMinimaKgM3: number;
  faixaMaximaKgM3: number;
  desvioFaixa: number; // distância do valor mais próximo se fora
  formulaExplicativa: string;
  isConforme: boolean;
  parecerOperacional: string;
}

/**
 * Cálculo detalhado e com clareza operacional para o usuário final
 */
export function calcularDetalhesDensidadeOperacional(
  densidadeObservada: number,
  temperatura: number,
  produto: string
): DetalhesCalculoDensidade {
  const padrao = PADROES_ANP_2026[produto] || PADROES_ANP_2026['Gasolina Comum'];
  let coef = padrao.coeficienteTermico || 0.00076;
  const prodUpper = produto.toUpperCase();
  if (prodUpper.includes('ETANOL') || prodUpper.includes('ÁLCOOL')) {
    coef = 0.00084; // ABNT NBR 5992
  } else if (prodUpper.includes('DIESEL')) {
    coef = 0.00070; // ASTM D1250
  } else if (prodUpper.includes('GASOLINA')) {
    coef = 0.00076; // ABNT NBR 5992 / ASTM D1250
  }

  const deltaT = Math.round((temperatura - 20) * 10) / 10;
  // ABNT NBR 5992: D20 = Dt + coef * (T - 20)
  const correcaoLinear = Math.round(coef * deltaT * 100000) / 100000;
  const d20 = densidadeObservada ? Math.round((densidadeObservada + correcaoLinear) * 10000) / 10000 : 0;
  const dKgM3 = Math.round(d20 * 1000 * 10) / 10;

  const min = padrao.densidade20CMin;
  const max = padrao.densidade20CMax;
  const minKgM3 = Math.round(min * 1000 * 10) / 10;
  const maxKgM3 = Math.round(max * 1000 * 10) / 10;

  const isConforme = d20 >= min && d20 <= max;
  let desvio = 0;
  if (d20 < min) desvio = Math.round((min - d20) * 10000) / 10000;
  else if (d20 > max) desvio = Math.round((d20 - max) * 10000) / 10000;

  const sinalDelta = deltaT >= 0 ? `+${deltaT}` : `${deltaT}`;
  const formulaExplicativa = `D20 = ${densidadeObservada.toFixed(4)} + (${coef} × (${sinalDelta})) = ${d20.toFixed(4)} g/cm³ (${dKgM3.toFixed(1)} kg/m³)`;

  let parecerOperacional = `Dentro das especificações ANP (${minKgM3.toFixed(1)} - ${maxKgM3.toFixed(1)} kg/m³)`;
  if (!isConforme) {
    if (d20 < min) {
      parecerOperacional = `NÃO CONFORME: Densidade D20 de ${d20.toFixed(4)} g/cm³ (${dKgM3.toFixed(1)} kg/m³) abaixo da faixa regulamentar (${minKgM3.toFixed(1)} a ${maxKgM3.toFixed(1)} kg/m³).`;
    } else {
      parecerOperacional = `NÃO CONFORME: Densidade D20 de ${d20.toFixed(4)} g/cm³ (${dKgM3.toFixed(1)} kg/m³) acima da faixa regulamentar (${minKgM3.toFixed(1)} a ${maxKgM3.toFixed(1)} kg/m³).`;
    }
  }

  return {
    densidadeObservada,
    temperaturaAmostra: temperatura,
    diferencaTemperatura20C: deltaT,
    coeficienteExpansaoTermica: coef,
    fatorCorrecaoAplicado: correcaoLinear,
    densidadeCalculada20C: d20,
    densidadeKgM3: dKgM3,
    faixaMinima: min,
    faixaMaxima: max,
    faixaMinimaKgM3: minKgM3,
    faixaMaximaKgM3: maxKgM3,
    desvioFaixa: desvio,
    formulaExplicativa,
    isConforme,
    parecerOperacional,
  };
}

/**
 * Cálculo de Densidade a 20°C a partir de temperatura e densidade observada conforme fórmula da ANP / ABNT NBR 5992
 */
export function calcularDensidade20C(
  densidadeObservada: number,
  temperatura: number,
  produto: string
): number {
  if (!densidadeObservada || !temperatura) return 0;

  let coef = 0.00076;
  const prodUpper = produto.toUpperCase();
  if (prodUpper.includes('ETANOL') || prodUpper.includes('ÁLCOOL')) {
    coef = 0.00084;
  } else if (prodUpper.includes('DIESEL')) {
    coef = 0.00070;
  } else if (prodUpper.includes('GASOLINA')) {
    coef = 0.00076;
  }

  // D20 = Dt + coef * (T - 20)
  const densidade20 = densidadeObservada + coef * (temperatura - 20);
  return Math.round(densidade20 * 10000) / 10000;
}

/**
 * Teste da Proveta para Gasolina (Determinação do teor de etanol anidro na gasolina)
 * Procedimento oficial ANP:
 * 50ml de gasolina + 50ml de solução aquosa de NaCl 10% p/v.
 * Leitura final da fase aquosa: V_aq
 * Fórmula regulamentar: % Etanol = (V_aq - 50) * 2 + 1 (onde +1 é a contração de volume da mistura)
 */
export interface ResultadoTesteProveta {
  volumeGasolinaInicial: number;
  volumeSolucaoNaClInicial: number;
  volumeAquosoFinal: number;
  teorEtanolApurado: number; // % em volume
  teorReferenciaMin: number;
  teorReferenciaMax: number;
  teorReferenciaNominal: number;
  isConforme: boolean;
  parecer: string;
}

export function calcularTesteProvetaGasolina(
  volumeAquosoFinal: number,
  tipoGasolina: 'COMUM' | 'ADITIVADA' | 'PREMIUM' = 'COMUM'
): ResultadoTesteProveta {
  const volFinal = Math.max(50, Math.min(100, volumeAquosoFinal));
  // Fórmula oficial ANP: (V_final - 50) * 2 + 1
  const teorEtanol = Math.round(((volFinal - 50) * 2 + 1) * 10) / 10;

  const isPremium = tipoGasolina === 'PREMIUM';
  // Resolução de Agosto de 2026 (D32 / E32): mistura de 32% ± 1% (31,0% a 33,0%) para comum/aditivada; Premium 25% ± 1%
  const teorMin = isPremium ? 24.0 : 31.0;
  const teorMax = isPremium ? 26.0 : 33.0;
  const teorNominal = isPremium ? 25.0 : 32.0;

  const isConforme = teorEtanol >= teorMin && teorEtanol <= teorMax;

  let parecer = isPremium
    ? `Conforme padrão ANP Premium (${teorMin}% a ${teorMax}% | Nominal ${teorNominal}%).`
    : `Conforme Resolução de Agosto de 2026 D32 / E32 (${teorMin}% a ${teorMax}% | Nominal ${teorNominal}%).`;

  if (teorEtanol < teorMin) {
    parecer = `NÃO CONFORME: Teor de etanol abaixo do mínimo regulamentar de ${teorMin}% (Padrão D32/Resolução Ago/2026). Suspeita de fraude ou erro de formulação.`;
  } else if (teorEtanol > teorMax) {
    parecer = `NÃO CONFORME: Teor de etanol acima do teto de ${teorMax}% (Padrão D32/Resolução Ago/2026). Excesso de álcool na gasolina.`;
  }

  return {
    volumeGasolinaInicial: 50,
    volumeSolucaoNaClInicial: 50,
    volumeAquosoFinal: volFinal,
    teorEtanolApurado: teorEtanol,
    teorReferenciaMin: teorMin,
    teorReferenciaMax: teorMax,
    teorReferenciaNominal: teorNominal,
    isConforme,
    parecer,
  };
}

/**
 * Cálculo do Teor Alcoólico do Etanol Hidratado (°INPM e °GL) a partir da Densidade a 20°C (ABNT NBR 5992 / ANP 907/2022)
 */
export interface ResultadoTeorEtanol {
  densidade20C: number;
  grauINPM: number; // % em massa (padrão ANP: 92,5° a 93,8° INPM)
  grauGL: number; // % em volume (padrão ANP: 94,5° a 96,9° GL)
  descricaoConversao: string;
  isConforme: boolean;
  parecer: string;
}

export function calcularTeorAlcoolicoEtanol(densidade20C: number): ResultadoTeorEtanol {
  const descricaoConversao = 'Calculado via D20 - Norma ANP 92,5% - 93,8% M/M';

  if (densidade20C <= 0) {
    return {
      densidade20C: 0,
      grauINPM: 0,
      grauGL: 0,
      descricaoConversao,
      isConforme: false,
      parecer: 'Densidade inválida.',
    };
  }

  // Especificações ANP - Res. ANP 907/2022 & ABNT NBR 5992:
  // D20 mín = 0.8076 g/cm³ (807.6 kg/m³) -> 93.8 °INPM
  // D20 máx = 0.8110 g/cm³ (811.0 kg/m³) -> 92.5 °INPM
  const dMin = 0.8076;
  const dMax = 0.8110;
  const inpmMin = 92.5;
  const inpmMax = 93.8;
  const glMin = 94.5;
  const glMax = 96.9;

  let inpm = 92.5;
  let gl = 94.5;

  if (densidade20C >= dMin && densidade20C <= dMax) {
    const fracao = (dMax - densidade20C) / (dMax - dMin);
    inpm = Math.round((inpmMin + fracao * (inpmMax - inpmMin)) * 10) / 10;
    gl = Math.round((glMin + fracao * (glMax - glMin)) * 10) / 10;
  } else if (densidade20C > dMax) {
    const delta = (densidade20C - dMax) / (dMax - dMin);
    inpm = Math.max(85.0, Math.round((inpmMin - delta * 1.3) * 10) / 10);
    gl = Math.max(88.0, Math.round((glMin - delta * 2.4) * 10) / 10);
  } else {
    const delta = (dMin - densidade20C) / (dMax - dMin);
    inpm = Math.min(99.5, Math.round((inpmMax + delta * 1.3) * 10) / 10);
    gl = Math.min(99.9, Math.round((glMax + delta * 2.4) * 10) / 10);
  }

  const isConforme = densidade20C >= dMin && densidade20C <= dMax;

  let parecer = 'Dentro das especificações ANP (807.6 - 811.0 kg/m³)';
  if (densidade20C > dMax) {
    parecer = 'NÃO CONFORME: Densidade elevada (>0,8110 g/cm³) e °INPM baixo (<92,5% m/m). Excesso de água ("álcool molhado").';
  } else if (densidade20C < dMin) {
    parecer = 'NÃO CONFORME: Densidade baixa (<0,8076 g/cm³) e °INPM elevado (>93,8% m/m). Suspeita de presença de etanol anidro irregular.';
  }

  return {
    densidade20C,
    grauINPM: inpm,
    grauGL: gl,
    descricaoConversao,
    isConforme,
    parecer,
  };
}

/**
 * Matriz de Cruzamento Temperatura x Densidade NBR 5992
 */
export interface CelulaMatrizNBR5992 {
  temperatura: number;
  densidadeLida: number;
  d20: number;
  d20KgM3: number;
  isConforme: boolean;
  isCorrente: boolean;
}

export interface LinhaMatrizNBR5992 {
  densidadeLida: number;
  celulas: CelulaMatrizNBR5992[];
}

export function gerarMatrizNBR5992(
  produto: string = 'Etanol',
  temperaturaAtual: number = 26.8,
  densidadeAtual: number = 0.8040
): {
  temperaturas: number[];
  linhas: LinhaMatrizNBR5992[];
  padrao: PadraoCombustivelANP;
} {
  const padrao = PADROES_ANP_2026[produto] || PADROES_ANP_2026['Etanol'];
  const temperaturas = [15, 18, 20, 22, 25, 28];

  // Base rows based on fuel type
  let densidadesBase: number[] = [];
  if (produto.includes('Etanol') || produto.includes('Álcool')) {
    densidadesBase = [0.7940, 0.7990, 0.8040, 0.8090, 0.8140];
  } else if (produto.includes('Gasolina Premium')) {
    densidadesBase = [0.7600, 0.7700, 0.7800, 0.7900, 0.8000];
  } else if (produto.includes('Gasolina')) {
    densidadesBase = [0.7150, 0.7300, 0.7450, 0.7600, 0.7750];
  } else {
    // Diesel
    densidadesBase = [0.8100, 0.8250, 0.8350, 0.8450, 0.8600];
  }

  // If user has a specific density not in base, ensure it's represented
  const arredondada = Math.round(densidadeAtual * 10000) / 10000;
  if (arredondada > 0 && !densidadesBase.some((d) => Math.abs(d - arredondada) < 0.001)) {
    densidadesBase.push(arredondada);
    densidadesBase.sort((a, b) => a - b);
  }

  const linhas: LinhaMatrizNBR5992[] = densidadesBase.map((dt) => {
    const celulas: CelulaMatrizNBR5992[] = temperaturas.map((temp) => {
      const d20 = calcularDensidade20C(dt, temp, produto);
      const d20KgM3 = Math.round(d20 * 1000 * 10) / 10;
      const isConforme = d20 >= padrao.densidade20CMin && d20 <= padrao.densidade20CMax;
      const isCorrente =
        Math.abs(dt - densidadeAtual) < 0.0025 && Math.abs(temp - temperaturaAtual) <= 1.5;

      return {
        temperatura: temp,
        densidadeLida: dt,
        d20,
        d20KgM3,
        isConforme,
        isCorrente,
      };
    });

    return {
      densidadeLida: dt,
      celulas,
    };
  });

  return {
    temperaturas,
    linhas,
    padrao,
  };
}

/**
 * Cruzamento de Dados (NF-e x Tanque x Proveta)
 */
export interface ResultadoCruzamentoDados {
  produto: string;
  densidadeNF: number; // kg/m³ ou g/cm³ * 1000
  densidadeTanque: number; // kg/m³
  densidadeProvetaCalculada: number; // kg/m³
  diferencaNfProveta: number; // kg/m³
  diferencaNfTanque: number;
  toleranciaMaximaKgM3: number; // 5.0 kg/m³
  isLiberadoDescarga: boolean;
  statusConformidade: 'APROVADO' | 'DIVERGENTE' | 'ALERTA';
  parecerCruzamento: string;
}

export function calcularCruzamentoDadosANP(
  produto: string,
  densidadeNFKgM3: number,
  densidadeTanqueKgM3: number,
  densidadeProvetaKgM3: number
): ResultadoCruzamentoDados {
  const tolerancia = 5.0; // Resolução ANP: tolerância máxima de ± 5,0 kg/m³ entre nota fiscal e medição na proveta
  const diffNfProveta = Math.round(Math.abs(densidadeProvetaKgM3 - densidadeNFKgM3) * 10) / 10;
  const diffNfTanque = Math.round(Math.abs(densidadeTanqueKgM3 - densidadeNFKgM3) * 10) / 10;

  const isLiberado = diffNfProveta <= tolerancia;
  let status: 'APROVADO' | 'DIVERGENTE' | 'ALERTA' = 'APROVADO';
  let parecer = `Descarga Aprovada: Diferença entre a NF-e (${densidadeNFKgM3.toFixed(1)} kg/m³) e a Proveta (${densidadeProvetaKgM3.toFixed(1)} kg/m³) é de ${diffNfProveta.toFixed(1)} kg/m³, dentro da tolerância regulamentar ANP (máx. ±${tolerancia.toFixed(1)} kg/m³).`;

  if (!isLiberado) {
    status = 'DIVERGENTE';
    parecer = `DIVERGÊNCIA METROLÓGICA (Bloqueio de Descarga): A diferença apurada (${diffNfProveta.toFixed(1)} kg/m³) excedeu o limite máximo regulamentar de ±${tolerancia.toFixed(1)} kg/m³ estabelecido pela ANP. Notificar a distribuidora antes de descarregar.`;
  }

  return {
    produto,
    densidadeNF: densidadeNFKgM3,
    densidadeTanque: densidadeTanqueKgM3,
    densidadeProvetaCalculada: densidadeProvetaKgM3,
    diferencaNfProveta: diffNfProveta,
    diferencaNfTanque: diffNfTanque,
    toleranciaMaximaKgM3: tolerancia,
    isLiberadoDescarga: isLiberado,
    statusConformidade: status,
    parecerCruzamento: parecer,
  };
}

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}
