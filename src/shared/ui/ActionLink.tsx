import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

type Props = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href' | 'onClick'
> & {
  href: string;
  /** Chamado só no clique simples; Ctrl/Meta/Shift/Alt e botões do meio seguem o comportamento do navegador. */
  onNavigate: () => void;
  children: ReactNode;
};

/**
 * PR-03 (M1): link de área com o mesmo tratamento de clique do menu lateral. O clique simples navega
 * dentro do app; Ctrl, Meta, Shift, Alt ou botão do meio deixam o navegador abrir em nova aba/janela.
 */
export function ActionLink({ href, onNavigate, children, ...rest }: Props) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.shiftKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onNavigate();
  }
  return (
    <a {...rest} href={href} onClick={follow}>
      {children}
    </a>
  );
}
