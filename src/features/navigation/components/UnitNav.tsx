import type { Area, AreaId } from '../domain/areas';

const areaPaths: Record<AreaId, string> = {
  validade:
    'M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 10 2 2 4-4',
  receber:
    'M4 11h5l2 3h2l2-3h5m-16 0 3-6h10l3 6v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z',
  producao:
    'M5 12h14v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zm-2 2h2m14 0h2M8 8V5m4 3V3m4 5V5',
  locais:
    'M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 0 1 14 0Zm-5 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  cadastros:
    'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 5h6m-6 3h6m-6 3h4',
};

/**
 * Navegação da unidade (V1): menu lateral no desktop e barra inferior no celular (CSS). São links
 * com endereço próprio (`?unidade=…&area=…`), então abrir em nova aba, voltar e recarregar funcionam.
 */
export function UnitNav({
  areas,
  current,
  hrefFor,
  onSelect,
}: {
  areas: Area[];
  current: AreaId;
  hrefFor: (area: AreaId) => string;
  onSelect: (area: AreaId) => void;
}) {
  return (
    <nav aria-label="Áreas da unidade" className="unit-nav">
      <span className="unit-nav-brand">CozziGo</span>
      <ul>
        {areas.map((area) => (
          <li key={area.id}>
            <a
              href={hrefFor(area.id)}
              aria-current={area.id === current ? 'page' : undefined}
              onClick={(event) => {
                // Clique com tecla modificadora segue o comportamento normal do navegador.
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                onSelect(area.id);
              }}
            >
              <svg
                aria-hidden="true"
                focusable="false"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={areaPaths[area.id]} />
              </svg>
              {area.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
