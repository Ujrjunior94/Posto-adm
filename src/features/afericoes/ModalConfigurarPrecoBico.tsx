import React, { useState, useEffect } from 'react';
import { Bico } from '../../types';
import { calcularPrecoEfetivoBico, formatarPrecoLitro, PRECOS_PADRAO_COMBUSTIVEL } from '../../utils/pricing';
import { DollarSign, Tag, Percent, ArrowRight, CheckCircle2, AlertTriangle, X, Sparkles } from 'lucide-react';

interface ModalConfigurarPrecoBicoProps {
  isOpen: boolean;
  bico: Bico | null;
  onClose: () => void;
  onSalvar: (bicoAtualizado: Bico) => Promise<void>;
}

export const ModalConfigurarPrecoBico: React.FC<ModalConfigurarPrecoBicoProps> = ({
  isOpen,
  bico,
  onClose,
  onSalvar,
}) => {
  const [precoBase, setPrecoBase] = useState<number>(5.89);
  const [temDesconto, setTemDesconto] = useState<boolean>(false);
  const [tipoDesconto, setTipoDesconto] = useState<'VALOR' | 'PERCENTUAL'>('VALOR');
  const [valorDesconto, setValorDesconto] = useState<number>(0.1);
  const [motivoDesconto, setMotivoDesconto] = useState<string>('Promoção Pista Rápida');
  const [salvando, setSalvando] = useState<boolean>(false);

  useEffect(() => {
    if (bico) {
      const precoPadrao = PRECOS_PADRAO_COMBUSTIVEL[bico.produto] || 5.89;
      setPrecoBase(bico.precoBase || bico.precoLitro || precoPadrao);
      setTemDesconto(!!bico.temDesconto);
      setTipoDesconto(bico.tipoDesconto || 'VALOR');
      setValorDesconto(typeof bico.valorDesconto === 'number' ? bico.valorDesconto : 0.1);
      setMotivoDesconto(bico.motivoDesconto || 'Promoção Pista Rápida');
    }
  }, [bico]);

  if (!isOpen || !bico) return null;

  const resultado = calcularPrecoEfetivoBico({
    produto: bico.produto,
    precoBase,
    temDesconto,
    tipoDesconto,
    valorDesconto,
    motivoDesconto,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const bicoAtualizado: Bico = {
        ...bico,
        precoBase: resultado.precoBase,
        precoLitro: resultado.precoFinal,
        temDesconto,
        tipoDesconto: temDesconto ? tipoDesconto : undefined,
        valorDesconto: temDesconto ? valorDesconto : undefined,
        motivoDesconto: temDesconto ? motivoDesconto : undefined,
        atualizadoEm: new Date().toISOString(),
      };
      await onSalvar(bicoAtualizado);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar preço do bico:', err);
      alert('Erro ao salvar alteração de preço do bico.');
    } finally {
      setSalvando(false);
    }
  };

  const aplicarSugestaoDesconto = (tipo: 'VALOR' | 'PERCENTUAL', valor: number, motivo?: string) => {
    setTemDesconto(true);
    setTipoDesconto(tipo);
    setValorDesconto(valor);
    if (motivo) setMotivoDesconto(motivo);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Preço e Desconto — Bico {bico.numero}
              </h3>
              <p className="text-xs text-slate-500">
                {bico.produto} • {bico.bomba} (Lado {bico.lado})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Preço Base da Tabela */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Preço Base da Tabela (R$ / Litro)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">
                R$
              </span>
              <input
                type="number"
                step="0.001"
                min="0.01"
                required
                value={precoBase}
                onChange={(e) => setPrecoBase(parseFloat(e.target.value) || 0)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-base font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Preço padrão de venda sem promoção para este combustível.
            </p>
          </div>

          {/* Seção de Desconto Específico no Bico */}
          <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-xs text-emerald-950">
                  Desconto Promocional para este Bico
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={temDesconto}
                  onChange={(e) => setTemDesconto(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ml-2 text-xs font-semibold text-slate-700">
                  {temDesconto ? 'Ativo' : 'Desativado'}
                </span>
              </label>
            </div>

            {temDesconto ? (
              <div className="space-y-3 pt-2 border-t border-emerald-100 animate-in fade-in">
                {/* Tipo de Desconto */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Formato do Desconto
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTipoDesconto('VALOR')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                        tipoDesconto === 'VALOR'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      Valor Fixo (R$ / Litro)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoDesconto('PERCENTUAL')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                        tipoDesconto === 'PERCENTUAL'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Percent className="w-3.5 h-3.5" />
                      Percentual (%)
                    </button>
                  </div>
                </div>

                {/* Valor do Desconto */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {tipoDesconto === 'VALOR' ? 'Valor do Desconto por Litro' : 'Percentual de Desconto'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">
                      {tipoDesconto === 'VALOR' ? 'R$' : '%'}
                    </span>
                    <input
                      type="number"
                      step={tipoDesconto === 'VALOR' ? '0.01' : '0.1'}
                      min="0.01"
                      max={tipoDesconto === 'PERCENTUAL' ? '90' : precoBase - 0.01}
                      required={temDesconto}
                      value={valorDesconto}
                      onChange={(e) => setValorDesconto(parseFloat(e.target.value) || 0)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-emerald-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Chips de Atalhos de Desconto Rápido */}
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 block mb-1">
                    Atalhos Rápidos:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => aplicarSugestaoDesconto('VALOR', 0.05, 'Desconto Bico -R$ 0,05')}
                      className="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-semibold transition"
                    >
                      -R$ 0,05/L
                    </button>
                    <button
                      type="button"
                      onClick={() => aplicarSugestaoDesconto('VALOR', 0.1, 'Desconto Bico -R$ 0,10')}
                      className="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-semibold transition"
                    >
                      -R$ 0,10/L
                    </button>
                    <button
                      type="button"
                      onClick={() => aplicarSugestaoDesconto('VALOR', 0.15, 'Promoção Especial Bico -R$ 0,15')}
                      className="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-semibold transition"
                    >
                      -R$ 0,15/L
                    </button>
                    <button
                      type="button"
                      onClick={() => aplicarSugestaoDesconto('VALOR', 0.2, 'Super Desconto -R$ 0,20')}
                      className="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-semibold transition"
                    >
                      -R$ 0,20/L
                    </button>
                    <button
                      type="button"
                      onClick={() => aplicarSugestaoDesconto('PERCENTUAL', 2.5, 'Desconto Fidelidade 2.5%')}
                      className="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-semibold transition"
                    >
                      -2.5%
                    </button>
                    <button
                      type="button"
                      onClick={() => aplicarSugestaoDesconto('PERCENTUAL', 5.0, 'Desconto Frotista 5%')}
                      className="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-semibold transition"
                    >
                      -5.0%
                    </button>
                  </div>
                </div>

                {/* Motivo do Desconto */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Motivo / Nome da Promoção
                  </label>
                  <input
                    type="text"
                    value={motivoDesconto}
                    onChange={(e) => setMotivoDesconto(e.target.value)}
                    placeholder="Ex: Pista Rápida, Fidelidade App, Desconto Frotista"
                    className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs text-slate-800 placeholder-slate-400"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                O bico funcionará com o preço de tabela normal sem abatimento promocional.
              </p>
            )}
          </div>

          {/* Card Resumo do Preço Efetivo na Bomba */}
          <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 shadow-md">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Simulação do Preço Vigente na Bomba:</span>
              <span className="font-mono text-slate-300">Bico {bico.numero} ({bico.produto})</span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Preço Final ao Consumidor
                </div>
                <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                  {formatarPrecoLitro(resultado.precoFinal, 3)}
                  <span className="text-xs text-slate-300 font-normal ml-1">/ litro</span>
                </div>
              </div>

              {resultado.temDesconto ? (
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-xs font-bold">
                    <Sparkles className="w-3 h-3" />
                    -{formatarPrecoLitro(resultado.descontoReais, 3)} ({resultado.descontoPercentual}%)
                  </span>
                  <div className="text-[10px] text-slate-400 line-through mt-0.5 font-mono">
                    De {formatarPrecoLitro(resultado.precoBase, 3)}
                  </div>
                </div>
              ) : (
                <div className="text-right text-xs text-slate-400">
                  Preço de Tabela Padrão
                </div>
              )}
            </div>

            {resultado.temDesconto && resultado.motivoDesconto && (
              <div className="mt-3 pt-2 border-t border-slate-800 text-xs text-slate-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-400">Identificação:</span>
                <strong className="text-white font-medium">{resultado.motivoDesconto}</strong>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {salvando ? 'Salvando...' : 'Confirmar Preço do Bico'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
