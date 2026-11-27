import type { ButtonHTMLAttributes } from 'react';

// Ícones de traço (24 × 24), sem texto: o nome vem do `label` (aria-label e dica ao passar o mouse).
const iconPaths = {
  ficha: 'M7 3h8l4 4v14H7zM14 3v5h5M10 13h6M10 17h6',
  movimentos: 'M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4',
  baixar: 'M12 4v11m-4-4 4 4 4-4M5 20h14',
  temperatura: 'M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0zM12 9v7',
  anular: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  local:
    'M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
} as const;
export type IconName = keyof typeof iconPaths;

/**
 * Botão de ação só com ícone. O nome acessível e a dica são o mesmo `label`; o alvo de toque tem 44 px
 * (ui.css). Não muda o que a ação faz: quem usa passa o mesmo `onClick` do botão com texto.
 */
export function IconAction({
  icon,
  label,
  className,
  risk = false,
  ...rest
}: {
  icon: IconName;
  label: string;
  /** Ação destrutiva: contorno vermelho, o mesmo nível "risk" dos botões com texto. */
  risk?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'>) {
  return (
    <button
      type="button"
      {...rest}
      className={`icon-action ${risk ? 'risk' : 'secondary'}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={iconPaths[icon]} />
      </svg>
    </button>
  );
}
