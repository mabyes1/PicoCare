import { randomUUID } from 'node:crypto';
import type { CareStore } from './store.ts';
import type { ContextDecision, SecretaryNote } from '../shared/protocol.ts';
import type { ContextSample } from './context-engine.ts';
import { distance, hasVideo } from './context-engine.ts';
import { dayAt, wallClock } from './domain.ts';
import type { Lang } from './lang.ts';

const minute = 60000, maxPerDay = 6;
type Row = Record<string, any>;

// Proactive opinions for the feed. Every note is built from observed
// samples only: fixed templates plus real timestamps and numbers, so
// the secretary can have opinions without fabricating anything.
export class SecretaryNotes {
  s: CareStore;
  constructor(store: CareStore) {
    this.s = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS secretary_notes(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),at INTEGER NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,evidence_json TEXT NOT NULL,source TEXT NOT NULL,lang TEXT NOT NULL DEFAULT 'zh');
      CREATE INDEX IF NOT EXISTS secretary_notes_person ON secretary_notes(person_id,at);`);
    if (!store.all('PRAGMA table_info(secretary_notes)').some(c => c.name === 'lang')) store.db.exec(`ALTER TABLE secretary_notes ADD COLUMN lang TEXT NOT NULL DEFAULT 'zh'`);
  }
  recent(personId: string, limit = 20, lang?: Lang): SecretaryNote[] {
    const useLang = lang || this.s.lang();
    return this.s.all('SELECT * FROM secretary_notes WHERE person_id=? AND lang=? ORDER BY at DESC LIMIT ?', personId, useLang, limit)
      .map(r => ({ id: r.id, at: r.at, kind: r.kind, title: r.title, body: r.body, evidence: JSON.parse(r.evidence_json), source: r.source }));
  }
  private add(personId: string, timezone: string, note: { at: number; kind: string; title: string; body: string; evidence: SecretaryNote['evidence']; source: SecretaryNote['source'] }, lang?: Lang) {
    const useLang = lang || this.s.lang();
    const day = dayAt(note.at, timezone);
    const same = this.s.all('SELECT at FROM secretary_notes WHERE person_id=? AND kind=? AND lang=? AND at>=? AND at<?', personId, note.kind, useLang, note.at - 86400000, note.at + 86400000)
      .some(r => dayAt(r.at, timezone) === day);
    if (same) return;
    const count = this.s.all('SELECT at FROM secretary_notes WHERE person_id=? AND lang=? AND at>=? AND at<?', personId, useLang, note.at - 86400000, note.at + 86400000)
      .filter(r => dayAt(r.at, timezone) === day).length;
    if (count >= maxPerDay) return;
    this.s.run('INSERT INTO secretary_notes(id,person_id,at,kind,title,body,evidence_json,source,lang) VALUES(?,?,?,?,?,?,?,?,?)', randomUUID(), personId, note.at, note.kind, note.title, note.body, JSON.stringify(note.evidence), note.source, useLang);
  }
  private today(personId: string, timezone: string, now: number): ContextSample[] {
    const day = dayAt(now, timezone);
    return this.s.all("SELECT event_id,observed_at,body FROM events WHERE person_id=? AND kind='context' AND observed_at>=? AND observed_at<=? ORDER BY observed_at ASC LIMIT 500", personId, now - 86400000, now)
      .map(r => ({ id: r.event_id, at: r.observed_at, context: JSON.parse(r.body).context }))
      .filter(s => dayAt(s.at, timezone) === day);
  }
  tick(personId: string) {
    this.tickAt(personId, this.s.now(), this.s.lang());
  }
  // Replay one calendar day in the given language (backfill; dedup keeps it idempotent).
  tickDay(personId: string, dayStart: number, lang: Lang) {
    this.tickAt(personId, dayStart + 86400000 - 1, lang);
  }
  private tickAt(personId: string, now: number, lang: Lang) {
    const en = lang === 'en';
    const timezone: string = this.s.get('SELECT w.timezone AS tz FROM people p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?', personId)?.tz || 'Asia/Taipei';
    const samples = this.today(personId, timezone, now);
    if (samples.length === 0) return;
    const latest = samples.at(-1)!, clock = (at: number) => wallClock(at, timezone);
    const firstActive = samples.find(s => s.context.screenInteractive === true && clock(s.at) >= '05:00');
    if (firstActive) this.add(personId, timezone, { at: firstActive.at, kind: 'morning', title: en ? 'First time on the phone today' : '今天第一次看到你用手機',
      body: en ? `First saw the phone light up today at ${clock(firstActive.at)}.` : `今天 ${clock(firstActive.at)} 第一次看到手機亮起來。`,
      evidence: [{ eventId: firstActive.id, observedAt: firstActive.at, label: en ? 'First phone interaction today' : '今天第一次手機可互動' }], source: 'local_evidence' }, lang);
    const late = samples.find(s => s.context.screenInteractive === true && (clock(s.at) >= '23:00' || clock(s.at) < '05:00'));
    if (late) this.add(personId, timezone, { at: late.at, kind: 'late_screen', title: en ? 'Phone still on this late' : '這麼晚了手機還亮著',
      body: en ? `It's already ${clock(late.at)}, and the phone is still on.` : `已經 ${clock(late.at)} 了，手機還亮著。`,
      evidence: [{ eventId: late.id, observedAt: late.at, label: en ? `Phone still interactive late at night (${clock(late.at)})` : `深夜手機仍可互動（${clock(late.at)}）` }], source: 'local_evidence' }, lang);
    const chain: ContextSample[] = [];
    for (const s of samples) {
      const prev = chain.at(-1);
      if (prev && (s.at - prev.at > 150000 || s.context.usage?.appId !== prev.context.usage?.appId || !hasVideo(s, s.at))) chain.length = 0;
      if (hasVideo(s, s.at) && (!prev || s.at > prev.at)) chain.push(s);
    }
    if (chain.length >= 2 && chain.at(-1)!.at - chain[0].at >= 10 * minute && clock(chain.at(-1)!.at) >= '18:00') {
      const first = chain[0], last = chain.at(-1)!;
      this.add(personId, timezone, { at: last.at, kind: 'evening_video', title: en ? 'Watched videos for a while tonight' : '今晚看了好一會兒影片',
        body: en ? `Watched from ${clock(first.at)} to ${clock(last.at)}, about ${Math.round((last.at - first.at) / minute)} minutes.` : `從 ${clock(first.at)} 看到 ${clock(last.at)}，共約 ${Math.round((last.at - first.at) / minute)} 分鐘。`,
        evidence: [{ eventId: first.id, observedAt: first.at, label: en ? 'Consistent audio-video usage clues first observed' : '開始觀測到一致的影音使用線索' },
          { eventId: last.id, observedAt: last.at, label: en ? 'Video app still in foreground and playing' : '影音 App 仍在前景且播放中' }], source: 'local_evidence' }, lang);
    }
    const fixes = samples.map(s => ({ s, p: s.context.location }))
      .filter(x => x.p && ['available', 'speed_unavailable'].includes(x.s.context.sources?.location || '') && x.p.accuracy <= 50 && x.p.observedAt <= x.s.at && x.s.at - x.p.observedAt <= 2 * minute);
    let travelled = 0;
    for (let i = 1; i < fixes.length; i++) travelled += Math.max(0, distance(fixes[i - 1].p!, fixes[i].p!) - fixes[i - 1].p!.accuracy - fixes[i].p!.accuracy);
    if (travelled >= 400) this.add(personId, timezone, { at: fixes.at(-1)!.s.at, kind: 'outing', title: en ? 'Out and about today' : '今天有出門走走',
      body: en ? `Location moved about ${Math.round(travelled)} meters today.` : `今天定位移動約 ${Math.round(travelled)} 公尺。`,
      evidence: [{ eventId: fixes[0].s.id, observedAt: fixes[0].p!.observedAt, label: en ? 'First usable fix today' : '今天第一個可用定位' },
        { eventId: fixes.at(-1)!.s.id, observedAt: fixes.at(-1)!.p!.observedAt, label: en ? `About ${Math.round(travelled)} meters travelled in total` : `累計移動約 ${Math.round(travelled)} 公尺` }], source: 'local_evidence' }, lang);
    const nowClock = clock(now);
    if (nowClock >= '09:00' && nowClock < '17:00' && samples.length >= 3 && now - latest.at <= 30 * minute) {
      const lastActive = samples.findLast(s => s.context.screenInteractive === true);
      if (!lastActive || now - lastActive.at > 4 * 3600000) this.add(personId, timezone, { at: now, kind: 'quiet', title: en ? 'Quiet phone today' : '今天手機很安靜',
        body: lastActive ? (en ? `No phone use seen since ${clock(lastActive.at)}.` : `從 ${clock(lastActive.at)} 起就沒看到使用手機了。`) : (en ? 'No phone use seen today yet.' : '今天還沒看到使用手機。'),
        evidence: [{ eventId: latest.id, observedAt: latest.at, label: en ? 'Phone still reporting, but no interaction' : '手機仍在回報，但沒有互動' }], source: 'local_evidence' }, lang);
    }
    if (latest.context.batteryPercent !== null && latest.context.batteryPercent <= 15 && latest.context.charging === false)
      this.add(personId, timezone, { at: latest.at, kind: 'battery', title: en ? 'Phone battery is low' : '手機快沒電了',
        body: en ? `Battery at ${latest.context.batteryPercent}% and not charging.` : `電量剩 ${latest.context.batteryPercent}% 且未充電。`,
        evidence: [{ eventId: latest.id, observedAt: latest.at, label: en ? `Battery ${latest.context.batteryPercent}%, not charging` : `電量 ${latest.context.batteryPercent}%，未充電` }], source: 'local_evidence' }, lang);
  }
  private action(personId: string, decision: ContextDecision, kind: string, title: string, body: string) {
    const timezone: string = this.s.get('SELECT w.timezone AS tz FROM people p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?', personId)?.tz || 'Asia/Taipei';
    this.add(personId, timezone, { at: this.s.now(), kind, title, body,
      evidence: decision.evidence.slice(0, 3).map(e => ({ eventId: e.eventId, label: e.label, observedAt: e.observedAt })), source: decision.source });
  }
  askedOuting(personId: string, decision: ContextDecision) {
    if (this.s.lang() === 'en') this.action(personId, decision, 'asked_outing', 'Asked about your outing', 'Already asked once, waiting for your reply.');
    else this.action(personId, decision, 'asked_outing', '我問了你出門的事', '已經主動問了你一句，正在等你回覆。');
  }
  videoWait(personId: string, decision: ContextDecision) {
    if (this.s.lang() === 'en') this.action(personId, decision, 'video_wait', 'Saw you watching videos', "Won't disturb you; the check-in reminder comes later.");
    else this.action(personId, decision, 'video_wait', '看到你在看影片', '先不吵你，晚點再提醒報安。');
  }
  askedVideo(personId: string, decision: ContextDecision) {
    if (this.s.lang() === 'en') this.action(personId, decision, 'asked_video', 'Video stopped, asked you a question', 'Waiting for your reply on whether the video made you forget.');
    else this.action(personId, decision, 'asked_video', '影片停了，我問了你一題', '等你回覆是不是看影片忘了回。');
  }
}
