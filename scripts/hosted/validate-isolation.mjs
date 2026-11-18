// Fatia 8.4d: validação de isolamento entre empresas e de sessões NO AMBIENTE HOSPEDADO DE TESTES.
//
// O que faz: entra com TRÊS contas fictícias (proprietário A, proprietário B, colaborador de A) e tenta,
// nos dois sentidos, ler, inserir, alterar e excluir dados da outra empresa; confere as restrições do
// colaborador; testa token adulterado, token sem sessão (logout) e, se pedido, expiração por inatividade.
//
// O que NÃO faz: nenhuma operação que grave dado de negócio. Só leituras e tentativas que DEVEM ser
// recusadas. Antes e depois, fotografa o CONTEÚDO de todas as tabelas visíveis a cada conta (contagem e
// resumo criptográfico de cada linha) e exige que nada tenha mudado, mesmo que a contagem fique igual.
//
// Salvaguardas (todas obrigatórias):
//  - O endereço é FIXO neste arquivo (projeto de testes). Não há variável nem opção para trocá-lo.
//  - Só aceita chave PUBLICÁVEL (sb_publishable_). Chave secreta / service_role é recusada.
//  - Só roda se as três contas tiverem exatamente os papéis, vínculos e unidades esperados (A e B proprietários,
//    colaborador de A, cada um com uma única empresa e uma única unidade fictícias). Qualquer divergência
//    = abortar antes de qualquer tentativa.
//  - Ao primeiro acesso indevido bem-sucedido, ou a uma recusa por motivo diferente de permissão (formato,
//    referência inexistente), os testes de escrita PARAM na hora.
//  - Toda sessão aberta pelo script é encerrada (logout local) em `finally`, mesmo com exceção.
//  - E-mails e senhas ficam só na memória; senhas são digitadas sem eco. Nada disso, nem token, é impresso:
//    toda saída passa por `scrub`, que remove segredos conhecidos e tudo que pareça token ou chave.
//
// Uso (PowerShell, na pasta do repositório, com Node 24):
//   node scripts/hosted/validate-isolation.mjs [--wait-inactivity]
//   (pede: chave publicável, e-mail e senha de A, B e do colaborador; nada vem de variável de ambiente)
// --wait-inactivity: acrescenta o teste de expiração por inatividade (espera ~31 minutos sem usar a sessão).
import { createHash, randomUUID } from 'node:crypto';
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
export const UNIT_NAMES = {
  A: 'Unidade Teste A',
  B: 'Unidade Teste B',
};
// Papel esperado de cada conta na sua empresa (colaborador = "member").
export const EXPECTED_ROLES = { A: 'owner', B: 'owner', C: 'member' };

// Tabelas em que as tentativas de escrita são feitas. Cada tentativa usa uma linha com TODAS as colunas
// obrigatórias e valores válidos: só a permissão ou a RLS podem barrá-la. Um erro de formato ou de
// referência (que não seja 42501) NÃO conta como recusa: é "inconclusivo" e interrompe a validação.
export const WRITE_TABLES = [
  'organizations',
  'establishments',
  'memberships',
  'products',
  'suppliers',
  'storage_locations',
  'batch_receipts',
  'stock_movements',
];
export const UPDATE_COLUMN = {
  organizations: 'name',
  establishments: 'name',
  memberships: 'display_name',
  products: 'name',
  suppliers: 'name',
  storage_locations: 'name',
  batch_receipts: 'source_code',
  stock_movements: 'reason',
};
const ORG_KEY = (table) =>
  table === 'organizations' ? 'id' : 'organization_id';

// ctx = { org, est, actor (id de quem tenta), other (id de um usuário da empresa alvo),
//         refs: { product, supplier, batch } (ids reais da própria empresa de quem tenta, quando existem) }
export function attemptRow(table, ctx) {
  const text = 'ZZ validação';
  const { org, est, actor, refs } = ctx;
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
      // tentativa de se promover a proprietário da empresa alvo
      return { organization_id: org, user_id: actor, role: 'owner' };
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
        created_by: actor,
      };
    case 'batch_receipts':
      return {
        organization_id: org,
        establishment_id: est,
        product_id: refs.product,
        supplier_id: refs.supplier,
        intent_id: randomUUID(),
        source_code: 'ZZ-VALIDACAO',
        quantity: 1,
        unit: 'kg',
        expiry_date: '2030-01-01',
        expiry_origin: 'responsible',
        original_expiry_date: null,
        timezone: 'America/Sao_Paulo',
        created_by: actor,
      };
    case 'stock_movements':
      return {
        organization_id: org,
        establishment_id: est,
        batch_id: refs.batch,
        intent_id: randomUUID(),
        kind: 'discard',
        quantity: 1,
        reason: text,
        timezone: 'America/Sao_Paulo',
        created_by: actor,
      };
    default:
      throw new Error(`tabela sem payload de escrita: ${table}`);
  }
}

// Recusa esperada de quem não pode escrever (colaborador, no piloto) ou não pertence à empresa.
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

// Adultera um token de três formas e CONFERE que os bytes realmente mudaram (trocar só o último caractere
// da assinatura em base64url pode não mudar nenhum byte, pois os bits finais são de preenchimento).
export function tamperToken(token, mode) {
  const [header, payload, signature = ''] = String(token).split('.');
  if (!header || !payload) throw new Error('token inválido');
  const json = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  let changed;
  if (mode === 'signature') {
    const bytes = Buffer.from(signature, 'base64url');
    if (bytes.length < 16) throw new Error('assinatura ausente ou curta');
    const altered = Buffer.from(bytes);
    altered[0] ^= 0xff;
    altered[altered.length - 1] ^= 0xff;
    if (Buffer.compare(bytes, altered) === 0)
      throw new Error('a adulteração não alterou a assinatura');
    changed = `${header}.${payload}.${altered.toString('base64url')}`;
  } else if (mode === 'subject') {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    changed = `${header}.${json({ ...claims, sub: randomUUID() })}.${signature}`;
  } else if (mode === 'none') {
    changed = `${json({ alg: 'none', typ: 'JWT' })}.${payload}.`;
  } else {
    throw new Error('modo desconhecido');
  }
  const [h2, p2, s2 = ''] = changed.split('.');
  const bytesDiffer =
    Buffer.compare(
      Buffer.from(signature, 'base64url'),
      Buffer.from(s2, 'base64url'),
    ) !== 0 ||
    Buffer.compare(
      Buffer.from(payload, 'base64url'),
      Buffer.from(p2, 'base64url'),
    ) !== 0 ||
    Buffer.compare(
      Buffer.from(header, 'base64url'),
      Buffer.from(h2, 'base64url'),
    ) !== 0;
  if (!bytesDiffer) throw new Error('a adulteração não alterou o token');
  return changed;
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

// Papéis, vínculos e unidades de uma conta. Devolve a lista de divergências (vazia = tudo certo).
export function accountProblems({
  label,
  userId,
  organizations,
  establishments,
  memberships,
}) {
  const problems = [];
  const orgName = label === 'B' ? ORGANIZATION_NAMES.B : ORGANIZATION_NAMES.A;
  const unitName = label === 'B' ? UNIT_NAMES.B : UNIT_NAMES.A;
  if (!expectedOrganization(organizations, orgName))
    problems.push(
      `a conta ${label} não vê exatamente a empresa fictícia esperada`,
    );
  const orgId = organizations?.[0]?.id;
  if (
    !Array.isArray(establishments) ||
    establishments.length !== 1 ||
    establishments[0].name !== unitName ||
    establishments[0].organization_id !== orgId
  )
    problems.push(
      `a conta ${label} não vê exatamente a unidade fictícia esperada`,
    );
  const own = (memberships ?? []).filter((row) => row.user_id === userId);
  if (
    own.length !== 1 ||
    own[0].organization_id !== orgId ||
    own[0].role !== EXPECTED_ROLES[label] ||
    own[0].revoked_at !== null
  )
    problems.push(
      `a conta ${label} não tem o vínculo ativo esperado (papel ${EXPECTED_ROLES[label]})`,
    );
  if ((memberships ?? []).some((row) => row.organization_id !== orgId))
    problems.push(`a conta ${label} enxerga vínculo de outra empresa`);
  return problems;
}

// Forma canônica (chaves ordenadas) para que o resumo de uma linha não dependa da ordem das colunas.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value ?? null);
}

// Contagem + resumo SHA-256 do conjunto de linhas (cada linha resumida e depois ordenada, então a ordem
// de leitura não importa). Qualquer coluna alterada, linha trocada ou apagada+inserida muda o resumo.
export function digestRows(rows) {
  const hashes = rows
    .map((row) => createHash('sha256').update(canonical(row)).digest('hex'))
    .sort();
  return {
    count: rows.length,
    digest: createHash('sha256').update(hashes.join('\n')).digest('hex'),
  };
}

// Compara duas fotografias { tabela: {count, digest} | {error} } e diz o que mudou.
export function diffSnapshots(before, after) {
  const changes = [];
  for (const key of Object.keys(before)) {
    const a = before[key];
    const b = after[key];
    if (a?.error || b?.error) {
      if (a?.error !== b?.error) changes.push(`${key} (leitura)`);
    } else if (a?.count !== b?.count) changes.push(`${key} (contagem)`);
    else if (a?.digest !== b?.digest) changes.push(`${key} (conteúdo)`);
  }
  return changes;
}

// Leitura recusada = erro de permissão, ou nenhuma linha devolvida. Nunca linhas.
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

// Escrita: "acesso negado" (42501) é recusa. Alterar/excluir também pode ser recusado em silêncio pela RLS
// (nenhum erro, mas ZERO linhas afetadas, conferido pela contagem do servidor). Qualquer linha afetada,
// qualquer inserção aceita ou qualquer outro erro (formato, coluna, referência) não prova nada e interrompe.
export function classifyWrite(result, { zeroRowsIsDenied = false } = {}) {
  const { error, count } = result;
  if (!error) return zeroRowsIsDenied && count === 0 ? 'denied' : 'accepted';
  return error.code === DENIED ? 'denied' : 'inconclusive';
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
    this.stopped = false;
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
    return Boolean(condition);
  }
  note(line) {
    this.lines.push(line);
  }
}

class ValidationAbort extends Error {}

const rid = () => randomUUID();

export function deniedAttempts({ org, est, other, refs }) {
  const base = { p_organization_id: org, p_establishment_id: est };
  return [
    [
      'receive_batch',
      {
        ...base,
        p_product_id: refs.product,
        p_supplier_id: refs.supplier,
        p_source_code: 'ZZ-VALIDACAO',
        p_quantity: 1,
        p_expiry_date: '2030-01-01',
        p_expiry_origin: 'responsible',
        p_original_expiry_date: null,
        p_storage_condition: 'ambient',
        p_temperature_status: 'not_required',
        p_received_temperature_c: null,
        p_temperature_reason: null,
        p_intent_id: rid(),
      },
    ],
    [
      'record_movement',
      {
        ...base,
        p_batch_id: refs.batch,
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
        p_portion_expiry_rule: 'equal',
      },
    ],
    [
      'set_member_display_name',
      {
        p_organization_id: org,
        p_user_id: other,
        p_display_name: 'ZZ validação',
      },
    ],
  ];
}

// Fotografia de CONTEÚDO: todas as linhas que a conta enxerga em cada tabela (até 1000 por tabela).
async function snapshot(client) {
  const result = {};
  for (const table of TABLES) {
    const { data, count, error } = await client
      .from(table)
      .select('*', { count: 'exact' })
      .range(0, 999);
    if (error) result[table] = { error: `erro:${error.code ?? error.status}` };
    else if (count !== data.length) result[table] = { error: 'erro:grande' };
    else result[table] = digestRows(data);
  }
  return result;
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

// Tentativas diretas de escrita (inserir, alterar, excluir) numa tabela. Pára no primeiro resultado que não
// seja "acesso negado" para não causar mais dano; devolve null se tudo foi negado.
export async function directWrites(client, table, ctx) {
  const attempts = [
    [
      'inserir',
      () => client.from(table).insert(attemptRow(table, ctx)).select(),
      false,
    ],
    [
      'alterar',
      () =>
        client
          .from(table)
          .update(
            { [UPDATE_COLUMN[table]]: 'ZZ validação' },
            { count: 'exact' },
          )
          .eq(ORG_KEY(table), ctx.org)
          .select(),
      true,
    ],
    [
      'excluir',
      () =>
        client
          .from(table)
          .delete({ count: 'exact' })
          .eq(ORG_KEY(table), ctx.org)
          .select(),
      true,
    ],
  ];
  for (const [kind, run, silent] of attempts) {
    const result = await run();
    const verdict = classifyWrite(result, { zeroRowsIsDenied: silent });
    if (verdict !== 'denied') return `${kind} ${table}: ${verdict}`;
    // Recusa silenciosa sobre tabela sem linhas na empresa alvo não prova a RLS: fica registrada.
    if (silent && !result.error && ctx.targetRows?.[table] === 0)
      ctx.vacuous?.push(`${kind} ${table}`);
  }
  return null;
}

export async function rpcAttempts(client, ctx) {
  for (const [name, args] of deniedAttempts(ctx)) {
    const result = await client.rpc(name, args);
    const verdict = classifyWrite(result);
    if (verdict !== 'denied') return `${name}: ${verdict}`;
  }
  return null;
}

// Executa a validação. `accounts` = { A, B, C } com { email, password }.
// `betweenSnapshots` existe só para testes automáticos (exige `testOrigin`): roda entre as duas fotografias
// para provar que a comparação de conteúdo acusa alterações que não mudam a contagem.
export async function runValidation({
  publishableKey,
  accounts,
  waitInactivity = false,
  testOrigin,
  log = () => {},
  inactivityMinutes = 31,
  betweenSnapshots,
}) {
  const url = assertTarget({ publishableKey, testOrigin });
  if (betweenSnapshots && !testOrigin)
    throw new Error('Gancho de teste proibido no ambiente hospedado.');
  const secrets = [
    publishableKey,
    ...Object.values(accounts).flatMap((a) => [a.email, a.password]),
  ];
  const report = new Report(secrets);
  const emit = (line) => log(scrub(line, secrets));
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const clients = [];
  const newClient = () => {
    const client = createClient(url, publishableKey, options);
    clients.push(client);
    return client;
  };
  const remember = (session) => {
    if (session?.access_token) secrets.push(session.access_token);
    if (session?.refresh_token) secrets.push(session.refresh_token);
  };

  try {
    // 1) Entrar e conferir papéis, vínculos e unidades. Qualquer divergência aborta antes de qualquer tentativa.
    const who = {};
    for (const label of ['A', 'B', 'C']) {
      const client = newClient();
      const { data, error } = await client.auth.signInWithPassword(
        accounts[label],
      );
      if (error || !data.session)
        throw new ValidationAbort(
          `Não foi possível entrar com a conta ${label}. Nada foi tentado.`,
        );
      remember(data.session);
      const organizations = await client
        .from('organizations')
        .select('id,name');
      const establishments = await client
        .from('establishments')
        .select('id,name,organization_id');
      const memberships = await client
        .from('memberships')
        .select('organization_id,user_id,role,revoked_at');
      const problems = accountProblems({
        label,
        userId: data.user.id,
        organizations: organizations.data,
        establishments: establishments.data,
        memberships: memberships.data,
      });
      if (organizations.error || establishments.error || memberships.error)
        problems.push(
          `a conta ${label} não conseguiu ler empresa, unidade ou vínculo`,
        );
      if (problems.length > 0)
        throw new ValidationAbort(`${problems.join('; ')}. Nada foi tentado.`);
      const read = async (table) => {
        const { data: rows } = await client.from(table).select('id').limit(1);
        return rows?.[0]?.id ?? rid();
      };
      who[label] = {
        client,
        token: data.session.access_token,
        userId: data.user.id,
        org: organizations.data[0].id,
        est: establishments.data[0].id,
        refs: {
          product: await read('products'),
          supplier: await read('suppliers'),
          batch: await read('batch_receipts'),
        },
      };
    }
    if (
      !report.check(
        'papéis, vínculos e unidades das três contas conferem (A e B proprietários, colaborador de A)',
        who.A.org !== who.B.org &&
          who.A.org === who.C.org &&
          who.A.est !== who.B.est &&
          new Set([who.A.userId, who.B.userId, who.C.userId]).size === 3,
        'empresas ou usuários inesperados',
      )
    )
      throw new ValidationAbort('Contas inconsistentes. Nada foi tentado.');

    // 2) Fotografia de conteúdo antes.
    const before = {};
    for (const label of ['A', 'B', 'C'])
      before[label] = await snapshot(who[label].client);
    const snapshotErrors = Object.entries(before).flatMap(([label, tables]) =>
      Object.entries(tables)
        .filter(([, value]) => value.error)
        .map(([table, value]) => `${label}:${table}:${value.error}`),
    );
    if (
      !report.check(
        'todas as tabelas esperadas existem e são legíveis pelas contas',
        snapshotErrors.length === 0,
        snapshotErrors.join(', '),
      )
    )
      throw new ValidationAbort(
        'Verificação inicial falhou. Nenhuma tentativa de escrita foi feita.',
      );
    const emptyEverywhere = TABLES.filter((table) =>
      ['A', 'B', 'C'].every((label) => before[label][table].count === 0),
    );
    if (emptyEverywhere.length > 0)
      report.note(
        `AVISO tabelas vazias para as três contas (leitura cruzada não prova isolamento por dados nelas): ${emptyEverywhere.join(', ')}`,
      );

    // 3) Leituras nos dois sentidos (A->B, B->A) e do colaborador de A contra B.
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
        const { data, error } = await x.client
          .from(table)
          .select('*')
          .eq(ORG_KEY(table), y.org);
        if (error || (data?.length ?? 0) > 0) foreign.push(table);
      }
      const leaks = [];
      for (const table of TABLES) {
        const key = ORG_KEY(table);
        const { data, error } = await x.client.from(table).select(key);
        if (error || (data ?? []).some((row) => row[key] !== x.org))
          leaks.push(table);
      }
      const embedded = await x.client
        .from('organizations')
        .select(
          'id,establishments(organization_id),memberships(organization_id)',
        );
      const rows = embedded.data ?? [];
      const results = [
        report.check(
          `${title}: leitura de qualquer tabela devolve 0 linhas da outra empresa`,
          foreign.length === 0,
          `tabelas: ${foreign.join(', ')}`,
        ),
        report.check(
          `${title}: leitura sem filtro só traz a própria empresa`,
          leaks.length === 0,
          `tabelas: ${leaks.join(', ')}`,
        ),
        report.check(
          `${title}: leitura com junção não alcança a outra empresa`,
          !embedded.error &&
            rows.length === 1 &&
            rows[0].id === x.org &&
            rows[0].establishments.every((e) => e.organization_id === x.org) &&
            rows[0].memberships.every((m) => m.organization_id === x.org),
          'junção devolveu dado de outra empresa',
        ),
      ];
      if (results.includes(false)) report.stopped = true;
    }
    if (report.stopped)
      report.note(
        'INTERROMPIDO acesso indevido de leitura detectado: nenhuma tentativa de escrita foi feita.',
      );

    // 4) Escritas que devem ser recusadas. Parar NA HORA diante de qualquer resultado diferente de "acesso negado".
    const stopAt = (title, found) => {
      report.fail(`${title}: tentativa não foi recusada por permissão`, found);
      report.note(
        'INTERROMPIDO os testes de escrita seguintes não foram executados.',
      );
      report.stopped = true;
    };
    const vacuous = [];
    for (const [from, to, title] of directions) {
      if (report.stopped) break;
      const x = who[from];
      const y = who[to];
      const ctx = {
        org: y.org,
        est: y.est,
        actor: x.userId,
        other: y.userId,
        refs: x.refs,
        targetRows: Object.fromEntries(
          TABLES.map((table) => [table, before[to][table].count]),
        ),
        vacuous,
      };
      let found = null;
      for (const table of WRITE_TABLES) {
        found = await directWrites(x.client, table, ctx);
        if (found) break;
      }
      if (found) {
        stopAt(`${title}: escrita direta`, found);
        break;
      }
      report.ok(
        `${title}: inserir, alterar e excluir diretamente na outra empresa é recusado (acesso negado)`,
      );
      found = await rpcAttempts(x.client, ctx);
      if (found) {
        stopAt(`${title}: funções de escrita`, found);
        break;
      }
      report.ok(
        `${title}: funções de escrita com dados da outra empresa respondem acesso negado`,
      );
    }

    // 5) Colaborador: no piloto só o proprietário escreve, também na própria empresa (referências reais).
    if (!report.stopped) {
      const c = who.C;
      const ctx = {
        org: c.org,
        est: c.est,
        actor: c.userId,
        other: who.A.userId,
        refs: c.refs,
        targetRows: Object.fromEntries(
          TABLES.map((table) => [table, before.C[table].count]),
        ),
        vacuous,
      };
      let found = await rpcAttempts(c.client, ctx);
      if (found) stopAt('colaborador: funções na própria empresa', found);
      else {
        report.ok(
          'colaborador: escritas por função na própria empresa respondem acesso negado (piloto: só o proprietário escreve)',
        );
        for (const table of WRITE_TABLES) {
          found = await directWrites(c.client, table, ctx);
          if (found) break;
        }
        if (found)
          stopAt('colaborador: escrita direta na própria empresa', found);
        else
          report.ok(
            'colaborador: inserir, alterar e excluir diretamente na própria empresa é recusado',
          );
      }
      if (!report.stopped) {
        const mine = await who.C.client.from('organizations').select('id');
        report.check(
          'colaborador: lê a própria empresa',
          !mine.error &&
            mine.data?.length === 1 &&
            mine.data[0].id === who.A.org,
          'leitura própria falhou',
        );
      }
    }

    if (vacuous.length > 0)
      report.note(
        `AVISO alterar/excluir recusados em silêncio sobre tabelas SEM linhas na empresa alvo (a recusa de inserir é a prova nelas): ${[...new Set(vacuous)].join(', ')}`,
      );

    // 6) Sessões e tokens (somente leitura). Pulados se algo já foi interrompido.
    if (!report.stopped) {
      const anonymous = newClient();
      const anonymousFailures = [];
      for (const table of TABLES) {
        const result = await anonymous.from(table).select('*');
        if (!isDenied(result) || (result.data?.length ?? 0) > 0)
          anonymousFailures.push(table);
      }
      report.check(
        `sem login: nenhuma das ${TABLES.length} tabelas é lida`,
        anonymousFailures.length === 0,
        anonymousFailures.join(', '),
      );
      for (const [mode, label] of [
        ['signature', 'assinatura alterada'],
        ['subject', 'usuário trocado no token'],
        ['none', 'token sem assinatura (alg none)'],
      ]) {
        const tampered = tamperToken(who.A.token, mode);
        const response = await rawGet(
          url,
          publishableKey,
          tampered,
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
      remember(login.data?.session);
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
      const refreshing = newClient();
      const refreshed = await refreshing.auth.refreshSession({
        refresh_token: refresh,
      });
      remember(refreshed.data?.session);
      report.check(
        'Sair: o refresh token não renova mais a sessão',
        Boolean(refreshed.error) || !refreshed.data?.session,
        'a sessão foi renovada depois do Sair',
      );
    } else {
      report.note(
        'PULOU testes de sessão e token: validação interrompida antes.',
      );
    }

    if (betweenSnapshots) await betweenSnapshots({ who });

    // 7) Fotografia de conteúdo depois: nada pode ter mudado, nem em conteúdo com a mesma contagem.
    const changed = [];
    for (const label of ['A', 'B', 'C']) {
      const after = await snapshot(who[label].client);
      for (const change of diffSnapshots(before[label], after))
        changed.push(`${label}:${change}`);
    }
    report.check(
      'nada foi gravado: contagem e conteúdo de todas as linhas visíveis são idênticos antes e depois',
      changed.length === 0,
      changed.join(', '),
    );

    // 8) Inatividade (opcional, lenta): a sessão não é usada durante a espera.
    if (waitInactivity && !report.stopped) {
      const idle = newClient();
      const idleLogin = await idle.auth.signInWithPassword(accounts.C);
      remember(idleLogin.data?.session);
      const idleToken = idleLogin.data?.session?.access_token;
      emit(`Aguardando ${inactivityMinutes} minutos sem usar a sessão...`);
      for (let minute = 0; minute < inactivityMinutes; minute += 1) {
        await sleep(60_000);
        if (minute % 5 === 4) emit(`  ${minute + 1} minutos`);
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
      report.note(
        'PULOU inatividade de 30 minutos (rode com --wait-inactivity; leva cerca de 31 minutos)',
      );
    }
    return report;
  } catch (error) {
    if (error instanceof ValidationAbort) {
      report.fail(error.message);
      report.aborted = true;
      return report;
    }
    // Nunca propagar a exceção original (mensagem, pilha ou causa podem ter e-mail, senha ou token).
    // eslint-disable-next-line preserve-caught-error -- a causa original pode conter segredos; de propósito não é anexada
    throw new Error(scrub(error?.message, secrets));
  } finally {
    // Encerra toda sessão aberta por este script, mesmo com exceção (só a sessão local de cada cliente).
    for (const client of clients) {
      try {
        await client.auth.signOut({ scope: 'local' });
      } catch {
        // melhor esforço
      }
    }
  }
}

const knownSecrets = [];
function fatal(error) {
  process.stderr.write(
    `Interrompido: ${scrub(error?.message, knownSecrets)}\n`,
  );
  process.exit(2);
}

async function main() {
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);
  const waitInactivity = process.argv.includes('--wait-inactivity');
  const publishableKey = await ask('Chave publicável (sb_publishable_...): ');
  knownSecrets.push(publishableKey);
  const accounts = {};
  for (const [label, text] of [
    ['A', 'proprietário A'],
    ['B', 'proprietário B'],
    ['C', 'colaborador de A'],
  ]) {
    const email = await ask(`E-mail do ${text}: `);
    knownSecrets.push(email);
    const password = await askHidden(`Senha do ${text} (não aparece): `);
    knownSecrets.push(password);
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
  main().catch(fatal);
}
