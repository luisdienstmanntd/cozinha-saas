// Código TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s) para testes: gera o que o aplicativo autenticador mostraria
// a partir da chave devolvida no cadastro. Só para dados sintéticos de teste.
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(text) {
  let bits = '';
  for (const char of text.replace(/=+$/, '').toUpperCase())
    bits += ALPHABET.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const hmac = createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}
