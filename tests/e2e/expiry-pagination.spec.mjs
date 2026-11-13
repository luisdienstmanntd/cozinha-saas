import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('consulta mais de mil recebimentos e busca produto fora do catálogo carregado', async ({
  page,
}) => {
  test.setTimeout(120000);
  await withCatalogFixture(async ({ admin, users, scopeA }) => {
    const product = checked(
      await admin
        .from('products')
        .insert({ ...scopeA, name: 'Zulu especial', unit: 'kg' })
        .select('id')
        .single(),
    );
    const supplier = checked(
      await admin
        .from('suppliers')
        .insert({ ...scopeA, name: 'Fornecedor especial' })
        .select('id')
        .single(),
    );
    const ids = [
      scopeA.organization_id,
      scopeA.establishment_id,
      users[0].id,
      product.id,
      supplier.id,
    ];
    if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
      throw new Error('Identificador de teste inválido.');
    const [org, unit, user, productId, supplierId] = ids;
    const sql = `insert into public.products(organization_id,establishment_id,name,unit)
      select '${org}','${unit}','Produto '||lpad(n::text,4,'0'),'kg' from generate_series(1,1000) n;
      insert into public.batch_receipts(organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by)
      select '${org}','${unit}','${productId}','${supplierId}',gen_random_uuid(),'teste '||n,1,'kg','2020-01-01','original','2020-01-01','America/Sao_Paulo','${user}' from generate_series(1,1001) n;`;
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        'supabase_db_cozinha-saas',
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ],
      { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    // Fatia 6.2: o painel pagina no servidor por (validade, ID do recipiente), 100 por vez, sem teto no
    // navegador. O recebimento concorrente tem validade anterior à de todos os outros, para ficar atrás
    // do cursor: não pode aparecer duplicado nem deslocar a paginação em andamento.
    const concurrentId = randomUUID();
    let insertedDuringPagination = false;
    await page.route('**/rest/v1/rpc/list_containers', async (route) => {
      const body = route.request().postDataJSON();
      if (!insertedDuringPagination && body?.p_after_id) {
        insertedDuringPagination = true;
        const concurrent = `insert into public.batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by) values ('${concurrentId}','${org}','${unit}','${productId}','${supplierId}',gen_random_uuid(),'concorrente',1,'kg','2019-01-01','original','2019-01-01','America/Sao_Paulo','${user}')`;
        execFileSync(
          'docker',
          [
            'exec',
            '-i',
            'supabase_db_cozinha-saas',
            'psql',
            '-X',
            '-v',
            'ON_ERROR_STOP=1',
            '-U',
            'postgres',
            '-d',
            'postgres',
          ],
          { input: concurrent, stdio: ['pipe', 'pipe', 'pipe'] },
        );
      }
      await route.continue();
    });
    await page.goto('/');
    await page.getByLabel('E-mail').fill(users[0].email);
    await page.getByLabel('Senha').fill(users[0].password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    const dashboard = page.getByRole('region', { name: 'Painel de validade' });
    await expect(dashboard.getByText(/Vencidos: 1001/)).toBeVisible({
      timeout: 30000,
    });
    // A busca vai ao servidor depois de uma pausa na digitação: espera a resposta filtrada.
    const searched = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/list_containers') &&
        response.request().postDataJSON()?.p_search === 'Zulu especial',
    );
    await dashboard.getByRole('searchbox').fill('Zulu especial');
    await searched;
    const items = page
      .getByRole('list', { name: 'Recipientes e validade' })
      .getByRole('listitem');
    await expect(items).toHaveCount(100);
    const more = page.getByRole('button', {
      name: 'Carregar mais recipientes',
    });
    for (let shown = 200; shown <= 1000; shown += 100) {
      await more.click();
      await expect(items).toHaveCount(shown);
    }
    await more.click();
    await expect(items).toHaveCount(1001);
    await expect(more).toHaveCount(0);
    await expect(
      page.getByText(
        'Exibindo até 1.000 recebimentos; outros podem não aparecer.',
      ),
    ).toHaveCount(0);
    expect(insertedDuringPagination).toBe(true);
    // Sem repetição: 1001 recipientes distintos, e o concorrente (atrás do cursor) não entrou no meio.
    const codes = await items.evaluateAll((nodes) =>
      nodes.map((node) => /C-\d{6,}/.exec(node.textContent ?? '')?.[0]),
    );
    expect(new Set(codes).size).toBe(1001);
    await expect(
      page
        .getByRole('list', { name: 'Recipientes e validade' })
        .getByText(/lote concorrente/),
    ).toHaveCount(0);
    await dashboard
      .getByRole('button', { name: 'Atualizar recebimentos' })
      .click();
    await expect(dashboard.getByText(/Vencidos: 1002/)).toBeVisible({
      timeout: 30000,
    });
    // Depois de atualizar, o concorrente é o mais urgente e aparece no topo da busca.
    await expect(items.first()).toContainText('lote concorrente');
    await expect(items).toHaveCount(100);
  });
});
