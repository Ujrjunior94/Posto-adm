import React, { useState, useMemo } from 'react';
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
} from '../../types';
import {
  FileText,
  Printer,
  Download,
  Search,
  Trash2,
  FileDown,
  DollarSign,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { formatarMoeda } from '../../utils/calculations';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface RelatoriosProps {
  funcionarios: Funcionario[];
  escalas: Escala[];
  fechamentos: FechamentoCaixa[];
  ocorrencias: OcorrenciaCaixa[];
  tanques: Tanque[];
  bicos: Bico[];
  afericoes: Afericao[];
  densidades: RegistroDensidade[];
  conformidades: Conformidade[];
  auditoria: AuditLog[];
  onLimparDemonstracao?: () => void;
}

type TipoRelatorio =
  | 'BALANCO_CONSOLIDADO'
  | 'FECHAMENTOS'
  | 'AFERICOES'
  | 'ESCALAS'
  | 'TANQUES'
  | 'FALTAS'
  | 'DENSIDADES'
  | 'CONFORMIDADE'
  | 'FUNCIONARIOS'
  | 'AUDITORIA';

export const RelatoriosView: React.FC<RelatoriosProps> = ({
  funcionarios,
  escalas,
  fechamentos,
  ocorrencias,
  tanques,
  bicos,
  afericoes,
  densidades,
  conformidades,
  auditoria,
  onLimparDemonstracao,
}) => {
  const [tipo, setTipo] = useState<TipoRelatorio>('BALANCO_CONSOLIDADO');
  const [subModoEscala, setSubModoEscala] = useState<
    'DIARIO' | 'SEMANAL' | 'MENSAL' | 'FUNCIONARIO' | 'SETOR'
  >('MENSAL');
  const [filtroFuncRelatorio, setFiltroFuncRelatorio] = useState<string>('TODOS');
  const [filtroSetorRelatorio, setFiltroSetorRelatorio] = useState<string>('TODOS');
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 7) + '-31');
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // Filtros reativos por período e busca
  const fechamentosFiltrados = useMemo(() => {
    return fechamentos
      .filter((f) => {
        if (dataInicio && f.data < dataInicio) return false;
        if (dataFim && f.data > dataFim) return false;
        if (busca.trim()) {
          const q = busca.toLowerCase();
          if (
            !(f.funcionarioNome || '').toLowerCase().includes(q) &&
            !(f.turno || '').toLowerCase().includes(q) &&
            !f.data.includes(q) &&
            !(f.tipoDiferenca || '').toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [fechamentos, dataInicio, dataFim, busca]);

  const afericoesFiltradas = useMemo(() => {
    return afericoes
      .filter((a) => {
        if (dataInicio && a.data < dataInicio) return false;
        if (dataFim && a.data > dataFim) return false;
        if (busca.trim()) {
          const q = busca.toLowerCase();
          if (
            !(a.produto || '').toLowerCase().includes(q) &&
            !(a.responsavelNome || '').toLowerCase().includes(q) &&
            !String(a.bicoNumero || a.bicoId).toLowerCase().includes(q) &&
            !(a.resultado || '').toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => b.data.localeCompare(a.data) || (b.hora || '').localeCompare(a.hora || ''));
  }, [afericoes, dataInicio, dataFim, busca]);

  const escalasFiltradas = useMemo(() => {
    return escalas
      .filter((e) => {
        if (dataInicio && e.data < dataInicio) return false;
        if (dataFim && e.data > dataFim) return false;
        if (subModoEscala === 'DIARIO' && dataInicio && e.data !== dataInicio) return false;
        if (filtroFuncRelatorio !== 'TODOS' && e.funcionarioId !== filtroFuncRelatorio) return false;
        if (filtroSetorRelatorio !== 'TODOS' && (e.setor || 'Pista') !== filtroSetorRelatorio) return false;
        if (busca.trim()) {
          const q = busca.toLowerCase();
          if (
            !e.funcionarioNome.toLowerCase().includes(q) &&
            !(e.setor || '').toLowerCase().includes(q) &&
            !e.turno.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => a.data.localeCompare(b.data) || a.funcionarioNome.localeCompare(b.funcionarioNome));
  }, [escalas, dataInicio, dataFim, subModoEscala, filtroFuncRelatorio, filtroSetorRelatorio, busca]);

  // Consolidação Financeira (Fechamentos) e Metrológica (Aferições)
  const balancoConsolidado = useMemo(() => {
    const totalConferido = fechamentosFiltrados.reduce((acc, f) => acc + (Number(f.totalConferido) || 0), 0);
    const totalInformado = fechamentosFiltrados.reduce((acc, f) => acc + (Number(f.totalInformado) || 0), 0);
    const saldoDiferenca = fechamentosFiltrados.reduce((acc, f) => acc + (Number(f.diferenca) || 0), 0);
    const totalSobras = fechamentosFiltrados
      .filter((f) => f.diferenca > 0)
      .reduce((acc, f) => acc + Number(f.diferenca), 0);
    const totalFaltas = fechamentosFiltrados
      .filter((f) => f.diferenca < 0)
      .reduce((acc, f) => acc + Math.abs(Number(f.diferenca)), 0);

    const meiosPagamento = fechamentosFiltrados.reduce(
      (acc, f) => {
        acc.pix += Number(f.recolhimento?.pix || f.vendasPix || 0);
        acc.cartao += Number(
          f.recolhimento?.cartao || (f.vendasCartaoCredito || 0) + (f.vendasCartaoDebito || 0)
        );
        acc.deposito += Number(f.recolhimento?.deposito || f.vendasDinheiro || 0);
        acc.nota += Number(f.recolhimento?.nota || 0);
        acc.pixCnpj += Number(f.recolhimento?.pixCnpj || 0);
        acc.despesa += Number(f.recolhimento?.despesa || 0);
        acc.outros += Number(f.recolhimento?.outros || f.vendasOutros || 0);
        return acc;
      },
      { pix: 0, cartao: 0, deposito: 0, nota: 0, pixCnpj: 0, despesa: 0, outros: 0 }
    );

    const totalAfericoes = afericoesFiltradas.length;
    const afericoesConformes = afericoesFiltradas.filter((a) => a.resultado === 'CONFORME').length;
    const afericoesNaoConformes = totalAfericoes - afericoesConformes;
    const taxaConformidade =
      totalAfericoes > 0 ? ((afericoesConformes / totalAfericoes) * 100).toFixed(1) : '100.0';

    const volumeTotalNominal = afericoesFiltradas.reduce(
      (acc, a) => acc + (Number(a.volumeNominal) || 20),
      0
    );
    const volumeTotalAferido = afericoesFiltradas.reduce(
      (acc, a) => acc + (Number(a.volumeAferido) || 20),
      0
    );
    const desvioTotalMl = afericoesFiltradas.reduce(
      (acc, a) => acc + Math.round((Number(a.diferenca) || 0) * 1000),
      0
    );
    const desvioMedioMl = totalAfericoes > 0 ? Math.round(desvioTotalMl / totalAfericoes) : 0;

    // Agrupamento de aferições por produto
    const mapaPorProduto = new Map<
      string,
      { produto: string; qtd: number; volumeAferido: number; desvioSomaMl: number; conformes: number }
    >();
    afericoesFiltradas.forEach((a) => {
      const prod = a.produto || 'Combustível';
      const atual = mapaPorProduto.get(prod) || {
        produto: prod,
        qtd: 0,
        volumeAferido: 0,
        desvioSomaMl: 0,
        conformes: 0,
      };
      atual.qtd += 1;
      atual.volumeAferido += Number(a.volumeAferido) || 20;
      atual.desvioSomaMl += Math.round((Number(a.diferenca) || 0) * 1000);
      if (a.resultado === 'CONFORME') atual.conformes += 1;
      mapaPorProduto.set(prod, atual);
    });

    return {
      totalFechamentos: fechamentosFiltrados.length,
      totalConferido,
      totalInformado,
      saldoDiferenca,
      totalSobras,
      totalFaltas,
      meiosPagamento,
      totalAfericoes,
      afericoesConformes,
      afericoesNaoConformes,
      taxaConformidade,
      volumeTotalNominal,
      volumeTotalAferido,
      desvioTotalMl,
      desvioMedioMl,
      resumoPorProduto: Array.from(mapaPorProduto.values()),
    };
  }, [fechamentosFiltrados, afericoesFiltradas]);

  const handleImprimir = () => {
    window.print();
  };

  /**
   * Exportação nativa em PDF do Balanço Consolidado de Fechamentos de Caixa e Aferições Metrológicas
   * (ou do módulo específico selecionado)
   */
  const handleExportarPDF = (modoForcado?: TipoRelatorio) => {
    setGerandoPdf(true);
    try {
      const relatorioAlvo = modoForcado || tipo;
      const doc = new jsPDF({
        orientation: relatorioAlvo === 'ESCALAS' ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const dataHoraEmissao = new Date().toLocaleString('pt-BR');

      // Cabeçalho Institucional
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(
        relatorioAlvo === 'BALANCO_CONSOLIDADO'
          ? 'MEU POSTO 2.0 — BALANCO CONSOLIDADO: FECHAMENTOS & AFERICOES'
          : `MEU POSTO 2.0 — RELATORIO OPERACIONAL: ${relatorioAlvo}`,
        14,
        12
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(203, 213, 225);
      doc.text(
        `Periodo Analisado: ${dataInicio || 'Inicio'} ate ${dataFim || 'Atual'}   |   Emitido em: ${dataHoraEmissao}`,
        14,
        20
      );

      let currentY = 35;

      // 1. SEÇÃO DE FECHAMENTOS (Para BALANCO_CONSOLIDADO ou FECHAMENTOS)
      if (relatorioAlvo === 'BALANCO_CONSOLIDADO' || relatorioAlvo === 'FECHAMENTOS') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text('1. BALANCO FINANCEIRO CONSOLIDADO — FECHAMENTOS DE CAIXA', 14, currentY);
        currentY += 4;

        // Resumo Executivo de Fechamentos
        autoTable(doc, {
          startY: currentY,
          head: [
            [
              'Qtd. Fechamentos',
              'Total Bombas (Conferido)',
              'Total Recolhido (Informado)',
              'Total Sobras (+)',
              'Total Faltas (-)',
              'Saldo Liquido',
            ],
          ],
          body: [
            [
              String(balancoConsolidado.totalFechamentos),
              formatarMoeda(balancoConsolidado.totalConferido),
              formatarMoeda(balancoConsolidado.totalInformado),
              formatarMoeda(balancoConsolidado.totalSobras),
              formatarMoeda(balancoConsolidado.totalFaltas),
              formatarMoeda(balancoConsolidado.saldoDiferenca),
            ],
          ],
          theme: 'grid',
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8.5, fontStyle: 'bold', textColor: [15, 23, 42] },
          margin: { left: 14, right: 14 },
        });

        currentY = (doc as any).lastAutoTable.finalY + 5;

        // Composição por Meio de Pagamento
        autoTable(doc, {
          startY: currentY,
          head: [
            [
              'PIX Pista',
              'Cartoes (Deb/Cred)',
              'Dinheiro / Deposito',
              'Notas a Prazo',
              'PIX CNPJ',
              'Despesas / Vales',
              'Outros',
            ],
          ],
          body: [
            [
              formatarMoeda(balancoConsolidado.meiosPagamento.pix),
              formatarMoeda(balancoConsolidado.meiosPagamento.cartao),
              formatarMoeda(balancoConsolidado.meiosPagamento.deposito),
              formatarMoeda(balancoConsolidado.meiosPagamento.nota),
              formatarMoeda(balancoConsolidado.meiosPagamento.pixCnpj),
              formatarMoeda(balancoConsolidado.meiosPagamento.despesa),
              formatarMoeda(balancoConsolidado.meiosPagamento.outros),
            ],
          ],
          theme: 'striped',
          headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7.5 },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });

        currentY = (doc as any).lastAutoTable.finalY + 6;

        // Listagem Detalhada de Fechamentos de Caixa
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(
          `Detalhamento de Fechamentos de Caixa no Periodo (${fechamentosFiltrados.length} registros)`,
          14,
          currentY
        );
        currentY += 3;

        autoTable(doc, {
          startY: currentY,
          head: [
            [
              'Data',
              'Turno',
              'Operador / Responsavel',
              'Total Bombas',
              'Total Informado',
              'Diferenca',
              'Resultado',
            ],
          ],
          body:
            fechamentosFiltrados.length > 0
              ? fechamentosFiltrados.map((f) => [
                  f.data,
                  f.turno || '—',
                  f.funcionarioNome || 'Operador',
                  formatarMoeda(f.totalConferido),
                  formatarMoeda(f.totalInformado),
                  formatarMoeda(f.diferenca),
                  f.tipoDiferenca || (f.diferenca < 0 ? 'FALTA' : f.diferenca > 0 ? 'SOBRA' : 'EXATO'),
                ])
              : [['—', '—', 'Nenhum fechamento registrado no periodo selecionado', 'R$ 0,00', 'R$ 0,00', 'R$ 0,00', '—']],
          foot:
            fechamentosFiltrados.length > 0
              ? [
                  [
                    'TOTAL',
                    `${fechamentosFiltrados.length} turnos`,
                    'Consolidado do Periodo',
                    formatarMoeda(balancoConsolidado.totalConferido),
                    formatarMoeda(balancoConsolidado.totalInformado),
                    formatarMoeda(balancoConsolidado.saldoDiferenca),
                    balancoConsolidado.saldoDiferenca < 0
                      ? 'SALDO NEGATIVO'
                      : balancoConsolidado.saldoDiferenca > 0
                      ? 'SALDO POSITIVO'
                      : 'ZERADO',
                  ],
                ]
              : undefined,
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 7.5 },
          footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
          margin: { left: 14, right: 14 },
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      // 2. SEÇÃO DE AFERIÇÕES (Para BALANCO_CONSOLIDADO ou AFERICOES)
      if (relatorioAlvo === 'BALANCO_CONSOLIDADO' || relatorioAlvo === 'AFERICOES') {
        if (currentY > 220) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text('2. BALANCO METROLOGICO CONSOLIDADO — AFERICOES DE BICOS (INMETRO 20L)', 14, currentY);
        currentY += 4;

        // Resumo Executivo de Aferições
        autoTable(doc, {
          startY: currentY,
          head: [
            [
              'Total Afericoes',
              'Conformes (±100ml)',
              'Nao Conformes',
              'Indice Conformidade',
              'Volume Total Aferido',
              'Desvio Medio (ml)',
            ],
          ],
          body: [
            [
              String(balancoConsolidado.totalAfericoes),
              String(balancoConsolidado.afericoesConformes),
              String(balancoConsolidado.afericoesNaoConformes),
              `${balancoConsolidado.taxaConformidade}%`,
              `${balancoConsolidado.volumeTotalAferido.toFixed(3)} L`,
              `${balancoConsolidado.desvioMedioMl > 0 ? '+' : ''}${balancoConsolidado.desvioMedioMl} ml`,
            ],
          ],
          theme: 'grid',
          headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 8, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8.5, fontStyle: 'bold', textColor: [15, 23, 42] },
          margin: { left: 14, right: 14 },
        });

        currentY = (doc as any).lastAutoTable.finalY + 5;

        // Resumo por Produto (se houver aferições)
        if (balancoConsolidado.resumoPorProduto.length > 0) {
          autoTable(doc, {
            startY: currentY,
            head: [['Combustivel / Produto', 'Qtd. Testes', 'Volume Total (L)', 'Desvio Medio (ml)', 'Conformes']],
            body: balancoConsolidado.resumoPorProduto.map((p) => {
              const mediaMl = p.qtd > 0 ? Math.round(p.desvioSomaMl / p.qtd) : 0;
              return [
                p.produto,
                String(p.qtd),
                `${p.volumeAferido.toFixed(3)} L`,
                `${mediaMl > 0 ? '+' : ''}${mediaMl} ml`,
                `${p.conformes} de ${p.qtd}`,
              ];
            }),
            theme: 'striped',
            headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7.5 },
            bodyStyles: { fontSize: 7.5 },
            margin: { left: 14, right: 14 },
          });

          currentY = (doc as any).lastAutoTable.finalY + 6;
        }

        // Listagem Detalhada de Aferições
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(
          `Detalhamento Tecnico de Afericoes Volumétricas (${afericoesFiltradas.length} registros)`,
          14,
          currentY
        );
        currentY += 3;

        autoTable(doc, {
          startY: currentY,
          head: [
            [
              'Data / Hora',
              'Bico',
              'Combustivel',
              'Vol. Nominal',
              'Vol. Aferido',
              'Desvio (ml)',
              'Encerrante / Lacre',
              'Responsavel',
              'Status Inmetro',
            ],
          ],
          body:
            afericoesFiltradas.length > 0
              ? afericoesFiltradas.map((a) => {
                  const desvioMl = Math.round((Number(a.diferenca) || 0) * 1000);
                  const encInfo = a.encerranteFinal ?? a.encerranteLeitura;
                  const lacreInfo = a.lacreInmetro ? `Lacre: ${a.lacreInmetro}` : '';
                  return [
                    `${a.data} ${a.hora || ''}`.trim(),
                    `Bico ${String(a.bicoNumero || a.bicoId).padStart(2, '0')}`,
                    a.produto,
                    `${Number(a.volumeNominal || 20).toFixed(3)} L`,
                    `${Number(a.volumeAferido || 20).toFixed(3)} L`,
                    `${desvioMl > 0 ? '+' : ''}${desvioMl} ml`,
                    [encInfo ? `Enc: ${encInfo}` : '', lacreInfo].filter(Boolean).join(' | ') || '—',
                    a.responsavelNome || 'Operador',
                    a.resultado,
                  ];
                })
              : [['—', '—', 'Nenhuma afericao registrada no periodo selecionado', '20.000 L', '20.000 L', '0 ml', '—', '—', '—']],
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.5 },
          bodyStyles: { fontSize: 7 },
          margin: { left: 14, right: 14 },
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      // 3. DEMAIS MÓDULOS ESPECÍFICOS QUANDO SELECIONADOS INDIVIDUALMENTE
      if (relatorioAlvo === 'ESCALAS') {
        autoTable(doc, {
          startY: currentY,
          head: [
            [
              'Funcionario',
              'Data',
              'Dia',
              'Entrada',
              'Saida',
              'Intervalo',
              'Turno',
              'Setor / Funcao',
              'Status',
              'Observacoes',
            ],
          ],
          body: escalasFiltradas.map((e) => [
            e.funcionarioNome,
            e.data,
            e.diaSemana || '',
            e.horarioInicio,
            e.horarioFim,
            e.intervalo || '1h',
            e.turno,
            `${e.setor || 'Pista'} / ${e.funcao || 'Frentista'}`,
            e.status,
            e.observacao || '—',
          ]),
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 14, right: 14 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      } else if (relatorioAlvo === 'TANQUES') {
        autoTable(doc, {
          startY: currentY,
          head: [['Tanque', 'Combustivel', 'Capacidade Nominal', 'Estoque Atual', 'Ocupacao (%)']],
          body: tanques.map((t) => [
            t.codigo,
            t.produto,
            `${t.capacidadeNominal.toLocaleString('pt-BR')} L`,
            `${t.volumeAtual.toLocaleString('pt-BR')} L`,
            `${((t.volumeAtual / Math.max(1, t.capacidadeNominal)) * 100).toFixed(1)}%`,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 8;

        autoTable(doc, {
          startY: currentY,
          head: [['Bico', 'Bomba / Lado', 'Combustivel', 'Tanque Vinculado', 'Encerrante Atual', 'Status']],
          body: bicos.map((b) => [
            `Bico ${String(b.numero).padStart(2, '0')}`,
            `${b.bomba} (Lado ${b.lado})`,
            b.produto,
            b.tanqueCodigo || b.tanqueId,
            `${(b.encerranteAtual || 0).toLocaleString('pt-BR')} L`,
            b.status,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      } else if (relatorioAlvo === 'FALTAS') {
        autoTable(doc, {
          startY: currentY,
          head: [['Data', 'Colaborador', 'Tipo', 'Valor (R$)', 'Motivo / Descricao', 'Status']],
          body: ocorrencias.map((o) => [
            o.data,
            o.funcionarioNome || 'Operador',
            o.tipo,
            formatarMoeda(o.valor),
            o.motivo || '—',
            o.status,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      } else if (relatorioAlvo === 'DENSIDADES') {
        autoTable(doc, {
          startY: currentY,
          head: [['Data / Hora', 'Combustivel', 'Densidade (g/cm³)', 'Temp (°C)', 'Teor Etanol', 'Resultado']],
          body: densidades.map((d) => [
            `${d.data} ${d.hora}`,
            d.produto,
            String(d.densidadeObservada),
            `${d.temperaturaC} °C`,
            d.teorAlcoolico !== undefined ? `${d.teorAlcoolico}%` : '—',
            d.status,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      } else if (relatorioAlvo === 'CONFORMIDADE') {
        autoTable(doc, {
          startY: currentY,
          head: [['Data', 'Categoria', 'Item Inspecionado', 'Responsavel', 'Status']],
          body: conformidades.map((c) => [
            c.dataVerificacao,
            c.categoria,
            c.item,
            c.responsavel,
            c.status,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      } else if (relatorioAlvo === 'FUNCIONARIOS') {
        autoTable(doc, {
          startY: currentY,
          head: [['Nome', 'Matricula', 'Cargo / Funcao', 'Turno Preferencial', 'Admissao', 'Status']],
          body: funcionarios.map((f) => [
            f.nome,
            f.matricula,
            `${f.cargo} (${f.funcao || 'Pista'})`,
            f.turnoPreferencial,
            f.dataAdmissao,
            f.status,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      } else if (relatorioAlvo === 'AUDITORIA') {
        autoTable(doc, {
          startY: currentY,
          head: [['Data / Hora', 'Usuario', 'Modulo', 'Entidade', 'Acao']],
          body: auditoria.map((l) => [
            new Date(l.timestamp).toLocaleString('pt-BR'),
            l.usuarioNome,
            l.modulo,
            l.entidade,
            l.acao,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 14, right: 14 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      // Bloco de Assinaturas e Conferência no final do documento
      if (currentY > doc.internal.pageSize.getHeight() - 35) {
        doc.addPage();
        currentY = 30;
      } else {
        currentY += 12;
      }

      doc.setDrawColor(148, 163, 184);
      doc.line(20, currentY, 95, currentY);
      doc.line(pageWidth - 95, currentY, pageWidth - 20, currentY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Responsavel Operacional / Conferencia de Pista', 25, currentY + 5);
      doc.text('Gerencia / Auditoria Administrativa', pageWidth - 88, currentY + 5);

      // Numeração de páginas no rodapé
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `MEU POSTO 2.0 • Documento Oficial de Auditoria • Pagina ${i} de ${totalPages}`,
          14,
          doc.internal.pageSize.getHeight() - 8
        );
      }

      const nomeArquivo =
        relatorioAlvo === 'BALANCO_CONSOLIDADO'
          ? `balanco_consolidado_fechamentos_afericoes_${dataInicio}_a_${dataFim}.pdf`
          : `relatorio_${relatorioAlvo.toLowerCase()}_${dataInicio}_a_${dataFim}.pdf`;

      doc.save(nomeArquivo);
    } finally {
      setGerandoPdf(false);
    }
  };

  const handleExportarCsv = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    const linhas: string[][] = [];

    if (tipo === 'BALANCO_CONSOLIDADO' || tipo === 'FECHAMENTOS') {
      linhas.push(['=== BALANCO DE FECHAMENTOS DE CAIXA ===']);
      linhas.push([
        'ID',
        'Data',
        'Turno',
        'Operador',
        'Total_Bombas_Conferido',
        'Total_Recolhido_Informado',
        'Diferenca',
        'Status',
        'Pix',
        'Cartao',
        'Nota',
        'Deposito',
        'Pix_CNPJ',
        'Despesa',
        'Outros',
      ]);
      fechamentosFiltrados.forEach((f) => {
        linhas.push([
          f.id,
          f.data,
          f.turno,
          f.funcionarioNome || '',
          String(f.totalConferido),
          String(f.totalInformado),
          String(f.diferenca),
          f.tipoDiferenca,
          String(f.recolhimento?.pix ?? ''),
          String(f.recolhimento?.cartao ?? ''),
          String(f.recolhimento?.nota ?? ''),
          String(f.recolhimento?.deposito ?? ''),
          String(f.recolhimento?.pixCnpj ?? ''),
          String(f.recolhimento?.despesa ?? ''),
          String(f.recolhimento?.outros ?? ''),
        ]);
      });
    }

    if (tipo === 'BALANCO_CONSOLIDADO' || tipo === 'AFERICOES') {
      if (linhas.length > 0) linhas.push([]);
      linhas.push(['=== BALANCO DE AFERICOES DE BICOS ===']);
      linhas.push([
        'Data',
        'Hora',
        'Bico',
        'Produto',
        'Nominal_L',
        'Aferido_L',
        'Diferenca_ml',
        'Resultado',
        'Encerrante_Foto',
        'Lacre_Inmetro',
        'Responsavel',
      ]);
      afericoesFiltradas.forEach((a) => {
        linhas.push([
          a.data,
          a.hora,
          String(a.bicoNumero || a.bicoId),
          a.produto,
          String(a.volumeNominal),
          String(a.volumeAferido),
          String(Math.round(a.diferenca * 1000)),
          a.resultado,
          String(a.encerranteFinal ?? a.encerranteLeitura ?? ''),
          a.lacreInmetro || '',
          a.responsavelNome || '',
        ]);
      });
    }

    if (tipo === 'ESCALAS') {
      linhas.push([
        'Funcionario',
        'Data',
        'Dia_Semana',
        'Entrada',
        'Saida',
        'Intervalo',
        'Turno',
        'Setor',
        'Funcao',
        'Status',
        'Observacoes',
      ]);
      escalasFiltradas.forEach((e) => {
        linhas.push([
          e.funcionarioNome,
          e.data,
          e.diaSemana || '',
          e.horarioInicio,
          e.horarioFim,
          e.intervalo || '1h',
          e.turno,
          e.setor || 'Pista',
          e.funcao || 'Frentista',
          e.status,
          e.observacao || '',
        ]);
      });
    } else if (tipo === 'AUDITORIA') {
      linhas.push(['Timestamp', 'Usuario', 'Modulo', 'Entidade', 'Acao']);
      auditoria.forEach((l) => {
        linhas.push([l.timestamp, l.usuarioNome, l.modulo, l.entidade, l.acao]);
      });
    }

    const csvStr = linhas.map((e) => e.join(';')).join('\n');
    csvContent += encodeURI(csvStr);
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `relatorio_${tipo.toLowerCase()}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            Central de Relatórios & Balanço Consolidado
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Exportação em PDF do balanço consolidado de fechamentos de caixa, aferições Inmetro, escalas e auditoria.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onLimparDemonstracao && (
            <button
              onClick={onLimparDemonstracao}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg text-xs transition border border-red-200 cursor-pointer"
              title="Remover todos os dados de demonstração e resetar posto"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              Limpar Demonstração
            </button>
          )}

          <button
            onClick={handleExportarCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>

          <button
            onClick={handleImprimir}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Imprimir Tela
          </button>

          {tipo !== 'BALANCO_CONSOLIDADO' && (
            <button
              onClick={() => handleExportarPDF(tipo)}
              disabled={gerandoPdf}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              Baixar PDF ({tipo})
            </button>
          )}

          <button
            onClick={() => handleExportarPDF('BALANCO_CONSOLIDADO')}
            disabled={gerandoPdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            {gerandoPdf
              ? 'Gerando PDF...'
              : 'Exportar PDF — Balanço Consolidado (Fechamentos & Aferições)'}
          </button>
        </div>
      </div>

      {/* Barra de Filtros e Seleção do Tipo */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Módulo / Tipo de Relatório
          </label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoRelatorio)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-800"
          >
            <option value="BALANCO_CONSOLIDADO">
              ★ Balanço Consolidado (Fechamentos de Caixa & Aferições)
            </option>
            <option value="FECHAMENTOS">Fechamentos de Caixa (Individual)</option>
            <option value="AFERICOES">Aferições de Bicos Inmetro (Individual)</option>
            <option value="ESCALAS">Escalas & Planner (Diário, Semanal, Mensal, Setor)</option>
            <option value="TANQUES">Cadastro de Bicos & Estoque de Tanques</option>
            <option value="FALTAS">Sobras, Faltas e Ocorrências de Caixa</option>
            <option value="DENSIDADES">Análises de Qualidade e Densidade ANP</option>
            <option value="CONFORMIDADE">Conformidade e Checklists</option>
            <option value="FUNCIONARIOS">Quadro de Funcionários</option>
            <option value="AUDITORIA">Trilha de Auditoria (Logs)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Data Início</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Data Fim</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Busca Rápida</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Operador, combustível, turno..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Relatório Renderizado */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:shadow-none print:border-none space-y-6">
        <div className="pb-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900 uppercase">
              MEU POSTO 2.0 —{' '}
              {tipo === 'BALANCO_CONSOLIDADO'
                ? 'Balanço Consolidado de Fechamentos & Aferições'
                : `Relatório Operacional: ${tipo}`}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Período: <strong>{dataInicio}</strong> até <strong>{dataFim}</strong> • Emitido em:{' '}
              {new Date().toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="text-right text-xs text-slate-400 font-mono">
            Documento Auditável • Nuvem 24h
          </div>
        </div>

        {/* MODO 1: BALANÇO CONSOLIDADO (FECHAMENTOS + AFERIÇÕES) */}
        {tipo === 'BALANCO_CONSOLIDADO' && (
          <div className="space-y-8">
            {/* Bloco 1: Resumo Financeiro de Fechamentos */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  1. Balanço Financeiro de Fechamentos de Caixa ({balancoConsolidado.totalFechamentos} turnos)
                </h4>
                <span className="text-xs text-slate-500">
                  Conferência de bombas vs. valores recolhidos
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-bold uppercase text-slate-500">
                    Total Bombas (Conferido)
                  </div>
                  <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                    {formatarMoeda(balancoConsolidado.totalConferido)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {balancoConsolidado.totalFechamentos} fechamento(s) no período
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                  <div className="text-[11px] font-bold uppercase text-blue-800">
                    Total Recolhido (Informado)
                  </div>
                  <div className="text-xl font-bold text-blue-950 font-mono mt-1">
                    {formatarMoeda(balancoConsolidado.totalInformado)}
                  </div>
                  <div className="text-[11px] text-blue-700 mt-1">
                    Soma de Pix, Cartões, Dinheiro e Notas
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <div className="text-[11px] font-bold uppercase text-emerald-800 flex items-center justify-between">
                    <span>Sobras Acumuladas</span>
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-emerald-700 font-mono mt-1">
                    +{formatarMoeda(balancoConsolidado.totalSobras)}
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-1">
                    Faltas: -{formatarMoeda(balancoConsolidado.totalFaltas)}
                  </div>
                </div>

                <div
                  className={`p-4 rounded-xl border ${
                    balancoConsolidado.saldoDiferenca < 0
                      ? 'bg-red-50/70 border-red-200'
                      : 'bg-emerald-50/70 border-emerald-200'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase text-slate-700 flex items-center justify-between">
                    <span>Saldo Líquido de Caixa</span>
                    {balancoConsolidado.saldoDiferenca < 0 ? (
                      <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                  </div>
                  <div
                    className={`text-xl font-bold font-mono mt-1 ${
                      balancoConsolidado.saldoDiferenca < 0 ? 'text-red-700' : 'text-emerald-800'
                    }`}
                  >
                    {formatarMoeda(balancoConsolidado.saldoDiferenca)}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    Resultado líquido (Informado - Conferido)
                  </div>
                </div>
              </div>

              {/* Composição por Meios de Pagamento */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">PIX Pista</span>
                  <strong className="font-mono text-slate-900">
                    {formatarMoeda(balancoConsolidado.meiosPagamento.pix)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Cartões</span>
                  <strong className="font-mono text-slate-900">
                    {formatarMoeda(balancoConsolidado.meiosPagamento.cartao)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">
                    Dinheiro / Depósito
                  </span>
                  <strong className="font-mono text-slate-900">
                    {formatarMoeda(balancoConsolidado.meiosPagamento.deposito)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Notas a Prazo</span>
                  <strong className="font-mono text-slate-900">
                    {formatarMoeda(balancoConsolidado.meiosPagamento.nota)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">PIX CNPJ</span>
                  <strong className="font-mono text-slate-900">
                    {formatarMoeda(balancoConsolidado.meiosPagamento.pixCnpj)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Despesas</span>
                  <strong className="font-mono text-slate-900">
                    {formatarMoeda(balancoConsolidado.meiosPagamento.despesa)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Outros</span>
                  <strong className="font-mono text-slate-900">
                    {formatarMoeda(balancoConsolidado.meiosPagamento.outros)}
                  </strong>
                </div>
              </div>

              {/* Tabela de Fechamentos no Balanço Consolidado */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Data / Turno</th>
                      <th className="py-2.5 px-3">Operador / Caixa</th>
                      <th className="py-2.5 px-3">Total Bombas</th>
                      <th className="py-2.5 px-3">Total Informado</th>
                      <th className="py-2.5 px-3">Diferença</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fechamentosFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          Nenhum fechamento de caixa encontrado no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      fechamentosFiltrados.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono font-semibold">
                            {f.data} ({f.turno})
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900">
                            {f.funcionarioNome || 'Operador'}
                          </td>
                          <td className="py-2 px-3 font-mono">{formatarMoeda(f.totalConferido)}</td>
                          <td className="py-2 px-3 font-mono font-bold">
                            {formatarMoeda(f.totalInformado)}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold">
                            <span className={f.diferenca < 0 ? 'text-red-600' : 'text-emerald-600'}>
                              {formatarMoeda(f.diferenca)}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                f.diferenca < 0
                                  ? 'bg-red-100 text-red-800'
                                  : f.diferenca > 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {f.tipoDiferenca}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bloco 2: Resumo Metrológico de Aferições */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-emerald-600" />
                  2. Balanço Metrológico de Aferições de Bicos ({balancoConsolidado.totalAfericoes}{' '}
                  ensaios 20L)
                </h4>
                <span className="text-xs text-slate-500">
                  Tolerância máxima Inmetro: ±100 ml por aferição de 20L
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-bold uppercase text-slate-500">
                    Total de Aferições
                  </div>
                  <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                    {balancoConsolidado.totalAfericoes}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Volume Total: {balancoConsolidado.volumeTotalAferido.toFixed(3)} L
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <div className="text-[11px] font-bold uppercase text-emerald-800 flex items-center justify-between">
                    <span>Índice de Conformidade</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-emerald-800 font-mono mt-1">
                    {balancoConsolidado.taxaConformidade}%
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-1">
                    {balancoConsolidado.afericoesConformes} conformes •{' '}
                    {balancoConsolidado.afericoesNaoConformes} fora da faixa
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                  <div className="text-[11px] font-bold uppercase text-blue-800">
                    Desvio Volumétrico Médio
                  </div>
                  <div className="text-xl font-bold text-blue-950 font-mono mt-1">
                    {balancoConsolidado.desvioMedioMl > 0 ? '+' : ''}
                    {balancoConsolidado.desvioMedioMl} ml
                  </div>
                  <div className="text-[11px] text-blue-700 mt-1">
                    Média por medição de 20,000 L
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
                  <div className="text-[11px] font-bold uppercase text-amber-900 flex items-center justify-between">
                    <span>Bicos fora da Tolerância</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="text-xl font-bold text-amber-900 font-mono mt-1">
                    {balancoConsolidado.afericoesNaoConformes}
                  </div>
                  <div className="text-[11px] text-amber-800 mt-1">
                    Limite legal Inmetro: ±100 ml
                  </div>
                </div>
              </div>

              {/* Tabela de Aferições no Balanço Consolidado */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Data / Hora</th>
                      <th className="py-2.5 px-3">Bico / Combustível</th>
                      <th className="py-2.5 px-3">Nominal</th>
                      <th className="py-2.5 px-3">Volume Aferido</th>
                      <th className="py-2.5 px-3">Desvio (ml)</th>
                      <th className="py-2.5 px-3">Encerrante / Lacre</th>
                      <th className="py-2.5 px-3">Responsável</th>
                      <th className="py-2.5 px-3">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {afericoesFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-400">
                          Nenhuma aferição registrada no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      afericoesFiltradas.map((a) => {
                        const desvioMl = Math.round((Number(a.diferenca) || 0) * 1000);
                        return (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono">
                              {a.data} {a.hora}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900">
                              Bico {String(a.bicoNumero || a.bicoId).padStart(2, '0')} • {a.produto}
                            </td>
                            <td className="py-2 px-3 font-mono">{a.volumeNominal.toFixed(3)} L</td>
                            <td className="py-2 px-3 font-mono font-bold">
                              {a.volumeAferido.toFixed(3)} L
                            </td>
                            <td className="py-2 px-3 font-mono font-bold">
                              <span
                                className={
                                  Math.abs(desvioMl) > 100 ? 'text-red-600' : 'text-emerald-700'
                                }
                              >
                                {desvioMl > 0 ? '+' : ''}
                                {desvioMl} ml
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                              {a.encerranteFinal ?? a.encerranteLeitura ?? '—'}{' '}
                              {a.lacreInmetro ? `• Lacre ${a.lacreInmetro}` : ''}
                            </td>
                            <td className="py-2 px-3">{a.responsavelNome || 'Operador'}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  a.resultado === 'CONFORME'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {a.resultado}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Relatório Completo de Escalas e Planner */}
        {tipo === 'ESCALAS' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 print:hidden">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'DIARIO', label: 'Relatório Diário' },
                    { id: 'SEMANAL', label: 'Relatório Semanal' },
                    { id: 'MENSAL', label: 'Relatório Mensal' },
                    { id: 'FUNCIONARIO', label: 'Por Funcionário' },
                    { id: 'SETOR', label: 'Por Setor' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSubModoEscala(m.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      subModoEscala === m.id
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={filtroFuncRelatorio}
                  onChange={(e) => setFiltroFuncRelatorio(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold"
                >
                  <option value="TODOS">Todos os Funcionários</option>
                  {funcionarios.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>

                <select
                  value={filtroSetorRelatorio}
                  onChange={(e) => setFiltroSetorRelatorio(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold"
                >
                  <option value="TODOS">Todos os Setores</option>
                  <option value="Pista">Pista</option>
                  <option value="Caixa">Caixa</option>
                  <option value="Conveniência">Conveniência</option>
                  <option value="Lubrificação">Lubrificação</option>
                  <option value="Gerência">Gerência</option>
                </select>
              </div>
            </div>

            <div className="text-xs font-bold text-slate-600 uppercase">
              Modalidade Selecionada: {subModoEscala} ({escalasFiltradas.length} registros)
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Funcionário</th>
                  <th className="py-2.5 px-3">Data / Dia</th>
                  <th className="py-2.5 px-3">Entrada</th>
                  <th className="py-2.5 px-3">Saída</th>
                  <th className="py-2.5 px-3">Intervalo</th>
                  <th className="py-2.5 px-3">Turno</th>
                  <th className="py-2.5 px-3">Setor / Função</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {escalasFiltradas.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-900">{e.funcionarioNome}</td>
                    <td className="py-2 px-3 font-mono">
                      {e.data} {e.diaSemana ? `(${e.diaSemana})` : ''}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold">{e.horarioInicio}</td>
                    <td className="py-2 px-3 font-mono font-semibold">{e.horarioFim}</td>
                    <td className="py-2 px-3">{e.intervalo || '1h'}</td>
                    <td className="py-2 px-3">{e.turno}</td>
                    <td className="py-2 px-3">
                      {e.setor || 'Pista'} • {e.funcao || 'Frentista'}
                    </td>
                    <td className="py-2 px-3 font-bold">{e.status}</td>
                    <td className="py-2 px-3 text-slate-500">{e.observacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Relatório de Cadastro de Bicos e Tanques */}
        {tipo === 'TANQUES' && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase text-slate-700">
              Tanques Cadastrados ({tanques.length})
            </h4>
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
                <tr>
                  <th className="py-2 px-3">Código</th>
                  <th className="py-2 px-3">Combustível</th>
                  <th className="py-2 px-3">Capacidade</th>
                  <th className="py-2 px-3">Estoque Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tanques.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 px-3 font-bold">{t.codigo}</td>
                    <td className="py-2 px-3">{t.produto}</td>
                    <td className="py-2 px-3 font-mono">
                      {t.capacidadeNominal.toLocaleString('pt-BR')} L
                    </td>
                    <td className="py-2 px-3 font-mono font-bold">
                      {t.volumeAtual.toLocaleString('pt-BR')} L
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4 className="text-xs font-bold uppercase text-slate-700 pt-2">
              Bicos Cadastrados ({bicos.length})
            </h4>
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
                <tr>
                  <th className="py-2 px-3">Bico / Bomba</th>
                  <th className="py-2 px-3">Combustível</th>
                  <th className="py-2 px-3">Tanque Vinculado</th>
                  <th className="py-2 px-3">Encerrante Atual</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bicos.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 px-3 font-bold">
                      Bico {String(b.numero).padStart(2, '0')} ({b.bomba} • Lado {b.lado})
                    </td>
                    <td className="py-2 px-3">{b.produto}</td>
                    <td className="py-2 px-3 font-mono">{b.tanqueCodigo || b.tanqueId}</td>
                    <td className="py-2 px-3 font-mono">
                      {(b.encerranteAtual || 0).toLocaleString('pt-BR')} L
                    </td>
                    <td className="py-2 px-3 font-bold">{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabela de Fechamentos */}
        {tipo === 'FECHAMENTOS' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Data / Turno</th>
                <th className="py-2.5 px-3">Operador / Caixa</th>
                <th className="py-2.5 px-3">Informado</th>
                <th className="py-2.5 px-3">Conferido</th>
                <th className="py-2.5 px-3">Diferença</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fechamentosFiltrados.map((f) => (
                <tr key={f.id}>
                  <td className="py-2 px-3">
                    {f.data} ({f.turno})
                  </td>
                  <td className="py-2 px-3">{f.funcionarioNome}</td>
                  <td className="py-2 px-3 font-mono">{formatarMoeda(f.totalInformado)}</td>
                  <td className="py-2 px-3 font-mono font-bold">{formatarMoeda(f.totalConferido)}</td>
                  <td className="py-2 px-3 font-mono font-bold">
                    <span className={f.diferenca < 0 ? 'text-red-600' : 'text-emerald-600'}>
                      {formatarMoeda(f.diferenca)}
                    </span>
                  </td>
                  <td className="py-2 px-3">{f.tipoDiferenca}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tabela de Aferições */}
        {tipo === 'AFERICOES' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Bico / Produto</th>
                <th className="py-2.5 px-3">Nominal</th>
                <th className="py-2.5 px-3">Aferido</th>
                <th className="py-2.5 px-3">Diferença</th>
                <th className="py-2.5 px-3">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {afericoesFiltradas.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-3">
                    {a.data} {a.hora}
                  </td>
                  <td className="py-2 px-3">
                    Bico {String(a.bicoNumero || a.bicoId).padStart(2, '0')} • {a.produto}
                  </td>
                  <td className="py-2 px-3 font-mono">{a.volumeNominal.toFixed(3)} L</td>
                  <td className="py-2 px-3 font-mono font-bold">{a.volumeAferido.toFixed(3)} L</td>
                  <td className="py-2 px-3 font-mono">{Math.round(a.diferenca * 1000)} ml</td>
                  <td className="py-2 px-3 font-bold">{a.resultado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tabela de Faltas e Ocorrências */}
        {tipo === 'FALTAS' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 px-3">Colaborador</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Valor</th>
                <th className="py-2.5 px-3">Motivo</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ocorrencias.map((o) => (
                <tr key={o.id}>
                  <td className="py-2 px-3 font-mono">{o.data}</td>
                  <td className="py-2 px-3 font-medium">{o.funcionarioNome}</td>
                  <td className="py-2 px-3">{o.tipo}</td>
                  <td className="py-2 px-3 font-mono font-bold">{formatarMoeda(o.valor)}</td>
                  <td className="py-2 px-3">{o.motivo}</td>
                  <td className="py-2 px-3 font-bold">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tabela de Densidades */}
        {tipo === 'DENSIDADES' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Combustível</th>
                <th className="py-2.5 px-3">Densidade (g/cm³)</th>
                <th className="py-2.5 px-3">Temperatura</th>
                <th className="py-2.5 px-3">Status ANP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {densidades.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 px-3 font-mono">
                    {d.data} {d.hora}
                  </td>
                  <td className="py-2 px-3 font-medium">{d.produto}</td>
                  <td className="py-2 px-3 font-mono">{d.densidadeObservada}</td>
                  <td className="py-2 px-3 font-mono">{d.temperaturaC} °C</td>
                  <td className="py-2 px-3 font-bold">{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tabela de Conformidade */}
        {tipo === 'CONFORMIDADE' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Item</th>
                <th className="py-2.5 px-3">Responsável</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {conformidades.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 px-3 font-mono">{c.dataVerificacao}</td>
                  <td className="py-2 px-3">{c.categoria}</td>
                  <td className="py-2 px-3 font-medium">{c.item}</td>
                  <td className="py-2 px-3">{c.responsavel}</td>
                  <td className="py-2 px-3 font-bold">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tabela de Funcionários */}
        {tipo === 'FUNCIONARIOS' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Nome</th>
                <th className="py-2.5 px-3">Matrícula</th>
                <th className="py-2.5 px-3">Cargo / Função</th>
                <th className="py-2.5 px-3">Turno Preferencial</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {funcionarios.map((f) => (
                <tr key={f.id}>
                  <td className="py-2 px-3 font-bold">{f.nome}</td>
                  <td className="py-2 px-3 font-mono">{f.matricula}</td>
                  <td className="py-2 px-3">
                    {f.cargo} • {f.funcao}
                  </td>
                  <td className="py-2 px-3">{f.turnoPreferencial}</td>
                  <td className="py-2 px-3 font-bold">{f.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tabela de Auditoria */}
        {tipo === 'AUDITORIA' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Usuário</th>
                <th className="py-2.5 px-3">Módulo</th>
                <th className="py-2.5 px-3">Entidade</th>
                <th className="py-2.5 px-3">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditoria.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 px-3 font-mono text-[11px]">
                    {new Date(l.timestamp).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 px-3 font-medium">{l.usuarioNome}</td>
                  <td className="py-2 px-3">{l.modulo}</td>
                  <td className="py-2 px-3">{l.entidade}</td>
                  <td className="py-2 px-3 font-bold text-blue-700">{l.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
