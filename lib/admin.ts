export function allowlistSet(): Set<string> | null {
  const raw = (process.env.CLIENT_KEY_ALLOWLIST || "").trim();
  if (!raw) return null;
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function validateClientKey(clientKey: string) {
  const allow = allowlistSet();
  if (allow && !allow.has(clientKey)) {
    const err: any = new Error("client_key_not_allowed");
    err.status = 403;
    throw err;
  }
  if (!/^client([1-9]|1[0-9]|20)$/.test(clientKey)) {
    const err: any = new Error("invalid_client_key");
    err.status = 400;
    throw err;
  }
}

export function boolEnv(name: string, fallback = false) {
  const v = process.env[name];
  if (v == null) return fallback;
  return String(v).toLowerCase() === "true";
}
