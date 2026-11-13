// Short list of IANA zones used in Brazil. Kept free of imports so the
// integration test can verify each entry against PostgreSQL directly.
// The database trigger (pg_timezone_names) remains the authority.
export const brazilTimezones = [
  { id: 'America/Sao_Paulo', label: 'Brasília — SP, RJ, MG, Sul, GO e DF' },
  { id: 'America/Bahia', label: 'Bahia' },
  { id: 'America/Fortaleza', label: 'Fortaleza — CE, RN, PB, PI e MA' },
  { id: 'America/Recife', label: 'Recife — PE' },
  { id: 'America/Maceio', label: 'Maceió — AL e SE' },
  { id: 'America/Belem', label: 'Belém — PA (leste) e AP' },
  { id: 'America/Santarem', label: 'Santarém — PA (oeste)' },
  { id: 'America/Araguaina', label: 'Araguaína — TO' },
  { id: 'America/Noronha', label: 'Fernando de Noronha' },
  { id: 'America/Manaus', label: 'Manaus — AM (leste)' },
  { id: 'America/Cuiaba', label: 'Cuiabá — MT' },
  { id: 'America/Campo_Grande', label: 'Campo Grande — MS' },
  { id: 'America/Porto_Velho', label: 'Porto Velho — RO' },
  { id: 'America/Boa_Vista', label: 'Boa Vista — RR' },
  { id: 'America/Rio_Branco', label: 'Rio Branco — AC' },
  { id: 'America/Eirunepe', label: 'Eirunepé — AM (oeste)' },
] as const;

export const defaultTimezone = 'America/Sao_Paulo';
