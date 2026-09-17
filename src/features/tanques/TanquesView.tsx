import React, { useState } from 'react';
import { Tanque, PontoCalibracao } from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import { calcularVolumePorRegua, ResultadoInterpolacao } from '../../utils/calculations';
import { Fuel, Ruler, Plus, Calculator, Layers, AlertCircle, Save } from 'lucide-react';

const repoTanques = new PostoSubcollectionRepository<Tanque>('tanques');

interface TanquesProps {
  tanques: Tanque[];
  onReload: () => void;
}

export const TanquesView: React.FC<TanquesProps> = ({ tanques, onReload }) => {
  const { postoId, userProfile } = useAuth();
  const [selectedTanqueId, setSelectedTanqueId] = useState<string>(tanques[0]?.id || '');
  const [leituraRegua, setLeituraRegua] = useState<string>('');
  const [resultado, setResultado] = useState<ResultadoInterpolacao | null>(null);

  // Modal Novo Tanque
  const [isModalTanque, setIsModalTanque] = useState(false);
  const [codigo, setCodigo] = useState('TQ-01');
  const [produto, setProduto] = useState('Gasolina Comum');
  const [capacidadeNominal, setCapacidadeNominal] = useState(30000);
  const [capacidadeOperacional, setCapacidadeOperacional] = useState(28500);
  const [formato, setFormato] = useState<'CILINDRICO_HORIZONTAL' | 'CILINDRICO_VERTICAL' | 'ESFERICO' | 'RETANGULAR' | 'OUTRO'>('CILINDRICO_HORIZONTAL');
  const [tabelaTexto, setTabelaTexto] = useState('10: 950\n20: 2100\n30: 3400\n40: 4800\n50: 6300\n100: 15000\n150: 24000\n200: 30000');

  const tanqueAtivo = tanques.find((t) => t.id === selectedTanqueId) || tanques[0];

  const handleCalcular = () => {
    if (!tanqueAtivo) return;
    const num = parseFloat(leituraRegua);
    if (isNaN(num)) return;
    const res = calcularVolumePorRegua(num, tanqueAtivo.tabelaRegua);
    setResultado(res);
  };

  const handleSalvarTanque = async (e: React.FormEvent) => {
    e.preventDefault();
    // Parse da tabela de régua
    const pontos: PontoCalibracao[] = tabelaTexto
      .split('\n')
      .map((linha) => {
        const parts = linha.split(/[:;,]/);
        if (parts.length >= 2) {
          const h = parseFloat(parts[0].trim());
          const v = parseFloat(parts[1].trim());
          if (!isNaN(h) && !isNaN(v)) return { altura: h, volume: v };
        }
        return null;
      })
      .filter((p): p is PontoCalibracao => p !== null)
      .sort((a, b) => a.altura - b.altura);

    const id = `tanque-${Date.now()}`;
    const novoTanque: Tanque = {
      id,
      postoId,
      codigo,
      produto,
      capacidadeNominal,
      capacidadeOperacional,
      unidade: 'Litros',
      formato,
      ativo: true,
      tabelaRegua: pontos,
      observacoes: 'Calibração aferida por régua volumétrica',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await repoTanques.save(postoId, novoTanque);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'TANQUES',
      'Tanque',
      id,
      'CREATE',
      null,
      novoTanque as unknown as Record<string, unknown>
    );

    setIsModalTanque(false);
    onReload();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Fuel className="w-6 h-6 text-indigo-600" />
            Tanques de Combustível e Calculadora de Régua
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Interpolação linear precisa sobre tabela de arqueação/calibração real do tanque.
          </p>
        </div>

        <button
          onClick={() => setIsModalTanque(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Cadastrar Tanque
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calculadora Independente de Régua */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Ruler className="w-5 h-5 text-indigo-600" />
            Medição de Régua
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Selecionar Tanque</label>
            <select
              value={selectedTanqueId}
              onChange={(e) => {
                setSelectedTanqueId(e.target.value);
                setResultado(null);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {tanques.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} — {t.produto}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Leitura da Régua (cm)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="Ex: 45.5"
                value={leituraRegua}
                onChange={(e) => setLeituraRegua(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
              <button
                type="button"
                onClick={handleCalcular}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
              >
                Calcular
              </button>
            </div>
          </div>

          {resultado && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2 animate-in fade-in">
              <div className="text-xs text-indigo-700 font-semibold uppercase">Volume Estimado</div>
              <div className="text-2xl font-bold font-mono text-indigo-950">
                {resultado.volumeEstimado.toLocaleString('pt-BR')} Litros
              </div>

              <div className="text-xs text-slate-600 space-y-1 pt-2 border-t border-indigo-100">
                <div>
                  <strong>Método:</strong> {resultado.metodo}
                </div>
                <div>
                  <strong>Pontos de Apoio:</strong>{' '}
                  {resultado.pontosUtilizados.map((p) => `${p.altura}cm (${p.volume}L)`).join(' e ')}
                </div>
                <div>
                  <strong>Horário:</strong> {new Date().toLocaleTimeString('pt-BR')}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lista de Tanques e Detalhes da Tabela de Calibração */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tanques.map((t) => (
              <div
                key={t.id}
                onClick={() => {
                  setSelectedTanqueId(t.id);
                  setResultado(null);
                }}
                className={`p-5 rounded-xl border cursor-pointer transition ${
                  selectedTanqueId === t.id
                    ? 'border-indigo-600 bg-indigo-50/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{t.codigo}</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                    {t.produto}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Capacidade Nominal: <strong>{t.capacidadeNominal.toLocaleString('pt-BR')} L</strong>
                </div>
                <div className="text-xs text-slate-500">
                  Operacional Máxima: <strong>{t.capacidadeOperacional.toLocaleString('pt-BR')} L</strong>
                </div>
                <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  {t.tabelaRegua?.length || 0} pontos na tabela de arqueação
                </div>
              </div>
            ))}
          </div>

          {tanqueAtivo && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h4 className="font-bold text-sm text-slate-800 mb-3">
                Tabela de Arqueação Atual: {tanqueAtivo.codigo} ({tanqueAtivo.produto})
              </h4>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="py-2 px-3">Altura da Régua (cm)</th>
                      <th className="py-2 px-3">Volume Correspondente (L)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {tanqueAtivo.tabelaRegua?.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3">{p.altura} cm</td>
                        <td className="py-1.5 px-3">{p.volume.toLocaleString('pt-BR')} L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Cadastro de Tanque */}
      {isModalTanque && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Novo Tanque de Combustível</h3>

            <form onSubmit={handleSalvarTanque} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Código</label>
                  <input
                    type="text"
                    required
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Produto</label>
                  <select
                    value={produto}
                    onChange={(e) => setProduto(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="Gasolina Comum">Gasolina Comum</option>
                    <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                    <option value="Etanol Hidratado">Etanol Hidratado</option>
                    <option value="Diesel S10">Diesel S10</option>
                    <option value="Diesel S500">Diesel S500</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Capacidade Nominal (L)</label>
                  <input
                    type="number"
                    required
                    value={capacidadeNominal}
                    onChange={(e) => setCapacidadeNominal(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Capacidade Operacional (L)</label>
                  <input
                    type="number"
                    required
                    value={capacidadeOperacional}
                    onChange={(e) => setCapacidadeOperacional(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Tabela de Calibração (Altura em cm : Volume em Litros)
                </label>
                <textarea
                  rows={4}
                  value={tabelaTexto}
                  onChange={(e) => setTabelaTexto(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  placeholder="10: 950&#10;20: 2100&#10;30: 3400"
                />
                <span className="text-[10px] text-slate-400">Uma leitura por linha no formato: altura: volume</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalTanque(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700"
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
