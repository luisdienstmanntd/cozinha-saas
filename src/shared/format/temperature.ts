// V5B (D-064): temperatura digitada com vírgula ou ponto, para o recebimento e para a produção.
// Só troca a vírgula decimal pelo ponto que o esquema de sempre exige. Não valida nem limita: faixa
// (-50 a 80 °C) e uma casa decimal continuam sendo conferidas pelo esquema de cada tela, sem nenhum limite
// sanitário novo. Mais de um separador, ou vírgula e ponto juntos, ficam como foram digitados e são
// recusados por esse esquema.
export function toDotTemperature(raw: string): string {
  const text = raw.trim();
  return /^[^.,]*,[^.,]*$/.test(text) ? text.replace(',', '.') : text;
}
