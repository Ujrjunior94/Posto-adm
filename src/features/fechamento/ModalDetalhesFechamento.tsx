import React, { useEffect } from 'react';
import { FechamentoCaixa } from '../../types';
import { formatarMoeda } from '../../utils/calculations';
import {
  X,
  Printer,
  Fuel,
  Banknote,
  QrCode,
  CreditCard,
  Building2,
  Receipt,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  ShieldCheck,
} from 'lucide-react';

interface ModalDetalhesFechamentoProps {
  isOpen: boolean;
  fechamento: FechamentoCaixa | null;
  autoPrint?: boolean;
  onClose: () => void;
  onAbrirOcorrencia?: (fechamento: FechamentoCaixa) => void;
}

export const ModalDetalhesFechamento: React.FC<ModalDetalhesFechamentoProps> = ({
  isOpen,
  fechamento,
  autoPrint = false,
  onClose,
  onAbrirOcorrencia,
}) => {
  if (!isOpen || !fechamento) return null;

  const handleImprimir = () => {
    window.print();
  };

  // Disparo automático da caixa de diálogo de impressão se solicitado
  useEffect(() => {
    if (isOpen && fechamento && autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, fechamento, autoPrint]);

  const rec = fechamento.recolhimento;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:static print:bg-white print:p-0 print:m-0 print:overflow-visible print:w-full print:block">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print:m-0 print:p-0 print:border-none print:shadow-none print:max-w-none print:max-h-none print:w-full print:overflow-visible print:rounded-none animate-in fade-in">
        {/* Cabeçalho do Modal (Oculto na Impressão) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold">Comprovante de Fechamento de Caixa</h3>
              <p className="text-xs text-slate-400">ID: {fechamento.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImprimir}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-xs"
            >
              <Printer className="w-4 h-4" />
              Imprimir Comprovante
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo do Comprovante (Imprimível) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-800 print:p-4 print:overflow-visible">
          {/* Cabeçalho do Documento */}
          <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                MEU POSTO 2.0 • GESTÃO OPERACIONAL
              </div>
              <h2 className="text-xl font-black text-slate-900 mt-0.5">
                Espelho de Fechamento de Caixa
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" /> {fechamento.data}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> {fechamento.turno}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" /> {fechamento.funcionarioNome}
                </span>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                  fechamento.tipoDiferenca === 'FALTA'
                    ? 'bg-red-100 text-red-800 border border-red-200'
                    : fechamento.tipoDiferenca === 'SOBRA'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {fechamento.tipoDiferenca === 'FALTA' && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                {fechamento.tipoDiferenca === 'SOBRA' && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                {fechamento.tipoDiferenca === 'SEM_DIFERENCA' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                {fechamento.tipoDiferenca === 'SEM_DIFERENCA' ? 'CAIXA BATIDO' : fechamento.tipoDiferenca}
              </span>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">
                Ponto: {fechamento.caixaId}
              </div>
            </div>
          </div>

          {/* 1. Tabela de Encerrantes dos Bicos */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-900 uppercase flex items-center gap-1.5">
              <Fuel className="w-4 h-4 text-emerald-600" />
              1. Apuração por Encerrante dos Bicos
            </h4>

            {fechamento.encerrantesBicos && fechamento.encerrantesBicos.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Bico</th>
                      <th className="py-2 px-3">Combustível</th>
                      <th className="py-2 px-3 text-right">Enc. Inicial</th>
                      <th className="py-2 px-3 text-right">Enc. Final</th>
                      <th className="py-2 px-3 text-right">Aferição</th>
                      <th className="py-2 px-3 text-right">Litros</th>
                      <th className="py-2 px-3 text-right">Preço</th>
                      <th className="py-2 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fechamento.encerrantesBicos.map((b) => (
                      <tr key={b.bicoId} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          Bico {b.numeroBico} ({b.lado})
                        </td>
                        <td className="py-2 px-3 text-slate-700">{b.produto}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {b.encerranteInicial.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {b.encerranteFinal.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-500">
                          {b.afericaoLitros ? `${b.afericaoLitros.toFixed(2)} L` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                          {b.litrosVendidos.toFixed(2)} L
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {formatarMoeda(b.precoLitro)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                          {formatarMoeda(b.valorTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold text-slate-900 border-t border-slate-200">
                    <tr>
                      <td colSpan={5} className="py-2 px-3 text-right uppercase text-[11px]">
                        Total Combustíveis nas Bombas:
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {(fechamento.totalLitrosBicos || 0).toFixed(2)} L
                      </td>
                      <td></td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-900">
                        {formatarMoeda(fechamento.totalVendasBicos || fechamento.totalConferido)}
                      </td>
                    </tr>
                    {fechamento.outrasVendasPista ? (
                      <tr>
                        <td colSpan={7} className="py-1.5 px-3 text-right text-[11px] text-slate-600 font-normal">
                          (+) Outras Vendas de Pista / Lubrificantes / Aditivos:
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-800">
                          {formatarMoeda(fechamento.outrasVendasPista)}
                        </td>
                      </tr>
                    ) : null}
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 italic">
                Fechamento registrado sem detalhamento individual de encerrantes.
              </div>
            )}
          </div>

          {/* 2. Valores Detalhados de Recolhimento */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-900 uppercase flex items-center gap-1.5">
              <Banknote className="w-4 h-4 text-emerald-600" />
              2. Valores de Recolhimento Informados
            </h4>

            {rec ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                {/* Pix */}
                <div className="p-2.5 bg-white rounded-lg border border-purple-100">
                  <span className="text-[11px] font-bold text-purple-900 uppercase flex items-center gap-1 mb-1">
                    <QrCode className="w-3.5 h-3.5 text-purple-600" /> Pix
                  </span>
                  <div className="font-mono font-bold text-sm text-slate-900">{formatarMoeda(rec.pix)}</div>
                </div>

                {/* Cartão */}
                <div className="p-2.5 bg-white rounded-lg border border-blue-100">
                  <span className="text-[11px] font-bold text-blue-900 uppercase flex items-center gap-1 mb-1">
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Cartão
                  </span>
                  <div className="font-mono font-bold text-sm text-slate-900">{formatarMoeda(rec.cartao)}</div>
                </div>

                {/* Nota */}
                <div className="p-2.5 bg-white rounded-lg border border-emerald-100">
                  <span className="text-[11px] font-bold text-emerald-900 uppercase flex items-center gap-1 mb-1">
                    <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Nota (Espécie)
                  </span>
                  <div className="font-mono font-bold text-sm text-slate-900">{formatarMoeda(rec.nota)}</div>
                </div>

                {/* Depósito */}
                <div className="p-2.5 bg-white rounded-lg border border-indigo-100">
                  <span className="text-[11px] font-bold text-indigo-900 uppercase flex items-center gap-1 mb-1">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" /> Depósito
                  </span>
                  <div className="font-mono font-bold text-sm text-slate-900">{formatarMoeda(rec.deposito)}</div>
                </div>

                {/* Pix CNPJ */}
                <div className="p-2.5 bg-white rounded-lg border border-violet-100">
                  <span className="text-[11px] font-bold text-violet-900 uppercase flex items-center gap-1 mb-1">
                    <QrCode className="w-3.5 h-3.5 text-violet-600" /> Pix CNPJ
                  </span>
                  <div className="font-mono font-bold text-sm text-slate-900">{formatarMoeda(rec.pixCnpj)}</div>
                </div>

                {/* Despesa */}
                <div className="p-2.5 bg-white rounded-lg border border-amber-100 col-span-1 sm:col-span-2">
                  <span className="text-[11px] font-bold text-amber-900 uppercase flex items-center gap-1 mb-1">
                    <Receipt className="w-3.5 h-3.5 text-amber-600" /> Despesa de Caixa
                  </span>
                  <div className="font-mono font-bold text-sm text-amber-900">{formatarMoeda(rec.despesa)}</div>
                  {rec.despesaDescricao && (
                    <div className="text-[10px] text-slate-500 italic mt-0.5">{rec.despesaDescricao}</div>
                  )}
                </div>

                {/* Outros */}
                <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-700 uppercase flex items-center gap-1 mb-1">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400" /> Outros
                  </span>
                  <div className="font-mono font-bold text-sm text-slate-900">{formatarMoeda(rec.outros)}</div>
                  {rec.outrosDescricao && (
                    <div className="text-[10px] text-slate-500 italic mt-0.5">{rec.outrosDescricao}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg text-xs font-mono font-bold text-slate-800">
                Total Informado no Recolhimento: {formatarMoeda(fechamento.totalInformado)}
              </div>
            )}
          </div>

          {/* 3. Balanço Comparativo */}
          <div className="border-t-2 border-slate-200 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Total Esperado (Bombas)</span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                {formatarMoeda(fechamento.totalConferido)}
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Total Recolhido</span>
              <div className="text-lg font-bold font-mono text-blue-800 mt-1">
                {formatarMoeda(fechamento.totalInformado)}
              </div>
            </div>

            <div
              className={`p-3.5 rounded-xl border ${
                fechamento.diferenca < 0
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : fechamento.diferenca > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <span className="text-[10px] font-bold uppercase">Diferença do Caixa</span>
              <div className="text-lg font-bold font-mono mt-1">
                {formatarMoeda(fechamento.diferenca)}
              </div>
              <span className="text-[10px] font-semibold">
                {fechamento.tipoDiferenca === 'SEM_DIFERENCA'
                  ? 'Caixa Batido'
                  : fechamento.tipoDiferenca === 'FALTA'
                  ? 'Falta Apurada'
                  : 'Sobra Apurada'}
              </span>
            </div>
          </div>

          {/* Observações */}
          {fechamento.observacao && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="font-bold text-slate-700 uppercase text-[10px] mb-1">Observações do Fechamento:</div>
              <p className="text-slate-600 italic">{fechamento.observacao}</p>
            </div>
          )}

          {/* Assinaturas / Autenticação (Impresso) */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-xs text-slate-500 print:break-inside-avoid print:pt-6">
            <div>
              <div className="border-b border-slate-400 w-48 mx-auto mb-2 print:border-black"></div>
              <div className="font-bold text-slate-800 print:text-black">{fechamento.funcionarioNome}</div>
              <div className="text-[10px]">Operador / Frentista Responsável</div>
            </div>
            <div>
              <div className="border-b border-slate-400 w-48 mx-auto mb-2 print:border-black"></div>
              <div className="font-bold text-slate-800 print:text-black">{fechamento.conferidoPor}</div>
              <div className="text-[10px]">Conferente / Supervisor Operacional</div>
            </div>
          </div>

          {/* Rodapé de Autenticação Impresso */}
          <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-1 print:flex print:text-slate-600 print:border-slate-300 print:pt-2">
            <span>Comprovante emitido via Sistema Meu Posto 2.0 • Registro: {fechamento.id}</span>
            <span>Emitido em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* Rodapé das Ações (Oculto na Impressão) */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between print:hidden">
          <div>
            {fechamento.tipoDiferenca === 'FALTA' && onAbrirOcorrencia && (
              <button
                type="button"
                onClick={() => onAbrirOcorrencia(fechamento)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-xs transition"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Registrar / Ratear Ocorrência de Falta
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleImprimir}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition shadow-2xs"
            >
              <Printer className="w-4 h-4" />
              Imprimir Comprovante
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
