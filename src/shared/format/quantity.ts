// V5 (M5, D-063): quantidades digitadas com vírgula ou ponto decimal.
// Só converte, na tela, o texto digitado para a forma com ponto que os esquemas e o banco já usam; não
// arredonda nem muda precisão, limite ou regra de unidade inteira. Os esquemas de domínio (batch,
// handling, production) e as funções do banco ficam como estavam e continuam decidindo depois.
// Regras explícitas:
// 1. Espaços nas pontas são ignorados; espaço no meio, sinal ou letra são recusados.
// 2. No máximo UM separador. Vírgula e ponto juntos (1.000,50 ou 1,000.50) ou separador repetido
//    (1.000.000) são recusados: não há separador de milhar.
// 3. Vírgula é sempre decimal (padrão brasileiro): 1,5 = 1,500 = um e meio.
// 4. Ponto é decimal, salvo quando é seguido de exatamente três dígitos e a parte inteira não é zero
//    (1.500, 2.000): pode ser milhar no costume brasileiro ou decimal no americano. É recusado como
//    ambíguo; 0.250 e 1.25 não são ambíguos e são aceitos.

export type QuantityProblem = 'empty' | 'format' | 'grouping' | 'ambiguous';
export type QuantityParse =
  { ok: true; value: string } | { ok: false; problem: QuantityProblem };

export function parseQuantity(raw: string): QuantityParse {
  const text = raw.trim();
  if (!text) return { ok: false, problem: 'empty' };
  if ((text.match(/[.,]/g) ?? []).length > 1)
    return { ok: false, problem: 'grouping' };
  const match = /^(\d+)(?:([.,])(\d+))?$/.exec(text);
  if (!match) return { ok: false, problem: 'format' };
  const [, whole, separator, fraction] = match as unknown as [
    string,
    string,
    string | undefined,
    string | undefined,
  ];
  if (separator === '.' && fraction?.length === 3 && !/^0+$/.test(whole))
    return { ok: false, problem: 'ambiguous' };
  return { ok: true, value: fraction ? `${whole}.${fraction}` : whole };
}

// Texto digitado na forma com ponto que os esquemas de sempre e o banco recebem; nulo quando a regra
// acima recusa. Quem chama trata nulo como quantidade inválida (os esquemas continuam valendo depois).
export function toDotQuantity(raw: string): string | null {
  const parsed = parseQuantity(raw);
  return parsed.ok ? parsed.value : null;
}

// Texto com ponto (como volta de parseQuantity) ou número do banco, mostrado com vírgula, sem milhar.
export function formatQuantity(value: string | number): string {
  return String(value).replace('.', ',');
}

export const QUANTITY_HINT =
  'Use vírgula ou ponto para decimais, por exemplo 0,5. Não use separador de milhar.';

// Mensagem própria para as recusas da regra acima; nulo quando a tela deve usar a sua mensagem de sempre.
export function quantityProblemText(raw: string): string | null {
  const parsed = parseQuantity(raw);
  if (parsed.ok) return null;
  if (parsed.problem === 'grouping')
    return 'Quantidade com mais de um separador: não use separador de milhar. Escreva, por exemplo, 1500 ou 1500,5.';
  if (parsed.problem === 'ambiguous')
    return `Quantidade ambígua: "${raw.trim()}" pode ser milhar ou decimal. Para decimais use vírgula (por exemplo 1,5); para milhar escreva sem separador (por exemplo 1500).`;
  return null;
}
