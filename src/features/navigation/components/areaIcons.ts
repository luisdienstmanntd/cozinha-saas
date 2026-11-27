import type { AreaId } from '../domain/areas';

export const iconPaths: Partial<Record<AreaId, string>> = {
  'visao-geral': 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  indicadores: 'M4 20V10m6 10V4m6 16v-7m4 7H3',
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
  'config-equipe':
    'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1m7-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74',
  'config-organizacao':
    'M5 21V4h14v17M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-5h4v5',
  'config-conta': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0z',
};
