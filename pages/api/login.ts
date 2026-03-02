import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const password = String(req.body?.password || "");
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return res.status(500).json({ error: "Missing ADMIN_PASSWORD" });

  // constant-time compare
  const ok =
    password.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));

  if (!ok) return res.status(401).json({ error: "Invalid password" });

  const secret = process.env.AUTH_COOKIE_SECRET || "";
  if (!secret) return res.status(500).json({ error: "Missing AUTH_COOKIE_SECRET" });

  const ts = String(Date.now());
  const sig = crypto.createHmac("sha256", secret).update(`v1.${ts}`).digest("hex");
  const cookieVal = `v1.${ts}.${sig}`;

  // HttpOnly cookie
  res.setHeader(
    "Set-Cookie",
    `mas_admin=${cookieVal}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
  );

  return res.status(200).json({ ok: true });
}
