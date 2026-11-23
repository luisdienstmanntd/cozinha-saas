import type { MouseEvent } from 'react';
import type { AreaId } from '../../navigation/domain/areas';

// Links para as áreas da unidade (V1): endereço próprio e troca de área sem recarregar.
export type AreaLinks = {
  hrefFor: (area: AreaId) => string;
  onSelect: (area: AreaId) => void;
};

export function AreaLink({
  area,
  links,
  children,
}: {
  area: AreaId;
  links: AreaLinks | undefined;
  children: string;
}) {
  if (!links) return <strong>{children}</strong>;
  return (
    <a
      href={links.hrefFor(area)}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        // Tecla modificadora segue o comportamento normal do navegador (nova aba etc.).
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        links.onSelect(area);
      }}
    >
      {children}
    </a>
  );
}

/**
 * V4 (D1): unidade sem recipientes mostra um passo a passo curto. Só orienta: cada passo leva à área
 * certa, e quem cadastra e recebe continua sendo decidido pelo banco. O colaborador vê a versão sem
 * ações de cadastro.
 */
export function FirstSteps({
  owner,
  hasProducts,
  hasSuppliers,
  hasLocations,
  links,
}: {
  owner: boolean;
  hasProducts: boolean;
  hasSuppliers: boolean;
  hasLocations: boolean;
  links?: AreaLinks;
}) {
  if (!owner)
    return (
      <section aria-label="Primeiros passos" className="first-steps">
        <h5>Primeiros passos</h5>
        <p>
          Ainda não há recipientes com saldo nesta unidade. O proprietário
          cadastra produtos e fornecedores e registra os recebimentos; eles
          aparecem aqui com a validade.
        </p>
      </section>
    );
  const catalogDone = hasProducts && hasSuppliers;
  return (
    <section aria-label="Primeiros passos" className="first-steps">
      <h5>Primeiros passos</h5>
      <ol>
        <li>
          <AreaLink area="cadastros" links={links}>
            Cadastrar produtos e fornecedores
          </AreaLink>
          {catalogDone ? (
            <span className="step-done"> — feito</span>
          ) : (
            <>
              {' '}
              — {hasProducts ? 'falta fornecedor' : 'falta produto'}
              {!hasProducts && !hasSuppliers && ' e fornecedor'}
            </>
          )}
        </li>
        {hasLocations && (
          <li>
            <AreaLink area="locais" links={links}>
              Criar locais de armazenamento
            </AreaLink>{' '}
            (opcional: geladeira, freezer, estoque seco)
          </li>
        )}
        <li>
          <AreaLink area="receber" links={links}>
            Registrar o primeiro recebimento
          </AreaLink>
        </li>
      </ol>
      <p>
        Os recipientes recebidos aparecem aqui, do vencimento mais próximo para
        o mais distante.
      </p>
    </section>
  );
}
