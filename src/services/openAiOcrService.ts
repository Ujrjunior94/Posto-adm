import OpenAI from 'openai';
import {
  EscalaOcrRequestPayload,
  prepararImagemMultimodal,
  parseAndRepairJson,
  estruturarRespostaEscalaOcr,
} from './geminiOcrService';

/**
 * Constrói o prompt detalhado para o ChatGPT (GPT-4o Vision)
 * extrair funcionários, turnos oficiais, folgas e alocações do posto de combustíveis.
 */
function construirPromptParaChatGpt(payload: EscalaOcrRequestPayload, anoMesAtual: string): string {
  const listaFuncs = Array.isArray(payload.funcionariosCadastrados)
    ? payload.funcionariosCadastrados
    : [];

  return `Você é um motor especialista em OCR e estruturação de escalas de trabalho de postos de combustíveis para o Planner Oficial.
Analise a imagem da escala com máxima atenção e fidelidade visual.

EXTRAIA TODOS OS FUNCIONÁRIOS E RESPECTIVOS TURNOS / HORÁRIOS / FOLGAS.

FORMATOS POSSÍVEIS NA IMAGEM:
1. TABELA MENSAL OU QUINZENAL: Linhas = Colaboradores, Colunas = Dias do mês (01 a 31). Siglas comuns: T1, T2, T3, M, T, N, HOR, H, F, S, FOLGA, DSR, OFF, X, P, PLT, 12x36, FE, AT.
2. TABELA SEMANAL: Linhas = Colaboradores, Colunas = Dias da semana (SEG, TER, QUA, QUI, SEX, SAB, DOM).
3. LISTA / RELAÇÃO DE EQUIPE: Cada linha traz Nome do Colaborador, Turno ou Horário (ex: "06:00 às 14:00", "Turno 1", "14h às 22h", "Horista 08h-14h") e dia fixo de folga (ex: "Folga: Domingo").
4. BLOCOS AGRUPADOS POR TURNO: Ex: "1º TURNO (MANHÃ 06-14H): Carlos, Roberto", "2º TURNO (TARDE 14-22H): Juliana, Amanda", "HORISTA: Lucas". Crie um colaborador para cada nome com o turno do bloco correspondente.

CLASSIFICAÇÃO OFICIAL DE TURNOS DO POSTO:
- T1 / Manhã / 1º Turno / 06:00-14:00 -> turno="Turno 1 - Manhã (06h - 14h)", horarioInicio="06:00", horarioFim="14:00", codigoOriginal="T1"
- T2 / Tarde / 2º Turno / 14:00-22:00 -> turno="Turno 2 - Tarde (14h - 22h)", horarioInicio="14:00", horarioFim="22:00", codigoOriginal="T2"
- T3 / Noite / 3º Turno / 22:00-06:00 -> turno="Turno 3 - Noite (22h - 06h)", horarioInicio="22:00", horarioFim="06:00", codigoOriginal="T3"
- HOR / Horista / Intermediário / 08:00-14:00 -> turno="Turno Horista", horarioInicio="08:00", horarioFim="14:00", codigoOriginal="HOR"
- PLT / Plantão / 12x36 -> status="PLANTAO", turno="Plantão", horarioInicio="06:00", horarioFim="18:00", codigoOriginal="PLT"
- FOLGA / DSR / S / F / FOL / OFF / X -> status="FOLGA", turno="Folga", horarioInicio="00:00", horarioFim="00:00", codigoOriginal="S"
- Férias / FE / FER -> status="FERIAS", turno="Férias"
- Afastado / Atestado / AT -> status="AFASTADO", turno="Afastado"

FUNCIONÁRIOS CADASTRADOS NO SISTEMA (vincule 'funcionarioId' caso corresponda):
${JSON.stringify(
  listaFuncs.map((f: any) => ({
    id: f.id,
    nome: f.nome,
    cargo: f.cargo,
    setor: f.setor,
  }))
)}

RETORNE EXCLUSIVAMENTE UM OBJETO JSON VÁLIDO:
{
  "tituloEscala": "Título ou cabeçalho lido na imagem",
  "mesReferencia": "${anoMesAtual}",
  "tipoDocumentoIdentificado": "Tabela Mensal / Quadro de Horários / Relação de Turnos",
  "qualidadeImagem": "BOA",
  "copiaFielReconhecida": "Resumo fiel dos nomes, turnos e descansos identificados",
  "simbolosEAbreviacoes": ["T1 = Manhã (06:00-14:00)", "T2 = Tarde (14:00-22:00)", "HOR = Horista", "S/F = Folga"],
  "observacoesGerais": "Observações operacionais lidas",
  "colaboradoresEscala": [
    {
      "nomeOriginal": "Nome Completo Lido",
      "funcionarioId": "id se vinculado ou vazio",
      "cargo": "Frentista",
      "setor": "Pista",
      "turnoPadrao": "Turno 1 - Manhã (06h - 14h)",
      "horarioEntradaPadrao": "06:00",
      "horarioSaidaPadrao": "14:00",
      "folgaPadrao": "DOM",
      "dias": [
        {
          "dia": "01",
          "codigoOriginal": "T1",
          "status": "TRABALHO",
          "turno": "Turno 1 - Manhã (06h - 14h)",
          "horarioInicio": "06:00",
          "horarioFim": "14:00"
        }
      ]
    }
  ]
}`;
}

/**
 * Executa o reconhecimento da imagem de escala utilizando o ChatGPT (OpenAI GPT-4o / GPT-4o-mini Vision)
 */
export async function processarEscalaOcrComChatGpt(
  payload: EscalaOcrRequestPayload,
  apiKey: string
): Promise<any> {
  const { imageBase64, mimeType = 'image/jpeg', mesAnoReferencia } = payload;

  if (!apiKey) {
    throw new Error('Chave OPENAI_API_KEY não fornecida para o ChatGPT.');
  }

  const { cleanBase64, mimeType: normalizedMimeType } = prepararImagemMultimodal(imageBase64, mimeType);

  const anoMesAtual =
    mesAnoReferencia && /^\d{4}-\d{2}$/.test(mesAnoReferencia)
      ? mesAnoReferencia
      : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const prompt = construirPromptParaChatGpt(payload, anoMesAtual);

  const openai = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: false,
  });

  const modelosTentativa = ['gpt-4o', 'gpt-4o-mini'];
  let parsed: any = null;
  let ultimoErro: any = null;
  let modeloUsado = 'gpt-4o';

  for (const model of modelosTentativa) {
    try {
      modeloUsado = model;
      const completion = await openai.chat.completions.create({
        model,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'Você é um motor especialista em OCR e estruturação de escalas de trabalho de postos de combustíveis para o Planner Oficial. Responda exclusivamente com um objeto JSON estruturado.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${normalizedMimeType};base64,${cleanBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
      });

      const rawContent = completion.choices[0]?.message?.content || '';
      if (rawContent) {
        const candidateParsed = parseAndRepairJson(rawContent);
        if (candidateParsed && typeof candidateParsed === 'object') {
          const listaColabs =
            candidateParsed.colaboradoresEscala ||
            candidateParsed.colaboradores ||
            candidateParsed.funcionarios ||
            candidateParsed.linhas ||
            (Array.isArray(candidateParsed) ? candidateParsed : null);

          if (Array.isArray(listaColabs) || Array.isArray(candidateParsed.itensEscala)) {
            if (Array.isArray(listaColabs) && !candidateParsed.colaboradoresEscala) {
              candidateParsed.colaboradoresEscala = listaColabs;
            }
            parsed = candidateParsed;
            break;
          }
        }
      }
    } catch (err: any) {
      ultimoErro = err;
    }
  }

  if (!parsed) {
    throw (
      ultimoErro ||
      new Error('O ChatGPT não conseguiu extrair dados legíveis da imagem da escala.')
    );
  }

  const rotuloMotor = `ChatGPT (${modeloUsado === 'gpt-4o' ? 'OpenAI GPT-4o' : 'OpenAI GPT-4o-mini'})`;
  return estruturarRespostaEscalaOcr(parsed, payload, rotuloMotor);
}
