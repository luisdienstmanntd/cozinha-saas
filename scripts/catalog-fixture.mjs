import { randomUUID } from 'node:crypto';
import { checked, localSupabase } from './local-supabase.mjs';

export async function withCatalogFixture(run) {
  const { admin, client } = localSupabase();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const orgIds = [orgA, orgB];
  const scopeA = { organization_id: orgA, establishment_id: randomUUID() };
  const scopeA2 = { organization_id: orgA, establishment_id: randomUUID() };
  const scopeB = { organization_id: orgB, establishment_id: randomUUID() };
  const users = [];
  try {
    checked(
      await admin.from('organizations').insert([
        { id: orgA, name: 'Empresa de teste A' },
        { id: orgB, name: 'Empresa de teste B' },
      ]),
    );
    checked(
      await admin.from('establishments').insert([
        {
          id: scopeA.establishment_id,
          organization_id: orgA,
          name: 'Cozinha principal',
          timezone: 'America/Sao_Paulo',
        },
        {
          id: scopeA2.establishment_id,
          organization_id: orgA,
          name: 'Cozinha auxiliar',
          timezone: 'America/Sao_Paulo',
        },
        {
          id: scopeB.establishment_id,
          organization_id: orgB,
          name: 'Cozinha de outra empresa',
          timezone: 'UTC',
        },
      ]),
    );
    for (const [organization_id, role] of [
      [orgA, 'owner'],
      [orgB, 'owner'],
      [orgA, 'member'],
    ]) {
      const email = `catalog-${randomUUID()}@example.test`;
      const password = randomUUID();
      const { user } = checked(
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
      );
      users.push({ id: user.id, email, password });
      checked(
        await admin
          .from('memberships')
          .insert({ organization_id, user_id: user.id, role }),
      );
    }
    await run({ admin, client, users, scopeA, scopeA2, scopeB });
  } finally {
    await cleanupCatalogFixture(admin, orgIds, users);
  }
}

// Recebimentos, recipientes e movimentos são append-only para todos os papéis (Fase 6.0a, P5), e
// a auditoria de cadastros também (Fase 6.0c): a limpeza não apaga histórico nem os usuários e
// cadastros que ele referencia. Cada execução usa
// organizações, unidades e e-mails aleatórios, então dados deixados por um teste não aparecem em
// outro. Para começar de um banco vazio localmente: npm run db:reset (a CI parte de banco novo).
async function cleanupCatalogFixture(admin, orgIds, users) {
  for (const table of [
    'batch_receipts',
    'containers',
    'stock_movements',
    'entity_changes',
    // Locais (6.9): service_role só lê; locais e eventos de local ficam, como o histórico.
    'storage_locations',
    'location_moves',
  ]) {
    const result = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .in('organization_id', orgIds);
    checked(result);
    if (result.count !== 0) return;
  }
  for (const table of [
    'products',
    'suppliers',
    'memberships',
    'establishments',
  ]) {
    checked(await admin.from(table).delete().in('organization_id', orgIds));
  }
  checked(await admin.from('organizations').delete().in('id', orgIds));
  for (const { id } of users) checked(await admin.auth.admin.deleteUser(id));
}
