import React from 'react';
import { ResultadoCalculoAfericao } from '../../utils/calculations';
import { CheckCircle2, XCircle, AlertTriangle, Info, ArrowRight } from 'lucide-react';

interface DesvioAfericaoGaugeProps {
  calculo: ResultadoCalculoAfericao;
  compacto?: boolean;
}

export const DesvioAfericaoGauge: React.FC<DesvioAfericaoGaugeProps> = ({
  calculo,
  compacto = false,
}) => {
  const {
    volumeNominal,
    volumeAferido,
    desvioMl,
    toleranciaMl,
    isConforme,
    resultado,
    percentualDesvio,
  } = calculo;

  // Normalização para posicionar o ponteiro na régua (escala de -150 ml a +150 ml)
  const minEscala = -150;
  const maxEscala = 150;
  const rangeEscala = maxEscala - minEscala;
  const desvioClamp = Math.min(Math.max(desvioMl, minEscala), maxEscala);
  const posicaoPercentual = ((desvioClamp - minEscala) / rangeEscala) * 100;

  // Posições dos marcos de -100, 0 e +100 na régua percentual
  const posMinTol = ((-toleranciaMl - minEscala) / rangeEscala) * 100; // (-100 - (-150)) / 300 = 50 / 300 = 16.66%
  const posZero = ((0 - minEscala) / rangeEscala) * 100; // 50%
  const posMaxTol = ((toleranciaMl - minEscala) / rangeEscala) * 100; // 83.33%

  return (
    <div
      className={`rounded-2xl border transition-all ${
        isConforme
          ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200/50'
          : 'bg-red-50/70 border-red-300 ring-1 ring-red-200/50'
      } ${compacto ? 'p-3' : 'p-4 sm:p-5'}`}
    >
      {/* Cabeçalho do Desvio */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200/60">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Aferição Padrão: {volumeNominal.toFixed(3)} L (Balde Inmetro)
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-xs text-slate-600">Volume Lido:</span>
            <span className="text-base font-bold font-mono text-slate-900">
              {volumeAferido.toFixed(3)} L
            </span>
          </div>
        </div>

        {/* Badge de Status Inmetro */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
              isConforme
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-red-100 text-red-800 border-red-300'
            }`}
          >
            {isConforme ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600" />
            )}
            {isConforme ? 'CONFORME (±100 ml)' : 'NÃO CONFORME (FORA DE ±100 ml)'}
          </span>
        </div>
      </div>

      {/* Destaque Numérico do Desvio */}
      <div className="my-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 block">Desvio Apurado</span>
          <div
            className={`text-2xl font-extrabold font-mono mt-0.5 ${
              desvioMl === 0
                ? 'text-slate-800'
                : isConforme
                ? 'text-emerald-700'
                : 'text-red-700'
            }`}
          >
            {desvioMl > 0 ? `+${desvioMl}` : desvioMl} ml
          </div>
          <span className="text-[10px] text-slate-400">
            {desvioMl === 0 ? 'Exato no marco zero' : `${percentualDesvio > 0 ? `+${percentualDesvio}` : percentualDesvio}% dos 20L`}
          </span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 block">Tolerância Permitida</span>
          <div className="text-xl font-bold font-mono text-slate-800 mt-0.5">
            ± {toleranciaMl} ml
          </div>
          <span className="text-[10px] text-slate-400">
            Faixa aceitável: -{toleranciaMl} ml a +{toleranciaMl} ml
          </span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 block">Diagnóstico de Entrega</span>
          <div className="text-sm font-bold text-slate-800 mt-1">
            {desvioMl === 0 && 'Volume Exato (20,000 L)'}
            {desvioMl > 0 && isConforme && 'Excesso aceitável (ao cliente)'}
            {desvioMl < 0 && isConforme && 'Falta aceitável (tolerada)'}
            {desvioMl > toleranciaMl && 'Excesso abusivo (Prejuízo posto)'}
            {desvioMl < -toleranciaMl && 'Falta gravosa (Prejuízo cliente)'}
          </div>
          <span className="text-[10px] text-slate-500">
            {isConforme ? 'Bomba liberada p/ operação' : 'Requer ajuste no medidor'}
          </span>
        </div>
      </div>

      {/* Régua Metrológica Visual de Desvio (-100 a +100 ml) */}
      <div className="mt-4 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
          <span>Escala Metrológica do Balde 20L</span>
          <span className="text-[11px] text-slate-500 font-normal">
            Limite Regulatório: <strong>-100 ml</strong> até <strong>+100 ml</strong>
          </span>
        </div>

        {/* Trilho da Régua */}
        <div className="relative h-6 rounded-lg bg-slate-100 border border-slate-300 overflow-hidden flex">
          {/* Zona Vermelha Esquerda: < -100 ml */}
          <div
            style={{ width: `${posMinTol}%` }}
            className="bg-red-200 border-r border-red-300 flex items-center justify-center text-[9px] font-bold text-red-800"
            title="Abaixo de -100 ml: Fora da tolerância"
          >
            &lt; -100 ml
          </div>

          {/* Zona Verde Central: -100 ml até +100 ml */}
          <div
            style={{ width: `${posMaxTol - posMinTol}%` }}
            className="bg-emerald-200/80 border-r border-red-300 relative flex items-center justify-center text-[10px] font-bold text-emerald-900"
            title="Faixa Permitida Inmetro (± 100 ml)"
          >
            <span className="hidden sm:inline">Zona Conforme (±100 ml)</span>
            {/* Linha Zero Central */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-emerald-600 z-0 opacity-40" />
          </div>

          {/* Zona Vermelha Direita: > +100 ml */}
          <div
            style={{ width: `${100 - posMaxTol}%` }}
            className="bg-red-200 flex items-center justify-center text-[9px] font-bold text-red-800"
            title="Acima de +100 ml: Fora da tolerância"
          >
            &gt; +100 ml
          </div>

          {/* Ponteiro Indicador do Desvio Atual */}
          <div
            style={{ left: `${posPosicaoRelativa(posicaoPercentual)}%` }}
            className="absolute top-0 bottom-0 -translate-x-1/2 w-3 flex items-center justify-center z-10 transition-all duration-300"
          >
            <div
              className={`w-2.5 h-full rounded-xs shadow-md border ${
                isConforme
                  ? 'bg-emerald-700 border-white ring-2 ring-emerald-400'
                  : 'bg-red-700 border-white ring-2 ring-red-400'
              }`}
              title={`Desvio atual: ${desvioMl > 0 ? `+${desvioMl}` : desvioMl} ml`}
            />
          </div>
        </div>

        {/* Legendas e Marcadores Numéricos da Régua */}
        <div className="relative mt-2 text-[10px] text-slate-500 font-mono flex justify-between">
          <span className="text-red-700 font-bold">-150 ml</span>
          <span
            style={{ left: `${posMinTol}%` }}
            className="absolute -translate-x-1/2 text-slate-800 font-bold text-red-700"
          >
            -100 ml
          </span>
          <span
            style={{ left: `${posZero}%` }}
            className="absolute -translate-x-1/2 text-emerald-700 font-extrabold"
          >
            0 ml (20,000 L)
          </span>
          <span
            style={{ left: `${posMaxTol}%` }}
            className="absolute -translate-x-1/2 text-slate-800 font-bold text-red-700"
          >
            +100 ml
          </span>
          <span className="text-red-700 font-bold">+150 ml</span>
        </div>
      </div>

      {/* Mensagem Informativa de Desvio */}
      <div className="mt-3 flex items-start gap-2 text-xs">
        {isConforme ? (
          <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
        )}
        <div className="text-slate-700 leading-relaxed">
          <strong>Resultado: </strong>
          {desvioMl === 0 && (
            <span>
              O medidor atingiu exatamente <strong>20,000 Litros</strong> com <strong>0 ml</strong> de desvio. Calibração perfeita.
            </span>
          )}
          {desvioMl !== 0 && isConforme && (
            <span>
              O desvio apurado foi de{' '}
              <strong className="text-emerald-700">
                {desvioMl > 0 ? `+${desvioMl}` : desvioMl} ml
              </strong>
              , estando <strong>DENTRO</strong> da tolerância regulamentar de{' '}
              <strong>± 100 ml</strong> (de -100 ml a +100 ml). O bico está apto para operação.
            </span>
          )}
          {!isConforme && (
            <span className="text-red-800">
              O desvio apurado foi de{' '}
              <strong className="text-red-700">
                {desvioMl > 0 ? `+${desvioMl}` : desvioMl} ml
              </strong>
              , estando <strong>FORA</strong> da tolerância máxima permitida de{' '}
              <strong>± 100 ml</strong>. {desvioMl > 100 ? 'Excesso de combustível dispensado.' : 'Volume dispensado inferior ao cobrado.'} A bomba deve ser interditada ou calibrada.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

function posPosicaoRelativa(percentual: number): number {
  return Math.min(Math.max(percentual, 2), 98);
}
