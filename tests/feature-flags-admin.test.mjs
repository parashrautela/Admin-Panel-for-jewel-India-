import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { transform } = require('esbuild');

async function fixture(name, response, envOverrides = {}) {
  let handler;
  const calls = [];
  const query = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then'
          ? (resolve) => resolve({ data: [], error: null, count: 0 })
          : (...args) => {
              calls.push({ method: key, args });
              return query;
            },
    }
  );
  const context = vm.createContext({
    Response,
    console,
    crypto: webcrypto,
    TextEncoder,
    Deno: {
      env: {
        get: (key) => {
          if (key in envOverrides) return envOverrides[key];
          if (key === 'ADMIN_PASSWORD') return 'server-password';
          if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-key';
          return 'test';
        },
      },
      serve: (fn) => {
        handler = fn;
      },
    },
  });

  const create = new vm.SyntheticModule(
    ['createClient'],
    function () {
      this.setExport('createClient', () => ({
        from: (table) => {
          calls.push({ table });
          return {
            select: (...args) => {
              calls.push({ method: 'select', args });
              return {
                or: (...args) => {
                  calls.push({ method: 'or', args });
                  return {
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: { user_id: '99999999-9999-4999-8999-999999999999' },
                        error: null,
                      }),
                    }),
                  };
                },
                order: () => ({
                  range: async () => ({ data: [], count: 0, error: null }),
                }),
                then: (resolve) => resolve({ data: [], error: null }),
              };
            },
          };
        },
        rpc: async (name, args) => {
          calls.push({ name, args });
          return response ? response(name, args) : { data: { ok: true, name, args }, error: null };
        },
      }));
    },
    { context }
  );

  const serve = new vm.SyntheticModule(
    ['serve'],
    function () {
      this.setExport('serve', (fn) => {
        handler = fn;
      });
    },
    { context }
  );

  const auth = new vm.SourceTextModule(
    (
      await transform(
        await readFile(new URL('../supabase/functions/_shared/adminAuth.ts', import.meta.url), 'utf8'),
        { loader: 'ts', format: 'esm' }
      )
    ).code,
    { context }
  );
  await auth.link(() => {
    throw Error('unexpected import');
  });

  const module = new vm.SourceTextModule(
    (
      await transform(
        await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8'),
        { loader: 'ts', format: 'esm' }
      )
    ).code,
    { context }
  );
  await module.link((spec) =>
    spec.includes('adminAuth') ? auth : spec.includes('supabase-js') ? create : serve
  );
  await module.evaluate();

  return {
    calls,
    run: async (body, password = 'server-password') => {
      const headersMap = new Map();
      headersMap.set('content-type', 'application/json');
      if (password !== null && password !== undefined) {
        headersMap.set('x-admin-password', String(password));
      }
      return handler({
        method: 'POST',
        headers: {
          get: (key) => headersMap.get(key.toLowerCase()) ?? null,
        },
        json: async () => body,
      });
    },
  };
}

const wholesalerId = '11111111-1111-4111-8111-111111111111';

test('admin-feature-flags: requires server-validated admin password (R2 specs)', async () => {
  // 1. Correct password passes
  const fCorrect = await fixture('admin-feature-flags');
  const resCorrect = await fCorrect.run({ action: 'list', wholesaler_id: wholesalerId }, 'server-password');
  assert.equal(resCorrect.status, 200);

  // 2. Wrong ASCII fails -> 401
  const fWrongAscii = await fixture('admin-feature-flags');
  const resWrongAscii = await fWrongAscii.run({ action: 'list', wholesaler_id: wholesalerId }, 'wrong-password');
  assert.equal(resWrongAscii.status, 401);

  // 3. 'Łbc' vs 'Abc' fails (collision check that broke hand-written sha256Sync)
  const fColl1 = await fixture('admin-feature-flags', null, { ADMIN_PASSWORD: 'Abc' });
  const resColl1 = await fColl1.run({ action: 'list', wholesaler_id: wholesalerId }, 'Łbc');
  assert.equal(resColl1.status, 401);

  const fColl2 = await fixture('admin-feature-flags', null, { ADMIN_PASSWORD: 'Łbc' });
  const resColl2 = await fColl2.run({ action: 'list', wholesaler_id: wholesalerId }, 'Abc');
  assert.equal(resColl2.status, 401);

  // 4. Non-ASCII correct password passes -> 200
  const fNonAscii = await fixture('admin-feature-flags', null, { ADMIN_PASSWORD: 'Łbc-admin-secret-🔑' });
  const resNonAscii = await fNonAscii.run({ action: 'list', wholesaler_id: wholesalerId }, 'Łbc-admin-secret-🔑');
  assert.equal(resNonAscii.status, 200);

  // 5. Missing ADMIN_PASSWORD in environment -> 401
  const fMissingEnv = await fixture('admin-feature-flags', null, { ADMIN_PASSWORD: undefined });
  const resMissingEnv = await fMissingEnv.run({ action: 'list', wholesaler_id: wholesalerId }, 'server-password');
  assert.equal(resMissingEnv.status, 401);

  // 6. Empty header -> 401
  const fEmptyHeader = await fixture('admin-feature-flags');
  const resEmptyHeader = await fEmptyHeader.run({ action: 'list', wholesaler_id: wholesalerId }, '');
  assert.equal(resEmptyHeader.status, 401);

  // 7. Null/missing header -> 401
  const fNullHeader = await fixture('admin-feature-flags');
  const resNullHeader = await fNullHeader.run({ action: 'list', wholesaler_id: wholesalerId }, null);
  assert.equal(resNullHeader.status, 401);
});


test('admin-feature-flags: action list validates wholesaler_id and calls admin_list_features', async () => {
  const f = await fixture('admin-feature-flags', (name, args) => {
    if (name === 'admin_list_features') {
      return { data: { ok: true, features: [{ key: 'chamak', effective_enabled: true }] }, error: null };
    }
  });

  const res = await f.run({ action: 'list', wholesaler_id: wholesalerId });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.features[0].key, 'chamak');

  const rpcCall = f.calls.find((c) => c.name === 'admin_list_features');
  assert.ok(rpcCall);
  assert.equal(rpcCall.args.p_wholesaler_user_id, '99999999-9999-4999-8999-999999999999');
});

test('admin-feature-flags: action set validates inputs and calls admin_set_feature', async () => {
  const f = await fixture('admin-feature-flags');
  const res = await f.run({
    action: 'set',
    wholesaler_id: wholesalerId,
    feature_key: 'chamak',
    enabled: false,
    reason: 'Policy restriction',
    expected_version: 1,
  });

  assert.equal(res.status, 200);
  const rpcCall = f.calls.find((c) => c.name === 'admin_set_feature');
  assert.ok(rpcCall);
  assert.equal(rpcCall.args.p_key, 'chamak');
  assert.equal(rpcCall.args.p_enabled, false);
  assert.equal(rpcCall.args.p_reason, 'Policy restriction');
  assert.equal(rpcCall.args.p_expected_version, 1);
});

test('admin-feature-flags: action set returns 409 on VERSION_CONFLICT', async () => {
  const f = await fixture('admin-feature-flags', (name) => {
    if (name === 'admin_set_feature') {
      return { data: { ok: false, error: 'VERSION_CONFLICT', current_version: 2 }, error: null };
    }
  });

  const res = await f.run({
    action: 'set',
    wholesaler_id: wholesalerId,
    feature_key: 'chamak',
    enabled: false,
    reason: 'Conflict test',
    expected_version: 1,
  });

  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.error, 'VERSION_CONFLICT');
});

test('admin-feature-flags: action reset validates inputs and calls admin_reset_feature', async () => {
  const f = await fixture('admin-feature-flags');
  const res = await f.run({
    action: 'reset',
    wholesaler_id: wholesalerId,
    feature_key: 'chamak',
    reason: 'Reset to default',
    expected_version: 2,
  });

  assert.equal(res.status, 200);
  const rpcCall = f.calls.find((c) => c.name === 'admin_reset_feature');
  assert.ok(rpcCall);
  assert.equal(rpcCall.args.p_key, 'chamak');
  assert.equal(rpcCall.args.p_reason, 'Reset to default');
  assert.equal(rpcCall.args.p_expected_version, 2);
});

test('admin-feature-flags: action catalog_set calls admin_set_catalog', async () => {
  const f = await fixture('admin-feature-flags');
  const res = await f.run({
    action: 'catalog_set',
    feature_key: 'orders',
    default_enabled: true,
    enforcement_mode: 'enforce',
    reason: 'Enforcing orders globally',
  });

  assert.equal(res.status, 200);
  const rpcCall = f.calls.find((c) => c.name === 'admin_set_catalog');
  assert.ok(rpcCall);
  assert.equal(rpcCall.args.p_key, 'orders');
  assert.equal(rpcCall.args.p_mode, 'enforce');
});

test('admin-feature-flags: action bulk_set validates inputs and calls admin_bulk_set_features', async () => {
  const f = await fixture('admin-feature-flags');
  const res = await f.run({
    action: 'bulk_set',
    wholesaler_id: wholesalerId,
    reason: 'Account suspension',
    changes: [
      { feature_key: 'chamak', enabled: false, expected_version: 1 },
      { feature_key: 'orders', enabled: false, expected_version: 0 },
    ],
  });

  assert.equal(res.status, 200);
  const rpcCall = f.calls.find((c) => c.name === 'admin_bulk_set_features');
  assert.ok(rpcCall);
  assert.equal(rpcCall.args.p_reason, 'Account suspension');
  assert.equal(rpcCall.args.p_changes.length, 2);
});
