import { Bico } from '../types';

export const PRECOS_PADRAO_COMBUSTIVEL: Record<string, number> = {
  'Gasolina Comum': 5.89,
  'Gasolina Aditivada': 6.15,
  'Etanol Hidratado': 3.89,
  'Diesel S10': 6.19,
  'Diesel S500': 5.99,
  'GNV': 4.79,
};

export interface CalculoPrecoBicoResult {
  precoBase: number;
  precoFinal: number;
  descontoReais: number;
  descontoPercentual: number;
  temDesconto: boolean;
  motivoDesconto?: string;
}

/**
 * Calcula o preço final efetivo de venda de um bico com base no preço base
 * e nos parâmetros de desconto configurados.
 */
export function calcularPrecoEfetivoBico(
  bico: Partial<Bico> & { produto?: string }
): CalculoPrecoBicoResult {
  const precoBasePadrao = bico.produto
    ? PRECOS_PADRAO_COMBUSTIVEL[bico.produto] || 5.89
    : 5.89;

  const precoBase =
    typeof bico.precoBase === 'number' && bico.precoBase > 0
      ? bico.precoBase
      : typeof bico.precoLitro === 'number' && bico.precoLitro > 0
      ? bico.precoLitro
      : precoBasePadrao;

  if (
    !bico.temDesconto ||
    typeof bico.valorDesconto !== 'number' ||
    bico.valorDesconto <= 0
  ) {
    return {
      precoBase,
      precoFinal: precoBase,
      descontoReais: 0,
      descontoPercentual: 0,
      temDesconto: false,
      motivoDesconto: bico.motivoDesconto,
    };
  }

  let descontoReais = 0;
  let descontoPercentual = 0;

  if (bico.tipoDesconto === 'PERCENTUAL') {
    descontoPercentual = bico.valorDesconto;
    descontoReais = (precoBase * bico.valorDesconto) / 100;
  } else {
    // Tipo 'VALOR' (R$/litro)
    descontoReais = bico.valorDesconto;
    descontoPercentual = precoBase > 0 ? (descontoReais / precoBase) * 100 : 0;
  }

  // Preço não pode ser negativo ou zerado (mínimo 0.01)
  const precoFinalCalculado = Math.max(0.01, precoBase - descontoReais);
  // No Brasil combustíveis operam com 2 ou 3 casas decimais
  const precoFinal = Math.round(precoFinalCalculado * 1000) / 1000;

  return {
    precoBase: Math.round(precoBase * 1000) / 1000,
    precoFinal,
    descontoReais: Math.round(descontoReais * 1000) / 1000,
    descontoPercentual: Math.round(descontoPercentual * 10) / 10,
    temDesconto: true,
    motivoDesconto: bico.motivoDesconto,
  };
}

/**
 * Formata um preço por litro com 3 casas decimais (padrão bombas ANP) ou 2 casas
 */
export function formatarPrecoLitro(valor: number, casasDecimais: number = 2): string {
  if (isNaN(valor)) return 'R$ 0,00';
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  });
}
