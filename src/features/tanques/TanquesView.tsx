import React, { useState, useMemo } from 'react';
import { Tanque, PontoCalibracao } from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import { calcularVolumePorRegua } from '../../utils/calculations';
import {
  Database,
  Plus,
  Ruler,
  Calculator,
  Edit2,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const repoTanque = new PostoSubcollectionRepository<Tanque>('tanques');

interface TanquesProps {
  tanques: Tanque[];
  onReload: () => void;
}

export const TanquesView: React.FC<TanquesProps> = ({ tanques, onReload }) => {
  const { postoId, userProfile } = useAuth();

  // Calculadora de Régua: modo simples por padrão + botão para detalhar informações
  const [selectedTanqueId, setSelectedTanqueId] = useState<string>(tanques[0]?.id || '');
  const [leituraCm, setLeituraCm] = useState<number>(125);
  const [detalharCalculadora, setDetalharCalculadora] = useState<boolean>(false);

  // Modal de Cadastro / Edição de Tanque
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tanqueEditando, setTanqueEditando] = useState<Tanque | null>(null);
  const [codigo, setCodigo] = useState('TQ-01');
  const [produto, setProduto] = useState('Gasolina Comum');
  const [capacidadeNominal, setCapacidadeNominal] = useState(15000);
  const [capacidadeOperacional, setCapacidadeOperacional] = useState(14250);
  const [observacoes, setObservacoes] = useState('');
  const [pontosTexto, setPontosTexto] = useState(
    '0:0\n50:2500\n100:6800\n150:11200\n200:15000'
  );

  const tanqueAtivo = useMemo(() => {
    return tanques.find((t) => t.id === selectedTanqueId) || tanques[0] || null;
  }, [tanques, selectedTanqueId]);

  const resultadoCalculo = useMemo(() => {
    if (!tanqueAtivo) return null;
    const res = calcularVolumePorRegua(leituraCm, tanqueAtivo.tabelaRegua || []);
    if (!res) return null;
    const pct =
      tanqueAtivo.capacidadeNominal > 0
        ? Math.min(100, Math.round((res.volumeEstimado / tanqueAtivo.capacidadeNominal) * 1000) / 10)
        : 0;
    const espacoLivre = Math.max(0, tanqueAtivo.capacidadeOperacional - res.volumeEstimado);
    return {
      ...res,
      pct,
      espacoLivre,
    };
  }, [tanqueAtivo, leituraCm]);

  const abrirModalNovo = () => {
    setTanqueEditando(null);
    setCodigo(`TQ-0${tanques.length + 1}`);
    setProduto('Gasolina Comum');
    setCapacidadeNominal(15000);
    setCapacidadeOperacional(14250);
    setObservacoes('');
    setPontosTexto('0:0\n50:2500\n100:6800\n150:11200\n200:15000');
    setIsModalOpen(true);
  };

  const abrirModalEditar = (tq: Tanque) => {
    setTanqueEditando(tq);
    setCodigo(tq.codigo);
    setProduto(tq.produto);
    setCapacidadeNominal(tq.capacidadeNominal);
    setCapacidadeOperacional(tq.capacidadeOperacional);
    setObservacoes(tq.observacoes || '');
    if (tq.tabelaRegua && tq.tabelaRegua.length > 0) {
      setPontosTexto(tq.tabelaRegua.map((p) => `${p.altura}:${p.volume}`).join('\n'));
    } else {
      setPontosTexto('0:0\n50:2500\n100:6800\n150:11200\n200:15000');
    }
    setIsModalOpen(true);
  };

  const handleSalvarTanque = async (e: React.FormEvent) => {
    e.preventDefault();
    const tabela: PontoCalibracao[] = pontosTexto
      .split('\n')
      .map((line) => {
        const [a, v] = line.split(':').map((s) => parseFloat(s.trim()));
        return { altura: a, volume: v };
      })
      .filter((p) => !isNaN(p.altura) && !isNaN(p.volume));

    const id = tanqueEditando?.id || `tq-${Date.now()}`;
    const novoTanque: Tanque = {
      id,
      postoId,
      codigo: codigo.trim(),
      produto,
      capacidadeNominal: Number(capacidadeNominal),
      capacidadeOperacional: Number(capacidadeOperacional),
      unidade: 'Litros',
      formato: 'CILINDRICO_HORIZONTAL',
      ativo: true,
      tabelaRegua: tabela,
      observacoes: observacoes.trim() || undefined,
      criadoEm: tanqueEditando?.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await repoTanque.save(postoId, novoTanque);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'TANQUES',
      'Tanque',
      id,
      tanqueEditando ? 'UPDATE' : 'CREATE',
      tanqueEditando as unknown as Record<string, unknown>,
      novoTanque as unknown as Record<string, unknown>
    );

    setIsModalOpen(false);
    setTanqueEditando(null);
    onReload();
  };

  const handleExcluirTanque = async (tq: Tanque) => {
    if (!window.confirm(`Tem certeza que deseja excluir o tanque "${tq.codigo} (${tq.produto})"?`)) {
      return;
    }
    await repoTanque.delete(postoId, tq.id);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'TANQUES',
      'Tanque',
      tq.id,
      'DELETE',
      tq as unknown as Record<string, unknown>,
      null
    );
    onReload();
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Tanques e Calculadora de Régua Volumétrica
            </h2>
            <p className="text-xs text-slate-500">
              Conversão direta de altura (cm) em litros e gestão completa de tanques cadastrados.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={abrirModalNovo}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Tanque
        </button>
      </div>

      {/* Calculadora de Régua Direta (Versão Simples + Botão para Detalhar Informações) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Calculadora de Régua (cm → Litros)
            </h3>
          </div>

          <button
            type="button"
            onClick={() => setDetalharCalculadora(!detalharCalculadora)}
            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            {detalharCalculadora ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Versão Simples
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Detalhar Informações da Curva de Calibração
              </>
            )}
          </button>
        </div>

        {tanques.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            Cadastre um tanque para utilizar a calculadora de régua.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  1. Selecione o Tanque
                </label>
                <select
                  value={tanqueAtivo?.id || ''}
                  onChange={(e) => setSelectedTanqueId(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-bold bg-white text-slate-900"
                >
                  {tanques.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} — {t.produto} ({t.capacidadeNominal.toLocaleString('pt-BR')} L)
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  2. Altura na Régua (cm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={leituraCm}
                  onChange={(e) => setLeituraCm(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-5">
                {resultadoCalculo && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase text-blue-700">
                        Volume Apurado no Tanque
                      </div>
                      <div className="text-2xl font-mono font-black text-blue-950 mt-0.5">
                        {resultadoCalculo.volumeEstimado.toLocaleString('pt-BR')} L
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-1 rounded-full bg-blue-600 text-white font-mono text-xs font-bold">
                        {resultadoCalculo.pct}% cheio
                      </span>
                      <div className="text-[11px] text-slate-600 font-medium mt-1">
                        Livre p/ descarga: {resultadoCalculo.espacoLivre.toLocaleString('pt-BR')} L
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Detalhes exibidos apenas sob solicitação */}
            {detalharCalculadora && tanqueAtivo && resultadoCalculo && (
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs animate-in fade-in">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800">Detalhes da Interpolação:</div>
                  <div className="text-slate-600">
                    Método: <strong>{resultadoCalculo.metodo}</strong>
                  </div>
                  <div className="text-slate-600">
                    Capacidade Nominal: <strong>{tanqueAtivo.capacidadeNominal.toLocaleString('pt-BR')} L</strong> | Operacional: <strong>{tanqueAtivo.capacidadeOperacional.toLocaleString('pt-BR')} L</strong>
                  </div>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-800 mb-1.5">
                    Pontos da Tabela de Arqueação ({tanqueAtivo.tabelaRegua?.length || 0} pontos):
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {(tanqueAtivo.tabelaRegua || []).map((pt, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700"
                      >
                        {pt.altura}cm = {pt.volume}L
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lista de Tanques Cadastrados com Alterar e Excluir */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tanques.map((t) => (
          <div
            key={t.id}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-xs font-bold">
                  {t.codigo}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1.5">{t.produto}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nominal: <strong>{t.capacidadeNominal.toLocaleString('pt-BR')} L</strong> • Operacional:{' '}
                  <strong>{t.capacidadeOperacional.toLocaleString('pt-BR')} L</strong>
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => abrirModalEditar(t)}
                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                  title="Alterar cadastro do tanque"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleExcluirTanque(t)}
                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                  title="Excluir tanque"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {t.tabelaRegua?.length || 0} pontos de régua
              </span>
              <button
                type="button"
                onClick={() => setSelectedTanqueId(t.id)}
                className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline cursor-pointer"
              >
                <Ruler className="w-3.5 h-3.5" />
                Usar na Calculadora
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Cadastrar / Alterar Tanque */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {tanqueEditando ? `Alterar Tanque ${tanqueEditando.codigo}` : 'Cadastrar Novo Tanque'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarTanque} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Código</label>
                  <input
                    type="text"
                    required
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Combustível</label>
                  <select
                    value={produto}
                    onChange={(e) => setProduto(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold"
                  >
                    <option value="Gasolina Comum">Gasolina Comum</option>
                    <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                    <option value="Etanol">Etanol</option>
                    <option value="Diesel S10">Diesel S10</option>
                    <option value="Diesel S500">Diesel S500</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Capacidade Nominal (L)
                  </label>
                  <input
                    type="number"
                    required
                    value={capacidadeNominal}
                    onChange={(e) => setCapacidadeNominal(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Cap. Operacional (L)
                  </label>
                  <input
                    type="number"
                    required
                    value={capacidadeOperacional}
                    onChange={(e) => setCapacidadeOperacional(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tabela de Calibração (Altura cm : Volume L)
                </label>
                <textarea
                  rows={4}
                  value={pontosTexto}
                  onChange={(e) => setPontosTexto(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                >
                  Salvar Tanque
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
