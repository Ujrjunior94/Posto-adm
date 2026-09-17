import React, { useState } from 'react';
import { Bico } from '../../types';
import { calcularPrecoEfetivoBico, formatarPrecoLitro, PRECOS_PADRAO_COMBUSTIVEL } from '../../utils/pricing';
import { DollarSign, Tag, Check, AlertCircle, X, Sparkles, Filter } from 'lucide-react';

interface ModalAlternarPrecosLoteProps {
  isOpen: boolean;
  bicos: Bico[];
  onClose: () => void;
  onSalvarLote: (bicosAtualizados: Bico[]) => Promise<void>;
}

export const ModalAlternarPrecosLote: React.FC<ModalAlternarPrecosLoteProps> = ({
  isOpen,
  bicos,
  onClose,
  onSalvarLote,
}) => {
  // Lista de combustíveis únicos nos bicos
  const produtosDisponiveis = Array.from(new Set(bicos.map((b) => b.produto)));
  const [produtoSelecionado, setProdutoSelecionado] = useState<string>(
    produtosDisponiveis[0] || 'Gasolina Comum'
  );

  const bicosFiltrados = bicos.filter((b) => b.produto === produtoSelecionado);

  const precoPadraoProduto =
    PRECOS_PADRAO_COMBUSTIVEL[produtoSelecionado] ||
    bicosFiltrados[0]?.precoBase ||
    bicosFiltrados[0]?.precoLitro ||
    5.89;

  const [novoPrecoBase, setNovoPrecoBase] = useState<number>(precoPadraoProduto);

  // Seleção de bicos específicos para desconto
  const [bicosComDesconto, setBicosComDesconto] = useState<Record<string, boolean>>({});
  const [tipoDescontoLote, setTipoDescontoLote] = useState<'VALOR' | 'PERCENTUAL'>('VALOR');
  const [valorDescontoLote, setValorDescontoLote] = useState<number>(0.1);
  const [motivoDescontoLote, setMotivoDescontoLote] = useState<string>('Promoção Pista');
  const [salvando, setSalvando] = useState<boolean>(false);

  // Inicializar seleção quando o produto mudar
  React.useEffect(() => {
    const padrao = PRECOS_PADRAO_COMBUSTIVEL[produtoSelecionado] || 5.89;
    setNovoPrecoBase(bicosFiltrados[0]?.precoBase || padrao);
    const inicial: Record<string, boolean> = {};
    bicosFiltrados.forEach((b) => {
      if (b.temDesconto) {
        inicial[b.id] = true;
      }
    });
    setBicosComDesconto(inicial);
  }, [produtoSelecionado]);

  if (!isOpen) return null;

  const toggleBicoDesconto = (id: string) => {
    setBicosComDesconto((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const selecionarTodosDesconto = (selecionar: boolean) => {
    const novo: Record<string, boolean> = {};
    bicosFiltrados.forEach((b) => {
      novo[b.id] = selecionar;
    });
    setBicosComDesconto(novo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const atualizados: Bico[] = bicosFiltrados.map((b) => {
        const querDesconto = !!bicosComDesconto[b.id];
        const res = calcularPrecoEfetivoBico({
          produto: b.produto,
          precoBase: novoPrecoBase,
          temDesconto: querDesconto,
          tipoDesconto: tipoDescontoLote,
          valorDesconto: valorDescontoLote,
          motivoDesconto: querDesconto ? motivoDescontoLote : undefined,
        });

        return {
          ...b,
          precoBase: res.precoBase,
          precoLitro: res.precoFinal,
          temDesconto: querDesconto,
          tipoDesconto: querDesconto ? tipoDescontoLote : undefined,
          valorDesconto: querDesconto ? valorDescontoLote : undefined,
          motivoDesconto: querDesconto ? motivoDescontoLote : undefined,
          atualizadoEm: new Date().toISOString(),
        };
      });

      await onSalvarLote(atualizados);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar preços em lote:', err);
      alert('Erro ao atualizar preços em lote.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Alternação de Preço em Lote & Desconto Seletivo
              </h3>
              <p className="text-xs text-slate-500">
                Ajuste o preço base do produto e selecione bicos específicos para desconto promocional.
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
          {/* Seletor de Produto / Combustível */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Combustível Alvo
              </label>
              <select
                value={produtoSelecionado}
                onChange={(e) => setProdutoSelecionado(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              >
                {produtosDisponiveis.map((p) => (
                  <option key={p} value={p}>
                    {p} ({bicos.filter((b) => b.produto === p).length} bicos)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Novo Preço Base da Tabela (R$ / Litro)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                  R$
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0.01"
                  required
                  value={novoPrecoBase}
                  onChange={(e) => setNovoPrecoBase(parseFloat(e.target.value) || 0)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Configuração do Desconto Seletivo */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-amber-700" />
              <span className="font-bold text-xs text-amber-950">
                Parâmetros do Desconto para os Bicos Selecionados
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tipo de Desconto
                </label>
                <select
                  value={tipoDescontoLote}
                  onChange={(e) => setTipoDescontoLote(e.target.value as 'VALOR' | 'PERCENTUAL')}
                  className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-slate-800"
                >
                  <option value="VALOR">R$ / Litro (Fixo)</option>
                  <option value="PERCENTUAL">% Percentual</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {tipoDescontoLote === 'VALOR' ? 'Valor (R$/L)' : 'Percentual (%)'}
                </label>
                <input
                  type="number"
                  step={tipoDescontoLote === 'VALOR' ? '0.01' : '0.1'}
                  min="0.01"
                  value={valorDescontoLote}
                  onChange={(e) => setValorDescontoLote(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Motivo da Promoção
                </label>
                <input
                  type="text"
                  value={motivoDescontoLote}
                  onChange={(e) => setMotivoDescontoLote(e.target.value)}
                  placeholder="Ex: Pista Rápida"
                  className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Seleção de Bicos Específicos com Tabela de Pré-visualização */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800">
                Selecione os Bicos Específicos que receberão o desconto ({bicosFiltrados.length} bicos)
              </span>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => selecionarTodosDesconto(true)}
                  className="text-blue-600 hover:text-blue-800 font-semibold"
                >
                  Marcar Todos
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => selecionarTodosDesconto(false)}
                  className="text-slate-500 hover:text-slate-700 font-semibold"
                >
                  Desmarcar Todos
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="px-3 py-2.5 w-10 text-center">Desconto?</th>
                    <th className="px-3 py-2.5">Bico / Bomba</th>
                    <th className="px-3 py-2.5">Preço Atual</th>
                    <th className="px-3 py-2.5">Novo Preço Base</th>
                    <th className="px-3 py-2.5">Desconto</th>
                    <th className="px-3 py-2.5 text-right">Novo Preço Efetivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bicosFiltrados.map((b) => {
                    const teraDesconto = !!bicosComDesconto[b.id];
                    const sim = calcularPrecoEfetivoBico({
                      produto: b.produto,
                      precoBase: novoPrecoBase,
                      temDesconto: teraDesconto,
                      tipoDesconto: tipoDescontoLote,
                      valorDesconto: valorDescontoLote,
                    });

                    return (
                      <tr
                        key={b.id}
                        className={`transition cursor-pointer ${
                          teraDesconto ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50'
                        }`}
                        onClick={() => toggleBicoDesconto(b.id)}
                      >
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={teraDesconto}
                            onChange={() => toggleBicoDesconto(b.id)}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-bold text-slate-800">Bico {b.numero}</span>{' '}
                          <span className="text-[10px] text-slate-400">
                            ({b.bomba} • Lado {b.lado})
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-500">
                          {formatarPrecoLitro(b.precoLitro || b.precoBase || novoPrecoBase, 3)}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-medium text-slate-700">
                          {formatarPrecoLitro(novoPrecoBase, 3)}
                        </td>
                        <td className="px-3 py-2.5">
                          {teraDesconto ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded">
                              -{formatarPrecoLitro(sim.descontoReais, 3)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          <span
                            className={
                              teraDesconto ? 'text-emerald-700 font-extrabold' : 'text-slate-900'
                            }
                          >
                            {formatarPrecoLitro(sim.precoFinal, 3)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rodapé e Botões */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              {Object.values(bicosComDesconto).filter(Boolean).length} de {bicosFiltrados.length}{' '}
              bicos configurados com desconto.
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={salvando}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {salvando ? 'Aplicando...' : 'Aplicar Preços & Descontos'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
