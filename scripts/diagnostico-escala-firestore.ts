/**
 * SCRIPT DE DIAGNÓSTICO: Leitura de Documentos de Escala do Firestore
 * 
 * Objetivo:
 * - Conectar ao Firestore e inspecionar documentos na subcoleção 'escalas'.
 * - Extrair e registrar no console os valores brutos de 'turnoId' (ou 'turno'), 'horario' ('horarioInicio' / 'horarioFim').
 * - Comparar os valores brutos com os tipos definidos no projeto (Escala, TURNOS_OFICIAIS_POSTO, TURNOS_PADRAO_POSTO).
 * - Detectar discrepâncias de nomenclatura, campos legados/faltantes, divergências de horário e inconsistências de tipagem.
 * 
 * Execução via terminal:
 *   npx tsx scripts/diagnostico-escala-firestore.ts [postoId] [limite]
 *   Exemplo: npx tsx scripts/diagnostico-escala-firestore.ts posto-matriz-01 20
 */

import { db } from '../src/config/firebase';
import { collection, getDocs, doc, getDoc, query, limit } from 'firebase/firestore';
import { Escala, TURNOS_OFICIAIS_POSTO, EscalaStatus } from '../src/types';
import { TURNOS_PADRAO_POSTO } from '../src/features/planner/importadorEscalaImagemService';

export interface DiagnosticoResultadoDoc {
  docId: string;
  caminhoCompleto: string;
  valoresBrutos: {
    turnoBruto: unknown;
    turnoIdBruto: unknown;
    horarioBruto: unknown;
    horarioInicioBruto: unknown;
    horarioFimBruto: unknown;
    statusBruto: unknown;
    funcionarioIdBruto: unknown;
    funcionarioNomeBruto: unknown;
    dataBruta: unknown;
  };
  analiseConformidade: {
    possuiCampoTurnoIdExplicito: boolean;
    campoTurnoCorrespondeATipoOficial: boolean;
    turnoOficialIdentificado: string | null;
    horarioInicioConformeOficial: boolean;
    horarioFimConformeOficial: boolean;
    statusConformeEscalaStatus: boolean;
    discrepanciasDetectadas: string[];
  };
}

export async function executarDiagnosticoEscalaFirestore(
  postoId: string = 'posto-matriz-01',
  docIdEspecifico?: string,
  limiteRegistros: number = 20
): Promise<{
  postoId: string;
  totalAnalisados: number;
  totalComDiscrepancia: number;
  resultados: DiagnosticoResultadoDoc[];
  resumoDiscrepancias: Record<string, number>;
}> {
  console.log('='.repeat(80));
  console.log('🔍 SCRIPT DE DIAGNÓSTICO DE ESCALAS NO FIRESTORE');
  console.log(`Banco: ai-studio-fd51eac2-5d3c-4e14-83d7-2b9d11f95f7a`);
  console.log(`Posto Alvo: ${postoId}`);
  if (docIdEspecifico) {
    console.log(`Modo: Leitura de documento específico ID = '${docIdEspecifico}'`);
  } else {
    console.log(`Modo: Varredura de amostra (limite: ${limiteRegistros} registros)`);
  }
  console.log('='.repeat(80));

  const turnosOficiaisMap = new Map<string, { id: string; sigla: string; inicio: string; fim: string }>();
  TURNOS_OFICIAIS_POSTO.forEach((t) => {
    turnosOficiaisMap.set(t.id, { id: t.id, sigla: t.sigla, inicio: t.inicio, fim: t.fim });
  });
  TURNOS_PADRAO_POSTO.forEach((t) => {
    if (!turnosOficiaisMap.has(t.id)) {
      turnosOficiaisMap.set(t.id, { id: t.id, sigla: t.sigla, inicio: t.inicio, fim: t.fim });
    }
  });

  const statusValidos: EscalaStatus[] = [
    'TRABALHO',
    'FOLGA',
    'PLANTAO',
    'FERIAS',
    'AFASTADO',
    'AUSENTE',
    'SUBSTITUIDO',
  ];

  const resultados: DiagnosticoResultadoDoc[] = [];
  const resumoDiscrepancias: Record<string, number> = {};

  const registrarDiscrepancia = (disc: string) => {
    resumoDiscrepancias[disc] = (resumoDiscrepancias[disc] || 0) + 1;
  };

  try {
    let docsParaProcessar: Array<{ id: string; path: string; data: Record<string, unknown> }> = [];

    if (docIdEspecifico) {
      const dRef = doc(db, 'postos', postoId, 'escalas', docIdEspecifico);
      const snap = await getDoc(dRef);
      if (!snap.exists()) {
        console.error(`❌ Documento não encontrado: postos/${postoId}/escalas/${docIdEspecifico}`);
        return {
          postoId,
          totalAnalisados: 0,
          totalComDiscrepancia: 0,
          resultados: [],
          resumoDiscrepancias: {},
        };
      }
      docsParaProcessar.push({ id: snap.id, path: snap.ref.path, data: snap.data() });
    } else {
      const colRef = collection(db, 'postos', postoId, 'escalas');
      const q = query(colRef, limit(limiteRegistros));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        docsParaProcessar.push({ id: d.id, path: d.ref.path, data: d.data() });
      });
    }

    console.log(`\n📄 Total de documentos recuperados do Firestore: ${docsParaProcessar.length}\n`);

    for (const item of docsParaProcessar) {
      const raw = item.data;
      const discrepancias: string[] = [];

      // Valores brutos do Firestore
      const turnoBruto = raw['turno'];
      const turnoIdBruto = raw['turnoId'];
      const horarioBruto = raw['horario'];
      const horarioInicioBruto = raw['horarioInicio'];
      const horarioFimBruto = raw['horarioFim'];
      const statusBruto = raw['status'];
      const funcionarioIdBruto = raw['funcionarioId'];
      const funcionarioNomeBruto = raw['funcionarioNome'];
      const dataBruta = raw['data'];

      // 1. Verificação do campo 'turnoId' vs 'turno'
      // Na interface Escala, o campo canônico é 'turno: string', enquanto serviços de importação usam 'shiftId' ou 'turnoId'
      const possuiTurnoId = turnoIdBruto !== undefined;
      const identificadorTurnoEfetivo = typeof turnoIdBruto === 'string'
        ? turnoIdBruto
        : typeof turnoBruto === 'string'
        ? turnoBruto
        : null;

      if (!turnoBruto && !turnoIdBruto) {
        discrepancias.push('AUSÊNCIA_DE_TURNO: Nem `turno` nem `turnoId` constam gravados no documento.');
        registrarDiscrepancia('AUSÊNCIA_DE_TURNO');
      } else if (turnoIdBruto !== undefined && turnoBruto !== undefined && turnoIdBruto !== turnoBruto) {
        discrepancias.push(`DIVERGÊNCIA_TURNO_E_TURNOID: campo 'turnoId'="${turnoIdBruto}" difere de 'turno'="${turnoBruto}".`);
        registrarDiscrepancia('DIVERGÊNCIA_TURNO_E_TURNOID');
      }

      // 2. Verificação de Correspondência com Turnos Oficiais do Projeto
      let oficialCorrespondente: { id: string; sigla: string; inicio: string; fim: string } | null = null;
      if (identificadorTurnoEfetivo) {
        if (turnosOficiaisMap.has(identificadorTurnoEfetivo)) {
          oficialCorrespondente = turnosOficiaisMap.get(identificadorTurnoEfetivo)!;
        } else {
          // Busca por match aproximado (ex: Folga, Férias)
          for (const [idOficial, conf] of turnosOficiaisMap.entries()) {
            if (
              identificadorTurnoEfetivo.toLowerCase() === idOficial.toLowerCase() ||
              identificadorTurnoEfetivo.toLowerCase() === conf.sigla.toLowerCase()
            ) {
              oficialCorrespondente = conf;
              break;
            }
          }
          if (!oficialCorrespondente) {
            discrepancias.push(`TURNO_FORA_DO_CATALOGO: O valor bruto "${identificadorTurnoEfetivo}" não consta nos tipos oficiais (TURNOS_OFICIAIS_POSTO).`);
            registrarDiscrepancia('TURNO_FORA_DO_CATALOGO');
          }
        }
      }

      // 3. Verificação do campo 'horario' vs 'horarioInicio'/'horarioFim'
      // O modelo canônico do projeto requer 'horarioInicio' e 'horarioFim' (HH:MM). Se foi gravado 'horario' composto, deve ser detectado.
      if (horarioBruto !== undefined && (horarioInicioBruto === undefined || horarioFimBruto === undefined)) {
        discrepancias.push(`CAMPO_HORARIO_LEGADO: Documento gravou campo consolidado 'horario'="${horarioBruto}" sem 'horarioInicio'/'horarioFim' normalizados.`);
        registrarDiscrepancia('CAMPO_HORARIO_LEGADO');
      }

      const inicioStr = typeof horarioInicioBruto === 'string' ? horarioInicioBruto : '';
      const fimStr = typeof horarioFimBruto === 'string' ? horarioFimBruto : '';

      let inicioConforme = true;
      let fimConforme = true;

      if (oficialCorrespondente) {
        const isFolgaOuFerias = statusBruto === 'FOLGA' || statusBruto === 'FERIAS' || oficialCorrespondente.id === 'Folga' || oficialCorrespondente.id === 'Férias';
        if (isFolgaOuFerias) {
          if (inicioStr && inicioStr !== '00:00') {
            discrepancias.push(`HORARIO_INCONSISTENTE_FOLGA: Horário de início em folga/férias é "${inicioStr}" (esperado: "00:00").`);
            registrarDiscrepancia('HORARIO_INCONSISTENTE_FOLGA');
            inicioConforme = false;
          }
          if (fimStr && fimStr !== '00:00') {
            discrepancias.push(`HORARIO_INCONSISTENTE_FOLGA: Horário de fim em folga/férias é "${fimStr}" (esperado: "00:00").`);
            registrarDiscrepancia('HORARIO_INCONSISTENTE_FOLGA');
            fimConforme = false;
          }
        } else {
          // Turno de trabalho com horário tabelado
          if (inicioStr && oficialCorrespondente.inicio && inicioStr !== oficialCorrespondente.inicio) {
            discrepancias.push(`DIVERGENCIA_HORARIO_INICIO: Valor bruto de início "${inicioStr}" difere do padrão do turno "${oficialCorrespondente.inicio}".`);
            registrarDiscrepancia('DIVERGENCIA_HORARIO_INICIO');
            inicioConforme = false;
          }
          if (fimStr && oficialCorrespondente.fim && fimStr !== oficialCorrespondente.fim) {
            discrepancias.push(`DIVERGENCIA_HORARIO_FIM: Valor bruto de saída "${fimStr}" difere do padrão do turno "${oficialCorrespondente.fim}".`);
            registrarDiscrepancia('DIVERGENCIA_HORARIO_FIM');
            fimConforme = false;
          }
        }
      }

      // 4. Verificação de Status
      const statusConforme = typeof statusBruto === 'string' && statusValidos.includes(statusBruto as EscalaStatus);
      if (!statusConforme) {
        discrepancias.push(`STATUS_INVALIDO: O valor bruto "${statusBruto}" não pertence à união de tipos EscalaStatus.`);
        registrarDiscrepancia('STATUS_INVALIDO');
      }

      // Registro detalhado no console
      console.log(`--------------------------------------------------------------------------------`);
      console.log(`📌 Documento ID: [${item.id}]`);
      console.log(`   Caminho: ${item.path}`);
      console.log(`   Colaborador: "${funcionarioNomeBruto}" (ID: ${funcionarioIdBruto}) | Data: "${dataBruta}"`);
      console.log(`   [VALORES BRUTOS FIRESTORE]:`);
      console.log(`     • turno:          ${JSON.stringify(turnoBruto)}`);
      console.log(`     • turnoId:        ${JSON.stringify(turnoIdBruto)}`);
      console.log(`     • horario:        ${JSON.stringify(horarioBruto)}`);
      console.log(`     • horarioInicio:  ${JSON.stringify(horarioInicioBruto)}`);
      console.log(`     • horarioFim:     ${JSON.stringify(horarioFimBruto)}`);
      console.log(`     • status:         ${JSON.stringify(statusBruto)}`);
      console.log(`   [COMPARATIVO COM TIPOS DO PROJETO]:`);
      console.log(`     • Turno Oficial Reconhecido: ${oficialCorrespondente ? `"${oficialCorrespondente.id}" (Sigla: ${oficialCorrespondente.sigla})` : 'NÃO RECONHECIDO'}`);
      console.log(`     • Horário Esperado no Tipo:  ${oficialCorrespondente ? `${oficialCorrespondente.inicio} às ${oficialCorrespondente.fim}` : 'N/A'}`);
      console.log(`     • Status Válido no Tipo:     ${statusConforme ? 'SIM (EscalaStatus)' : 'NÃO (Discrepante)'}`);

      if (discrepancias.length === 0) {
        console.log(`   ✅ CONFORMIDADE: 100% aderente aos tipos e convenções.`);
      } else {
        console.log(`   ⚠️ DISCREPÂNCIAS ENCONTRADAS (${discrepancias.length}):`);
        discrepancias.forEach((d) => console.log(`      - ${d}`));
      }

      resultados.push({
        docId: item.id,
        caminhoCompleto: item.path,
        valoresBrutos: {
          turnoBruto,
          turnoIdBruto,
          horarioBruto,
          horarioInicioBruto,
          horarioFimBruto,
          statusBruto,
          funcionarioIdBruto,
          funcionarioNomeBruto,
          dataBruta,
        },
        analiseConformidade: {
          possuiCampoTurnoIdExplicito: possuiTurnoId,
          campoTurnoCorrespondeATipoOficial: Boolean(oficialCorrespondente),
          turnoOficialIdentificado: oficialCorrespondente?.id || null,
          horarioInicioConformeOficial: inicioConforme,
          horarioFimConformeOficial: fimConforme,
          statusConformeEscalaStatus: statusConforme,
          discrepanciasDetectadas: discrepancias,
        },
      });
    }

    const totalComDiscrepancia = resultados.filter((r) => r.analiseConformidade.discrepanciasDetectadas.length > 0).length;

    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMO DO DIAGNÓSTICO:');
    console.log(`Total Analisado: ${resultados.length}`);
    console.log(`Total Totalmente Conforme: ${resultados.length - totalComDiscrepancia}`);
    console.log(`Total com Alertas/Discrepâncias: ${totalComDiscrepancia}`);
    console.log('Frequência de Discrepâncias por Categoria:');
    if (Object.keys(resumoDiscrepancias).length === 0) {
      console.log('  (Nenhuma discrepância encontrada!)');
    } else {
      Object.entries(resumoDiscrepancias).forEach(([cat, qtd]) => {
        console.log(`  • ${cat}: ${qtd} ocorrência(s)`);
      });
    }
    console.log('='.repeat(80) + '\n');

    return {
      postoId,
      totalAnalisados: resultados.length,
      totalComDiscrepancia,
      resultados,
      resumoDiscrepancias,
    };
  } catch (err: any) {
    console.error('❌ Falha na execução do diagnóstico Firestore:', err);
    throw err;
  }
}

// Execução direta via CLI se chamado via 'npx tsx scripts/diagnostico-escala-firestore.ts'
if (process.argv[1]?.endsWith('diagnostico-escala-firestore.ts')) {
  const args = process.argv.slice(2);
  const postoArg = args[0] || 'posto-matriz-01';
  const limiteArg = parseInt(args[1] || '10', 10);
  const docIdArg = args.find((a) => a.startsWith('--doc='))?.split('=')[1];

  executarDiagnosticoEscalaFirestore(postoArg, docIdArg, limiteArg)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
