// Fatia 8.4d: validação de isolamento entre empresas e de sessões NO AMBIENTE HOSPEDADO DE TESTES.
//
// O que faz: entra com TRÊS contas fictícias (proprietário A, proprietário B, colaborador de A) e tenta,
// nos dois sentidos, ler, inserir, alterar e excluir dados da outra empresa; confere as restrições do
// colaborador; testa token adulterado, token sem sessão (logout) e, se pedido, expiração por inatividade.
//
// O que NÃO faz: nenhuma operação que grave dado de negócio. Só leituras e tentativas que DEVEM ser
// recusadas. Antes e depois, conta as linhas visíveis a cada conta e exige que nada tenha mudado.
//
// Salvaguardas (todas obrigatórias):
//  - O endereço é FIXO neste arquivo (projeto de testes). Não há variável nem opção para trocá-lo.
//  - Só aceita chave PUBLICÁVEL (sb_publishable_). Chave secreta / service_role é recusada.
//  - Só roda se cada conta enxergar exatamente a empresa fictícia esperada ("CozziGo Teste A" / "B").
//    Qualquer outra empresa visível = abortar antes de qualquer tentativa.
//  - E-mails e senhas ficam só na memória; senhas são digitadas sem eco. Nada disso, nem token, é impresso:
//    toda saída passa por `scrub`, que remove segredos conhecidos e tudo que pareça token ou chave.
//
// Uso (PowerShell, na pasta do repositório, com Node 24):
//   node scripts/hosted/validate-isolation.mjs [--wait-inactivity]
//   (pede: chave publicável, e-mail e senha de A, B e do colaborador)
// --wait-inactivity: acrescenta o teste de expiração por inatividade (espera ~31 minutos sem usar a sessão).
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createInterface } from 'node:readline';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const ALLOWED_PROJECT_REF = 'wtscafnacsmyfmqcaffy';
export const ORGANIZATION_NAMES = {
  A: 'CozziGo Teste A',
  B: 'CozziGo Teste B',
};
// Todas as tabelas do schema public (a lista é conferida por teste contra as migrações).
export const TABLES = [
  'batch_productions',
  'batch_receipts',
  'container_balances',
  'container_handlings',
  'containers',
  'entity_changes',
  'establishment_settings',
  'establishments',
  'handling_voids',
  'location_moves',
  'memberships',
  'occurrence_decisions',
  'occurrences',
  'organizations',
  'production_label_downloads',
  'production_temperatures',
  'production_voids',
  'products',
  'stock_movements',
  'storage_locations',
  'suppliers',
];
// Para cada tabela: uma linha com colunas VÁLIDAS (assim só a permissão ou a RLS podem barrar a tentativa,
// e não um erro de formato) e a coluna usada na tentativa de alteração.
const WRITE_TABLES = [
  'organizations',
  'establishments',
  'memberships',
  'products',
  'suppliers',
  'storage_locations',
  'batch_receipts',
  'stock_movements',
];
const UPDATE_COLUMN = {
  organizations: 'name',
  establishments: 'name',
  memberships: 'display_name',
  products: 'name',
  suppliers: 'name',
  storage_locations: 'name',
  batch_receipts: 'source_code',
  stock_movements: 'reason',
};
export function attemptRow(table, org, est) {
  const text = 'ZZ validação';
  switch (table) {
    case 'organizations':
      return { id: randomUUID(), name: text };
    case 'establishments':
      return {
        organization_id: org,
        name: text,
        timezone: 'America/Sao_Paulo',
      };
    case 'memberships':
      return { organization_id: org, user_id: randomUUID(), role: 'owner' };
    case 'products':
      return {
        organization_id: org,
        establishment_id: est,
        name: text,
        unit: 'kg',
      };
    case 'suppliers':
      return { organization_id: org, establishment_id: est, name: text };
    case 'storage_locations':
      return {
        organization_id: org,
        establishment_id: est,
        name: text,
        condition: 'ambient',
        intent_id: randomUUID(),
        created_by: randomUUID(),
      };
    default:
      return { organization_id: org, establishment_id: est };
  }
}
// Recusas esperadas de quem não pode escrever (colaborador, no piloto) ou não pertence à empresa.
const DENIED = '42501';

const SECRET_SHAPES = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]*)?/g,
  /sb_(publishable|secret)_[A-Za-z0-9_-]+/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
];

// Remove segredos conhecidos e qualquer coisa com cara de token, chave ou e-mail.
export function scrub(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets)
    if (secret && String(secret).length >= 4)
      out = out.split(String(secret)).join('[oculto]');
  for (const shape of SECRET_SHAPES) out = out.replace(shape, '[oculto]');
  return out.slice(0, 300);
}

export function hostedUrl(allowedRef = ALLOWED_PROJECT_REF) {
  return `https://${allowedRef}.supabase.co`;
}

// O destino é fixo. `testOrigin` só existe para os testes automáticos contra o Supabase local descartável;
// a linha de comando nunca o define.
export function assertTarget({ publishableKey, testOrigin }) {
  if (
    typeof publishableKey !== 'string' ||
    !publishableKey.startsWith('sb_publishable_') ||
    publishableKey.length < 20
  )
    throw new Error('Use somente a chave PUBLICÁVEL (sb_publishable_...).');
  if (/secret|service_role/i.test(publishableKey))
    throw new Error('Chave secreta recusada.');
  const url = testOrigin ?? hostedUrl();
  if (testOrigin && testOrigin !== 'http://127.0.0.1:54321')
    throw new Error('Destino de teste inválido.');
  return url;
}

// Adultera um token de três formas; nenhuma delas pode ser aceita pelo servidor.
export function tamperToken(token, mode) {
  const [header, payload, signature = ''] = token.split('.');
  const json = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  if (mode === 'signature') {
    const last = signature.slice(-1) === 'A' ? 'B' : 'A';
    return `${header}.${payload}.${signature.slice(0, -1)}${last}`;
  }
  if (mode === 'subject') {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return `${header}.${json({ ...claims, sub: randomUUID() })}.${signature}`;
  }
  if (mode === 'none')
    return `${json({ alg: 'none', typ: 'JWT' })}.${payload}.`;
  throw new Error('modo desconhecido');
}

// Cada conta deve ver exatamente uma empresa, a esperada.
export function expectedOrganization(rows, expectedName) {
  return (
    Array.isArray(rows) &&
    rows.length === 1 &&
    rows[0].name === expectedName &&
    typeof rows[0].id === 'string'
  );
}

export function diffSnapshots(before, after) {
  return Object.keys(before).filter((key) => before[key] !== after[key]);
}

// "Recusado" = erro de permissão, ou nenhuma linha devolvida. Nunca linhas.
export function isDenied(result) {
  const { data, error, status } = result;
  if (error)
    return (
      error.code === DENIED ||
      status === 401 ||
      status === 403 ||
      /permission denied|row-level security/i.test(error.message ?? '')
    );
  return data === null || (Array.isArray(data) && data.length === 0);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    process.stdout.write(question);
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}
function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

class Report {
  constructor(secrets) {
    this.secrets = secrets;
    this.lines = [];
    this.failures = 0;
  }
  ok(name) {
    this.lines.push(`OK    ${name}`);
  }
  fail(name, detail = '') {
    this.failures += 1;
    this.lines.push(
      `FALHA ${name}${detail ? ` — ${scrub(detail, this.secrets)}` : ''}`,
    );
  }
  check(name, condition, detail) {
    if (condition) this.ok(name);
    else this.fail(name, detail);
  }
}

const rid = () => randomUUID();

function deniedAttempts(org, est, otherUser) {
  const base = { p_organization_id: org, p_establishment_id: est };
  return [
    [
      'receive_batch',
      {
        ...base,
        p_product_id: rid(),
        p_supplier_id: rid(),
        p_source_code: 'ZZ-VALIDACAO',
        p_quantity: 1,
        p_expiry_date: '2030-01-01',
        p_expiry_origin: 'responsible',
        p_original_expiry_date: null,
        p_storage_condition: 'ambient',
        p_temperature_status: 'not_applicable',
        p_received_temperature_c: null,
        p_temperature_reason: null,
        p_intent_id: rid(),
      },
    ],
    [
      'record_movement',
      {
        ...base,
        p_batch_id: rid(),
        p_kind: 'discard',
        p_quantity: 1,
        p_reason: 'validação',
        p_intent_id: rid(),
      },
    ],
    [
      'create_storage_location',
      {
        ...base,
        p_name: 'ZZ validação',
        p_condition: 'ambient',
        p_intent_id: rid(),
      },
    ],
    [
      'set_establishment_settings',
      {
        ...base,
        p_production_registrar: 'owner',
        p_production_window_minutes: 60,
        p_unlabeled_limit_minutes: 60,
        p_portion_expiry_rule: 'same_or_less',
      },
    ],
    [
      'set_member_display_name',
      {
        p_organization_id: org,
        p_user_id: otherUser,
        p_display_name: 'ZZ validação',
      },
    ],
  ];
}

async function snapshot(client) {
  const counts = {};
  for (const table of TABLES) {
    const { count, error } = await client
      .from(table)
      .select('*', { count: 'exact', head: true });
    counts[table] = error ? `erro:${error.code ?? error.status}` : count;
  }
  return counts;
}

async function rawGet(url, key, token, path) {
  const response = await globalThis.fetch(`${url}${path}`, {
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

// Executa a validação. `accounts` = { A, B, C } com { email, password }.
export async function runValidation({
  publishableKey,
  accounts,
  waitInactivity = false,
  testOrigin,
  log = () => {},
  inactivityMinutes = 31,
}) {
  const url = assertTarget({ publishableKey, testOrigin });
  const secrets = [
    publishableKey,
    ...Object.values(accounts).flatMap((a) => [a.email, a.password]),
  ];
  const report = new Report(secrets);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const newClient = () => createClient(url, publishableKey, options);

  // 1) Entrar e conferir que cada conta enxerga só a empresa fictícia esperada. Qualquer outra coisa aborta.
  const who = {};
  for (const [label, expectedName] of [
    ['A', ORGANIZATION_NAMES.A],
    ['B', ORGANIZATION_NAMES.B],
    ['C', ORGANIZATION_NAMES.A],
  ]) {
    const client = newClient();
    const { data, error } = await client.auth.signInWithPassword(
      accounts[label],
    );
    if (error || !data.session)
      throw new Error(`Não foi possível entrar com a conta ${label}.`);
    const organizations = await client.from('organizations').select('id,name');
    if (!expectedOrganization(organizations.data, expectedName))
      throw new Error(
        `A conta ${label} não vê exatamente a empresa fictícia esperada. Nada foi tentado.`,
      );
    const establishments = await client
      .from('establishments')
      .select('id,organization_id');
    who[label] = {
      client,
      token: data.session.access_token,
      userId: data.user.id,
      org: organizations.data[0].id,
      est: establishments.data?.[0]?.id ?? rid(),
    };
  }
  report.check(
    'as três contas entram e cada uma vê só a empresa fictícia esperada',
    who.A.org !== who.B.org && who.A.org === who.C.org,
    'empresas inesperadas',
  );

  // 2) Fotografia antes.
  const before = {};
  for (const label of ['A', 'B', 'C'])
    before[label] = await snapshot(who[label].client);

  const snapshotErrors = Object.entries(before).flatMap(([label, counts]) =>
    Object.entries(counts)
      .filter(([, value]) => String(value).startsWith('erro'))
      .map(([table]) => `${label}:${table}`),
  );
  report.check(
    'todas as tabelas esperadas existem e são legíveis pelas contas',
    snapshotErrors.length === 0,
    snapshotErrors.join(', '),
  );

  // 3) Nos dois sentidos (A->B, B->A) e o colaborador de A contra B.
  const directions = [
    ['A', 'B', 'proprietário A contra empresa B'],
    ['B', 'A', 'proprietário B contra empresa A'],
    ['C', 'B', 'colaborador de A contra empresa B'],
  ];
  for (const [from, to, title] of directions) {
    const x = who[from];
    const y = who[to];
    const foreign = [];
    for (const table of TABLES) {
      const key = table === 'organizations' ? 'id' : 'organization_id';
      const { data, error } = await x.client
        .from(table)
        .select('*')
        .eq(key, y.org);
      if (error || (data?.length ?? 0) > 0) foreign.push(table);
    }
    report.check(
      `${title}: leitura de qualquer tabela devolve 0 linhas da outra empresa`,
      foreign.length === 0,
      `tabelas: ${foreign.join(', ')}`,
    );
    const leaks = [];
    for (const table of TABLES) {
      const key = table === 'organizations' ? 'id' : 'organization_id';
      const { data, error } = await x.client.from(table).select(key);
      if (error || (data ?? []).some((row) => row[key] !== x.org))
        leaks.push(table);
    }
    report.check(
      `${title}: leitura sem filtro só traz a própria empresa`,
      leaks.length === 0,
      `tabelas: ${leaks.join(', ')}`,
    );
    const embedded = await x.client
      .from('organizations')
      .select(
        'id,establishments(organization_id),memberships(organization_id)',
      );
    const rows = embedded.data ?? [];
    report.check(
      `${title}: leitura com junção não alcança a outra empresa`,
      !embedded.error &&
        rows.length === 1 &&
        rows[0].id === x.org &&
        rows[0].establishments.every((e) => e.organization_id === x.org) &&
        rows[0].memberships.every((m) => m.organization_id === x.org),
      'junção devolveu dado de outra empresa',
    );
    const writes = [];
    for (const table of WRITE_TABLES) {
      const inserted = await x.client
        .from(table)
        .insert(attemptRow(table, y.org, y.est))
        .select();
      const updated = await x.client
        .from(table)
        .update({ [UPDATE_COLUMN[table]]: 'ZZ validação' })
        .eq(table === 'organizations' ? 'id' : 'organization_id', y.org)
        .select();
      const removed = await x.client
        .from(table)
        .delete()
        .eq(table === 'organizations' ? 'id' : 'organization_id', y.org)
        .select();
      for (const [kind, result] of [
        ['inserir', inserted],
        ['alterar', updated],
        ['excluir', removed],
      ])
        if (!isDenied(result)) writes.push(`${kind} ${table}`);
    }
    report.check(
      `${title}: inserir, alterar e excluir diretamente na outra empresa é recusado`,
      writes.length === 0,
      writes.join('; '),
    );
    const rpc = [];
    for (const [name, args] of deniedAttempts(y.org, y.est, y.userId)) {
      const result = await x.client.rpc(name, args);
      if (!result.error || result.error.code !== DENIED) rpc.push(name);
    }
    report.check(
      `${title}: funções de escrita com dados da outra empresa respondem acesso negado`,
      rpc.length === 0,
      `funções: ${rpc.join(', ')}`,
    );
  }

  // 4) Colaborador: no piloto só o proprietário escreve, também na própria empresa.
  const own = [];
  for (const [name, args] of deniedAttempts(
    who.C.org,
    who.C.est,
    who.A.userId,
  )) {
    const result = await who.C.client.rpc(name, args);
    if (!result.error || result.error.code !== DENIED) own.push(name);
  }
  report.check(
    'colaborador: escritas na própria empresa respondem acesso negado (piloto: só o proprietário escreve)',
    own.length === 0,
    `funções: ${own.join(', ')}`,
  );
  const direct = [];
  for (const table of WRITE_TABLES) {
    const attempt = await who.C.client
      .from(table)
      .insert(attemptRow(table, who.C.org, who.C.est))
      .select();
    if (!isDenied(attempt)) direct.push(table);
  }
  report.check(
    'colaborador: inserção direta nas tabelas da própria empresa é recusada',
    direct.length === 0,
    direct.join(', '),
  );
  const mine = await who.C.client.from('organizations').select('id');
  report.check(
    'colaborador: lê a própria empresa',
    !mine.error && mine.data?.length === 1 && mine.data[0].id === who.A.org,
    'leitura própria falhou',
  );

  // 5) Sessões e tokens.
  const anonymous = newClient();
  const anonymousFailures = [];
  for (const table of [
    'organizations',
    'establishments',
    'memberships',
    'batch_receipts',
    'containers',
    'stock_movements',
  ]) {
    const result = await anonymous.from(table).select('*');
    if (!isDenied(result) || (result.data?.length ?? 0) > 0)
      anonymousFailures.push(table);
  }
  report.check(
    'sem login: nenhuma tabela é lida',
    anonymousFailures.length === 0,
    anonymousFailures.join(', '),
  );
  for (const [mode, label] of [
    ['signature', 'assinatura alterada'],
    ['subject', 'usuário trocado no token'],
    ['none', 'token sem assinatura (alg none)'],
  ]) {
    const response = await rawGet(
      url,
      publishableKey,
      tamperToken(who.A.token, mode),
      '/rest/v1/organizations?select=id',
    );
    report.check(
      `token adulterado (${label}) é recusado`,
      response.status === 401 || response.status === 403,
      `status ${response.status}`,
    );
  }
  const valid = await rawGet(
    url,
    publishableKey,
    who.A.token,
    '/rest/v1/organizations?select=id',
  );
  report.check(
    'controle: o token verdadeiro funciona',
    valid.status === 200 && valid.body?.length === 1,
    `status ${valid.status}`,
  );

  // Logout: sessão nova de A; copiar o token; Sair; o token copiado e o refresh token deixam de valer.
  const logoutClient = newClient();
  const login = await logoutClient.auth.signInWithPassword(accounts.A);
  const copied = login.data?.session?.access_token;
  const refresh = login.data?.session?.refresh_token;
  const before1 = await rawGet(
    url,
    publishableKey,
    copied,
    '/rest/v1/organizations?select=id',
  );
  await logoutClient.auth.signOut({ scope: 'local' });
  const after1 = await rawGet(
    url,
    publishableKey,
    copied,
    '/rest/v1/organizations?select=id',
  );
  report.check(
    'Sair: o token copiado antes do Sair deixa de valer na hora (401)',
    before1.status === 200 && after1.status === 401,
    `antes ${before1.status}, depois ${after1.status}`,
  );
  report.check(
    'Sair: a recusa traz o código SESSION_EXPIRED do banco',
    after1.body?.code === 'SESSION_EXPIRED',
    `código ${scrub(after1.body?.code ?? 'ausente', secrets)}`,
  );
  const refreshed = await newClient().auth.refreshSession({
    refresh_token: refresh,
  });
  report.check(
    'Sair: o refresh token não renova mais a sessão',
    Boolean(refreshed.error) || !refreshed.data?.session,
    'a sessão foi renovada depois do Sair',
  );

  // 6) Fotografia depois: nada pode ter mudado.
  const changed = [];
  for (const label of ['A', 'B', 'C']) {
    const after = await snapshot(who[label].client);
    for (const table of diffSnapshots(before[label], after))
      changed.push(`${label}:${table}`);
  }
  report.check(
    'nada foi gravado: as contagens de linhas antes e depois são idênticas',
    changed.length === 0,
    changed.join(', '),
  );

  // 7) Inatividade (opcional, lenta): a sessão não é usada durante a espera.
  if (waitInactivity) {
    const idle = newClient();
    const idleLogin = await idle.auth.signInWithPassword(accounts.C);
    const idleToken = idleLogin.data?.session?.access_token;
    log(`Aguardando ${inactivityMinutes} minutos sem usar a sessão...`);
    for (let minute = 0; minute < inactivityMinutes; minute += 1) {
      await sleep(60_000);
      if (minute % 5 === 4) log(`  ${minute + 1} minutos`);
    }
    const stale = await rawGet(
      url,
      publishableKey,
      idleToken,
      '/rest/v1/organizations?select=id',
    );
    report.check(
      'inatividade de 30 minutos: a sessão parada é recusada (401 SESSION_EXPIRED)',
      stale.status === 401 && stale.body?.code === 'SESSION_EXPIRED',
      `status ${stale.status}`,
    );
  } else {
    report.lines.push(
      'PULOU inatividade de 30 minutos (rode com --wait-inactivity; leva cerca de 31 minutos)',
    );
  }

  for (const label of ['A', 'B', 'C']) await who[label].client.auth.signOut();
  return report;
}

async function main() {
  const waitInactivity = process.argv.includes('--wait-inactivity');
  const publishableKey =
    process.env.VALIDATE_SUPABASE_PUBLISHABLE_KEY ??
    (await ask('Chave publicável (sb_publishable_...): '));
  const accounts = {};
  for (const [label, text] of [
    ['A', 'proprietário A'],
    ['B', 'proprietário B'],
    ['C', 'colaborador de A'],
  ]) {
    const email =
      process.env[`VALIDATE_${label}_EMAIL`] ??
      (await ask(`E-mail do ${text}: `));
    const password =
      process.env[`VALIDATE_${label}_PASSWORD`] ??
      (await askHidden(`Senha do ${text} (não aparece): `));
    accounts[label] = { email, password };
  }
  const report = await runValidation({
    publishableKey,
    accounts,
    waitInactivity,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(`${report.lines.join('\n')}\n`);
  process.stdout.write(
    report.failures === 0
      ? '\nResultado: nenhuma falha. Nenhum dado foi gravado.\n'
      : `\nResultado: ${report.failures} falha(s). Não siga adiante sem revisar.\n`,
  );
  process.exit(report.failures === 0 ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    const known = [process.env.VALIDATE_SUPABASE_PUBLISHABLE_KEY];
    process.stderr.write(`Interrompido: ${scrub(error.message, known)}\n`);
    process.exit(2);
  });
}
