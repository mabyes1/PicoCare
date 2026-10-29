export type Workspace = { workspaceId: string; label: string; caregiverName: string; kind: 'personal' | 'institution'; timezone: string };
export type PhoneContext = {
  batteryPercent: number | null; charging: boolean | null;
  network: 'online' | 'offline' | 'unknown'; screenInteractive: boolean | null;
  ringer: 'normal' | 'vibrate' | 'silent' | 'unknown'; motion: 'moving' | 'stationary' | 'unknown';
  motionEvidence?: { observedAt: number; accuracy: number; speed: number; speedAccuracy: number } | null;
  usage?: { appId: string; category: 'video' | 'other'; observedAt: number; changedAt: number } | null;
  media?: { appId: string; state: 'playing' | 'paused' | 'stopped' | 'unknown'; observedAt: number } | null;
  sources?: { notifications: SourceState; location: SourceState; usage?: SourceState; media?: SourceState };
  location: { latitude: number; longitude: number; accuracy: number; observedAt: number } | null;
  notifications: { category: 'navigation' | 'call' | 'other'; text?: string; observedAt: number; postedAt?: number }[];
  sharing: 'summary' | 'detailed';
};
export type SourceState = 'available' | 'disabled' | 'permission_missing' | 'disconnected' | 'no_fix' | 'stale' | 'inaccurate' | 'speed_unavailable' | 'error';
export type CarePlan = { enabled: boolean; contextualEnabled: boolean; graceMinutes: number; responseMinutes: number; deferMinutes: number; cooldownMinutes: number };
export type CareRun = { id: string; day: string; dueAt: number; deadline: number | null; questionId: string | null;
  state: 'waiting' | 'observing' | 'question_pending' | 'deferred' | 'clarified' | 'escalated' | 'resolved' | 'cancelled';
  reason: string; steps: { at: number; kind: string; detail: string }[] };
export type CareAlert = { id: string; personId: string; personName: string; runId: string | null; kind: 'unclarified' | 'help';
  createdAt: number; readAt: number | null; resolvedAt: number | null; title: string;
  evidence: string[]; question: string | null; answer: string | null };
export type Assessment = {
  source: 'rules' | 'meta'; meta: string; state: 'fresh' | 'stale' | 'unknown';
  title: string; explanation: string; evidence: { label: string; observedAt: number }[]; gaps: string[]; nextAction: string;
};
export type CareQuestion = {
  topic: 'checkin' | 'video' | 'outing';
  id: string; prompt: string; options: { id: string; label: string }[];
  elseLabel: string; maxElseLength: number; createdAt: number; expiresAt: number;
  source: 'rules'; status: 'open' | 'answered' | 'answered_late' | 'expired' | 'closed_by_checkin' | 'cancelled';
};
export type QuestionRecord = CareQuestion & {
  answer: null | { optionId: string; label: string; elseText?: string; observedAt: number; review: 'clarified' | 'needs_contact' | 'deferred' | 'pending' };
};
export type PersonView = {
  id: string; name: string; demo: boolean; revision: number; lastSeen: number | null; observedAt: number | null;
  lastCheckin: number | null; checkin: 'reported' | 'awaiting'; helpOpen: boolean;
  helpEventId: string | null; helpAt: number | null; connection: 'waiting' | 'stale' | 'recent';
  facts: PhoneContext | null; assessment: Assessment;
  care: CareRun | null;
  secretary: SecretaryView;
};
export type ContextDecision = {
  source: 'local_evidence' | 'meta'; model?: string; scenario: 'video' | 'outing' | 'other' | 'unknown'; action: 'wait' | 'confirm' | 'none';
  title: string; reason: string; at: number; validUntil: number;
  evidence: { eventId: string; label: string; observedAt: number }[];
  alternatives: string[]; gaps: string[];
};
export type ElseReview = { review: 'clarified' | 'needs_contact' | 'pending'; summary: string };
export type SecretaryCase = { id: string; state: 'question_pending' | 'deferred' | 'clarified' | 'escalated' | 'resolved' | 'cancelled';
  createdAt: number; deadline: number | null; questionId: string; reason: string; decision: ContextDecision };
export type SecretaryNote = { id: string; at: number; kind: string; title: string; body: string;
  evidence: { eventId: string; label: string; observedAt: number }[]; source: 'local_evidence' | 'meta' };
export type SecretaryView = { decision: ContextDecision; latestMeta: ContextDecision | null; outing: SecretaryCase | null;
  confirmation: { topic: string; text: string; observedAt: number } | null; notes: SecretaryNote[];
  weekly: { text: string; at: number; model: string } | null };
export type MetaIntegration = { enabled: boolean; status: string; model: string | null; requestsToday?: number; dailyLimit?: number; lastSuccessAt?: number | null; lastError?: string | null };
export type PeopleResponse = { workspace: Workspace; serverAt: number; people: PersonView[]; alerts: CareAlert[]; meta: MetaIntegration };
export type PersonDetail = {
  person: PersonView;
  questions: QuestionRecord[];
  plan: CarePlan;
  care: CareRun | null;
  alerts: CareAlert[];
  timeline: { id: string; kind: string; at: number; receivedAt?: number; outcome?: string; note?: string }[];
  reminders: { id: string; createdAt: number; expiresAt: number; result: string }[];
};
