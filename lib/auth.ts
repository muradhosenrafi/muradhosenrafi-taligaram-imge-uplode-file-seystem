import "server-only";
import { cookies } from "next/headers";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
const COOKIE = "rafi_vault_session";
export function authReady() {
  return (
    /^[a-f0-9]{64}$/i.test(process.env.AUTH_SECRET || "") &&
    /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/i.test(
      process.env.VAULT_PASSWORD_HASH || "",
    )
  );
}
function signature(body: string) {
  const key = process.env.AUTH_SECRET;
  if (!key) throw new Error("Configure AUTH_SECRET.");
  return createHmac("sha256", key).update(body).digest("base64url");
}
export function makeSession() {
  const body = Buffer.from(
    JSON.stringify({
      exp: Date.now() + 7 * 24 * 3600 * 1000,
      nonce: randomBytes(16).toString("hex"),
      version: createHash("sha256")
        .update(process.env.VAULT_PASSWORD_HASH || "")
        .digest("hex"),
    }),
  ).toString("base64url");
  return body + "." + signature(body);
}
export function verifySession(token: string) {
  try {
    if (!authReady()) return false;
    const [body, sig, ...rest] = token.split(".");
    if (!body || !sig || rest.length) return false;
    const want = Buffer.from(signature(body));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return (
      Number.isFinite(data.exp) &&
      data.exp > Date.now() &&
      data.exp <= Date.now() + 8 * 24 * 3600 * 1000 &&
      data.version ===
        createHash("sha256")
          .update(process.env.VAULT_PASSWORD_HASH || "")
          .digest("hex")
    );
  } catch {
    return false;
  }
}
export async function hasSession() {
  return verifySession((await cookies()).get(COOKIE)?.value || "");
}
export async function setSession() {
  (await cookies()).set(COOKIE, makeSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
}
export async function clearSession() {
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
export function verifyPassword(password: unknown) {
  if (typeof password !== "string" || password.length > 1024 || !authReady())
    return false;
  const [, salt, want] = process.env.VAULT_PASSWORD_HASH!.split(":");
  const got = scryptSync(password, Buffer.from(salt, "hex"), 64);
  return timingSafeEqual(got, Buffer.from(want, "hex"));
}
export function encryptionKey() {
  if (!authReady())
    throw new Error("Configure AUTH_SECRET and VAULT_PASSWORD_HASH.");
  return createHash("sha256")
    .update("rafi-vault-encryption:" + process.env.AUTH_SECRET)
    .digest();
}
export function sameOrigin(req: Request) {
  return req.headers.get("origin") === new URL(req.url).origin;
}
