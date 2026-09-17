import React, { useState, useEffect } from 'react';
import { Afericao, Bico, Funcionario } from '../../types';
import { calcularAfericao, TOLERANCIA_DESVIO_PADRAO_L } from '../../utils/calculations';
import { DesvioAfericaoGauge } from './DesvioAfericaoGauge';
import {
  X,
  Gauge,
  Save,
  Calendar,
  Clock,
  User,
  Fuel,
  Wrench,
  FileText,
  RotateCcw,
} from 'lucide-react';

interface ModalEditarAfericaoProps {
  isOpen: boolean;
  afericao: Afericao | null;
  bicos: Bico[];
  funcionarios: Funcionario[];
  onClose: () => void;
  onSalvar: (afericaoAtualizada: Afericao) => Promise<void>;
}

export const ModalEditarAfericao: React.FC<ModalEditarAfericaoProps> = ({
  isOpen,
  afericao,
  bicos,
  funcionarios,
  onClose,
  onSalvar,
}) => {
  const [bicoId, setBicoId] = useState('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const volumeNominal = 20.0; // Sempre 20L
  const [volumeAferido, setVolumeAferido] = useState(20.0);
  const [toleranciaConfigurada, setToleranciaConfigurada] = useState(TOLERANCIA_DESVIO_PADRAO_L); // 0.100 L = 100ml
  const [equipamento, setEquipamento] = useState('Medidor Padrão 20L Inmetro');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (afericao) {
      setBicoId(afericao.bicoId || bicos[0]?.id || '');
      setFuncionarioId(afericao.funcionarioId || funcionarios[0]?.id || '');
      setData(afericao.data || new Date().toISOString().slice(0, 10));
      setHora(afericao.hora || new Date().toLocaleTimeString('pt-BR').slice(0, 5));
      setVolumeAferido(afericao.volumeAferido ?? 20.0);
      setToleranciaConfigurada(afericao.toleranciaConfigurada ?? TOLERANCIA_DESVIO_PADRAO_L);
      setEquipamento(afericao.equipamento || 'Medidor Padrão 20L Inmetro');
      setObservacao(afericao.observacao || '');
    }
  }, [afericao, bicos, funcionarios]);

  if (!isOpen || !afericao) return null;

  const bicoSelecionado = bicos.find((b) => b.id === bicoId) || bicos[0];
  const calculo = calcularAfericao(volumeAferido, 20.0, toleranciaConfigurada);

  const ajustarVolumeAferido = (deltaMl: number) => {
    setVolumeAferido((prev) => {
      const novo = Math.round((prev + deltaMl / 1000) * 1000) / 1000;
      return Math.max(0, novo);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bicoSelecionado) return;
    setSalvando(true);

    try {
      const afericaoAtualizada: Afericao = {
        ...afericao,
        bicoId: bicoSelecionado.id,
        tanqueId: bicoSelecionado.tanqueId,
        produto: bicoSelecionado.produto,
        funcionarioId,
        data,
        hora,
        volumeNominal: 20.0, // Sempre 20L
        volumeAferido,
        diferenca: calculo.diferenca,
        toleranciaConfigurada,
        resultado: calculo.resultado,
        equipamento,
        observacao,
      };

      await onSalvar(afericaoAtualizada);
      onClose();
    } catch (err) {
      console.error('Erro ao atualizar aferição:', err);
      alert('Erro ao atualizar aferição. Verifique os dados e tente novamente.');
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
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-200">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Editar Aferição de Bico (Balde 20L)
              </h3>
              <p className="text-xs text-slate-500">
                Aferição metrológica de 20 Litros com avaliação de desvio entre ± 100 ml.
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

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Identificação do Bico e Responsável */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Fuel className="w-3.5 h-3.5 text-slate-400" /> Bico / Bomba
              </label>
              <select
                value={bicoId}
                onChange={(e) => setBicoId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
              >
                {bicos.map((b) => (
                  <option key={b.id} value={b.id}>
                    Bico {b.numero} ({b.bomba} • Lado {b.lado}) — {b.produto}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" /> Responsável Técnico
              </label>
              <select
                value={funcionarioId}
                onChange={(e) => setFuncionarioId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              >
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} ({f.cargo})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Data
              </label>
              <input
                type="date"
                required
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Horário
              </label>
              <input
                type="time"
                required
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          {/* Volume Nominal (Sempre 20L) & Leitura do Balde */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Volume Padrão Nominal
              </label>
              <div className="relative">
                <input
                  type="text"
                  disabled
                  value="20,000 Litros"
                  className="w-full px-3 py-2.5 border border-slate-200 bg-slate-100/90 rounded-lg text-xs font-bold font-mono text-slate-700 cursor-not-allowed"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                  Sempre 20L
                </span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Medida-padrão oficial de 20L calibrada pelo Inmetro
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Valor Lido no Balde (Litros)</span>
                <span className="font-mono font-bold text-amber-700">
                  {volumeAferido.toFixed(3)} L
                </span>
              </label>
              <input
                type="number"
                step="0.001"
                required
                value={volumeAferido}
                onChange={(e) => setVolumeAferido(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
              
              {/* Botões de Ajuste Rápido em ml */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400 mr-0.5">Ajuste rápido:</span>
                <button
                  type="button"
                  onClick={() => ajustarVolumeAferido(-50)}
                  className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700"
                >
                  -50ml
                </button>
                <button
                  type="button"
                  onClick={() => ajustarVolumeAferido(-10)}
                  className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700"
                >
                  -10ml
                </button>
                <button
                  type="button"
                  onClick={() => setVolumeAferido(20.0)}
                  className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700 flex items-center gap-1"
                  title="Restaurar para exatos 20,000 L"
                >
                  <RotateCcw className="w-2.5 h-2.5 text-slate-400" />
                  20L
                </button>
                <button
                  type="button"
                  onClick={() => ajustarVolumeAferido(+10)}
                  className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700"
                >
                  +10ml
                </button>
                <button
                  type="button"
                  onClick={() => ajustarVolumeAferido(+50)}
                  className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-[10px] rounded font-mono text-slate-700"
                >
                  +50ml
                </button>
              </div>
            </div>
          </div>

          {/* Painel do Desvio Metrológico Visual entre ± 100 ml */}
          <DesvioAfericaoGauge calculo={calculo} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5 text-slate-400" /> Equipamento Utilizado
              </label>
              <input
                type="text"
                value={equipamento}
                onChange={(e) => setEquipamento(e.target.value)}
                placeholder="Ex: Medidor Padrão 20L Inmetro"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Observações Operacionais
              </label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Lacre Inmetro, bomba lubrificada, etc."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              />
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
