import React from 'react';
import { ParecerTecnicoGemini } from '../../services/chatGptCalculadoraAnpService';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Printer,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Award,
  HelpCircle,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';

interface ModalParecerGeminiProps {
  isOpen: boolean;
  onClose: () => void;
  parecer: ParecerTecnicoGemini | null;
  produto: string;
  padraoRegulatorio: 'ANP_AGOSTO_2026' | 'ANP_TRANSICAO';
}

export const ModalParecerGemini: React.FC<ModalParecerGeminiProps> = ({
  isOpen,
  onClose,
  parecer,
  produto,
  padraoRegulatorio,
}) => {
  const [copiado, setCopiado] = React.useState(false);

  if (!isOpen || !parecer) return null;

  const ehConforme = parecer.isConforme;
  const ehCritico = parecer.grauRisco === 'CRITICO_REPROVADO';
  const padraoRotulo =
    padraoRegulatorio === 'ANP_AGOSTO_2026'
      ? 'Padrão Oficial ANP de Agosto de 2026 (Lei nº 14.993/2024 — E32 e B15)'
      : 'Padrão ANP de Transição (E27 e B14)';

  const copiarTextoParecer = () => {
    const texto = `LAUDO TÉCNICO DE CONFORMIDADE ANP (EMITIDO VIA GOOGLE GEMINI)
Produto: ${produto}
Data/Hora: ${new Date(parecer.timestamp).toLocaleString('pt-BR')}
Norma de Referência: ${padraoRotulo}
Resultado: ${ehConforme ? 'CONFORME (Aprovado)' : 'NÃO CONFORME (Reprovado)'}

PARECER TÉCNICO:
${parecer.parecerDetalhado}

PARÂMETROS METROLÓGICOS:
${parecer.parametrosAvaliados
  .map(
    (p) => `• ${p.parametro}: ${p.valorApurado} (Limite: ${p.limiteRegulamentar}) — Status: ${p.status}`
  )
  .join('\n')}

AÇÕES OPERACIONAIS RECOMENDADAS:
${parecer.acoesOperacionaisRecomendadas.map((a, i) => `${i + 1}. ${a}`).join('\n')}

EMBASAMENTO LEGAL:
${parecer.embasamentoLegal.join('; ')}
`;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Cabeçalho Oficial do Parecer */}
        <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl text-white ${
                ehConforme ? 'bg-emerald-600' : 'bg-red-600 animate-pulse'
              }`}
            >
              {ehConforme ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">Parecer Técnico de Conformidade ANP</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/30 text-blue-200 border border-blue-400/40 text-[10px] font-bold">
                  <Sparkles className="w-3 h-3 text-blue-300" />
                  Google Gemini 3.8 Flash
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {produto} • {padraoRotulo}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Laudo com Scroll */}
        <div className="p-6 overflow-y-auto space-y-5 bg-slate-50/50 flex-1 text-xs">
          {/* Banner de Resultado e Grau de Risco */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
              ehConforme
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-red-50 border-red-300 text-red-950'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-black uppercase ${
                    ehConforme ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                  }`}
                >
                  {ehConforme ? 'APROVADO' : 'REPROVADO'}
                </span>
                <h4 className="font-bold text-sm text-slate-900">{parecer.tituloParecer}</h4>
              </div>
              <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                {parecer.resumoRegulatorio}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">Grau de Risco Fiscal</span>
              <span
                className={`font-black text-xs px-2 py-0.5 rounded ${
                  ehConforme
                    ? 'bg-emerald-100 text-emerald-800'
                    : ehCritico
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {parecer.grauRisco.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Alerta Específico de Fraude se Detectado */}
          {parecer.alertaFraudeAdulteracao && (
            <div className="p-3.5 bg-red-100/80 border border-red-300 rounded-xl text-red-950 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div>
                <strong className="text-red-900 font-bold">ALERTA METROLÓGICO CRÍTICO:</strong>{' '}
                {parecer.alertaFraudeAdulteracao}
              </div>
            </div>
          )}

          {/* Parecer Técnico Detalhado do Gemini */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
            <h5 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
              <FileText className="w-4 h-4 text-blue-600" />
              Diagnóstico Metrológico Fundamentado
            </h5>
            <p className="text-slate-700 leading-relaxed text-xs whitespace-pre-line">
              {parecer.parecerDetalhado}
            </p>
          </div>

          {/* Tabela de Parâmetros Analisados nos Padrões ANP de Agosto de 2026 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 font-bold text-slate-800 flex items-center justify-between">
              <span>Parâmetros Metrológicos Avaliados</span>
              <span className="text-[10px] font-normal text-slate-500">
                Padrões Oficiais Vigentes (Agosto/2026)
              </span>
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2 px-3">Parâmetro</th>
                  <th className="py-2 px-3">Valor Apurado</th>
                  <th className="py-2 px-3">Limite Regulamentar</th>
                  <th className="py-2 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {parecer.parametrosAvaliados.map((param, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      <div>{param.parametro}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{param.observacao}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{param.valorApurado}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{param.limiteRegulamentar}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          param.status === 'CONFORME'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {param.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ações Operacionais Recomendadas para o Posto */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h5 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
              <Award className="w-4 h-4 text-emerald-600" />
              Ações Operacionais Obrigatórias para o Posto
            </h5>
            <ul className="space-y-1.5 list-disc list-inside text-slate-700">
              {parecer.acoesOperacionaisRecomendadas.map((acao, i) => (
                <li key={i} className="leading-relaxed">
                  {acao}
                </li>
              ))}
            </ul>
          </div>

          {/* Embasamento Legal e Normativo */}
          <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-700">Embasamento Regulatório:</strong>{' '}
              {parecer.embasamentoLegal.join(' • ')}
            </div>
          </div>
        </div>

        {/* Rodapé com Ações de Cópia e Impressão */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500">
            Motor: <strong className="text-slate-700">{parecer.motorUtilizado}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copiarTextoParecer}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiado ? 'Copiado!' : 'Copiar Laudo'}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Laudo
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Alias para compatibilidade */
export const ModalParecerChatGPT = ModalParecerGemini;
