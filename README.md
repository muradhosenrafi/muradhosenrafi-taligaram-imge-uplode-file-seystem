# Rafi Vault for Vercel

Next.js 16, React 19, Node.js 24. Original media in Telegram, private metadata in Supabase/Postgres. Start with [START_HERE_BN.md](START_HERE_BN.md).

Install: `pnpm install --frozen-lockfile`

Create password hash and server secret: `pnpm setup`

Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT service-role key), `AUTH_SECRET`, `VAULT_PASSWORD_HASH`. Run `supabase/schema.sql` in Supabase SQL Editor. No browser-facing secrets or public access policies are needed.

Develop: `pnpm dev`. Build: `pnpm build`. Validate: `pnpm check && pnpm test`.

`vercel.json` selects Next.js with the ordinary Next.js output. Do not select a custom `dist` output directory. The production build writes `.next/routes-manifest.json`.

The personal login uses scrypt, a signed HttpOnly SameSite cookie and an atomic Postgres limit of 20 login attempts per 15-minute window. Every media and configuration endpoint checks the signed session. Changing the password hash invalidates sessions. Tokens use AES-256-GCM with a key derived from `AUTH_SECRET`; preserve that secret to retain access to stored credentials.

Telegram uploads/downloads use 3 MiB parts, below Vercel's function payload limit. Browser downloads validate each part and reassemble the original. A chosen writable directory avoids assembling large videos in browser memory. Uploads up to 2 GiB are accepted; phone memory, platform transfer/duration quotas and Telegram limits still apply. Abandoned uploads do not automatically resume.

This is an independent export, not a migration of the original Sites database. It does not change or update the existing Sites app. The included unit/integration checks mock Telegram and Supabase; live-service and browser checks require the owner's configured services.
