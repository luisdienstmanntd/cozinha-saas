import {
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useCompactLayout } from '../../../shared/ui/useCompactLayout';
import { BrandLogo } from '../../../shared/ui/brand/BrandLogo';
import type { Area, AreaId } from '../domain/areas';
import { catalogPages } from '../domain/workspaceAreas';
import { BottomNav } from './BottomNav';
import { iconPaths } from './areaIcons';

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
    catalog: Object.hasOwn(catalogPages, current),
    settings: current.startsWith('config-'),
  });

  const [groupPage, setGroupPage] = useState(current);
  if (groupPage !== current) {
    setGroupPage(current);
    setOpenGroups({
      catalog: Object.hasOwn(catalogPages, current),
      settings: current.startsWith('config-'),
    });
  }

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

  // PR-12 (D-078): no celular e no tablet em pé (≤ 899 px) o menu vira barra inferior com "Mais".
  if (mobileLayout)
    return (
      <BottomNav
        areas={areas}
        current={current}
        hrefFor={hrefFor}
        select={select}
      />
    );

  const catalog = areas.filter(({ id }) => Object.hasOwn(catalogPages, id));
  const settings = areas.filter(({ id }) => id.startsWith('config-'));
  const operations = areas.filter(
    ({ id }) =>
      !Object.hasOwn(catalogPages, id) &&
      !id.startsWith('config-') &&
      id !== 'visao-geral' &&
      id !== 'indicadores',
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
        onKeyDown={(event) => {
          // Com o foco no próprio botão, o Escape não passa pelo menu: fecha aqui também.
          if (event.key !== 'Escape' || !mobile) return;
          setMobile(false);
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
          <BrandLogo variant={compactSidebar ? 'mark' : 'full'} />
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
            {links(
              areas.filter(
                ({ id }) => id === 'visao-geral' || id === 'indicadores',
              ),
            )}
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
