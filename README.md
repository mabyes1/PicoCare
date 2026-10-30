# PicoCare — a care secretary for elderly parents

> Meta Global AI Developer Hackathon 2026 · Indie track · Theme: Build for Your World

PicoCare watches an elderly parent's phone for **observable clues only** (foreground app, media playback, notifications, location, battery), fuses them into a living feed, asks the parent first when something is worth checking, and hands clear evidence to family caregivers only when things stay unclear. It never diagnoses, never gives medical advice, and never auto-alerts — care coordination, not healthcare.

**One line:** the phone watches quietly, the secretary thinks with Meta, the family rests easy.

- Demo video (3 min, English VO): _link on submission day_
- Vertical cut (40 s): _link on submission day_
- Dated build log: [docs/build-log.md](docs/build-log.md) — everything here was built 26–30 Oct 2026.
- Chinese docs: [README_ZH.md](README_ZH.md) (full manual), [PRODUCT.md](PRODUCT.md) (product), [SECRETARY.md](SECRETARY.md) (scenario engine), [META.md](META.md) (Meta integration), [FIELD.md](FIELD.md) (field test).

The app is bilingual (English default, 中文一鍵切換). The backend stores per-language output history and serves the active language.

## What Meta does (the part local rules cannot)

| Job | Model | Why only Meta can do it |
|---|---|---|
| Weekly review for family | `muse-spark-open-1026` via Baseten (falls back to `muse-spark-1.3`) | Reads 7 days of notes + answers + checkins, writes a warm ≤400-char paragraph. No template can do this. |
| Situation reading | `muse-spark-1.3` | Fuses weak signals (e.g. long walk + repeated navigation + draining battery) into one caring question. |
| ELSE free-text triage | `muse-spark-1.3` | Parent picks "none of the above" and writes freely; Meta judges clarified / needs-contact / pending. |

Local deterministic rules stay as gate + fallback: insufficient evidence means silence, and every Meta output passes medical/finite-output guardrails before it is stored or shown. No coordinates or notification text reach the model — only counts, distances and category labels.

## How it works

1. The Android app (`tw.picocare.meta`) collects on-device samples into a 7-day local evidence timeline with a pending outbox.
2. The Node backend evaluates the situation (`src/context-engine.ts`), runs the floating greeting schedule with cooldown (`src/workflow.ts`), and writes proactive opinion notes (`src/notes.ts`, max 6/day).
3. The phone's Insight tab shows the secretary's thinking, the weekly review, and the feed wall — newest first, each post citing its evidence.
4. Open questions carry options plus a per-question ELSE box; unclarified items escalate to the paired caregiver with evidence and the parent's own words.

The caregiver counterpart (`tw.picocare.meta.care`, "PicoCare Caregiver") shows the same person: people list, person detail with weekly review, alerts, contact filing and help resolution — same backend, cookie session, no shared identity with the elder phone.

## Run it

Requires Node.js 24.12+. No runtime dependencies beyond the standard library.

```powershell
npm install
npm run check
npm test
npm run build
npm start -- --demo
```

Open <http://127.0.0.1:4317>. Default DB is `.local/care.sqlite` (`PICOCARE_DB` overrides); loopback only. For the Meta layer, copy `.env.example` to `.env.local`, set `MODEL_API_KEY`, and run `npm run start:meta`. Never commit `.env.local`.

Switch language (also flips server-side output + backfill):

```powershell
curl -X POST http://127.0.0.1:4317/api/lang -H "Authorization: Bearer <device-token>" -H "Content-Type: application/json" -d '{"lang":"en"}'
```

Android field apps: needs JDK 17, Android SDK 35, Gradle 8.13:

```powershell
.\scripts\build-android.ps1 -Offline
.\scripts\build-field.ps1 -OutputDirectory .local/apks -Flavor elder
.\scripts\build-field.ps1 -OutputDirectory .local/apks -Flavor care
```

Output is two dev-signed APKs (`tw.picocare.meta` elder side, `tw.picocare.meta.care` caregiver side, v1.0.0-meta.15). The build script runs Lint plus JVM/Robolectric unit tests for both flavors.

## Verification

- `npm run check` clean, `npm test` 93/93 (HTTP, persistence, schedule, cooldown, bilingual output).
- Android: `assembleElderDebug assembleCareDebug lintElderDebug lintCareDebug testElderDebugUnitTest testCareDebugUnitTest` green, 33 tests per flavor.
- Real-device field test on Samsung S23: pairing, sync, questions, check-in/help round-trip, permissions, caregiver cross-check with live data.

## Submission checklist

- [ ] Public repo (this one), no secrets, no field data, no build cache
- [ ] 3-minute demo video, real device footage only, English VO
- [ ] Team member names on the submission form
- [ ] Optional: vertical cut posted on X for Most Viral
