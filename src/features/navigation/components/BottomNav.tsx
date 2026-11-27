import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { Area, AreaId } from '../domain/areas';
import { bottomBarAreas, catalogPages } from '../domain/workspaceAreas';
import { iconPaths } from './areaIcons';

const MORE_PATH = 'M5 12h.01M12 12h.01M19 12h.01';
const FOCUSABLE = 'a[href], button:not([disabled])';

function Icon({
  path,
  strokeWidth = 1.6,
}: {
  path: string | undefined;
  strokeWidth?: number;
}) {
  return (
    <svg
      className="operation-icon"
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

/**
 * PR-12 (D-078): barra inferior do celular. Quatro atalhos por perfil e "Mais", que abre uma folha
 * com as demais áreas. Só muda a apresentação: as áreas vêm de `workspaceAreas`, o endereço e a
 * permissão continuam os mesmos.
 */
export function BottomNav({
  areas,
  current,
  hrefFor,
  select,
}: {
  areas: Area[];
  current: AreaId;
  hrefFor: (area: AreaId) => string;
  select: (area: AreaId) => void;
}) {
  const sheetId = useId();
  const moreButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { bar, more } = bottomBarAreas(areas);
  const inMore = more.some(({ id }) => id === current);

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) moreButton.current?.focus();
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
    const fromSheet = open;
    // Ao trocar de área o foco vai para o conteúdo (App.tsx); na mesma área volta ao botão.
    close(fromSheet && id === current);
    select(id);
  }

  function trap(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [
      ...(sheet.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (
      event.shiftKey &&
      (active === first || !sheet.current?.contains(active))
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function link({ id, label }: Area) {
    return (
      <a
        key={id}
        href={hrefFor(id)}
        aria-label={label}
        aria-current={id === current ? 'page' : undefined}
        onClick={(event) => follow(event, id)}
      >
        <Icon path={iconPaths[id]} />
        <span>{label}</span>
      </a>
    );
  }

  const catalog = more.filter(({ id }) => Object.hasOwn(catalogPages, id));
  const settings = more.filter(({ id }) => id.startsWith('config-'));
  const operations = more.filter(
    ({ id }) => !Object.hasOwn(catalogPages, id) && !id.startsWith('config-'),
  );

  return (
    <>
      <nav className="mesa-bottom-nav" aria-label="Áreas da unidade">
        {bar.map(link)}
        {more.length > 0 && (
          <button
            ref={moreButton}
            type="button"
            className={inMore ? 'is-current' : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? sheetId : undefined}
            onClick={() => (open ? close(false) : setOpen(true))}
          >
            <Icon path={MORE_PATH} strokeWidth={3.2} />
            <span>Mais</span>
          </button>
        )}
      </nav>
      {open && (
        <>
          <div
            className="mesa-more-backdrop"
            aria-hidden="true"
            onClick={() => close(true)}
          />
          <div
            id={sheetId}
            ref={sheet}
            className="mesa-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Mais áreas"
            onKeyDown={trap}
          >
            <div className="mesa-more-head">
              <p className="mesa-nav-heading">Mais áreas</p>
              <button
                type="button"
                className="secondary"
                onClick={() => close(true)}
              >
                Fechar
              </button>
            </div>
            {operations.length > 0 && (
              <div className="mesa-more-group">{operations.map(link)}</div>
            )}
            {catalog.length > 0 && (
              <div className="mesa-more-group">
                <p className="mesa-nav-heading">Cadastros</p>
                {catalog.map(link)}
              </div>
            )}
            {settings.length > 0 && (
              <div className="mesa-more-group">
                <p className="mesa-nav-heading">Configurações</p>
                {settings.map(link)}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
