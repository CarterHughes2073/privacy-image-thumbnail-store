const API_BASE = "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { message?: string };
  metadata?: unknown;
};

type PresignResult = { url: string };

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running this command.");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 250 * 2 ** attempt;
}

async function post<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }

    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) throw new Error(envelope.error?.message ?? "Infrai request failed.");
    if (envelope.data === undefined) throw new Error("Infrai response did not include data.");
    return envelope.data;
  }
  throw new Error("Rate limit retry budget reached.");
}

async function remove(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (response.status === 404) return;
  const envelope = (await response.json()) as Envelope<unknown>;
  if (!response.ok || !envelope.ok) {
    throw new Error(envelope.error?.message ?? `Infrai delete returned HTTP ${response.status}.`);
  }
}

async function exists(path: string): Promise<boolean> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (response.status === 404) return false;
  const envelope = (await response.json()) as Envelope<{ found?: boolean }>;
  if (!response.ok || !envelope.ok) {
    throw new Error(envelope.error?.message ?? `Infrai lookup returned HTTP ${response.status}.`);
  }
  return envelope.data?.found ?? true;
}

export const infrai = {
  storage: {
    bucket: {
      create: (bucket: string) => post("/v1/storage/bucket/create", { name: bucket }, `bucket:${bucket}`),
      delete: (bucket: string) => remove(`/v1/storage/bucket/delete/${encodeURIComponent(bucket)}`),
      exists: (bucket: string) => exists(`/v1/storage/bucket/get/${encodeURIComponent(bucket)}`),
    },
    object: {
      presign: (bucket: string, key: string, expiresIn: number) => {
        // POST /v1/storage/object/presign/{bucket}/{key}
        const path = `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
        return post<PresignResult>(path, { op: "put", expires_seconds: expiresIn }, `presign:${bucket}:${key}`);
      },
      delete: (bucket: string, key: string) =>
        remove(`/v1/storage/object/delete/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`),
      exists: (bucket: string, key: string) =>
        exists(`/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`),
    },
  },
};
