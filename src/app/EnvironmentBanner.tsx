// Aviso permanente do ambiente hospedado. Em testes, deixa claro que só dados fictícios podem ser usados
// (o repositório e o ambiente de testes não são lugar de dado real de ninguém).
export function EnvironmentBanner({
  environmentName,
}: {
  environmentName?: 'testes' | 'producao';
}) {
  if (environmentName !== 'testes') return null;
  return (
    <p className="environment-banner" role="note">
      <strong>Ambiente de testes.</strong> Use somente dados fictícios. Este
      banco pode ser zerado a qualquer momento.
    </p>
  );
}
