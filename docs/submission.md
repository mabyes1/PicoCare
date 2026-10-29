# Submission runbook (do this on 2026-10-30, user flies out the next day)

Submit at <https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit>.

## Morning

1. Open PicoCare on the field phone → Insight tab. Confirm the weekly review card has real text (3rd note + Meta call happen automatically after the morning note lands; quota resets overnight).
2. If the weekly card is still placeholder, ping Muse to trigger one review call manually.
3. Record 4 phone screen recordings (each ~20s, keep the phone online so sync is live):
   - `phone-wall.mp4`: elder app Insight tab, slow scroll through the feed wall.
   - `phone-weekly.mp4`: the weekly review card, hold 5s so text is readable.
   - `phone-ask.mp4`: elder Home tab question → answer one option → show the handoff state.
   - `phone-care.mp4`: caregiver app: people list → Zhang-grandma detail → mark help alert read → file "contacted".
4. Transfer the 4 files to `video/public/`.

## Midday (Muse)

1. Swap the three `FootageSlot`s in `video/src/Main.tsx` for `<Video>` clips + trim to slot lengths.
2. Render stills at slot boundaries, check framing and captions, then `npx remotion render Main out/picocare-demo.mp4`.
3. Render `Vertical` the same way for the X cut (`out/picocare-x.mp4`).
4. Upload demo video (YouTube unlisted), fill the link into `README_EN.md`.

## Before submit

1. `git status`: no `.env.local`, no `*.sqlite`, no `video/public/*.mp4`, no `*.apk`, no key material.
2. `npm run check`, `npm test` green; note the counts in the form.
3. Push public repo; submit form with repo link + video link + member names.
4. Optional: post the vertical cut on X with the event hashtag.
