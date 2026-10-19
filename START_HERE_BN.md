# Rafi Vault — Vercel সংস্করণ (v2)

এটি সাধারণ Next.js অ্যাপ। আগের Vinext/Cloudflare ZIP-এর পরিবর্তে এই সম্পূর্ণ project ব্যবহার করুন। নতুন folder/repository-তে extract করুন; পুরোনো ZIP-এর source-এর সঙ্গে মেশাবেন না।

## এই সংস্করণে কী বদলেছে

- `pnpm build` সত্যিকারের `next build --webpack` চালায় ও `.next/routes-manifest.json` তৈরি করে।
- Cloudflare Workers/D1 বা ChatGPT Sites login-এর dependency নেই।
- আপনার নিজের password দিয়ে private login; password-এর scrypt hash server-এ থাকে।
- Telegram-এ মূল ফাইল, Supabase-এ folder/file index এবং encrypted bot token।
- Vercel-এর payload limit-এর জন্য প্রতি upload/download অংশ 3 MiB। প্রতিটি অংশের SHA-256 যাচাই করে মূল file ফেরত আসে।

## ১. Supabase database তৈরি

1. https://supabase.com/dashboard থেকে একটি project তৈরি/নির্বাচন করুন।
2. SQL Editor → New query খুলুন।
3. ZIP-এর `supabase/schema.sql`-এর সব SQL paste করে Run দিন।
4. Project URL এবং legacy `service_role` API key সংগ্রহ করুন। `anon`/publishable key দেবেন না।
5. Project-এর Data API চালু রাখুন। এই অ্যাপ server থেকে REST API ব্যবহার করে।

RLS চালু থাকে এবং browser/anonymous role-কে table/function access দেওয়া হয়নি। Service role key শুধু backend-এ রাখবেন। Supabase-এ ছবি–ভিডিওর bytes upload হবে না।

## ২. নিজের password এবং secret তৈরি

Node.js 24 এবং pnpm 11.25.0 ব্যবহার করুন। VS Code-এ এই folder খুলে terminal-এ চালান:

```powershell
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm setup
```

`pnpm setup`-এ আপনার পছন্দের কমপক্ষে 12-character password দিন। Password input আড়ালে থাকবে। Script যে `AUTH_SECRET` ও `VAULT_PASSWORD_HASH` দেবে সেগুলো নিজের কাছে রাখুন। এই script file তৈরি করে না।

এখানে password-এর text নয়, `VAULT_PASSWORD_HASH`-এর পুরো `scrypt:...:...` value ব্যবহার করতে হবে। Sign-in করতে আপনার নির্বাচিত সাধারণ password লাগবে।

## ৩. Vercel environment variables

Vercel project → Settings → Environment Variables-এ চারটি server-only variable দিন:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | আপনার Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | আপনার legacy service_role key |
| `AUTH_SECRET` | setup script-এর তৈরি 64-character hex secret |
| `VAULT_PASSWORD_HASH` | setup script-এর তৈরি পুরো scrypt hash |

Production environment নির্বাচন করুন। Preview-তেও পরীক্ষা করতে চাইলে সেখানে variables দিন। কোনো variable-এর নামের আগে `NEXT_PUBLIC_` দেবেন না। Values GitHub-এ commit করবেন না।

## ৪. GitHub এবং Vercel settings

নতুন folder-এর source files repository root-এ রাখুন—যেখানে এই ZIP-এর `package.json` আছে। আগের Vinext source/`vite.config.ts`/Cloudflare build scripts রেখে মেশাবেন না। নতুন repository ব্যবহার করলে সহজ হবে।

Vercel-এর project settings:

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | যে directory-তে নতুন package.json আছে; repository root হলে খালি/default |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm build` |
| Output Directory | Override বন্ধ; framework default |
| Node.js | 24.x |

ZIP-এ `vercel.json` আছে। `.next`/`dist`/`node_modules` GitHub-এ দেবেন না। Source push করে Redeploy দিন। পুরোনো build cache বাদ দিয়ে প্রথমবার নতুন deployment করা যেতে পারে।

Environment variables না দিলেও app build হয়; খুললে setup-needed screen দেখাবে। বাস্তবে login/Telegram চালাতে চারটি value এবং SQL setup প্রয়োজন। শুধু deployment success মানেই setup complete নয়।

## ৫. Login ও Telegram connect

1. নতুন Vercel link খুলে setup-এর সময় বেছে নেওয়া password দিন।
2. Storage settings → Connect Telegram খুলুন।
3. BotFather-এর নতুন/revoked-safe bot token এবং আপনার private channel ID দিন।
4. আপনার দেওয়া channel link অনুযায়ী ID: `-1004478313043`।
5. Bot-টিকে ওই private channel-এর admin করুন; Post Messages চালু রাখুন।
6. Verify & connect চাপুন, তারপর অ্যাপ থেকে ছোট একটি photo upload এবং download করে পরীক্ষা করুন।

এটি আপনার personal Telegram account-এ login করে না; আপনার private channel-এ bot দিয়ে files পাঠায়। Telegram-এ সরাসরি দেওয়া পুরোনো files স্বয়ংক্রিয়ভাবে import হয় না। আগের Sites app-এর D1 index-ও নতুন Supabase database-এ নিজে থেকে আসে না।

## ৬. Local development

`.env.example` copy করে `.env.local` নাম দিন এবং চারটি actual value বসান। তারপর:

```powershell
pnpm dev
```

`http://localhost:3000` খুলুন। Local app একই Supabase project/channel-এ যুক্ত করলে একই cloud data ব্যবহার করবে। Browser-এর This device data প্রতিটি domain/browser-এর জন্য আলাদা।

## ৭. File/phone storage

- সর্বোচ্চ upload file size 2 GiB; একাধিক 3 MiB Telegram document হিসেবে রাখা হয়। Download-এ একই original bytes ফিরবে। কোনো image/video compression নেই।
- Telegram-এর folder নেই; folder tree Supabase-এ থাকে। App থেকে file remove করলে index মুছে যায়, Telegram-এর original documents থেকে যায়।
- This device মোড IndexedDB-তে রাখে। Browser data clear/eviction হলে local files হারাতে পারে। Download backup রাখুন।
- বড় video download-এর জন্য সমর্থিত desktop browser-এ Choose download folder দিন; parts সরাসরি disk-এ লেখা হয়। অন্য browser/ফোনে memory-তে file জোড়া হয়, তাই খুব বড় file device memory-এর কারণে ব্যর্থ হতে পারে।
- Upload চলাকালে page খোলা রাখুন। Failed/closed uploads automatically resume হয় না; file আবার select করুন।

## ৮. Checks এবং সীমা

```powershell
pnpm build
pnpm check
pnpm test
```

এই export-এর standard Next.js production build ও TypeScript check পাস করেছে। `.next/routes-manifest.json` তৈরি হওয়া যাচাই করা হয়েছে। Mocked tests-এ login/session/logout, same-origin check, anonymous access denial, encrypted token, multipart bytes, retry-after, duplicate chunks, corrupted chunks এবং nonempty folder protection পাস করেছে।

আসল Supabase project, bot token বা আপনার Vercel account ব্যবহার করা হয়নি। SQL/Supabase live integration, Vercel deployment এবং browser visual QA এখানে করা হয়নি। এই ZIP-এ কোনো actual key, password, media বা database dump নেই।

Login-এ 15 মিনিটে 20টি attempt-এর shared database limit আছে। Password ভুলে গেলে setup script দিয়ে নতুন hash তৈরি করে শুধু `VAULT_PASSWORD_HASH` পরিবর্তন করুন। বিদ্যমান encrypted Telegram token খোলার জন্য আগের `AUTH_SECRET` অপরিবর্তিত রাখতে হবে। নতুন hash দিলে পুরোনো login sessions বাতিল হয়।
