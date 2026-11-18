import { parseOfficialOrigin } from '../../../shared/config/environment';

// Fatia 8.4b: endereço que vai no QR da etiqueta. No ambiente hospedado é o endereço oficial
// configurado (VITE_APP_URL), já validado de forma estrita; no local e na demonstração continua
// sendo o endereço da página. Fica aqui, e não em cada tela, para que todo gerador de PDF use a
// mesma regra e para que um host não autorizado nunca chegue ao QR.
const LOCAL_ORIGINS = ['http://127.0.0.1:5173', 'http://127.0.0.1:5174'];

let official: string | null = null;

export function setOfficialOrigin(value: string | null) {
  official = value === null ? null : parseOfficialOrigin(value);
}

export function isHostedLabels(): boolean {
  return official !== null;
}

export function labelOrigin(): string {
  return official ?? window.location.origin;
}

export function isAuthorizedOrigin(origin: string): boolean {
  return (
    LOCAL_ORIGINS.includes(origin) || (official !== null && origin === official)
  );
}
