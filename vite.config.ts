import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { assertBuildEnvironment } from './src/shared/config/buildGuard';
import { headersFile } from './src/shared/security/headers';

// Fatia 8.4a: em build hospedado, valida a configuração (interrompe se faltar ou estiver errada) e gera o
// arquivo `_headers` do Cloudflare Pages com a política de segurança restrita ao projeto Supabase.
function hostedBuild(env: Record<string, string>): Plugin {
  const result = assertBuildEnvironment(env);
  return {
    name: 'cozinha-hosted-build',
    apply: 'build',
    generateBundle() {
      if (!result.hosted) return;
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: headersFile(result.supabaseUrl),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), hostedBuild(loadEnv(mode, process.cwd(), ''))],
}));
