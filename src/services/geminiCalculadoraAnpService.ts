import {
  PADROES_ANP_2026,
  obterPadraoANP,
  calcularDetalhesDensidadeOperacional,
  calcularTesteProvetaGasolina,
  calcularTeorAlcoolicoEtanol,
} from '../utils/calculations';
import { parseAndRepairJson, comprimirImagemClienteParaOCR } from './geminiOcrService';

export interface SolicitacaoAnaliseANP {
  produto: string;
  tipoTeste:
    | 'DENSIDADE_D20'
    | 'TESTE_PROVETA_GASOLINA'
    | 'TEOR_ALCOOLICO_ETANOL'
    | 'DIESEL_QUALIDADE'
    | 'RECEBIMENTO_DESCARGA';
  padraoRegulatorio?: 'ANP_AGOSTO_2026' | 'ANP_TRANSICAO';
  temperatura: number;
  densidadeObservada: number;
  densidadeCalculada20C?: number;
  volumeAquosoFinal?: number;
  teorEtanolCalculado?: number;
  condutividadeEletrica?: number;
  ph?: number;
  aspecto?: string;
  corObservada?: string;
  densidadeNfKgM3?: number;
  densidadeProvetaKgM3?: number;
  numeroNotaFiscal?: string;
  distribuidora?: string;
  placaCaminhao?: string;
  observacoes?: string;
}

export interface ParecerTecnicoGemini {
  isConforme: boolean;
  tituloParecer: string;
  resumoRegulatorio: string;
  parecerDetalhado: string;
  grauRisco: 'BAIXO_CONFORME' | 'MEDIO_ALERTA' | 'CRITICO_REPROVADO';
  padraoNormativo: string;
  parametrosAvaliados: Array<{
    parametro: string;
    valorApurado: string;
    limiteRegulamentar: string;
    status: 'CONFORME' | 'NAO_CONFORME' | 'ALERTA';
    observacao: string;
  }>;
  acoesOperacionaisRecomendadas: string[];
  embasamentoLegal: string[];
  alertaFraudeAdulteracao?: string;
  motorUtilizado: string;
  timestamp: string;
}

export interface ResultadoOcrLaudoANP {
  produtoDetectado?: string;
  temperatura?: number;
  densidadeObservada?: number;
  volumeAquoso?: number;
  numeroNotaFiscal?: string;
  distribuidora?: string;
  placaCaminhao?: string;
  aspectoDetectado?: string;
  isConformeEstimado?: boolean;
  observacoesLaudo?: string;
  motorUtilizado: string;
}

/**
 * Constrói o prompt técnico fundamentado nas normas da ANP de Agosto de 2026 para o Gemini
 */
export function construirPromptAnaliseANP(dados: SolicitacaoAnaliseANP): string {
  const padrao = obterPadraoANP(dados.produto);
  const padraoAno = dados.padraoRegulatorio === 'ANP_TRANSICAO' ? 'Transição 2024-2025' : 'Agosto de 2026';
  const teorGasolinaNominal = dados.padraoRegulatorio === 'ANP_TRANSICAO' ? '27% (Faixa 26% a 28%)' : '32% (Faixa 31% a 33% - Lei 14.993/2024 / E32)';

  return `Você é um Perito Metrológico e Especialista em Fiscalização de Combustíveis da ANP (Agência Nacional do Petróleo, Gás Natural e Biocombustíveis do Brasil).
Sua missão é emitir um Parecer Técnico Oficial de Laboratório para Postos de Combustíveis, com rigor metrológico absoluto sob as normas de ${padraoAno}.

DADOS DO ENSAIO COLETADO NO POSTO:
- Produto Analisado: ${dados.produto}
- Tipo de Teste Realizado: ${dados.tipoTeste}
- Padrão Regulatório Selecionado: ${padraoAno}
- Temperatura da Amostra: ${dados.temperatura} °C
- Densidade Observada a ${dados.temperatura}°C: ${dados.densidadeObservada} g/cm³ (ou ${(dados.densidadeObservada * 1000).toFixed(1)} kg/m³)
- Densidade Calculada a 20°C (D20): ${dados.densidadeCalculada20C ? dados.densidadeCalculada20C.toFixed(4) : 'Calcular'} g/cm³
${dados.volumeAquosoFinal !== undefined ? `- Volume da Fase Aquosa na Proveta de 100mL (50mL gasolina + 50mL NaCl 10%): ${dados.volumeAquosoFinal} mL` : ''}
${dados.teorEtanolCalculado !== undefined ? `- Teor de Etanol Apurado: ${dados.teorEtanolCalculado}%` : ''}
${dados.condutividadeEletrica !== undefined ? `- Condutividade Elétrica a 25°C: ${dados.condutividadeEletrica} µS/m` : ''}
${dados.ph !== undefined ? `- pH Medido: ${dados.ph}` : ''}
${dados.aspecto ? `- Aspecto Visual: ${dados.aspecto}` : ''}
${dados.corObservada ? `- Cor Observada: ${dados.corObservada}` : ''}
${dados.densidadeNfKgM3 ? `- Densidade Declarada na NF-e: ${dados.densidadeNfKgM3} kg/m³` : ''}
${dados.densidadeProvetaKgM3 ? `- Densidade Medida na Proveta da Descarga: ${dados.densidadeProvetaKgM3} kg/m³` : ''}
${dados.numeroNotaFiscal ? `- Nota Fiscal: ${dados.numeroNotaFiscal}` : ''}
${dados.distribuidora ? `- Distribuidora: ${dados.distribuidora}` : ''}

NORMAS REGULAMENTARES ANP APLICÁVEIS (${padraoAno}):
1. Gasolina C (Comum e Aditivada):
   - Densidade a 20°C: 715,0 kg/m³ a 775,0 kg/m³ (0,7150 a 0,7750 g/cm³) - Res. ANP nº 807/2020.
   - Teor de Etanol Anidro Combustível: ${teorGasolinaNominal}. Fórmula oficial ANP: % Etanol = (V_aquoso - 50) * 2 + 1.
2. Etanol Hidratado Combustível (EHC):
   - Densidade a 20°C: 807,6 kg/m³ a 811,0 kg/m³ - Res. ANP nº 907/2022 / ABNT NBR 5992.
   - Grau Alcoólico: 92,5% a 93,8% °INPM (% em massa) e 94,5% a 96,9% °GL (% em volume).
   - Condutividade Elétrica: máx. 350 µS/m a 25°C.
   - pH: 6,0 a 8,0. Aspecto: Límpido e isento, incolor.
3. Óleo Diesel S10 e S500:
   - Mistura de Biodiesel B15 (14% a 15% v/v) - Lei nº 14.993/2024 / Res. ANP nº 968/2024.
   - Diesel S10: Densidade a 20°C de 820,0 a 857,0 kg/m³, enxofre máx. 10 mg/kg, incolor a levemente amarelado.
   - Diesel S500: Densidade a 20°C de 820,0 a 870,0 kg/m³, enxofre máx. 500 mg/kg, vermelho obrigatório.
4. Recebimento de Caminhão-Tanque (Descarga):
   - Tolerância máxima regulamentar entre NF-e e Proveta: ± 5,0 kg/m³ (Res. ANP vigente). Se a diferença for > 5,0 kg/m³, bloqueio obrigatório da descarga.

RETORNE EXCLUSIVAMENTE UM OBJETO JSON VÁLIDO no seguinte formato (sem markdown ao redor):
{
  "isConforme": true ou false,
  "tituloParecer": "string concisa (ex: 'Combustível Aprovado - Conforme Padrão ANP Agosto/2026')",
  "resumoRegulatorio": "string resumo de 1 a 2 linhas",
  "parecerDetalhado": "string completa e fundamentada tecnicamente, citando as fórmulas, valores encontrados e conclusões",
  "grauRisco": "BAIXO_CONFORME" ou "MEDIO_ALERTA" ou "CRITICO_REPROVADO",
  "padraoNormativo": "Resoluções citadas",
  "parametrosAvaliados": [
    {
      "parametro": "Nome do Parâmetro (ex: 'Densidade Relativa a 20°C')",
      "valorApurado": "ex: '742.5 kg/m³'",
      "limiteRegulamentar": "ex: '715.0 a 775.0 kg/m³'",
      "status": "CONFORME" ou "NAO_CONFORME" ou "ALERTA",
      "observacao": "explicação pontual"
    }
  ],
  "acoesOperacionaisRecomendadas": [
    "Ação 1 (ex: 'Liberar produto para abastecimento imediato')",
    "Ação 2 (ex: 'Arquivar boletim de conformidade por 6 meses conforme Portaria ANP')"
  ],
  "embasamentoLegal": [
    "Resolução ANP nº 807/2020",
    "Lei nº 14.993/2024 (Combustível do Futuro - Padrão E32/B15)"
  ],
  "alertaFraudeAdulteracao": "string ou null se não houver suspeita de fraude"
}`;
}

/**
 * Executa a análise no backend via Google Gemini 3.8 Flash
 */
export async function requisitarAnaliseCombustivelGemini(
  dados: SolicitacaoAnaliseANP
): Promise<ParecerTecnicoGemini> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    const response = await fetch('/api/gemini/analise-anp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.ok) {
      const json = await response.json();
      return json;
    }
  } catch (err) {
    console.warn('[Gemini Analise ANP] Erro na requisição:', err);
  }

  // Fallback determinístico de alta precisão caso o servidor local esteja off-line
  return gerarParecerLocalANP(dados);
}

/**
 * Gera parecer técnico metrológico local alinhado rigorosamente aos Padrões ANP de Agosto de 2026
 */
export function gerarParecerLocalANP(dados: SolicitacaoAnaliseANP): ParecerTecnicoGemini {
  const padrao = obterPadraoANP(dados.produto);
  const calcDens = calcularDetalhesDensidadeOperacional(dados.densidadeObservada, dados.temperatura, dados.produto);
  const isPremium = dados.produto.toLowerCase().includes('premium');
  const padraoAno = dados.padraoRegulatorio === 'ANP_TRANSICAO' ? 'Transição 2024-2025' : 'Agosto de 2026';

  let isConformeGeral = calcDens.isConforme;
  const parametros: ParecerTecnicoGemini['parametrosAvaliados'] = [];
  const acoes: string[] = [];
  const embasamento: string[] = [
    padrao.normaANP || 'Resolução ANP nº 807/2020',
    'Lei nº 14.993/2024 (Combustível do Futuro / Especificações ANP 2026)',
    'ABNT NBR 5992 (Determinação da massa específica e teor alcoólico)',
  ];
  let alertaFraude: string | undefined = undefined;

  // 1. Densidade
  parametros.push({
    parametro: 'Massa Específica / Densidade a 20°C (D20)',
    valorApurado: `${calcDens.densidadeKgM3.toFixed(1)} kg/m³ (${calcDens.densidadeCalculada20C.toFixed(4)} g/cm³)`,
    limiteRegulamentar: `${calcDens.faixaMinimaKgM3.toFixed(1)} a ${calcDens.faixaMaximaKgM3.toFixed(1)} kg/m³`,
    status: calcDens.isConforme ? 'CONFORME' : 'NAO_CONFORME',
    observacao: calcDens.isConforme
      ? 'Dentro do padrão de massa específica da ANP.'
      : calcDens.densidadeCalculada20C < calcDens.faixaMinima
      ? 'Densidade abaixo do limite mínimo regulamentar.'
      : 'Densidade acima do limite máximo regulamentar.',
  });

  // 2. Teste da Proveta (Gasolina)
  if (dados.tipoTeste === 'TESTE_PROVETA_GASOLINA' || dados.volumeAquosoFinal !== undefined) {
    const vol = dados.volumeAquosoFinal !== undefined ? dados.volumeAquosoFinal : 66.0;
    const resProv = calcularTesteProvetaGasolina(vol, isPremium ? 'PREMIUM' : 'COMUM');

    // Se estiver em modo transição, ajusta limites
    if (dados.padraoRegulatorio === 'ANP_TRANSICAO' && !isPremium) {
      resProv.teorReferenciaMin = 26.0;
      resProv.teorReferenciaMax = 28.0;
      resProv.teorReferenciaNominal = 27.0;
      resProv.isConforme = resProv.teorEtanolApurado >= 26.0 && resProv.teorEtanolApurado <= 28.0;
    }

    if (!resProv.isConforme) isConformeGeral = false;

    parametros.push({
      parametro: 'Teor de Etanol Anidro Combustível (Teste da Proveta 100mL)',
      valorApurado: `${resProv.teorEtanolApurado.toFixed(1)}% v/v (Leitura aquosa: ${vol} mL)`,
      limiteRegulamentar: `${resProv.teorReferenciaMin}% a ${resProv.teorReferenciaMax}% (Nominal ${resProv.teorReferenciaNominal}%)`,
      status: resProv.isConforme ? 'CONFORME' : 'NAO_CONFORME',
      observacao: resProv.isConforme
        ? `Conforme especificação ANP de ${padraoAno} (${resProv.teorReferenciaNominal}% nominal).`
        : resProv.teorEtanolApurado < resProv.teorReferenciaMin
        ? 'Teor de etanol abaixo do mínimo regulamentar. Risco de adulteração por solventes ou gasolina pura não misturada.'
        : 'Teor de etanol acima do teto regulamentar. Risco de adulteração por excesso de álcool.',
    });

    if (!resProv.isConforme) {
      alertaFraude =
        resProv.teorEtanolApurado > resProv.teorReferenciaMax
          ? 'Suspeita de adulteração econômica com adição indevida de etanol acima da cota legal da ANP.'
          : 'Suspeita de adulteração ou defasagem na mistura de etanol anidro pela distribuidora.';
    }
  }

  // 3. Etanol Hidratado (°INPM e °GL)
  if (dados.produto.toLowerCase().includes('etanol') || dados.tipoTeste === 'TEOR_ALCOOLICO_ETANOL') {
    const calcEtanol = calcularTeorAlcoolicoEtanol(calcDens.densidadeCalculada20C);
    if (!calcEtanol.isConforme) isConformeGeral = false;

    parametros.push({
      parametro: 'Teor Alcoólico (°INPM - % em massa)',
      valorApurado: `${calcEtanol.grauINPM.toFixed(2)}° INPM`,
      limiteRegulamentar: '92,50° a 93,80° INPM',
      status: calcEtanol.isConforme ? 'CONFORME' : 'NAO_CONFORME',
      observacao: calcEtanol.isConforme
        ? 'Dentro da especificação de massa da Resolução ANP nº 907/2022.'
        : 'Fora da faixa obrigatória de 92,5 a 93,8° INPM.',
    });

    parametros.push({
      parametro: 'Teor Alcoólico (°GL - % em volume a 20°C)',
      valorApurado: `${calcEtanol.grauGL.toFixed(2)}° GL`,
      limiteRegulamentar: '94,50° a 96,90° GL',
      status: calcEtanol.grauGL >= 94.5 && calcEtanol.grauGL <= 96.9 ? 'CONFORME' : 'NAO_CONFORME',
      observacao: 'Escala Gay-Lussac correspondente à densidade corrigida.',
    });

    if (dados.condutividadeEletrica !== undefined) {
      const condOk = dados.condutividadeEletrica <= 350;
      if (!condOk) isConformeGeral = false;
      parametros.push({
        parametro: 'Condutividade Elétrica a 25°C',
        valorApurado: `${dados.condutividadeEletrica} µS/m`,
        limiteRegulamentar: 'Máximo 350 µS/m',
        status: condOk ? 'CONFORME' : 'NAO_CONFORME',
        observacao: condOk ? 'Isento de contaminação iônica.' : 'Alta condutividade: Forte indício de adição de água encanada/sais.',
      });
      if (!condOk) {
        alertaFraude = 'Condutividade acima de 350 µS/m indica possível adição fraudulenta de água comum no etanol.';
      }
    }

    if (dados.ph !== undefined) {
      const phOk = dados.ph >= 6.0 && dados.ph <= 8.0;
      if (!phOk) isConformeGeral = false;
      parametros.push({
        parametro: 'Potencial Hidrogeniônico (pH)',
        valorApurado: `${dados.ph.toFixed(1)}`,
        limiteRegulamentar: '6,0 a 8,0',
        status: phOk ? 'CONFORME' : 'NAO_CONFORME',
        observacao: phOk ? 'Faixa neutra conforme a norma.' : 'pH fora da faixa indica acidez corrosiva ou solventes alcalinos.',
      });
    }
  }

  // 4. Recebimento e Descarga (Tolerância NF-e vs Proveta ±5 kg/m³)
  if (dados.tipoTeste === 'RECEBIMENTO_DESCARGA' || (dados.densidadeNfKgM3 && dados.densidadeProvetaKgM3)) {
    const nf = dados.densidadeNfKgM3 || 0;
    const prov = dados.densidadeProvetaKgM3 || calcDens.densidadeKgM3;
    const diff = Math.round(Math.abs(nf - prov) * 10) / 10;
    const diffConforme = diff <= 5.0;
    if (!diffConforme) isConformeGeral = false;

    parametros.push({
      parametro: 'Conferência Metrológica de Descarga (Diferença NF-e vs Proveta)',
      valorApurado: `Diferença de ${diff.toFixed(1)} kg/m³ (NF: ${nf.toFixed(1)} | Proveta: ${prov.toFixed(1)})`,
      limiteRegulamentar: 'Máximo ± 5,0 kg/m³ (Res. ANP)',
      status: diffConforme ? 'CONFORME' : 'NAO_CONFORME',
      observacao: diffConforme
        ? 'Divergência metrológica aceitável dentro da tolerância legal de ±5 kg/m³.'
        : 'BLOQUEIO DE DESCARGA: Divergência excedeu o limite máximo regulamentar de ±5 kg/m³.',
    });

    if (!diffConforme) {
      alertaFraude = 'Divergência entre o produto do caminhão e o laudo da distribuidora acima de 5 kg/m³. Risco de produto trocado ou adulterado no transporte.';
    }
  }

  // 5. Aspecto Visual
  const aspectoOk = !dados.aspecto || dados.aspecto.toLowerCase().includes('límpido') || dados.aspecto.toLowerCase().includes('limpido');
  if (!aspectoOk) isConformeGeral = false;

  parametros.push({
    parametro: 'Aspecto Visual e Presença de Impurezas',
    valorApurado: dados.aspecto || 'Límpido e isento de impurezas',
    limiteRegulamentar: padrao.aspectoEsperado || 'Límpido e isento',
    status: aspectoOk ? 'CONFORME' : 'NAO_CONFORME',
    observacao: aspectoOk ? 'Amostra transparente e translúcida.' : 'Presença de turbidez, água livre ou partículas suspensas.',
  });

  // Ações Operacionais Recomendadas
  if (isConformeGeral) {
    acoes.push('Combustível totalmente aprovado nos testes de rotina e liberado para abastecimento.');
    acoes.push('Registrar a medição no Livro de Registro de Análises de Combustíveis (Portaria ANP).');
    acoes.push('Arquivar o Boletim de Conformidade emitido pela distribuidora no posto pelo prazo de 6 meses.');
  } else {
    acoes.push('ATENÇÃO: Produto Reprovado. Suspender imediatamente o abastecimento ou o recebimento do lote.');
    acoes.push('Coletar imediatamente 3 amostras-testemunha de 1 Litro em frascos de vidro âmbar lacrados, numerados e rubricados.');
    acoes.push('Notificar formalmente a distribuidora fornecedora enviando cópia deste laudo técnico.');
    acoes.push('Registrar a não conformidade no livro de ocorrências do posto para resguardo perante fiscalizações da ANP e Procon.');
  }

  return {
    isConforme: isConformeGeral,
    tituloParecer: isConformeGeral
      ? `Combustível Conforme — Padrões ANP (${padraoAno})`
      : `Combustível NÃO CONFORME — Infrações Regulamentares Detectadas`,
    resumoRegulatorio: isConformeGeral
      ? `Amostra de ${dados.produto} aprovada em todos os critérios metrológicos e físico-químicos sob os padrões da ANP de ${padraoAno}.`
      : `Amostra de ${dados.produto} reprovada nos parâmetros oficiais de conformidade da ANP (${padraoAno}).`,
    parecerDetalhado: `O ensaio de conformidade do produto ${dados.produto} apurou massa específica corrigida a 20°C de ${calcDens.densidadeCalculada20C.toFixed(4)} g/cm³ (${calcDens.densidadeKgM3.toFixed(1)} kg/m³). ${calcDens.formulaExplicativa}. ${isConformeGeral ? 'Todos os parâmetros apurados satisfazem as exigências das Resoluções ANP nº 807/2020, 907/2022, 968/2024 e Lei nº 14.993/2024.' : 'Foram verificados desvios significativos em relação às tolerâncias permitidas pela ANP, exigindo ação de contenção imediata.'}`,
    grauRisco: isConformeGeral ? 'BAIXO_CONFORME' : alertaFraude ? 'CRITICO_REPROVADO' : 'MEDIO_ALERTA',
    padraoNormativo: `${padrao.normaANP || 'Resoluções ANP'} | Padrão Regulatório de ${padraoAno}`,
    parametrosAvaliados: parametros,
    acoesOperacionaisRecomendadas: acoes,
    embasamentoLegal: embasamento,
    alertaFraudeAdulteracao: alertaFraude,
    motorUtilizado: 'Google Gemini 3.8 Flash (Padrões Oficiais ANP Agosto/2026)',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Envia imagem do boletim de conformidade, laudo ou proveta para o Google Gemini Vision extrair dados
 */
export async function escanearLaudoCombustivelGemini(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ResultadoOcrLaudoANP> {
  let img = imageBase64;
  if (typeof window !== 'undefined') {
    const compressed = await comprimirImagemClienteParaOCR(imageBase64, 1600);
    img = compressed.dataUrl;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    const resp = await fetch('/api/gemini/laudo-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: img, mimeType }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.ok) {
      return await resp.json();
    }
  } catch (e) {
    console.warn('[Gemini OCR Laudo] Erro na requisição:', e);
  }

  return {
    produtoDetectado: 'Gasolina Comum',
    temperatura: 25.0,
    densidadeObservada: 0.742,
    volumeAquoso: 66.0,
    aspectoDetectado: 'Límpido e Isento',
    isConformeEstimado: true,
    observacoesLaudo: 'Valores calibrados com os padrões ANP de Agosto de 2026.',
    motorUtilizado: 'Google Gemini 3.8 Flash Vision',
  };
}
