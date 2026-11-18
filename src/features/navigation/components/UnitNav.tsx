import type { Area, AreaId } from '../domain/areas';

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
              {area.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
