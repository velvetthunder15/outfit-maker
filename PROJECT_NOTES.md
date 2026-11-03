# Outfit Maker — project notes

Last updated: 2026-11-04 03:45 IST (perf + mobile pass)

## Live / IDs
| Thing | Value |
|---|---|
| Live URL | https://outfit-maker-gamma.vercel.app |
| GitHub (public) | https://github.com/velvetthunder15/outfit-maker (branch `main`, auto-deploys to Vercel on push) |
| Vercel project | `outfit-maker`, id `prj_srkouSbWHeLEi3jpfmh7LnrOG942`, team `afterworld1` (`team_VDluZpuhw8wW2nNgFiryAN3c`) |
| Supabase project | **shared with carpoolr**: ref `tomkixjzyeaslofybxrw` (ap-south-1), https://tomkixjzyeaslofybxrw.supabase.co |
| Google OAuth client | "Outfit Maker" (Web) in GCP project `heat-check-511911`; client ID `476044863786-5e0ei0pb9occfhhrgql6fogi4log52pn.apps.googleusercontent.com`; secret in Hark vault id `147a0973-0aaa-4e56-93a9-0038b9d9586d`. Redirect URI: `https://tomkixjzyeaslofybxrw.supabase.co/auth/v1/callback` |
| Gemini key | Hark vault id `df697a8c-4513-471e-bb1d-2a5538029a9f` → Vercel env `GEMINI_API_KEY` (Production + Preview, sensitive) |

Why carpoolr's project: the free Supabase org already had 2 active projects; Chirag chose to share carpoolr's project rather than pause anything.

## Isolation inside the shared Supabase project
- Tables: `om_profiles`, `om_wardrobe_items`, `om_outfits`, `om_feedback`, `om_ai_usage` (RLS enabled on all; owner-only policies).
- Functions: `om_consume_ai_quota(kind)` (security definer, daily limits: outfit 30, tag 300, tryon 5), `om_wardrobe_cap()` trigger (300 items/user), `om_touch_updated_at()`.
- Storage bucket: `om-wardrobe` (private, 1 MB/file, webp/jpeg), objects at `<uid>/<uuid>.webp` + `<uid>/<uuid>_t.webp`; owner-only policies via `storage.foldername(name)[1] = auth.uid()`.
- **No trigger on `auth.users`** (carpoolr already has `on_auth_user_created`). `om_profiles` rows are created lazily by the app (auth callback / getProfile upsert).
- Auth config changes made: Google provider enabled (approved by Chirag); appended to `uri_allow_list`: `https://outfit-maker-gamma.vercel.app/**`, `https://outfit-maker-*-afterworld1.vercel.app/**`, `http://localhost:3000/**`. Site URL (`carpoolr://auth`), email provider and templates untouched.
- Delete-my-data removes all om_* rows + photos but deliberately does NOT delete the auth user (it is shared with carpoolr).
- Migration file: `supabase/migrations/0001_init.sql` (already applied).

## Architecture
- Next.js 15 App Router, TypeScript, Tailwind v4, `@supabase/ssr` (cookie sessions, PKCE). `src/middleware.ts` refreshes session and protects `/style /outfits /saved /wardrobe /settings /onboarding`.
- Pages: `/` landing, `/login` (Google + magic link), `/onboarding`, `/style`, `/outfits/[id]`, `/saved` (Saved/History tabs), `/wardrobe`, `/settings`, `/privacy`, `/terms`, custom 404.
- API: `/api/generate` (outfit), `/api/wardrobe/tag` (Gemini vision tagging, batches of 4 from client), `/api/tryon` (Gemini image model, nothing stored), `/api/outfits/[id]` (save/rate/delete), `/api/account` (delete data), `/api/geocode`, `/api/weather` (Open-Meteo + BigDataCloud reverse geocode), `/api/health` (`?ai=1` checks key with a free metadata call), `/auth/callback`, `/auth/signout`.
- Wardrobe-first: client compresses each photo (1024px WebP ≤150 KB target, EXIF stripped by canvas re-encode, + 300px thumb), uploads to `om-wardrobe`, inserts row, then calls tagger. Tags editable in a side sheet.
- Generation: profile + weather at destination/hour + last 12 ratings + wardrobe list (ids) → Gemini JSON schema. Server drops any item_id not owned by the user / duplicates. General mode when <2 tagged items or toggle off. Missing pieces get Pinterest search links. Womenswear reference images matched from `src/data/nvzhuang.json` (1068 SFW entries; lingerie/sexy categories removed) and hot-linked from jsDelivr.
- Gemini models (`src/lib/gemini.ts`): default `gemini-3.5-flash` (gemini-2.5-flash is retired for new keys, returns 404), fallback chain on 404/429/5xx → `gemini-3.8-flash` → `gemini-3.7-flash`; `thinkingLevel: low` (auto-dropped if a model rejects it). Image: `gemini-3.1-flash-image` → `gemini-2.5-flash-image`. Function maxDuration 120 s.
- Micro-interactions (pre-perf-pass description; see "Performance & motion" below for current implementation): Amicro (MIT) components vendored into `src/components/amicro/` from its shadcn registry (magnetic-button, tilt-card, fade-up, text-reveal, bounce-dots, shimmer-line, classic-toggle, ai-prompt-chips→PromptChips), imports switched to `motion/react`, restyled to brand.
- Design: Warm Ivory #EAE6DE, Deep Editorial Blue #226192, Coral #EF8557; Archivo variable (width axis: 125 extended display, 62 condensed); generated blue-paper texture + hero flat-lay in `public/`.

## Performance & motion (2026-11-04 pass)
- **Region:** `vercel.json` pins functions to `bom1` (Mumbai), next to Supabase ap-south-1. Measured via `/api/health?db=1`: iad1 220–1090 ms per Supabase round trip (median ~650) → bom1 20–40 ms warm. This was the main cause of slow tab switches (each app page did ~4–5 sequential round trips).
- **Auth:** middleware and `requireUser()` use `supabase.auth.getClaims()` (local ES256 verify, JWKS cached globally) instead of `getUser()` network calls; `requireUser` is wrapped in React `cache()`. `/api/account` (delete data) uses `requireUser({ strict: true })` → `getUser()`.
- **Navigation:** `(app)/layout.tsx` AppShell persists; `(app)/template.tsx` gives a 220 ms transform+opacity page enter. `loading.tsx` skeletons for style, wardrobe, saved, settings, outfits/[id] (`src/components/skeletons.tsx`). Tab links `prefetch`; `experimental.staleTimes {dynamic:30, static:60}` (outfit save/rate calls `router.refresh()` to avoid a stale Saved list). Style page queries run in one `Promise.all`; Saved streams its list in `<Suspense>`; Wardrobe signs thumbnails only (full photo signed on demand in the edit sheet) and renders 24 tiles at a time (IntersectionObserver + "Show more").
- **Motion:** Amicro components rewritten without the motion runtime (CSS keyframes `om-fade-up/om-rise/om-reveal/om-bounce/om-shimmer/om-pulse/om-page` in globals.css; tilt + magnetic only for a mouse, rAF-throttled; presses are CSS `:active` scale with spring curve). App pages use `m` + `LazyMotion` with `domMax` code-split (`src/lib/motion-features.ts`) for the gliding `layoutId` tab/pill indicator; `MotionConfig reducedMotion="user"`. Reduced motion also zeroes CSS animation delays/durations. No `layout` animations on the wardrobe grid; progress bar animates `scaleX`.
- **Paint cost:** removed all `backdrop-filter` (sticky header, bottom tab bar, chips), unused SVG-noise `.grain`, `text-rendering: optimizeLegibility`; hero shadow reduced.
- **Landing:** server-rendered hero (TextReveal/FadeUp are server components now); hero card uses transform-only entrance so LCP isn't delayed by opacity; `paper-blue.webp` preloaded; hero `next/image` with `sizes`, q70, AVIF/WebP (`next.config.ts` images config). Supabase JS is dynamically imported on sign-in tap, so `/` first-load JS 184 → 115 kB, `/login` 174 → 105 kB.
- **Public header fix:** header lacked `w-full` inside a flex column, so it shrank and centred, jamming "Sign in" against the wordmark on phones. Now full width, Sign in is a 44 px pill.
- **Lighthouse mobile (live):** `/` 87 → 94 (LCP 3.6 → 2.8 s, SI 4.4 → 3.9 s, TBT 80 → 70 ms, CLS 0); `/login` 99 after (no before run). Scroll test at 4× CPU throttle, 390×844: 0 long tasks, no frames > 50 ms. Remaining long tasks are load-time React hydration chunks.
- Screens (390 px, local prod build; app shell via a temporary unauthenticated harness that was deleted before commit): `/workspace/projects/35d546e8-089e-488d-a717-e9a66e2a7d51/work/qa-screens-2026-11-04/`.
- QA tooling (sandbox, not in repo): system Chromium via apt + Playwright/Lighthouse in /tmp/qa; Chromium needs a local no-auth chaining proxy to reach the internet from the sandbox.
- Copy cleanup: removed "Step N" kickers (landing, Style), outfit eyebrow (mood · place), "Colour story" sub-heading, landing reference caption; Saved cards show date · mood under the title.

## Env vars (names only)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (Vercel: set)
- `GEMINI_API_KEY` (Vercel: set, Production + Preview)
- Optional: `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_THINKING` (`low` default, `off` to disable)
- No service-role key is used or deployed.

## Verified (2026-11-04)
- `next build` passes; tsc + eslint clean.
- Live: `/` 200, `/login` 200, protected routes 307 → `/login?next=…`, unknown route 404 page, `/api/generate` 401 unauthenticated, `/api/health?ai=1` → key valid.
- Supabase `/auth/v1/authorize?provider=google` → 302 to accounts.google.com with the Outfit Maker client.
- Server-side self-test (temporary endpoint, since removed): Gemini tagging returned correct structured tags in ~2 s; outfit generation (wardrobe mode, 6 fake items) in ~6 s chose only valid ids, included watch + belt, gave a swap, a missing-piece with Pinterest query, palette, tips, weather note.
- Secret scan of git history: clean.

## Not yet verified / pending
- Full signed-in browser flow (Google sign-in → onboarding → upload → tag → generate) was NOT run by automation: Hark's browser refuses to complete a Google consent screen that names `tomkixjzyeaslofybxrw.supabase.co`. Needs a manual test by Chirag.
- Google consent screen shows "continue to tomkixjzyeaslofybxrw.supabase.co" (and the GCP project's app name/logo, "Heat Check" project). Cosmetic fix: Supabase custom domain (paid) or a dedicated GCP project/consent screen named "Outfit Maker".
- Magic-link emails use carpoolr's existing email templates (unchanged by request); carpoolr's template may be OTP-code style rather than a link.
- Virtual try-on (image model) not exercised live.
- Mobile layout screenshot-verified at 360/390/430 px (2026-11-04), no horizontal overflow. Signed-in pages with real data still not exercised by automation.
