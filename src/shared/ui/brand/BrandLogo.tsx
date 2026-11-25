import { useState } from 'react';
// D-075: o logo vai embutido no próprio pacote (data URL), sem depender de um segundo download.
// Se mesmo assim a imagem não decodificar, aparece o nome escrito, nunca uma caixa vazia.
import logo from './cozzigo.webp?inline';
import mark from './cozzigo-mark.webp?inline';

export function BrandLogo({
  variant = 'full',
  alt = 'CozziGo',
  className,
  size,
}: {
  variant?: 'full' | 'mark';
  /** Texto alternativo; vazio quando o nome já aparece ao lado (imagem decorativa). */
  alt?: string;
  className?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span
        className={`brand-fallback${variant === 'mark' ? ' is-mark' : ''}${className ? ` ${className}` : ''}`}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        {variant === 'mark' ? 'C' : 'CozziGo'}
      </span>
    );
  return (
    <img
      className={className}
      src={variant === 'mark' ? mark : logo}
      alt={alt}
      width={size}
      height={size}
      onError={() => setFailed(true)}
    />
  );
}
