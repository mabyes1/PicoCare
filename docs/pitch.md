# PicoCare — Submission Copy-Paste Kit

- **Track**: Indie Developer · **Theme**: *Build for Your World*
- **Prizes Aimed**: Indie Track + Best Use of Open Weights

---

## One-Liner

The phone watches quietly, the secretary thinks with Meta, and the family finally rests easy — a dignity-first personal care secretary for aging parents living alone.

---

## Short Description (for the Submission Form)

When an aging parent lives alone, a day of silence makes your heart race. Yet indoor cameras strip away their dignity, and rigid daily check-in alarms feel like a roll call.

PicoCare takes a more human path: care should never feel like surveillance, and love should never sound like an alarm. Our native Android app (`tw.picocare.meta`) observes only gentle on-device clues—screen wakes, steps, media playback, navigation cues, and battery curves—and pairs local deterministic evidence gates with Meta AI (`muse-spark-1.3` and open-weight `muse-spark-open-1026`). Together, they write an evidence-backed Secretary Feed where every note cites its exact timestamped observations. When a routine shifts, PicoCare asks the parent first—with simple tap options and a per-question `ELSE` box, never an overwhelming chatbot—and only escalates to the paired family caregiver (`tw.picocare.meta.care`) with full context and the parent's own words when things remain unclear. It never diagnoses, never gives medical advice, and never triggers false panic.

---

## What Meta AI & Open Weights Do (Why Judges Should Care)

1. **7-Day Open-Weight Family Reflection (`meta-models/muse-spark-open-1026` via Baseten, fallback to `muse-spark-1.3`)**: Reads a full week of daily observations, check-ins, and answers to compose a warm `≤400`-character narrative for the family. The phone UI explicitly badges **`Open weights`** vs **`Meta`** so model provenance is 100% transparent.
2. **Weak-Signal Situation Fusion (`muse-spark-1.3`)**: Local deterministic gates stand guard first (thin evidence = silence; proactive check-ins require ≥2 distinct signals including a fresh sample). Within those bounds, `muse-spark-1.3` fuses subtle multi-sensor patterns—like *1,779m of movement + 9 repeated navigation prompts + draining battery*—into one natural, respectful check-in question.
3. **Nuanced `ELSE` Free-Text Triage (`muse-spark-1.3`)**: When a parent taps *"None of the above"* and writes freely (*"Just taking a walk nearby, I'm fine"*), Meta judges whether the concern is `clarified` (automatically retracting pending caregiver alerts while preserving the parent's exact words), `needs_contact`, or `pending`.
4. **Strict Privacy & Safety Guardrails**: Zero raw GPS coordinates or private notification text ever reach the LLM—only aggregated distances, counts, and categories. Every output passes deterministic medical/diagnostic checks and real `evidenceId` verification before storage or display.

---

## How It Was Built (Oct 26–30, 2026)

- **Native Android (Kotlin, 2 flavors: `tw.picocare.meta` Elder + `tw.picocare.meta.care` Caregiver)**: Foreground sampling, transactional 7-day SQLite evidence timeline, offline-resilient idempotent outbox, and bilingual UI (English default, one-tap 繁體中文).
- **Zero-Dependency Backend (TypeScript / Node.js 24.12+ / SQLite)**: Situation engine, floating greeting schedule with 8h cooldown & `22:00–07:00` quiet hours, proactive evidence notes (max 6/day), and caregiver escalation workflow.
- **End-to-End Verification**: `npm run check` clean, **94/94** Node automated tests, **66/66** Android JVM/Robolectric unit tests (`33` per flavor, `0` lint errors), and multi-day live field testing on a **Samsung Galaxy S23**.
- **Dated Engineering Trail**: See `docs/build-log.md` for day-by-day commits and benchmarks.

---

## Links (Fill on Submission Day)

- **GitHub Repository**: <https://github.com/mabyes1/PicoCare>
- **Demo Video (1:49, English VO + BGM, real Galaxy S23 screens)**: https://www.youtube.com/watch?v=8saCgnKm5GU
- **Vertical Cut (36s, X / Social cut)**: `video/out/picocare-vertical-en.mp4` *(paste X link here)*
