# RouteLens

Scan a bus timetable board — printed, photographed, mixed Malayalam and English — and get back structured data you can correct, export as GTFS, and immediately query. Built for ANAVANDI 2026, selection challenge SC-04.

## What's here

- `index.html`, `style.css`, `app.js` — the whole frontend. No build step, no framework, no npm install needed for the browser side.
- `api/extract.js` — a Vercel serverless function. This is the only place your Gemini API key lives. It calls `gemini-2.5-flash` with the uploaded image and a prompt that forces strict JSON output with a confidence label per row.
- Nothing else calls Gemini. The "Next bus" search is a plain filter over data you've already extracted and corrected — no live scraping, no second AI call, so it can never hallucinate a bus time.

## Run it locally

```bash
npm install
cp .env.example .env.local
# edit .env.local and paste your real key in place of the placeholder
npx vercel dev
```

`vercel dev` serves both the static frontend and the `/api/extract` function together, exactly like production. Open the URL it prints.

## Deploy to Vercel

```bash
npx vercel --prod
```

The first run walks you through linking/creating a project. Before your first real deploy (or right after), go to your project in the Vercel dashboard → **Settings → Environment Variables** → add:

```
GEMINI_API_KEY = your_real_key
```

Redeploy after adding it if you deployed before setting it. Never put the key in any committed file — `.env.local` is already in `.gitignore`.

## The demo, beat by beat

1. **Scan** a real, slightly messy board on stage (camera button, not a pre-loaded file — it's much more convincing live).
2. **Watch it land** in the editable table, colour-coded by confidence (green/amber/red per row).
3. **Correct two or three cells** on camera — this is the human-in-the-loop step the brief explicitly asks for, and it visibly does something (any edited cell flips to green).
4. **Save to library**, then **Export GTFS** — this is the headline moment. Say out loud what GTFS is: the exact format Google Maps and every trip-planning app already read. You're not just digitizing a board, you're producing the missing input for tools that already exist.
5. **Search "Next bus"** from a stop on the board you just scanned to a stop on one you scanned earlier — proves the library is real and growing, not a one-off demo.

Keep the whole sequence under 90 seconds if you can; a tight, confident run reads better than a longer one with dead air.

## Known simplifications (be upfront about these in your deck)

- **GTFS stop coordinates are placeholders (0.000000, 0.000000).** This build doesn't geocode stop names to real lat/lon — that's an honest, clearly-scoped next step, not a hidden gap. Mention it in your "what you'd improve with two more weeks" slide; judges respect a team that knows exactly what it didn't do and why.
- **One trip per route.** Real GTFS supports multiple scheduled trips per route per day; this build assumes the board lists one full run per route, which is true for most single-board timetables.
- **The library lives in the browser's localStorage**, not a shared database — fine for a live demo on one device, not for multiple users editing the same data. Swapping in a small hosted database (Supabase/Firestore) is a natural next step if you have spare time.

## If you're short on time before judging

Cut in this order, and stop as soon as it works end-to-end:
1. Drop the "Next bus" search first — everything else still stands on its own.
2. Fall back to file upload only (skip camera capture) if the camera permission flow is flaky on the demo device.
3. Do not cut GTFS export or the correction table — those two are what the brief is actually grading, and what makes this submission different from a plain OCR tool.
