// Cabeçalhos de segurança do Cloudflare Pages (arquivo `_headers`). O aplicativo não usa scripts nem
// estilos em linha, nem frames, workers ou fontes externas: a política é restrita a isso. A única origem
// externa permitida é o projeto Supabase configurado (API e Auth).
export function contentSecurityPolicy(supabaseOrigin: string) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin}`,
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function headersFile(supabaseOrigin: string) {
  return [
    '/*',
    `  Content-Security-Policy: ${contentSecurityPolicy(supabaseOrigin)}`,
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Cross-Origin-Resource-Policy: same-origin',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}
