import test from 'node:test';
import assert from 'node:assert/strict';
import { planStudent } from '../lib/personalization-plan.js';

test('60 percent belongs to shared practice; just below is targeted', () => {
  assert.equal(planStudent([{ pointsPossible: 100, pointsEarned: 60 }], 10).targeted, false);
  assert.equal(planStudent([{ pointsPossible: 100, pointsEarned: 59.99 }], 10).targeted, true);
});
test('uses points, ranks weakest topics, and rounds the 70/30 split', () => {
  const plan = planStudent([{ topic: 'Algebra', pointsPossible: 8, pointsEarned: 0 }, { topic: 'Fractions', pointsPossible: 2, pointsEarned: 2 }], 5);
  assert.equal(plan.percentage, 20);
  assert.deepEqual(plan.weakTopics, ['Algebra']);
  assert.equal(plan.focusCount, 4);
  assert.equal(planStudent([{ pointsPossible: 10, pointsEarned: 1 }], 10).focusCount, 7);
});
test('missing, unfinished and invalid marks never become a low-score classification', () => {
  for (const results of [[], [{ pointsPossible: 5, pointsEarned: 0, pendingReview: true }], [{ pointsPossible: 0, pointsEarned: 0 }], [{ pointsPossible: 5, pointsEarned: NaN }]]) assert.equal(planStudent(results, 10), null);
});

process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-personalization', storageBucket: 'demo-personalization.appspot.com' });
process.env.VERTEX_AI_API_KEY = 'test-only-not-a-real-key';
const { db, adminAuth } = await import('../lib/firebase.js');
const api = await import('../lib/personalization.js');
const { mock } = await import('node:test');
let store;
const snap = path => ({ id: path.split('/').at(-1), exists: store.has(path), ref: doc(path), get: key => store.get(path)?.[key], data: () => store.get(path) });
const doc = path => ({ path, id: path.split('/').at(-1), get: async () => snap(path), collection: name => col(`${path}/${name}`), set: async (data, options) => store.set(path, options?.merge ? { ...store.get(path), ...data } : data), update: async data => store.set(path, { ...store.get(path), ...data }) });
const col = (path, filters = []) => ({ doc: (name = crypto.randomUUID()) => doc(`${path}/${name}`), where: (field, op, value) => col(path, [...filters, [field, value]]), limit: () => col(path, filters), get: async () => ({ docs: [...store.keys()].filter(k => k.startsWith(`${path}/`) && k.split('/').length === path.split('/').length + 1 && filters.every(([field,value]) => store.get(k)[field] === value)).map(snap) }) });
mock.method(db, 'collection', col);
mock.method(db, 'runTransaction', async callback => {
  const pending = [];
  const result = await callback({ get: async ref => snap(ref.path), set: (ref,data,options) => pending.push(() => ref.set(data,options)), update: (ref,data) => pending.push(() => ref.update(data)), create: (ref,data) => { assert.equal(store.has(ref.path), false); pending.push(() => ref.set(data)); } });
  for (const apply of pending) await apply();
  return result;
});
mock.method(adminAuth, 'getUser', async () => ({ metadata: { creationTime: '2026-01-01T00:00:00Z' } }));
let calls = [];
mock.method(globalThis, 'fetch', async (_url, options) => {
  const prompt = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
  calls.push(prompt);
  const questions = Array.from({ length: prompt.settings.questionCount }, (_,i) => ({ id: `q${i}`, type: prompt.settings.questionTypes[0], question: `Calculate this new sum ${calls.length} + ${i}?`, correctAnswer: '2', choices: prompt.settings.questionTypes[0] === 'multiple_choice' ? ['2','3'] : undefined, explanation: 'Add the numbers.', hints: [], difficulty: 'easy', topic: 'Algebra', confidence: 'high', needsReview: false }));
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ questions }) }] } }] }) };
});
const req = (data, uid = 'teacher') => ({ data, auth: { uid, token: { name: uid } } });
function fixture() {
  store = new Map(); calls = [];
  store.set('users/teacher', { role: 'teacher' });
  store.set('classrooms/class', { teacherId: 'teacher', subject: 'Mathematics' });
  store.set('classrooms/class/exercises/previous', { title: 'Algebra', questions: [{ question: 'Calculate 1+1', answer: '2', topic: 'Algebra' }] });
  for (const [uid, mark] of [['strong', 6], ['strong2', 9], ['weak', 2], ['missing', null]]) {
    store.set(`classrooms/class/members/${uid}`, { status: 'active' });
    if (mark !== null) store.set(`classrooms/class/exercises/previous/submissions/${uid}`, { studentId: uid, studentName: uid, questionResults: [{ topic: 'Algebra', pointsPossible: 10, pointsEarned: mark }] });
  }
}
test('AI generation, draft review, shared/private delivery and server marking', async () => {
  fixture();
  const input = { classroomId: 'class', sourceId: 'previous', questionCount: 5, questionType: 'multiple_choice' };
  const preview = await api.generatePersonalizedExercise.run(req({ ...input, preview: true }));
  assert.equal(preview.credits, 10); assert.equal(preview.students, 3); assert.equal(preview.skipped.length, 1); assert.equal(calls.length, 0);
  const generated = await api.generatePersonalizedExercise.run(req(input));
  assert.deepEqual(calls.map(c => c.settings.questionCount), [5,4,1]);
  assert.equal(store.get('usage/teacher').questionsUsed, 10);
  assert.equal(store.get(`personalizedDrafts/${generated.draftId}`).status, 'draft');
  const publish = { draftId: generated.draftId, title: 'Practice', deadline: null, allowLateSubmissions: true, variants: generated.variants };
  await api.publishPersonalizedExercise.run(req({ ...publish, saveOnly: true }));
  assert.equal(store.has(`classrooms/class/exercises/${generated.draftId}`), false);
  await api.publishPersonalizedExercise.run(req(publish));
  const target = { classroomId: 'class', exerciseId: generated.draftId };
  const a = await api.getPersonalizedQuestions.run(req(target, 'strong'));
  const b = await api.getPersonalizedQuestions.run(req(target, 'strong2'));
  const w = await api.getPersonalizedQuestions.run(req(target, 'weak'));
  assert.deepEqual(a.questions, b.questions); assert.notDeepEqual(a.questions, w.questions);
  assert.ok(w.questions.every(q => q.answer === ''));
  await assert.rejects(() => api.getPersonalizedQuestions.run(req(target, 'missing')), /fully marked/);
  await assert.rejects(() => api.getPersonalizedQuestions.run(req(target, 'outsider')), /not a member/);
  const result = await api.submitPersonalizedExercise.run(req({ ...target, answers: { 0: '2', 1: '3' }, score: 999 }, 'weak'));
  assert.equal(result.score, 2); assert.equal(result.totalPoints, 10); assert.equal(result.totalCorrect, 1);
  await assert.rejects(() => api.submitPersonalizedExercise.run(req({ ...target, answers: {} }, 'weak')), /already submitted/);
});
test('quota limits apply before any AI call; other teachers cannot use a classroom', async () => {
  fixture();
  await assert.rejects(() => api.generatePersonalizedExercise.run(req({ classroomId: 'class', sourceId: 'previous', questionCount: 10 })), /20 question credits/);
  assert.equal(calls.length, 0);
  store.set('users/intruder', { role: 'teacher' });
  await assert.rejects(() => api.generatePersonalizedExercise.run(req({ classroomId: 'class', sourceId: 'previous', questionCount: 5 }, 'intruder')), /do not own/);
});
test('manual answers stay pending until teacher marking and cannot be used for personalization', async () => {
  fixture();
  const generated = await api.generatePersonalizedExercise.run(req({ classroomId: 'class', sourceId: 'previous', questionCount: 2 }));
  const variants = generated.variants.map(v => ({ ...v, questions: v.questions.map(q => ({ ...q, markingMode: 'manual' })) }));
  await api.publishPersonalizedExercise.run(req({ draftId: generated.draftId, title: 'Manual practice', deadline: null, allowLateSubmissions: true, variants }));
  const result = await api.submitPersonalizedExercise.run(req({ classroomId: 'class', exerciseId: generated.draftId, answers: { 0: '2', 1: '2' } }, 'weak'));
  assert.equal(result.score, 0); assert.ok(result.questionResults.every(r => r.pendingReview));
  assert.equal(planStudent(result.questionResults, 2), null);
});
test('invalid AI output refunds the reservation and saves no draft', async () => {
  fixture();
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: [] }) }] } }] }) }));
  try {
    await assert.rejects(() => api.generatePersonalizedExercise.run(req({ classroomId: 'class', sourceId: 'previous', questionCount: 2 })));
    assert.equal(store.get('usage/teacher').questionsUsed, 0);
    assert.equal([...store.keys()].some(k => k.startsWith('personalizedDrafts/')), false);
  } finally { fetchMock.mock.restore(); }
});
