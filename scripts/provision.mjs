// Fase 6, fatia 6.10: provisionamento de uma empresa piloto (empresa, unidades, proprietário e membros
// com nome de exibição). Só contra o Supabase LOCAL descartável: qualquer outro destino é recusado
// (D-006: nenhum deploy ou dado em ambiente hospedado sem autorização de luis). Senhas temporárias vão
// só para o arquivo de credenciais (modo 0600), nunca para a saída do terminal.
//
// Uso:  node scripts/provision.mjs plano.json --credentials-out credenciais.json
// Plano (JSON): { "organization": "Nome", "establishments": [{ "name": "Cozinha", "timezone": "America/Sao_Paulo" }],
//   "owner": { "email": "...", "displayName": "Ana" }, "members": [{ "email": "...", "displayName": "Bia" }] }
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { checked, localSupabase } from './local-supabase.mjs';

const visible = (value) => value.trim();
const nameSchema = z
  .string()
  .transform(visible)
  .pipe(z.string().min(1).max(40));
const personSchema = z.object({
  email: z.email().max(254),
  displayName: nameSchema,
});
export const planSchema = z
  .object({
    organization: z.string().transform(visible).pipe(z.string().min(1).max(80)),
    establishments: z
      .array(
        z.object({
          name: z.string().transform(visible).pipe(z.string().min(1).max(80)),
          timezone: z.string().min(1).max(64),
        }),
      )
      .min(1)
      .max(10),
    owner: personSchema,
    members: z.array(personSchema).max(50).default([]),
  })
  .superRefine((plan, context) => {
    const emails = [plan.owner, ...plan.members].map((p) =>
      p.email.toLowerCase(),
    );
    if (new Set(emails).size !== emails.length)
      context.addIssue({
        code: 'custom',
        message: 'E-mails repetidos no plano.',
      });
    const names = plan.establishments.map((e) => e.name.toLowerCase());
    if (new Set(names).size !== names.length)
      context.addIssue({
        code: 'custom',
        message: 'Unidades com o mesmo nome.',
      });
  });

// Senha temporária forte e aleatória; a pessoa a troca no primeiro acesso (depende da configuração de
// autenticação hospedada, ver docs/PRE_PILOTO.md, P4).
const temporaryPassword = () => `${randomBytes(18).toString('base64url')}aA1`;

// Cria tudo ou nada: se algo falhar no meio, desfaz o que criou (a empresa recém-criada ainda não tem
// histórico). Devolve ids e credenciais; quem chama decide onde gravar as senhas.
export async function provision({ admin, client }, rawPlan) {
  const plan = planSchema.parse(rawPlan);
  const existing = checked(
    await admin
      .from('organizations')
      .select('id')
      .eq('name', plan.organization),
  );
  if (existing.length > 0)
    throw new Error('Já existe uma empresa com este nome; nada foi alterado.');

  const created = { users: [], organizationId: null };
  try {
    const organizationId = randomUUID();
    checked(
      await admin
        .from('organizations')
        .insert({ id: organizationId, name: plan.organization }),
    );
    created.organizationId = organizationId;
    const establishments = checked(
      await admin
        .from('establishments')
        .insert(
          plan.establishments.map((e) => ({
            organization_id: organizationId,
            name: e.name,
            timezone: e.timezone,
          })),
        )
        .select('id,name'),
    );
    const people = [
      { ...plan.owner, role: 'owner' },
      ...plan.members.map((m) => ({ ...m, role: 'member' })),
    ];
    const credentials = [];
    for (const person of people) {
      const password = temporaryPassword();
      const { user } = checked(
        await admin.auth.admin.createUser({
          email: person.email,
          password,
          email_confirm: true,
        }),
      );
      created.users.push(user.id);
      checked(
        await admin.from('memberships').insert({
          organization_id: organizationId,
          user_id: user.id,
          role: person.role,
        }),
      );
      person.userId = user.id;
      credentials.push({
        email: person.email,
        role: person.role,
        temporaryPassword: password,
      });
    }
    // Nomes de exibição pela função real, como proprietário (fica auditado em entity_changes).
    const owner = client();
    checked(
      await owner.auth.signInWithPassword({
        email: plan.owner.email,
        password: credentials[0].temporaryPassword,
      }),
    );
    for (const person of people)
      checked(
        await owner.rpc('set_member_display_name', {
          p_organization_id: organizationId,
          p_user_id: person.userId,
          p_display_name: person.displayName,
        }),
      );
    return {
      organizationId,
      establishments,
      users: people.map((p) => ({ userId: p.userId, role: p.role })),
      credentials,
    };
  } catch (cause) {
    await undo(admin, created);
    throw cause;
  }
}

// Desfaz o que foi criado. Se o nome de exibição chegou a ser gravado, a auditoria (append-only) impede
// apagar a empresa: nesse caso nada é removido e o erro avisa para tratar à mão.
async function undo(admin, created) {
  if (!created.organizationId) return;
  const audit = await admin
    .from('entity_changes')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', created.organizationId);
  if (audit.error || audit.count !== 0) return;
  await admin
    .from('memberships')
    .delete()
    .eq('organization_id', created.organizationId);
  await admin
    .from('establishments')
    .delete()
    .eq('organization_id', created.organizationId);
  await admin.from('organizations').delete().eq('id', created.organizationId);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
}

async function main(argv) {
  const [planPath, flag, outPath] = argv;
  if (!planPath || flag !== '--credentials-out' || !outPath)
    throw new Error(
      'Uso: node scripts/provision.mjs plano.json --credentials-out credenciais.json',
    );
  if (existsSync(outPath))
    throw new Error(
      'O arquivo de credenciais já existe; não será sobrescrito.',
    );
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const result = await provision(localSupabase(), plan);
  writeFileSync(outPath, JSON.stringify(result.credentials, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  process.stdout.write(
    `Empresa criada (${result.organizationId}) com ${result.establishments.length} unidade(s) e ${result.users.length} pessoa(s). ` +
      `Senhas temporárias gravadas em ${outPath} (modo 0600); entregue por canal seguro e apague o arquivo.\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
