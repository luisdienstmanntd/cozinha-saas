import {
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useCompactLayout } from '../../../shared/ui/useCompactLayout';
import logo from '../../../shared/ui/brand/cozzigo.webp';
import mark from '../../../shared/ui/brand/cozzigo-mark.webp';
import type { Area, AreaId } from '../domain/areas';
import { catalogPages } from '../domain/workspaceAreas';

const iconPaths: Partial<Record<AreaId, string>> = {
  'visao-geral': 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  validade:
    'M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 10 2 2 4-4',
  receber:
    'M4 11h5l2 3h2l2-3h5m-16 0 3-6h10l3 6v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z',
  producao:
    'M5 12h14v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zm-2 2h2m14 0h2M8 8V5m4 3V3m4 5V5',
  etiquetas: 'M3 4h8l10 10-7 7L3 10zm4 3h.01',
  locais: 'm12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5',
  produtos: 'M4 5h16v14H4zM9 5v5h6V5',
  fornecedores: 'M3 6h11v11H3zM14 10h4l3 3v4h-7m-8 0v2m12-2v2',
  preparacoes: 'M6 4h12v16H6zM9 8h6m-6 4h6m-6 4h4',
  'config-unidade': 'M4 11l8-7 8 7v9H4zM9 20v-6h6v6',
  'config-organizacao':
    'M5 21V4h14v17M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-5h4v5',
};
export function OperationsNav({
  areas,
  current,
  hrefFor,
  select,
  unitName,
}: {
  areas: Area[];
  current: AreaId;
  hrefFor: (area: AreaId) => string;
  select: (area: AreaId) => void;
  unitName: string;
}) {
  const menuId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(false);
  const [compact, setCompact] = useState(false);
  const mobileLayout = useCompactLayout();
  const compactSidebar = compact && !mobileLayout;
  const [openGroups, setOpenGroups] = useState({
    catalog: true,
    settings: true,
  });

  function follow(event: MouseEvent<HTMLAnchorElement>, id: AreaId) {
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
    setMobile(false);
    select(id);
  }

  function links(items: Area[]) {
    return items.map(({ id, label }) => (
      <a
        key={id}
        href={hrefFor(id)}
        aria-label={label}
        title={label}
        aria-current={id === current ? 'page' : undefined}
        onClick={(event) => follow(event, id)}
      >
        <svg
          className="operation-icon"
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
          <path d={iconPaths[id]} />
        </svg>
        <span className="operation-nav-label">{label}</span>
      </a>
    ));
  }

  function group(
    label: string,
    key: keyof typeof openGroups,
    children: ReactNode,
  ) {
    return (
      <div className="operation-nav-group">
        <button
          type="button"
          className="operation-group-toggle"
          aria-expanded={openGroups[key]}
          onClick={() =>
            setOpenGroups({ ...openGroups, [key]: !openGroups[key] })
          }
        >
          {label}
          <span aria-hidden="true">{openGroups[key] ? '−' : '+'}</span>
        </button>
        <div
          className="operation-subnav"
          hidden={!compactSidebar && !openGroups[key]}
        >
          {children}
        </div>
      </div>
    );
  }

  const catalog = areas.filter(({ id }) => Object.hasOwn(catalogPages, id));
  const settings = areas.filter(({ id }) => id.startsWith('config-'));
  const operations = areas.filter(
    ({ id }) =>
      !Object.hasOwn(catalogPages, id) &&
      !id.startsWith('config-') &&
      id !== 'visao-geral',
  );

  return (
    <>
      <button
        className="secondary mesa-mobile-menu"
        type="button"
        aria-label="Menu"
        aria-expanded={mobile}
        ref={menuButton}
        aria-controls={menuId}
        onClick={() => {
          if (!mobile && window.scrollY > 0) window.scrollTo({ top: 0 });
          setMobile(!mobile);
        }}
      >
        ☰ Menu
      </button>
      <aside
        id={menuId}
        className={`mesa-sidebar${mobile ? ' mobile-open' : ''}${compactSidebar ? ' is-compact' : ''}`}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !mobile) return;
          setMobile(false);
          menuButton.current?.focus();
        }}
      >
        <div className="mesa-nav-brand">
          <img src={compactSidebar ? mark : logo} alt="CozziGo" />
          <button
            type="button"
            className="mesa-collapse"
            aria-label={compact ? 'Expandir menu' : 'Recolher menu'}
            onClick={() => setCompact(!compact)}
          >
            {compact ? '›' : '‹'}
          </button>
        </div>
        <nav aria-label="Áreas da unidade">
          <div>
            <p className="mesa-nav-heading">Principal</p>
            {links(areas.filter(({ id }) => id === 'visao-geral'))}
          </div>
          <div>
            <p className="mesa-nav-heading">Operação</p>
            {links(operations)}
          </div>
          <div>
            <p className="mesa-nav-heading">Administração</p>
            {catalog.length > 0 &&
              group('Cadastros', 'catalog', links(catalog))}
            {group('Configurações', 'settings', links(settings))}
          </div>
        </nav>
        <p className="mesa-nav-unit">{unitName}</p>
      </aside>
    </>
  );
}
