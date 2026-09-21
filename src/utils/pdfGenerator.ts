import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  LMCRegistro,
  LMCResumoPeriodo,
  FechamentoCaixa,
  RateioTurno,
} from '../types';
import { formatarMoeda } from './calculations';

export interface DadosPostoEmissao {
  nomePosto?: string;
  cnpj?: string;
  inscricaoEstadual?: string;
  endereco?: string;
  cidadeUf?: string;
  responsavelTecnico?: string;
}

const DADOS_POSTO_PADRAO: DadosPostoEmissao = {
  nomePosto: 'AUTO POSTO MEU POSTO 2.0 LTDA',
  cnpj: '12.345.678/0001-90',
  inscricaoEstadual: '123.456.789.000',
  endereco: 'Rodovia BR-101, Km 205 - Distrito Industrial',
  cidadeUf: 'Florianópolis / SC',
  responsavelTecnico: 'Gerência Operacional & Fiscal',
};

// Formata data YYYY-MM-DD para DD/MM/YYYY
export const formatarDataBR = (dataIso?: string): string => {
  if (!dataIso) return '-';
  const partes = dataIso.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dataIso;
};

// Formata número de litros com 2 casas
export const formatarLitros = (litros?: number): string => {
  if (litros === undefined || litros === null || isNaN(litros)) return '0,00 L';
  return `${litros.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
};

// Adiciona cabeçalho padrão de documento fiscal / gerencial
const adicionarCabecalhoDocumento = (
  doc: jsPDF,
  titulo: string,
  subtitulo: string,
  dadosPosto: DadosPostoEmissao = DADOS_POSTO_PADRAO
) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Barra de topo decorativa
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Faixa de destaque teal
  doc.setFillColor(13, 148, 136); // teal-600
  doc.rect(0, 24, pageWidth, 2.5, 'F');

  // Título e logo texto
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(dadosPosto.nomePosto || 'AUTO POSTO MEU POSTO 2.0', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    `CNPJ: ${dadosPosto.cnpj || '12.345.678/0001-90'}   |   IE: ${dadosPosto.inscricaoEstadual || 'ISENTO'}   |   ${dadosPosto.cidadeUf || 'Brasil'}`,
    14,
    18
  );

  // Box com o Título do Relatório
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(titulo, 14, 35);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(subtitulo, 14, 41);

  // Linha separadora
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.5);
  doc.line(14, 44, pageWidth - 14, 44);
};

// Adiciona rodapé padrão com paginação e carimbo de emissão
const adicionarRodapeDocumento = (doc: jsPDF, paginaAtual: number, totalPaginas: number) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const now = new Date();
  const dataHoraEmissao = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)}`;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('MEU POSTO 2.0 — Sistema Operacional para Postos de Combustíveis (Conformidade ANP/Portaria 26)', 14, pageHeight - 7);
  doc.text(`Emissão: ${dataHoraEmissao} | Pág. ${paginaAtual} de ${totalPaginas}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
};

// ==========================================
// 1. EXPORTAÇÃO: LMC DIÁRIO (FOLHA OFICIAL ANP)
// ==========================================
export const exportarLmcDiarioPDF = (
  registro: LMCRegistro,
  dadosPosto: DadosPostoEmissao = DADOS_POSTO_PADRAO
): void => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  adicionarCabecalhoDocumento(
    doc,
    'LMC — LIVRO DE MOVIMENTAÇÃO DE COMBUSTÍVEIS',
    `Folha Diária Oficial | Data: ${formatarDataBR(registro.data)} | Produto: ${registro.produto.toUpperCase()}`,
    dadosPosto
  );

  let currentY = 48;

  // Box de Identificação do Combustível e Tanque
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('PRODUTO / COMBUSTÍVEL:', 18, currentY + 6);
  doc.text('TANQUE:', 90, currentY + 6);
  doc.text('STATUS ANP (±0,6%):', 140, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(String(registro.produto).toUpperCase(), 18, currentY + 11.5);
  doc.text(registro.tanqueCodigo || 'Tanque Geral', 90, currentY + 11.5);

  const statusLabel =
    registro.statusANP === 'CONFORME'
      ? 'CONFORME (Regular)'
      : registro.statusANP === 'PERDA_EXCESSIVA'
      ? 'PERDA EXCESSIVA (> 0,6%)'
      : 'SOBRA EXCESSIVA (> 0,6%)';

  doc.setFont('helvetica', 'bold');
  if (registro.statusANP === 'CONFORME') {
    doc.setTextColor(22, 101, 52); // green-800
  } else {
    doc.setTextColor(185, 28, 28); // red-700
  }
  doc.text(statusLabel, 140, currentY + 11.5);

  currentY += 21;

  // Tabela Principal de Movimentação Volumétrica
  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    head: [['Item', 'Descrição da Operação', 'Volume (Litros)', 'Observação / Regulamentação']],
    body: [
      ['(1)', 'Estoque de Abertura (00:00h)', formatarLitros(registro.estoqueAbertura), 'Medição anterior ou livro anterior'],
      ['(2)', '(+) Recebimentos / Entradas por NF', formatarLitros(registro.entradas), registro.notasFiscais?.map(n => `NF: ${n.numeroNF}`).join(', ') || 'Sem descargas no dia'],
      ['(3)', '(-) Vendas Apuradas pelos Bicos', formatarLitros(registro.vendas), 'Total apurado no fechamento de bicos'],
      ['(4)', '(-) Aferições de Bicos (Volume Retornado)', formatarLitros(registro.afericoes), 'Retornadas ao tanque após teste'],
      ['(5)', '(=) Estoque Escritural / Teórico (1+2-3)', formatarLitros(registro.estoqueEscritural), 'Saldo calculado sem desvios'],
      ['(6)', 'Estoque Físico Medido na Régua', formatarLitros(registro.estoqueFisico), `Altura: ${registro.medicaoReguaCm ? `${registro.medicaoReguaCm} cm` : 'Leitura de régua'}`],
      ['(7)', 'Variação / Diferença Física (6 - 5)', `${registro.variacaoLitros > 0 ? '+' : ''}${formatarLitros(registro.variacaoLitros)} (${registro.variacaoPercentual.toFixed(2)}%)`, registro.variacaoLitros < 0 ? 'Perda Operacional' : registro.variacaoLitros > 0 ? 'Sobra Operacional' : 'Sem variação'],
      ['(8)', 'Limite Máximo de Tolerância ANP (±0,6%)', `± ${formatarLitros(registro.toleranciaANPMaxLitros)}`, 'Resolução ANP (Portaria DNC 26/92)'],
    ],
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.8,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 70, fontStyle: 'bold' },
      2: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.row.index === 6) {
        // Linha de Variação
        data.cell.styles.fillColor = registro.statusANP === 'CONFORME' ? [240, 253, 244] : [254, 242, 242];
        if (data.column.index === 2) {
          data.cell.styles.textColor = registro.statusANP === 'CONFORME' ? [22, 101, 52] : [185, 28, 28];
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // Tabela de Notas Fiscais Recebidas (se houver)
  if (registro.notasFiscais && registro.notasFiscais.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Notas Fiscais de Entrada / Descarga Recebidas no Dia:', 14, finalY);

    autoTable(doc, {
      startY: finalY + 2,
      theme: 'grid',
      head: [['Número NF', 'Série', 'Distribuidora', 'Volume da NF (L)']],
      body: registro.notasFiscais.map((nf) => [
        nf.numeroNF || '-',
        nf.serie || '1',
        nf.distribuidora || 'Distribuidora Autorizada',
        formatarLitros(nf.volumeLitros),
      ]),
      headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
    });
  }

  // Campo de Observações e Termo de Responsabilidade
  const obsY = ((doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : finalY) + 8;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, obsY, pageWidth - 28, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('OBSERVAÇÕES LEGAIS & REGULAMENTARES:', 18, obsY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    registro.observacoes ||
      'Declaro que as medições físicas de régua e os registros de encerrantes dos bicos foram conferidos conforme as normas vigentes da Agência Nacional do Petróleo, Gás Natural e Biocombustíveis (ANP) e Portaria DNC 26/92.',
    18,
    obsY + 10,
    { maxWidth: pageWidth - 36 }
  );

  // Linhas de Assinatura
  const signY = obsY + 36;
  const colWidth = (pageWidth - 36) / 2;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);

  // Assinatura 1: Responsável do Posto
  doc.line(14, signY, 14 + colWidth, signY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(registro.responsavelNome || dadosPosto.responsavelTecnico || 'Responsável Operacional do Posto', 14 + colWidth / 2, signY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Gerente / Encarregado da Pista', 14 + colWidth / 2, signY + 8, { align: 'center' });

  // Assinatura 2: Fiscal / Auditor
  doc.line(pageWidth - 14 - colWidth, signY, pageWidth - 14, signY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('Fiscalização / Auditoria ANP', pageWidth - 14 - colWidth / 2, signY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Visto de Inspeção e Conformidade', pageWidth - 14 - colWidth / 2, signY + 8, { align: 'center' });

  adicionarRodapeDocumento(doc, 1, 1);

  // Baixar PDF no navegador
  doc.save(`LMC_${registro.produto.replace(/\s+/g, '_')}_${registro.data}.pdf`);
};

// ==========================================
// 2. EXPORTAÇÃO: BALANÇO LMC DE PERÍODO (QUINZENAL / MENSAL)
// ==========================================
export const exportarLmcPeriodoPDF = (
  resumo: LMCResumoPeriodo,
  registros: LMCRegistro[],
  dadosPosto: DadosPostoEmissao = DADOS_POSTO_PADRAO
): void => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  adicionarCabecalhoDocumento(
    doc,
    `LMC — BALANÇO ${resumo.tipo === 'QUINZENAL' ? 'QUINZENAL' : 'MENSAL'} OFICIAL`,
    `Período: ${formatarDataBR(resumo.dataInicio)} até ${formatarDataBR(resumo.dataFim)} | Produto: ${resumo.produto.toUpperCase()}`,
    dadosPosto
  );

  let currentY = 48;

  // Grid de Métricas do Período
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('ESTOQUE INICIAL:', 18, currentY + 5);
  doc.text('TOTAL ENTRADAS:', 65, currentY + 5);
  doc.text('TOTAL VENDAS:', 115, currentY + 5);
  doc.text('ESTOQUE ESCRITURAL:', 165, currentY + 5);
  doc.text('ESTOQUE FÍSICO FINAL:', 215, currentY + 5);
  doc.text('VARIAÇÃO ACUMULADA:', 255, currentY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(formatarLitros(resumo.estoqueInicial), 18, currentY + 11.5);
  doc.text(formatarLitros(resumo.totalEntradas), 65, currentY + 11.5);
  doc.text(formatarLitros(resumo.totalVendas), 115, currentY + 11.5);
  doc.text(formatarLitros(resumo.estoqueEscrituralFinal), 165, currentY + 11.5);
  doc.text(formatarLitros(resumo.estoqueFisicoFinal), 215, currentY + 11.5);

  doc.setTextColor(resumo.statusANP === 'CONFORME' ? 22 : 185, resumo.statusANP === 'CONFORME' ? 101 : 28, resumo.statusANP === 'CONFORME' ? 52 : 28);
  doc.text(`${resumo.perdaSobraAcumulada > 0 ? '+' : ''}${formatarLitros(resumo.perdaSobraAcumulada)} (${resumo.percentualVariacao.toFixed(2)}%)`, 255, currentY + 11.5);

  currentY += 20;

  // Tabela Diária Detalhada do Período
  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    head: [
      [
        'Data',
        'Estoque Inicial',
        'Recebimentos (NF)',
        'Vendas (Bicos)',
        'Aferições',
        'Estoque Escritural',
        'Estoque Físico (Régua)',
        'Diferença (L)',
        'Var (%)',
        'Status ANP',
      ],
    ],
    body: registros.map((r) => [
      formatarDataBR(r.data),
      formatarLitros(r.estoqueAbertura),
      formatarLitros(r.entradas),
      formatarLitros(r.vendas),
      formatarLitros(r.afericoes),
      formatarLitros(r.estoqueEscritural),
      formatarLitros(r.estoqueFisico),
      `${r.variacaoLitros > 0 ? '+' : ''}${formatarLitros(r.variacaoLitros)}`,
      `${r.variacaoPercentual > 0 ? '+' : ''}${r.variacaoPercentual.toFixed(2)}%`,
      r.statusANP === 'CONFORME' ? 'CONFORME' : r.statusANP === 'PERDA_EXCESSIVA' ? 'PERDA' : 'SOBRA',
    ]),
    foot: [
      [
        'TOTAL / SALDO',
        formatarLitros(resumo.estoqueInicial),
        formatarLitros(resumo.totalEntradas),
        formatarLitros(resumo.totalVendas),
        formatarLitros(resumo.totalAfericoes),
        formatarLitros(resumo.estoqueEscrituralFinal),
        formatarLitros(resumo.estoqueFisicoFinal),
        `${resumo.perdaSobraAcumulada > 0 ? '+' : ''}${formatarLitros(resumo.perdaSobraAcumulada)}`,
        `${resumo.percentualVariacao.toFixed(2)}%`,
        resumo.statusANP === 'CONFORME' ? 'CONFORME' : 'FORA TOLERÂNCIA',
      ],
    ],
    headStyles: {
      fillColor: [15, 23, 42],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'right',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'center' },
      9: { halign: 'center', fontStyle: 'bold' },
    },
  });

  const totalPaginas = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    adicionarRodapeDocumento(doc, i, totalPaginas);
  }

  doc.save(`LMC_${resumo.tipo}_${resumo.produto.replace(/\s+/g, '_')}_${resumo.dataInicio}_a_${resumo.dataFim}.pdf`);
};

// ==========================================
// 3. EXPORTAÇÃO: FECHAMENTO DE CAIXA OFICIAL
// ==========================================
export const exportarFechamentoCaixaPDF = (
  fechamento: FechamentoCaixa,
  dadosPosto: DadosPostoEmissao = DADOS_POSTO_PADRAO
): void => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  adicionarCabecalhoDocumento(
    doc,
    'FECHAMENTO DE CAIXA E TURNO OPERACIONAL',
    `Data: ${formatarDataBR(fechamento.data)} | Turno: ${fechamento.turno} | Caixa: ${fechamento.caixaId || 'Pista Principal'}`,
    dadosPosto
  );

  let currentY = 48;

  // Box Resumo do Caixa e Responsável
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('OPERADOR RESPONSÁVEL:', 18, currentY + 5);
  doc.text('TURNO:', 85, currentY + 5);
  doc.text('CONFERIDO POR:', 130, currentY + 5);
  doc.text('STATUS:', 170, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(fechamento.funcionarioNome || 'Operador de Pista', 18, currentY + 11);
  doc.text(fechamento.turno, 85, currentY + 11);
  doc.text(fechamento.conferidoPor || 'Fiscal de Pátio', 130, currentY + 11);

  doc.setFont('helvetica', 'bold');
  doc.text(fechamento.status || 'CONFERIDO', 170, currentY + 11);

  currentY += 21;

  // Tabela de Encerrantes e Vendas por Bico (se existirem)
  if (fechamento.encerrantesBicos && fechamento.encerrantesBicos.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Detalhamento de Encerrantes e Vendas por Bico:', 14, currentY);

    autoTable(doc, {
      startY: currentY + 2,
      theme: 'grid',
      head: [['Bico / Bomba', 'Produto / Combustível', 'Encerr. Inicial', 'Encerr. Final', 'Aferição (L)', 'Litros Líquidos', 'Preço (R$)', 'Total (R$)']],
      body: fechamento.encerrantesBicos.map((b) => [
        `Bico ${b.numeroBico} (${b.bomba || 'Bomba'})`,
        b.produto,
        b.encerranteInicial.toFixed(2),
        b.encerranteFinal.toFixed(2),
        (b.afericaoLitros || 0).toFixed(2),
        b.litrosVendidos.toFixed(2),
        `R$ ${b.precoLitro.toFixed(2)}`,
        formatarMoeda(b.valorTotal),
      ]),
      foot: [
        [
          'TOTAL GERAL BICOS',
          '',
          '',
          '',
          '',
          formatarLitros(fechamento.totalLitrosBicos || fechamento.encerrantesBicos.reduce((s, x) => s + x.litrosVendidos, 0)),
          '',
          formatarMoeda(fechamento.totalVendasBicos || fechamento.encerrantesBicos.reduce((s, x) => s + x.valorTotal, 0)),
        ],
      ],
      headStyles: { fillColor: [15, 23, 42], fontSize: 7.5, fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8, halign: 'right' },
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 32 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right' },
        7: { halign: 'right', fontStyle: 'bold' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Tabela de Recolhimentos e Formas de Pagamento
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Demonstrativo Financeiro e Apuração de Caixa:', 14, currentY);

  const rec = fechamento.recolhimento;
  const formasPagamento = [
    ['Dinheiro em Espécie / Moeda', formatarMoeda(rec?.nota || 0)],
    ['Cartões (Débito e Crédito TEF/POS)', formatarMoeda(rec?.cartao || 0)],
    ['PIX Recebido (QR Code / Chave)', formatarMoeda((rec?.pix || 0) + (rec?.pixCnpj || 0))],
    ['Vendas Faturadas / Prazo / Boletos', formatarMoeda(rec?.deposito || 0)],
    ['Despesas e Sangrias de Pista', `- ${formatarMoeda(rec?.despesa || 0)} ${rec?.despesaDescricao ? `(${rec.despesaDescricao})` : ''}`],
    ['Outros Recebimentos / Vales', formatarMoeda(rec?.outros || 0)],
  ];

  autoTable(doc, {
    startY: currentY + 2,
    theme: 'grid',
    head: [['Forma de Pagamento / Movimentação', 'Valor Apurado (R$)']],
    body: formasPagamento,
    foot: [
      ['TOTAL CONFERIDO / RECOLHIDO (FÍSICO)', formatarMoeda(fechamento.totalConferido)],
      ['TOTAL SISTEMA / INFORMADO (TEÓRICO)', formatarMoeda(fechamento.totalInformado)],
      [
        `DIFERENÇA APURADA (${fechamento.tipoDiferenca === 'SOBRA' ? 'SOBRA DE CAIXA' : fechamento.tipoDiferenca === 'FALTA' ? 'FALTA DE CAIXA' : 'SEM DIFERENÇA'})`,
        `${fechamento.diferenca > 0 ? '+' : ''}${formatarMoeda(fechamento.diferenca)}`,
      ],
    ],
    headStyles: { fillColor: [51, 65, 85], fontSize: 8, fontStyle: 'bold' },
    footStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2.2 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (data) => {
      if (data.row.section === 'foot' && data.row.index === 2) {
        if (fechamento.tipoDiferenca === 'FALTA') {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fillColor = [254, 242, 242];
        } else if (fechamento.tipoDiferenca === 'SOBRA') {
          data.cell.styles.textColor = [22, 101, 52];
          data.cell.styles.fillColor = [240, 253, 244];
        }
      }
    },
  });

  const nextY = (doc as any).lastAutoTable.finalY + 8;

  // Observações do Caixa
  if (fechamento.observacao) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('OBSERVAÇÕES DO TURNO:', 14, nextY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(fechamento.observacao, 14, nextY + 4, { maxWidth: pageWidth - 28 });
  }

  // Assinaturas de Conferência
  const signY = (fechamento.observacao ? nextY + 16 : nextY) + 16;
  const colWidth = (pageWidth - 36) / 2;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);

  doc.line(14, signY, 14 + colWidth, signY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(fechamento.funcionarioNome || 'Operador de Caixa', 14 + colWidth / 2, signY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Assinatura do Operador de Caixa', 14 + colWidth / 2, signY + 8, { align: 'center' });

  doc.line(pageWidth - 14 - colWidth, signY, pageWidth - 14, signY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(fechamento.conferidoPor || 'Supervisor / Gerente', pageWidth - 14 - colWidth / 2, signY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Visto de Conferência e Auditoria', pageWidth - 14 - colWidth / 2, signY + 8, { align: 'center' });

  adicionarRodapeDocumento(doc, 1, 1);

  doc.save(`Fechamento_${fechamento.data}_${fechamento.turno.replace(/\s+/g, '_')}.pdf`);
};

// ==========================================
// 4. EXPORTAÇÃO: RATEIO DE SOBRAS E FALTAS POR TURNO
// ==========================================
export const exportarRateioTurnoPDF = (
  rateio: RateioTurno,
  dadosPosto: DadosPostoEmissao = DADOS_POSTO_PADRAO
): void => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  adicionarCabecalhoDocumento(
    doc,
    'DEMONSTRATIVO DE RATEIO DE SOBRAS E FALTAS POR TURNO',
    `Data: ${formatarDataBR(rateio.data)} | Turno: ${rateio.turno} | Status: ${rateio.status}`,
    dadosPosto
  );

  let currentY = 48;

  // Box Resumo do Rateio
  doc.setFillColor(rateio.tipo === 'FALTA' ? 254 : 240, rateio.tipo === 'FALTA' ? 242 : 253, rateio.tipo === 'FALTA' ? 242 : 244);
  doc.setDrawColor(rateio.tipo === 'FALTA' ? 252 : 187, rateio.tipo === 'FALTA' ? 165 : 247, rateio.tipo === 'FALTA' ? 165 : 208);
  doc.roundedRect(14, currentY, pageWidth - 28, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(rateio.tipo === 'FALTA' ? 153 : 20, rateio.tipo === 'FALTA' ? 27 : 83, rateio.tipo === 'FALTA' ? 27 : 45);
  doc.text('TIPO DE DIFERENÇA:', 18, currentY + 5.5);
  doc.text('VALOR TOTAL DO TURNO:', 75, currentY + 5.5);
  doc.text('EQUIPE PRESENTE:', 130, currentY + 5.5);
  doc.text('VALOR INDIVIDUAL:', 170, currentY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(rateio.tipo === 'FALTA' ? 185 : 22, rateio.tipo === 'FALTA' ? 28 : 101, rateio.tipo === 'FALTA' ? 28 : 52);
  doc.text(rateio.tipo === 'FALTA' ? 'FALTA DE CAIXA' : rateio.tipo === 'SOBRA' ? 'SOBRA DE CAIXA' : 'SEM DIFERENÇA', 18, currentY + 13);
  doc.text(formatarMoeda(rateio.valorTotalDiferenca), 75, currentY + 13);
  doc.text(`${rateio.totalIntegrantesPresentes} colaborador(es)`, 130, currentY + 13);
  doc.text(formatarMoeda(rateio.valorPorIntegrante), 170, currentY + 13);

  currentY += 24;

  // Tabela de Integrantes do Turno e Rateio
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Distribuição do Rateio entre os Colaboradores do Turno:', 14, currentY);

  autoTable(doc, {
    startY: currentY + 2,
    theme: 'grid',
    head: [['Colaborador Escalado', 'Cargo', 'Presença no Turno', 'Valor Rateado (R$)', 'Status / Pagamento']],
    body: rateio.integrantes.map((i) => [
      i.funcionarioNome,
      i.cargo || 'Frentista',
      i.presente ? 'PRESENTE NO TURNO' : `AUSENTE ("X Faltou" - ${i.motivoAusencia || 'Falta'})`,
      i.presente ? formatarMoeda(i.valorIndividual) : 'R$ 0,00 (Isento)',
      i.presente ? (i.pago ? 'QUITADO' : 'PENDENTE DE DESCONTO') : 'NÃO PARTICIPA',
    ]),
    foot: [
      [
        'TOTAL GERAL RATEADO',
        '',
        `${rateio.totalIntegrantesPresentes} presentes / ${rateio.totalIntegrantesAusentes} ausentes`,
        formatarMoeda(rateio.valorTotalDiferenca),
        rateio.status,
      ],
    ],
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 35 },
      2: { cellWidth: 45, halign: 'center' },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.row.section === 'body') {
        const item = rateio.integrantes[data.row.index];
        if (!item?.presente) {
          data.cell.styles.textColor = [148, 163, 184]; // slate-400
        }
      }
    },
  });

  const nextY = (doc as any).lastAutoTable.finalY + 8;

  // Motivo ou Justificativa
  if (rateio.motivo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('JUSTIFICATIVA / OCORRÊNCIA REGISTRADA:', 14, nextY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(rateio.motivo, 14, nextY + 4, { maxWidth: pageWidth - 28 });
  }

  // Linhas de Assinatura dos Integrantes Presentes
  const signStartY = (rateio.motivo ? nextY + 14 : nextY) + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Ciente dos Integrantes Presentes no Turno:', 14, signStartY);

  let currentSignY = signStartY + 10;
  const presentes = rateio.integrantes.filter((i) => i.presente);

  presentes.forEach((p, idx) => {
    const isOdd = idx % 2 !== 0;
    const colX = isOdd ? pageWidth / 2 + 5 : 14;
    const colWidth = pageWidth / 2 - 20;

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);
    doc.line(colX, currentSignY, colX + colWidth, currentSignY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(p.funcionarioNome, colX, currentSignY + 3.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Valor de ${formatarMoeda(p.valorIndividual)}`, colX, currentSignY + 6.5);

    if (isOdd || idx === presentes.length - 1) {
      currentSignY += 12;
    }
  });

  adicionarRodapeDocumento(doc, 1, 1);

  doc.save(`Rateio_${rateio.data}_${rateio.turno.replace(/\s+/g, '_')}.pdf`);
};

// ==========================================
// 5. EXPORTAÇÃO: RELATÓRIO GERAL CONSOLIDADO DE FECHAMENTOS
// ==========================================
export const exportarRelatorioFechamentosPDF = (
  fechamentos: FechamentoCaixa[],
  periodo = 'Geral',
  dadosPosto: DadosPostoEmissao = DADOS_POSTO_PADRAO
): void => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  adicionarCabecalhoDocumento(
    doc,
    'RELATÓRIO CONSOLIDADO DE FECHAMENTOS DE CAIXA',
    `Período: ${periodo} | Total de Fechamentos Emitidos: ${fechamentos.length}`,
    dadosPosto
  );

  const totalInformado = fechamentos.reduce((s, f) => s + (f.totalInformado || 0), 0);
  const totalConferido = fechamentos.reduce((s, f) => s + (f.totalConferido || 0), 0);
  const totalDiferenca = fechamentos.reduce((s, f) => s + (f.diferenca || 0), 0);

  autoTable(doc, {
    startY: 48,
    theme: 'grid',
    head: [['Data', 'Turno', 'Operador', 'Conferido Por', 'Total Sistema (R$)', 'Total Físico (R$)', 'Diferença (R$)', 'Status']],
    body: fechamentos.map((f) => [
      formatarDataBR(f.data),
      f.turno,
      f.funcionarioNome || 'Operador',
      f.conferidoPor || 'Fiscal',
      formatarMoeda(f.totalInformado),
      formatarMoeda(f.totalConferido),
      `${f.diferenca > 0 ? '+' : ''}${formatarMoeda(f.diferenca)}`,
      f.status,
    ]),
    foot: [
      [
        'TOTAL GERAL CONSOLIDADO',
        '',
        '',
        '',
        formatarMoeda(totalInformado),
        formatarMoeda(totalConferido),
        `${totalDiferenca > 0 ? '+' : ''}${formatarMoeda(totalDiferenca)}`,
        '',
      ],
    ],
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 35 },
      2: { cellWidth: 40 },
      3: { cellWidth: 35 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'center' },
    },
  });

  const totalPaginas = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    adicionarRodapeDocumento(doc, i, totalPaginas);
  }

  doc.save(`Relatorio_Fechamentos_${periodo.replace(/\s+/g, '_')}.pdf`);
};
