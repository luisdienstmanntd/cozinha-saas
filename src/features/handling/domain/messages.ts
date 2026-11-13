// Mensagens de recusa do banco que a tela repete ao usuário. Lista exata (nada de repassar texto
// desconhecido do servidor); um teste confere que cada uma existe nas migrações.
export const HANDLING_MESSAGES = [
  'Quantidade excede saldo registrado.',
  'Recipiente sem saldo registrado.',
  'Quantidade inválida.',
  'Informe o que acontece com a sobra.',
  'Não há sobra: as porções levam todo o saldo.',
  'Só a embalagem original fechada mantém a sobra na origem; inclua a sobra como porção ou descarte.',
  'A validade após abertura não pode passar da validade do recipiente de origem.',
  'A validade após abertura não pode ser anterior à data da manipulação nem à do registro.',
  'Recipiente de origem vencido na data da manipulação; manipular não recupera validade.',
  'O horário da manipulação não pode estar no futuro.',
  'O horário da manipulação não pode ser anterior ao do recipiente de origem.',
  'Manipulação registrada mais de 2 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
  'Justificativa de atraso só vale para manipulação registrada mais de 2 horas depois de feita.',
  'A pessoa que manipulou precisa ter vínculo ativo com a empresa.',
  'Defina o nome de exibição da pessoa que manipulou antes de registrar.',
  'Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.',
  'Recipiente bloqueado: ocorrência rejeitada pelo proprietário. Só o descarte é permitido.',
  'Algum recipiente desta manipulação já teve movimentação; a manipulação não pode ser anulada.',
  'Manipulação já anulada.',
] as const;

export function knownMessage(message: unknown): string | null {
  return typeof message === 'string' &&
    (HANDLING_MESSAGES as readonly string[]).includes(message)
    ? message
    : null;
}
