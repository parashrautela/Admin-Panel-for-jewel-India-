// Shared by every admin-* function: the client never holds the service-role
// key. Instead it holds a password (typed once at login), sent as
// `x-admin-password` on every request, checked here against a secret that
// only exists in this function's environment (`supabase secrets set
// ADMIN_PASSWORD=...`) — never shipped to iOS or the web client.

function constantTimeCompare(provided: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export function checkAdminAuth(req: Request, corsHeaders: Record<string, string>): Response | null {
  const provided = req.headers.get('x-admin-password');
  // @ts-ignore: Deno global
  const expected = typeof Deno !== 'undefined' ? Deno.env.get('ADMIN_PASSWORD') : undefined;

  if (!expected || !provided || !constantTimeCompare(provided, expected)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    });
  }
  return null;
}

const ALLOWED_TABLES = ['wholesalers', 'retailers'];

// Admin actions take a table name from the client; this keeps it to an exact
// whitelist so it can never be used to query/update an arbitrary table.
export function requireAllowedTable(table: unknown): string {
  if (typeof table !== 'string' || !ALLOWED_TABLES.includes(table)) {
    throw new Error(`Invalid table: ${String(table)}`);
  }
  return table;
}
