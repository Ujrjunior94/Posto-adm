import React, { useState, useEffect } from 'react';
import { RegistroDensidade, Funcionario, TipoTesteANP } from '../../types';
import {
  PADROES_ANP_2026,
  calcularDetalhesDensidadeOperacional,
  calcularTesteProvetaGasolina,
  calcularTeorAlcoolicoEtanol,
} from '../../utils/calculations';
import {
  X,
  FlaskConical,
  Calculator,
  CheckCircle2,
  XCircle,
  Save,
  AlertTriangle,
  Calendar,
  Clock,
  User,
  Fuel,
  Thermometer,
  FileText,
} from 'lucide-react';

interface ModalEditarAnaliseProps {
  isOpen: boolean;
  analise: RegistroDensidade | null;
  funcionarios: Funcionario[];
  onClose: () => void;
  onSalvar: (analiseAtualizada: RegistroDensidade) => Promise<void>;
}

export const ModalEditarAnalise: React.FC<ModalEditarAnaliseProps> = ({
  isOpen,
  analise,
  funcionarios,
  onClose,
  onSalvar,
}) => {
  const [produto, setProduto] = useState('Gasolina Comum');
  const [tipoTeste, setTipoTeste] = useState<TipoTesteANP>('DENSIDADE_D20');
  const [temperatura, setTemperatura] = useState(25);
  const [densidadeObservada, setDensidadeObservada] = useState(0.742);
  const [responsavelId, setResponsavelId] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [observacao, setObservacao] = useState('');

  // Parâmetros especiais
  const [volumeAquosoFinal, setVolumeAquosoFinal] = useState(65.5);
  const [condutividadeEletrica, setCondutividadeEletrica] = useState(180);
  const [phEtanol, setPhEtanol] = useState(7.0);

  // Recebimento de descarga
  const [numeroNotaFiscal, setNumeroNotaFiscal] = useState('');
  const [placaCaminhao, setPlacaCaminhao] = useState('');
  const [distribuidora, setDistribuidora] = useState('Vibra / Petrobras');
  const [compartimento, setCompartimento] = useState('Comp. 01 (5.000 L)');
  const [lacreConferido, setLacreConferido] = useState(true);

  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (analise) {
      setProduto(analise.produto || 'Gasolina Comum');
      setTipoTeste(analise.tipoTeste || 'DENSIDADE_D20');
      setTemperatura(analise.temperatura ?? 25);
      setDensidadeObservada(analise.densidadeObservada ?? 0.742);
      setResponsavelId(analise.responsavelId || funcionarios[0]?.id || '');
      setData(analise.data || new Date().toISOString().slice(0, 10));
      setHora(analise.hora || new Date().toLocaleTimeString('pt-BR').slice(0, 5));
      setObservacao(analise.observacao || '');

      setVolumeAquosoFinal(analise.volumeAquosoFinal ?? 65.5);
      setCondutividadeEletrica(analise.condutividadeEletrica ?? 180);
      setPhEtanol(analise.ph ?? 7.0);

      setNumeroNotaFiscal(analise.numeroNotaFiscal || '');
      setPlacaCaminhao(analise.placaCaminhao || '');
      setDistribuidora(analise.distribuidora || 'Vibra / Petrobras');
      setCompartimento(analise.compartimento || 'Comp. 01 (5.000 L)');
      setLacreConferido(analise.lacreConferido ?? true);
    }
  }, [analise, funcionarios]);

  if (!isOpen || !analise) return null;

  const padraoAtual = PADROES_ANP_2026[produto] || PADROES_ANP_2026['Gasolina Comum'];

  // 1. Cálculos de densidade operacional a 20°C
  const detalhesDensidade = calcularDetalhesDensidadeOperacional(densidadeObservada, temperatura, produto);
  const densidadeCalculada20 = detalhesDensidade.densidadeCalculada20C;
  const isDensidadeConforme = detalhesDensidade.isConforme;

  // 2. Cálculos proveta
  const resultadoProveta = calcularTesteProvetaGasolina(
    volumeAquosoFinal,
    produto.includes('Premium') ? 'PREMIUM' : 'COMUM'
  );

  // 3. Cálculos etanol
  const resultadoEtanol = calcularTeorAlcoolicoEtanol(densidadeCalculada20);
  const isCondutividadeConforme = condutividadeEletrica <= 350;
  const isPhConforme = phEtanol >= 6.0 && phEtanol <= 8.0;
  const isEtanolTotalConforme = resultadoEtanol.isConforme && isCondutividadeConforme && isPhConforme;

  // Status e parecer técnico recalculados
  let statusFinal: 'CONFORME' | 'NAO_CONFORME' = 'CONFORME';
  let parecerTecnico = '';

  if (tipoTeste === 'DENSIDADE_D20') {
    if (produto.includes('Etanol')) {
      statusFinal = isDensidadeConforme && resultadoEtanol.isConforme ? 'CONFORME' : 'NAO_CONFORME';
      parecerTecnico = (isDensidadeConforme && resultadoEtanol.isConforme)
        ? `APROVADO - Dentro das especificações ANP (${detalhesDensidade.faixaMinimaKgM3.toFixed(1)} - ${detalhesDensidade.faixaMaximaKgM3.toFixed(1)} kg/m³). D20: ${detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³ | Grau alcoólico: ${resultadoEtanol.grauINPM}% m/m.`
        : `NÃO CONFORME: Densidade D20 (${detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³) fora dos limites ANP (${detalhesDensidade.faixaMinimaKgM3.toFixed(1)} a ${detalhesDensidade.faixaMaximaKgM3.toFixed(1)} kg/m³).`;
    } else {
      statusFinal = isDensidadeConforme ? 'CONFORME' : 'NAO_CONFORME';
      parecerTecnico = isDensidadeConforme
        ? `Densidade D20 (${densidadeCalculada20.toFixed(4)} g/cm³ | ${detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³) dentro do padrão regulamentar ANP (${padraoAtual.densidade20CMin.toFixed(4)} a ${padraoAtual.densidade20CMax.toFixed(4)} g/cm³).`
        : `NÃO CONFORME: Densidade D20 (${densidadeCalculada20.toFixed(4)} g/cm³ | ${detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³) fora dos limites ANP (${padraoAtual.densidade20CMin.toFixed(4)} a ${padraoAtual.densidade20CMax.toFixed(4)} g/cm³).`;
    }
  } else if (tipoTeste === 'TESTE_PROVETA_GASOLINA') {
    statusFinal = resultadoProveta.isConforme ? 'CONFORME' : 'NAO_CONFORME';
    parecerTecnico = `${resultadoProveta.parecer} Teor apurado de ${resultadoProveta.teorEtanolApurado}% (Volume aquoso: ${volumeAquosoFinal} ml).`;
  } else if (tipoTeste === 'TEOR_ALCOOLICO_ETANOL') {
    statusFinal = isEtanolTotalConforme ? 'CONFORME' : 'NAO_CONFORME';
    parecerTecnico = `Teor alcoólico em massa: ${resultadoEtanol.grauINPM}° INPM | Grau GL: ${resultadoEtanol.grauGL}° GL | Condutividade: ${condutividadeEletrica} µS/m | pH: ${phEtanol}. ${resultadoEtanol.parecer}`;
  } else if (tipoTeste === 'RECEBIMENTO_DESCARGA') {
    const conformeDescarga = isDensidadeConforme && lacreConferido;
    statusFinal = conformeDescarga ? 'CONFORME' : 'NAO_CONFORME';
    parecerTecnico = conformeDescarga
      ? `Descarga liberada: Lacres conferidos, D20 ${densidadeCalculada20.toFixed(4)} g/cm³ em conformidade com a NF ${numeroNotaFiscal || 'S/N'}.`
      : `Descarga REPROVADA / BLOQUEADA: Falha de lacre ou desvio de densidade na amostra-testemunha.`;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const analiseAtualizada: RegistroDensidade = {
        ...analise,
        produto,
        tipoTeste,
        temperatura,
        densidadeObservada,
        densidadeCalculada20C: densidadeCalculada20,
        densidadeReferenciaMin: padraoAtual.densidade20CMin,
        densidadeReferenciaMax: padraoAtual.densidade20CMax,
        resultado: statusFinal,
        responsavelId,
        data,
        hora,
        volumeAquosoFinal: tipoTeste === 'TESTE_PROVETA_GASOLINA' ? volumeAquosoFinal : undefined,
        teorEtanolAnidro: tipoTeste === 'TESTE_PROVETA_GASOLINA' ? resultadoProveta.teorEtanolApurado : undefined,
        grauINPM: (tipoTeste === 'TEOR_ALCOOLICO_ETANOL' || produto.includes('Etanol')) ? resultadoEtanol.grauINPM : undefined,
        grauGL: (tipoTeste === 'TEOR_ALCOOLICO_ETANOL' || produto.includes('Etanol')) ? resultadoEtanol.grauGL : undefined,
        condutividadeEletrica: tipoTeste === 'TEOR_ALCOOLICO_ETANOL' ? condutividadeEletrica : undefined,
        ph: tipoTeste === 'TEOR_ALCOOLICO_ETANOL' ? phEtanol : undefined,
        aspecto: padraoAtual.aspectoEsperado,
        cor: padraoAtual.corEsperada,
        numeroNotaFiscal: tipoTeste === 'RECEBIMENTO_DESCARGA' ? numeroNotaFiscal : undefined,
        placaCaminhao: tipoTeste === 'RECEBIMENTO_DESCARGA' ? placaCaminhao : undefined,
        distribuidora: tipoTeste === 'RECEBIMENTO_DESCARGA' ? distribuidora : undefined,
        compartimento: tipoTeste === 'RECEBIMENTO_DESCARGA' ? compartimento : undefined,
        lacreConferido: tipoTeste === 'RECEBIMENTO_DESCARGA' ? lacreConferido : undefined,
        parecerTecnico,
        observacao,
        coeficienteCorrecaoUtilizado: detalhesDensidade.coeficienteExpansaoTermica,
        fatorExpansaoTermica: detalhesDensidade.fatorCorrecaoAplicado,
        densidadeKgM3: detalhesDensidade.densidadeKgM3,
      };

      await onSalvar(analiseAtualizada);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar edição de análise:', err);
      alert('Erro ao atualizar análise. Verifique os dados e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl border border-teal-200">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Editar Laudo de Análise ANP</h3>
              <p className="text-xs text-slate-500">
                Ajuste os parâmetros físicos e metrológicos com recálculo automático em tempo real
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Identificação e Data */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Hora
              </label>
              <input
                type="time"
                required
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" /> Responsável
              </label>
              <select
                value={responsavelId}
                onChange={(e) => setResponsavelId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              >
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} ({f.funcao || f.cargo})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tipo de Ensaio e Produto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Ensaio ANP</label>
              <select
                value={tipoTeste}
                onChange={(e) => setTipoTeste(e.target.value as TipoTesteANP)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
              >
                <option value="DENSIDADE_D20">Densidade a 20°C (D20 Termodensímetro)</option>
                <option value="TESTE_PROVETA_GASOLINA">Teste da Proveta (Teor de Etanol na Gasolina)</option>
                <option value="TEOR_ALCOOLICO_ETANOL">Etanol Hidratado (Grau INPM / GL / pH)</option>
                <option value="RECEBIMENTO_DESCARGA">Recebimento e Descarga de Caminhão-Tanque</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Fuel className="w-3.5 h-3.5 text-slate-400" /> Combustível Avaliado
              </label>
              <select
                value={produto}
                onChange={(e) => setProduto(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
              >
                <option value="Gasolina Comum">Gasolina Comum</option>
                <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                <option value="Gasolina Premium">Gasolina Premium</option>
                <option value="Etanol Hidratado">Etanol Hidratado</option>
                <option value="Óleo Diesel S10">Óleo Diesel S10</option>
                <option value="Óleo Diesel S500">Óleo Diesel S500</option>
              </select>
            </div>
          </div>

          {/* Parâmetros Físicos Básicos: Temperatura e Densidade Observada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5 text-teal-600" /> Temperatura Lida no Termômetro (°C)
                </span>
                <span className="font-mono text-teal-700 font-bold">{temperatura.toFixed(1)}°C</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="50"
                required
                value={temperatura}
                onChange={(e) => setTemperatura(parseFloat(e.target.value) || 20)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Calculator className="w-3.5 h-3.5 text-teal-600" /> Densidade Observada (g/cm³)
                </span>
                <span className="font-mono text-teal-700 font-bold">{densidadeObservada.toFixed(4)}</span>
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.65"
                max="0.95"
                required
                value={densidadeObservada}
                onChange={(e) => setDensidadeObservada(parseFloat(e.target.value) || 0.7)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white"
              />
            </div>
          </div>

          {/* Seção Condicional por Tipo de Ensaio */}
          {tipoTeste === 'TESTE_PROVETA_GASOLINA' && (
            <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-200 space-y-2">
              <label className="block text-xs font-bold text-teal-900">
                Volume da Camada Aquosa na Proveta de 100ml (ml)
              </label>
              <input
                type="number"
                step="0.5"
                min="50"
                max="90"
                value={volumeAquosoFinal}
                onChange={(e) => setVolumeAquosoFinal(parseFloat(e.target.value) || 50)}
                className="w-full px-3 py-2 border border-teal-300 rounded-lg text-xs font-mono bg-white"
              />
              <div className="text-[11px] text-teal-800 flex justify-between font-mono">
                <span>Teor de Etanol Apurado: <strong>{resultadoProveta.teorEtanolApurado}%</strong></span>
                <span>Referência ANP: {resultadoProveta.teorReferenciaMin}% a {resultadoProveta.teorReferenciaMax}%</span>
              </div>
            </div>
          )}

          {tipoTeste === 'TEOR_ALCOOLICO_ETANOL' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/70 rounded-xl border border-blue-200">
              <div>
                <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                  Condutividade Elétrica (µS/m)
                </label>
                <input
                  type="number"
                  step="1"
                  value={condutividadeEletrica}
                  onChange={(e) => setCondutividadeEletrica(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg text-xs font-mono bg-white"
                />
                <span className="text-[10px] text-blue-700">Máx. 350 µS/m</span>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                  Potencial Hidrogeniônico (pH)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={phEtanol}
                  onChange={(e) => setPhEtanol(parseFloat(e.target.value) || 7)}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg text-xs font-mono bg-white"
                />
                <span className="text-[10px] text-blue-700">Faixa 6,0 a 8,0</span>
              </div>
            </div>
          )}

          {tipoTeste === 'RECEBIMENTO_DESCARGA' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-amber-50/70 rounded-xl border border-amber-200">
              <div>
                <label className="block text-[11px] font-semibold text-amber-900 mb-1">Nota Fiscal (NF-e)</label>
                <input
                  type="text"
                  value={numeroNotaFiscal}
                  onChange={(e) => setNumeroNotaFiscal(e.target.value)}
                  className="w-full px-3 py-1.5 border border-amber-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-amber-900 mb-1">Placa do Caminhão</label>
                <input
                  type="text"
                  value={placaCaminhao}
                  onChange={(e) => setPlacaCaminhao(e.target.value)}
                  className="w-full px-3 py-1.5 border border-amber-300 rounded-lg text-xs bg-white font-mono"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="lacreCheckEdit"
                  checked={lacreConferido}
                  onChange={(e) => setLacreConferido(e.target.checked)}
                  className="rounded border-amber-400 text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <label htmlFor="lacreCheckEdit" className="text-xs font-semibold text-amber-900">
                  Lacres Numéricos Conferidos
                </label>
              </div>
            </div>
          )}

          {/* Painel de Recálculo em Tempo Real */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-100/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wide flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-teal-600" /> Recálculo Metrológico D20
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  statusFinal === 'CONFORME'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {statusFinal === 'CONFORME' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                {statusFinal}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-200 font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block">D20 Calculada:</span>
                <strong className="text-teal-800 font-bold">{densidadeCalculada20.toFixed(4)} g/cm³</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Massa Específica:</span>
                <strong className="text-slate-800">{detalhesDensidade.densidadeKgM3.toFixed(1)} kg/m³</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Faixa ANP Mín:</span>
                <span className="text-slate-700 font-medium">{(padraoAtual.densidade20CMin * 1000).toFixed(1)} kg/m³</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Faixa ANP Máx:</span>
                <span className="text-slate-700 font-medium">{(padraoAtual.densidade20CMax * 1000).toFixed(1)} kg/m³</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-600 p-2 rounded bg-white border border-slate-200">
              <strong>Novo Parecer:</strong> {parecerTecnico}
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" /> Observações Técnicas do Laudo
            </label>
            <textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Anotações sobre a amostra, equipamentos ou condições de temperatura..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition disabled:opacity-50"
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
