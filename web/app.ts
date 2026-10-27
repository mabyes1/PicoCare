import type { Workspace, PersonView, PeopleResponse, PersonDetail, CareAlert, CarePlan } from '../shared/protocol.js';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $('app');
let workspace: Workspace | null = null, people: PersonView[] = [], demoEnabled = false, pending = false;
let selectedId: string | null = null, filter: 'all' | 'attention' = 'all', search = '';
let alerts: CareAlert[] = [];
let serverClock = Date.now(), receivedClock = Date.now();
const currentTime = () => serverClock + Date.now() - receivedClock;
const careLabels: Record<string, string> = { waiting: '等待寬限時間', observing: '可能看影片，先延後確認', question_pending: '已問一題，等待回覆', deferred: '本人選擇晚點回覆', clarified: '本人已確認', escalated: '待照顧者釐清', resolved: '已有人接手處理', cancelled: '已停止這次確認' };
function desktopAlerts() {
  if (!workspace || !('Notification' in window) || Notification.permission !== 'granted') return;
  const key = `picocare-notified-${workspace.workspaceId}`;
  let seen: string[] = []; try { const value: unknown = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(value)) seen = value.filter((id): id is string => typeof id === 'string'); } catch { /* An unreadable local preference must not break the inbox. */ }
  const incoming = alerts.filter(a => !a.readAt && !a.resolvedAt && !seen.includes(a.id));
  if (!incoming.length) return;
  try {
    const a = incoming[0], notification = new Notification(incoming.length > 1 ? `PicoCare 有 ${incoming.length} 件關心提醒` : `${a.personName}：${a.kind === 'help' ? '希望你聯絡' : '近況仍待釐清'}`, { body: a.title, tag: `picocare-${a.id}` });
    notification.onclick = () => { window.focus(); void action(() => openPerson(a.personId)); notification.close(); };
    localStorage.setItem(key, JSON.stringify([...seen, ...incoming.map(a => a.id)].slice(-500)));
  } catch { /* Persistent inbox remains available when desktop notifications cannot be shown. */ }
}
function renderAlerts() {
  const target = $('care-inbox'); if (!target) return; target.replaceChildren();
  const header = el('div', undefined, 'toolbar'); header.append(el('h2', `關心提醒匣 · ${alerts.filter(a => !a.resolvedAt).length} 件待處理`), button('開啟桌面通知', async () => {
    if (!('Notification' in window)) { toast('這個瀏覽器不支援桌面通知，提醒仍會保存在這裡'); return; }
    const result = await Notification.requestPermission(); toast(result === 'granted' ? '已開啟；頁面執行時會提示新提醒' : '提醒會保存在提醒匣'); desktopAlerts();
  }, 'secondary')); target.append(header, el('p', '提醒會保存在這裡。桌面通知需要此頁持續執行；已讀不代表已處理。', 'muted small'));
  for (const a of alerts.slice(0, 12)) {
    const row = el('article', undefined, 'care-alert' + (a.resolvedAt ? ' resolved' : ''));
    row.append(el('strong', `${a.personName} · ${a.kind === 'help' ? '本人求助' : '待釐清'} · ${a.resolvedAt ? '已結束' : a.readAt ? '已讀／待處理' : '未讀'}`), el('p', a.title), el('small', new Date(a.createdAt).toLocaleString('zh-TW')));
    row.append(button('查看證據與回答', () => openPerson(a.personId), 'text-button'));
    if (!a.readAt) row.append(button('標為已讀', async () => { await api(`/api/alerts/${a.id}/read`, {}); await refresh(); }, 'text-button'));
    target.append(row);
  }
  if (!alerts.length) target.append(el('p', '目前沒有需要交給你的事項。', 'muted'));
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, value?: string, className?: string) {
  const node = document.createElement(tag); if (value !== undefined) node.textContent = value; if (className) node.className = className; return node;
}
function button(label: string, work: () => void | Promise<void>, className = '') {
  const node = el('button', label, className); node.type = 'button'; node.addEventListener('click', () => void action(work)); return node;
}
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(path, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '連線暫時中斷'); return result;
}
function toast(message: string) { const node = $('toast'); node.textContent = message; node.hidden = false; setTimeout(() => { node.hidden = true; }, 5000); }
async function action(work: () => void | Promise<void>) {
  if (pending) return; pending = true;
  try { await work(); } catch (error) { toast(error instanceof Error ? error.message : '請稍後再試'); } finally { pending = false; }
}
const time = (at: number | null) => at === null ? '尚未收到' : new Date(at).toLocaleTimeString('zh-TW', { timeZone: workspace?.timezone, hour: '2-digit', minute: '2-digit', hour12: false });
function ago(at: number | null) { if (at === null) return '等待手機連線'; const seconds = Math.max(0, Math.floor((currentTime() - at) / 1000)); return seconds < 60 ? `${seconds} 秒前` : seconds < 3600 ? `${Math.floor(seconds / 60)} 分鐘前` : `${Math.floor(seconds / 3600)} 小時前`; }
function brand() { const node = el('div', undefined, 'brand'); node.append(el('span', 'p', 'brand-icon'), el('strong', 'PicoCare')); return node; }

function onboarding() {
  app.replaceChildren();
  const page = el('main', undefined, 'onboarding');
  const story = el('section', undefined, 'onboard-story'); story.append(brand(), el('span', 'CARE, WITH CONTEXT.', 'eyebrow'), el('h1', '讓關心，\n有所依據。'), el('p', '從一句「今天好嗎」，到看得見的生活線索。\n把手機、照顧者與每一份關心連在一起。'));
  const artwork = el('div', undefined, 'orbit'); artwork.append(el('span', '生活線索', 'orbit-chip one'), el('span', '本人回覆', 'orbit-chip two'), el('span', '有人接手', 'orbit-chip three'), el('div', 'p', 'orbit-center')); story.append(artwork);
  const panel = el('section', undefined, 'onboard-panel'); panel.append(el('span', 'WELCOME TO PICOCARE', 'eyebrow'), el('h2', '從你的照顧空間開始'), el('p', '無論是一個家，或一整個照護團隊，都能從這裡開始。', 'muted'));
  const form = el('form');
  const kindLabel = el('label', '使用方式'), select = el('select'); select.name = 'kind';
  for (const [value, label] of [['personal', '個人照顧者 · 關心家人'], ['institution', '照護機構 · 團隊集中管理']]) { const option = el('option', label); option.value = value; select.append(option); } kindLabel.append(select);
  function input(label: string, name: string, placeholder: string) { const wrapper = el('label', label), control = el('input'); control.name = name; control.required = true; control.maxLength = 40; control.placeholder = placeholder; wrapper.append(control); return wrapper; }
  form.append(kindLabel, input('你的稱呼', 'caregiverName', '例如：小安'), input('照顧空間名稱', 'label', '例如：我們一家、晴日照護中心'));
  const submit = el('button', '建立照顧空間', 'primary'); submit.type = 'submit'; form.append(submit);
  form.addEventListener('submit', event => { event.preventDefault(); void action(async () => { const data = Object.fromEntries(new FormData(form)); const result = await api<{workspace: Workspace}>('/api/workspaces', data); workspace = result.workspace; await init(); }); });
  panel.append(form, el('p', '本機開發版 · 照顧空間保留於目前瀏覽器工作階段', 'footnote')); page.append(story, panel); app.append(page);
}
function shell() {
  app.replaceChildren();
  const sidebar = el('aside', undefined, 'sidebar'); sidebar.append(brand(), el('div', workspace!.kind === 'institution' ? '機構照護空間' : '個人照顧空間', 'workspace-type'), el('h3', workspace!.label));
  const nav = el('nav');
  const allButton = button('◉  關懷總覽', () => { filter = 'all'; render(); }, 'nav-item active'); allButton.dataset.filter = 'all';
  const attentionButton = button('♡  需要關注', () => { filter = 'attention'; render(); }, 'nav-item'); attentionButton.dataset.filter = 'attention';
  nav.append(allButton, attentionButton); sidebar.append(nav);
  const note = el('div', undefined, 'sidebar-note'); note.append(el('span', '一份關心，多一點理解。'), el('p', '先看線索，再決定下一步。')); sidebar.append(note, el('div', `${workspace!.caregiverName} · 照顧者`, 'caregiver')); app.append(sidebar);
  const main = el('main', undefined, 'main');
  const top = el('header', undefined, 'topbar'); top.append(el('span', workspace!.kind === 'institution' ? '機構工作台 / 關懷總覽' : '我的關懷 / 最近狀況'), el('span', '◌  Meta 等待額度 · 本機規則整理', 'model-badge')); main.append(top);
  const hero = el('section', undefined, 'hero'), heroCopy = el('div'); heroCopy.append(el('span', 'A LITTLE CLOSER, EVERY DAY.', 'eyebrow'), el('h1', workspace!.kind === 'institution' ? '今天的關心，從這裡開始。' : '讓牽掛，多一份安心。'), el('p', '看見最近的手機線索，也聽見本人真正的回覆。', 'muted')); hero.append(heroCopy, button('＋ 配對手機', () => { $('pair-result').replaceChildren(); ($('pair-form') as HTMLFormElement).reset(); $<HTMLDialogElement>('pair-dialog').showModal(); }, 'primary')); main.append(hero);
  const stats = el('section', undefined, 'stats'); stats.id = 'stats'; main.append(stats);
  const inbox = el('section', undefined, 'care-inbox'); inbox.id = 'care-inbox'; main.append(inbox);
  const toolbar = el('section', undefined, 'toolbar'), title = el('div'); title.append(el('h2', '關懷對象'), el('span', '資料每 5 秒更新 · 情境超過 2 分鐘會標示過期', 'muted small')); toolbar.append(title);
  const tools = el('div', undefined, 'tools'), input = el('input'); input.type = 'search'; input.placeholder = '搜尋稱呼'; input.setAttribute('aria-label', '搜尋關懷對象'); input.value = search; input.addEventListener('input', () => { search = input.value; renderCards(); }); tools.append(input, button('重新整理', async () => { await refresh(); toast('已更新最近狀況'); }, 'secondary')); if (demoEnabled) tools.append(button('加入示範', async () => { await api('/api/demo', {}); await refresh(); }, 'text-button')); toolbar.append(tools); main.append(toolbar);
  const grid = el('section', undefined, 'people-grid'); grid.id = 'people-grid'; main.append(grid);
  const footer = el('footer'); footer.append(el('span', 'PicoCare · 每一筆線索都有時間，每一次關心都有回應。'), el('span', new Date().toLocaleDateString('zh-TW', { dateStyle: 'long' }))); main.append(footer); app.append(main); render();
}
function render() {
  const stats = $('stats'); if (!stats) return; stats.replaceChildren();
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(node => { node.classList.toggle('active', node.dataset.filter === filter); node.setAttribute('aria-pressed', String(node.dataset.filter === filter)); });
  const values = [['關懷中的對象', people.length, '一起連起的每一份關心'], ['今日已回報', people.filter(p => p.checkin === 'reported').length, '來自本人按下的回覆'], ['需要協助', people.filter(p => p.helpOpen).length, '明確求助，等待有人接手']];
  for (const [index, [label, count, description]] of values.entries()) { const node = el('article', undefined, 'stat' + (index === 2 ? ' attention' : '')); node.append(el('span', String(label), 'muted'), el('strong', String(count)), el('small', String(description))); stats.append(node); }
  renderCards();
  renderAlerts();
}
function renderCards() {
  const grid = $('people-grid'); if (!grid) return; grid.replaceChildren();
  const visible = people.filter(p => p.name.includes(search) && (filter === 'all' || p.helpOpen || p.care?.state === 'escalated' || p.checkin !== 'reported' || p.connection !== 'recent'));
  if (!visible.length) { const empty = el('div', undefined, 'empty'); empty.append(el('div', '◎', 'empty-icon'), el('h3', people.length ? '這裡暫時沒有符合的對象' : '把第一位關心的人連進來'), el('p', people.length ? '可以換個搜尋條件看看。' : '點右上角「配對手機」，在被照顧者的 PicoCare 輸入配對碼。')); grid.append(empty); return; }
  for (const person of visible) {
    const card = el('article', undefined, 'person-card' + (person.helpOpen ? ' needs-help' : ''));
    const header = el('div', undefined, 'person-header'), avatar = el('div', person.name.slice(0, 1), 'avatar'), who = el('div'); who.append(el('h3', person.name)); if (person.demo) who.append(el('span', '示範資料', 'demo-tag')); else who.append(el('span', '已配對手機', 'muted small'));
    header.append(avatar, who, el('span', person.helpOpen ? '需要協助' : person.checkin === 'reported' ? '今日已回報' : '等待回覆', 'status ' + (person.helpOpen ? 'urgent' : person.checkin === 'reported' ? 'reported' : 'waiting'))); card.append(header);
    const context = el('div', undefined, 'context-block' + (person.assessment.state === 'stale' ? ' stale' : '')); context.append(el('span', '最近情境 · 本機規則', 'eyebrow'), el('h4', person.assessment.title), el('p', person.assessment.explanation)); card.append(context);
    const facts = el('div', undefined, 'compact-facts'); facts.append(el('span', `◷ ${ago(person.observedAt)}`), el('span', person.facts?.batteryPercent == null ? '電量 —' : `▱ ${person.facts.batteryPercent}%${person.facts.charging ? ' · 充電中' : ''}`)); card.append(facts);
    if (person.secretary.decision.action !== 'none' && person.secretary.decision.validUntil > currentTime()) card.append(el('p', person.secretary.decision.title, 'care-state'));
    if (person.secretary.outing && ['question_pending', 'deferred', 'escalated'].includes(person.secretary.outing.state)) card.append(el('p', `外出確認 · ${careLabels[person.secretary.outing.state]}`, 'care-state'));
    if (person.secretary.confirmation) card.append(el('p', `本人 ${time(person.secretary.confirmation.observedAt)} 確認：${person.secretary.confirmation.text}`, 'small'));
    if (person.care) card.append(el('p', careLabels[person.care.state], 'care-state'));
    const bottom = el('div', undefined, 'card-bottom'); bottom.append(el('span', `本人回覆 ${person.lastCheckin ? time(person.lastCheckin) : '尚未收到'}`, 'muted small'), button('查看狀況 ↗', () => openPerson(person.id), 'text-button')); card.append(bottom); grid.append(card);
  }
}
async function refresh() {
  const result = await api<PeopleResponse>('/api/people'); people = result.people; alerts = result.alerts; serverClock = result.serverAt; receivedClock = Date.now();
  if (workspace?.workspaceId !== result.workspace.workspaceId) { workspace = result.workspace; shell(); } else render();
  desktopAlerts();
}
async function openPerson(id: string) {
  const detail = await api<PersonDetail>(`/api/people/${id}`), p = detail.person; selectedId = id;
  const target = $('person-detail'); target.replaceChildren(el('span', 'CARE IN CONTEXT', 'eyebrow'), el('h2', `${p.name}的最近狀況`));
  if (p.demo) target.append(el('p', '這是合成示範資料，沒有連接實體手機。', 'demo-notice'));
  const summary = el('section', undefined, 'detail-summary'); summary.append(el('h3', p.assessment.title), el('p', p.assessment.explanation), el('small', `情境觀測 ${ago(p.observedAt)} · 服務收件 ${ago(p.lastSeen)} · 本機規則整理`)); target.append(summary);
  const evidence = el('section'); evidence.append(el('h3', '支持這個判斷的線索')); const list = el('ul', undefined, 'evidence-list');
  for (const e of p.assessment.evidence) { const item = el('li'); item.append(el('span', e.label), el('time', time(e.observedAt))); list.append(item); } if (!list.children.length) list.append(el('li', '目前沒有可用線索')); evidence.append(list); target.append(evidence);
  if (p.assessment.gaps.length) target.append(el('p', p.assessment.gaps.join('；'), 'gaps'));
  if (p.facts?.sharing === 'detailed') {
    const details = el('details'); details.append(el('summary', '查看已選擇分享的詳細資訊'));
    if (p.facts.location) { const l = p.facts.location; details.append(el('p', `位置 ${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)} · 精度 ${Math.round(l.accuracy)}m · ${ago(l.observedAt)}`)); }
    for (const n of p.facts.notifications) if (n.text) details.append(el('p', `${time(n.observedAt)} · ${n.text}`)); target.append(details);
  }
  target.append(el('div', p.assessment.nextAction, 'next-action'));
  const secretary = el('section', undefined, 'detail-summary'), d = p.secretary.decision;
  secretary.append(el('h3', `秘書的情境判讀 · ${d.validUntil <= currentTime() ? '需要更新' : '本地證據判讀'}`), el('h4', d.title), el('p', d.reason));
  for (const e of d.evidence) secretary.append(el('p', `${time(e.observedAt)} · ${e.label}`, 'small'));
  for (const line of [...d.alternatives, ...d.gaps]) secretary.append(el('p', line, 'small'));
  if (p.secretary.confirmation) secretary.append(el('p', `${time(p.secretary.confirmation.observedAt)} 本人已確認：${p.secretary.confirmation.text}`));
  if (p.secretary.outing) {
    const c = p.secretary.outing; secretary.append(el('h4', `外出確認 · ${careLabels[c.state]}`), el('p', c.reason));
    const trigger = el('details'); trigger.append(el('summary', '當時為什麼主動詢問？'), el('p', c.decision.reason));
    for (const e of c.decision.evidence) trigger.append(el('p', `${time(e.observedAt)} · ${e.label}`, 'small')); secretary.append(trigger);
    if (['question_pending', 'deferred', 'escalated'].includes(c.state)) secretary.append(button('已聯絡並釐清外出情況', async () => { await api(`/api/people/${id}/secretary/resolve`, { caseId: c.id }); await refresh(); await openPerson(id); }, 'secondary'));
  }
  target.append(secretary);
  const schedule = el('section'), form = el('form'); schedule.append(el('h3', '每日關心時間'), el('p', `依 ${workspace!.timezone} 執行。儲存後從下一個尚未到達的關心時間開始。`, 'muted small'));
  const enabledLabel = el('label', '啟用未報安自動確認'), enabled = el('input'); enabled.type = 'checkbox'; enabled.checked = detail.plan.enabled; enabledLabel.prepend(enabled); enabledLabel.className = 'check-label'; form.append(enabledLabel);
  const contextualLabel = el('label', '啟用情境秘書：看片延後確認、外出變化主動詢問'), contextual = el('input'); contextual.type = 'checkbox'; contextual.checked = detail.plan.contextualEnabled; contextualLabel.prepend(contextual); contextualLabel.className = 'check-label'; form.append(contextualLabel);
  const inputs: Record<string, HTMLInputElement> = {};
  for (const [key, label, type] of [['timeOfDay', '每日關心時間', 'time'], ['graceMinutes', '先等待幾分鐘', 'number'], ['responseMinutes', '問一題後等幾分鐘', 'number'], ['deferMinutes', '選「晚點回覆」再等幾分鐘', 'number']]) {
    const wrapper = el('label', label), input = el('input'); input.type = type; input.value = String(detail.plan[key as keyof CarePlan]); input.required = true;
    if (type === 'number') { input.min = '1'; input.max = '240'; } inputs[key] = input; wrapper.append(input); form.append(wrapper);
  }
  const save = el('button', '儲存關心時間', 'secondary'); save.type = 'submit'; save.disabled = p.demo; form.append(save);
  form.addEventListener('submit', event => { event.preventDefault(); void action(async () => {
    await api(`/api/people/${id}/plan`, { enabled: enabled.checked, contextualEnabled: contextual.checked, timeOfDay: inputs.timeOfDay.value, graceMinutes: +inputs.graceMinutes.value, responseMinutes: +inputs.responseMinutes.value, deferMinutes: +inputs.deferMinutes.value });
    toast('已儲存關心時間'); await refresh(); await openPerson(id);
  }); }); schedule.append(form); target.append(schedule);
  if (detail.care) {
    const flow = el('section'); flow.append(el('h3', `${detail.care.day} 的關心流程 · ${careLabels[detail.care.state]}`), el('p', detail.care.reason));
    if (detail.care.deadline) flow.append(el('p', `${detail.care.state === 'escalated' ? '原等待期限' : '等待至'} ${new Date(detail.care.deadline).toLocaleString('zh-TW')}`));
    for (const step of detail.care.steps) flow.append(el('p', `${time(step.at)} · ${step.detail}`, 'small'));
    target.append(flow);
  }
  for (const a of detail.alerts) {
    const section = el('section', undefined, 'care-alert'); section.append(el('h3', `${a.kind === 'help' ? '本人求助' : '交給照顧者的事項'}${a.resolvedAt ? ' · 已結束' : ''}`), el('p', a.title));
    for (const line of a.evidence) section.append(el('p', line, 'small'));
    if (a.question) section.append(el('p', `問過：${a.question}`));
    section.append(el('p', a.answer ? `當時回答：${a.answer}` : '產生提醒時尚無本人回答')); target.append(section);
  }
  if (detail.questions.length) {
    const section = el('section'); section.append(el('h3', 'PicoCare 的問題與本人回答'));
    const review: Record<string, string> = { clarified: '本人已確認這一題的情況', needs_contact: '本人希望照顧者聯絡', deferred: '本人暫時不方便回答', pending: '補充內容保留，等待釐清' };
    for (const q of detail.questions) {
      const item = el('div', undefined, 'detail-summary'); item.append(el('p', q.prompt));
      if (q.answer) {
        item.append(el('p', q.answer.elseText || q.answer.label));
        item.append(el('small', `${time(q.answer.observedAt)} · ${review[q.answer.review]}${q.status === 'answered_late' ? ' · 延遲收到' : ''}`));
      } else item.append(el('small', q.status === 'closed_by_checkin' ? '本人已直接報安，這一題停止等候' : q.status === 'cancelled' ? '照顧者已停止這一題' : q.status === 'expired' ? '問題已過期，尚未收到回答' : '等待本人選擇答案'));
      section.append(item);
    } target.append(section);
  }
  const actions = el('div', undefined, 'detail-actions');
  const remind = button('發送報安提醒', async () => { await api(`/api/people/${id}/reminders`, {}); toast('提醒已排入，等手機領取並回報執行結果'); await openPerson(id); }, 'primary'); remind.disabled = p.demo; actions.append(remind);
  actions.append(button('記錄已聯絡', async () => { await api(`/api/people/${id}/contacts`, { outcome: 'contacted', note: '' }); toast('已記下聯絡結果'); await openPerson(id); }, 'secondary'));
  if (detail.care && ['waiting', 'observing', 'question_pending', 'deferred', 'escalated'].includes(detail.care.state)) actions.append(button('已聯絡並確認近況', async () => {
    await api(`/api/people/${id}/contacts`, { outcome: 'care_resolved', runId: detail.care!.id, note: '照顧者已聯絡並確認近況' }); await refresh(); await openPerson(id);
  }, 'secondary'));
  if (p.helpOpen) actions.append(button('完成這次求助處理', async () => { await api(`/api/people/${id}/contacts`, { outcome: 'help_resolved', helpEventId: p.helpEventId, revision: p.revision, note: '照顧者已完成聯絡與處理' }); toast('求助處理已完成'); await refresh(); await openPerson(id); }, 'secondary')); target.append(actions);
  if (detail.reminders.length) { target.append(el('h3', '提醒執行結果')); const labels: Record<string, string> = { pending: '等待手機領取', executed: '手機已執行通知', declined: '手機無法顯示通知', cancelled: '本人已回報，提醒已停止', expired: '提醒已過期' }; for (const r of detail.reminders) target.append(el('p', `${time(r.createdAt)} · ${labels[r.result] || r.result}`, 'small')); }
  target.append(el('h3', '最近互動')); const timeline = el('ul', undefined, 'timeline'); const labels: Record<string, string> = { checkin: '本人送出報安', help: '本人按下需要協助', reminder_result: '手機送回提醒執行結果', question_answer: '本人回答 PicoCare 的問題', contact: '照顧者補充聯絡結果' };
  for (const event of detail.timeline) { const item = el('li'); item.append(el('time', time(event.at)), el('span', labels[event.kind] || event.kind)); if (event.note) item.append(el('small', event.note)); timeline.append(item); } if (!timeline.children.length) timeline.append(el('li', '配對完成後，互動紀錄會出現在這裡。')); target.append(timeline);
  const dialog = $('detail-dialog') as HTMLDialogElement; if (!dialog.open) dialog.showModal();
}
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(node => node.addEventListener('click', () => { ($<HTMLDialogElement>(node.dataset.close!)).close(); selectedId = null; }));
$('pair-form').addEventListener('submit', event => { event.preventDefault(); void action(async () => {
  const form = event.target as HTMLFormElement, result = await api<{code: string; expiresAt: number; displayName: string}>('/api/pairings', Object.fromEntries(new FormData(form)));
  const target = $('pair-result'); target.replaceChildren(el('p', `請在${result.displayName}的手機輸入`), el('strong', result.code, 'pair-code'), el('p', `有效至 ${time(result.expiresAt)}，使用一次後失效。`, 'muted small'));
}); });
async function init() {
  try { const result = await api<{workspace: Workspace; demoEnabled: boolean}>('/api/session'); workspace = result.workspace; demoEnabled = result.demoEnabled; shell(); await refresh(); }
  catch (error) { if (workspace) toast(error instanceof Error ? error.message : '連線失敗'); else onboarding(); }
}
setInterval(() => { if (workspace && (!document.hidden || ('Notification' in window && Notification.permission === 'granted')) && !pending) void refresh().catch(() => toast('連線中斷，畫面保留上次資料；請留意觀測時間')); }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && workspace) void refresh().catch(() => {}); });
void init();
