# PicoCare — submission copy-paste kit

Track: **Indie developer** · Theme: **Build for Your World**
Prizes aimed: Indie track + Best Use of Open Weights.

## One-liner

The phone watches quietly, the secretary thinks with Meta, the family rests easy — a care secretary for elderly parents living alone.

## Short description (for the form)

PicoCare is a personal care secretary for an elderly parent living alone. The Android app observes on-device clues only (foreground app, media playback, notifications, location, battery) and a Node backend fuses them into a living feed of short, evidence-backed notes. When something is worth checking, the secretary asks the parent first — with options, never free chat — and only escalates to the paired family caregiver with evidence and the parent's own words when things stay unclear. It never diagnoses, never gives medical advice, and never auto-alerts.

## What Meta does (why judges should care)

- **Weekly review (open weights):** `muse-spark-open-1026` via Baseten reads 7 days of notes + answers + check-ins and writes a warm ≤400-character paragraph for the family. Falls back to `muse-spark-1.3`. The phone card says plainly which model wrote it.
- **Situation reading:** `muse-spark-1.3` fuses weak signals (long walk + repeated navigation + draining battery) into one caring question. Local deterministic rules gate first: thin evidence means silence.
- **ELSE triage:** the parent picks "none of the above" and writes freely; Meta judges clarified / needs-contact / pending.
- Guardrails: every Meta output passes medical/finite-output checks before storage or display. No coordinates or notification text ever reach the model — only counts, distances, and category labels.

## How it was built (10 days, Oct 26–30)

- Android (Kotlin, 2 flavors: `tw.picocare.meta` elder + `tw.picocare.meta.care` caregiver): permissions, foreground connection, 7-day on-device evidence timeline, pending outbox, bilingual UI (English default, one-tap 中文).
- Backend (TypeScript/Node, zero runtime deps): situation engine, floating greeting schedule with cooldown (no fixed daily time; 8h cooldown; evening fallback; quiet 22:00–07:00), proactive opinion notes (max 6/day), caregiver alerts + contact filing.
- Verified: `npm run check` clean, Node 94/94, Android 33+33 per flavor, real-device field test on Galaxy S23 with live data end to end.
- Dated proof: `docs/build-log.md` — every claim above maps to a dated entry.

## Links (fill on submission day)

- Repo: <https://github.com/...> (public, no secrets, no field data)
- Demo video (3 min, English VO, real device footage): <YouTube unlisted link>
- Vertical cut (40 s): <link> — optional X post for Most Viral
