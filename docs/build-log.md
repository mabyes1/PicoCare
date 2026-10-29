# PicoCare build log (Meta Global AI Developer Hackathon, 26 Oct – 4 Nov 2026)

Dated record of what was built during the event. All commits in this repo are within the event window.

## 2026-10-27

- Repo checkpoint `103bf7a`: care plans, floating greeting design, evidence timeline, question/ELSE flow, local rules for video-wait and outing-confirm.
- Meta Model API key confirmed on local machine; Meta wired at the decision layer (`src/meta-api.ts`, `src/meta-secretary.ts`), local rules kept as fallback.

## 2026-10-28

- Meta decision layer verified against live API (model `muse-spark-1.3`); request spacing, daily cap, error backoff in place.
- Field phone (Galaxy S23, `tw.picocare.meta`) syncing end to end through tunnel + gateway.

## 2026-10-29

- `3b9f40e`: floating schedule + cooldown state machine live on field phone (no fixed daily time; 8h cooldown; evening fallback; no new topics 22:00–07:00).
- Bottom-tab UI (Home/Insight/Settings), DEBUG MODE split, short button labels (`1.0.0-meta.11`/111).
- Proactive opinion engine (`src/notes.ts`): fact-grounded daily notes (morning, late screen, evening video, outing, quiet day, low battery) plus action notes when the secretary waits or asks; capped at 6/day, one per kind per day.
- Feed wall on the Insight tab rendering `SecretaryView.notes` newest-first with evidence and local/Meta source tags (`1.0.0-meta.12`/111).
- Weekly review: Meta reads 7 days of notes + answers + checkin count and writes a ≤400-char paragraph for family (`MetaApi.weeklyReview`, `MetaSecretary.weeklyTick`, `SecretaryView.weekly`, phone card) (`1.0.0-meta.13`/112). Medical/finite-output guardrails shared with the decision layer.
- Verified live: weekly review generated against the real Meta API from synthetic week data; opinion notes generated from real field samples.
- Weekly review moved to Meta open weights (`meta-models/muse-spark-open-1026` via Baseten Model API) when `BASENTEN_API_KEY` is set; no structured-output params on that path, prompt carries a JSON example plus brace/alias parsing fallback. Verified end to end against the real endpoint. Phone card labels open vs closed source (`1.0.0-meta.14`/113).

- Caregiver APK flavor (`tw.picocare.meta.care`, "PicoCare 照顧者", same 113): cookie-session web API client, demo workspace + seed, people list, person detail (summary, weekly review, Q&A, alerts), alert read, contact filing, help resolution. Demo seed now includes Zhang-grandma's help alert. Elder/care UI tests skip by flavor; 30+30 Android tests green.
- Field phone linked into the caregiver workspace (real data only; demo rows removed after). Gateway opened for caregiver `/api/*` with cookie forwarding.
- UI polish (`1.0.0-meta.15`/114): shared `UiBits` pills/avatars, status badges on both apps, question expiry hint, weekly source pill, wall time+source pills, caregiver timeline section. 32+32 Android tests green.

## 2026-10-30 (planned)

- 3-minute demo video (all real device footage) + vertical cut for X.
- README (EN) + submission.
