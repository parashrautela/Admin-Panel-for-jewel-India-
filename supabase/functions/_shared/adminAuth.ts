// Shared by every admin-* function: the client never holds the service-role
// key. Instead it holds a password (typed once at login), sent as
// `x-admin-password` on every request, checked here against a secret that
// only exists in this function's environment (`supabase secrets set
// ADMIN_PASSWORD=...`) — never shipped to iOS or the web client.

function sha256Sync(ascii: string): Uint8Array {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i = 0, j = 0;

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength | 0;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));

    for (i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0; hash[1] = (hash[1] + b) | 0; hash[2] = (hash[2] + c) | 0; hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0; hash[5] = (hash[5] + f) | 0; hash[6] = (hash[6] + g) | 0; hash[7] = (hash[7] + h) | 0;
  }

  const bytes = new Uint8Array(32);
  for (i = 0; i < 8; i++) {
    bytes[i * 4] = (hash[i] >>> 24) & 255;
    bytes[i * 4 + 1] = (hash[i] >>> 16) & 255;
    bytes[i * 4 + 2] = (hash[i] >>> 8) & 255;
    bytes[i * 4 + 3] = hash[i] & 255;
  }
  return bytes;
}

function constantTimeCompare(a: string, b: string): boolean {
  const hashA = sha256Sync(a);
  const hashB = sha256Sync(b);
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= hashA[i] ^ hashB[i];
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
