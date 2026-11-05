export function acknowledgeDemo(acknowledged: boolean) {
  return acknowledged
    ? {
        accepted: true,
        message: 'Escopo confirmado. Explore as etapas previstas abaixo.',
      }
    : {
        accepted: false,
        message: 'Confirme que esta demonstração não salva dados.',
      };
}
