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
    for (const table of [
      'containers',
      'batch_receipts',
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
}
