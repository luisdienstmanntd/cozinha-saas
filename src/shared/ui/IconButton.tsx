import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: 'edit' | 'delete';
};
export function IconButton({ label, icon, className = '', ...props }: Props) {
  return (
    <button
      {...props}
      type="button"
      className={`secondary ui-icon-button ${className}`.trim()}
      aria-label={label}
      title={label}
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon === 'edit' ? (
          <>
            <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z" />
          </>
        ) : (
          <>
            <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
          </>
        )}
      </svg>
    </button>
  );
}
