# Submission runbook (do this on 2026-10-30, user flies out the next day)

Submit at <https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit>.

## Morning

1. Open PicoCare on the field phone → Insight tab. Confirm the weekly review card has real text (landed overnight via the Baseten open-weights call; if still placeholder, ping Muse to trigger one review call manually — note the Meta daily quota may already be spent, local mode still demos fine).
2. Record 4 phone screen recordings portrait fullscreen (each 10–20s, keep the phone online so sync is live):
   - `phone-wall.mp4`: elder app Insight tab, slow scroll through the feed wall.
   - `phone-weekly.mp4`: the weekly review card, hold 5s so text is readable.
   - `phone-ask.mp4`: elder Home tab question → answer one option → show the handoff state.
   - `phone-care.mp4`: caregiver app: 關心的人 → 查看 → 近況 (秘書摘要 / 時間線 / 提醒） → 標記已讀 → 回填：已聯絡.
3. Transfer the 4 files to `video/public/` (see `video/public/README.md`).

## Midday (Muse)

1. Swap the `FootageSlot`s in `video/src/Main.tsx` / `video/src/Vertical.tsx` for `<Video>` clips + trim to slot lengths.
2. Render stills at slot boundaries, check framing and captions, then `npx remotion render Main out/picocare-demo-3min.mp4`.
3. Render `Vertical` the same way (`out/picocare-demo-vertical.mp4`).
4. Upload demo video (YouTube unlisted), fill the link into `README_EN.md`.

## Before submit

1. `git status`: no `.env.local`, no `*.sqlite`, no `video/public/*.mp4`, no `*.apk`, no key material.
2. `npm run check`, `npm test` green; note the counts in the form.
3. Push public repo; submit form with repo link + video link + member names.
4. Optional: post the vertical cut on X with the event hashtag.
