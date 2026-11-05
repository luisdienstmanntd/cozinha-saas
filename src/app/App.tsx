import { DemoHome } from '../features/demo/components/DemoHome';
import { parseEnvironment } from '../shared/config/environment';

export function App({
  environment = import.meta.env,
}: {
  environment?: Record<string, unknown>;
}) {
  try {
    parseEnvironment(environment);
  } catch {
    return (
      <main className="page configuration-error">
        <h1>Não foi possível iniciar a demonstração</h1>
        <p role="alert">
          Configuração inválida. VITE_APP_MODE deve ser demo nesta fase.
        </p>
      </main>
    );
  }
  return <DemoHome />;
}
