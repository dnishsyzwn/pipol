import { randomUUID } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from './firebase.js';
import { config, providerSecrets } from './config.js';
import { requireTeacher, requireAuth, requireClassroomOwner } from './auth.js';
import { failed, denied } from './errors.js';
import { generateQuiz } from './provider.js';
import { GeneratedQuizSchema, removeUndefinedValues, validateQuestionSet } from './schemas.js';
import { reserveQuota, refundReservation, settleQuota, type QuotaReservation } from './quota.js';
import { assertGenerationInput } from './safety.js';
import { planStudent } from './personalization-plan.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const inputSchema = z.object({ classroomId: id, sourceId: id, questionCount: z.number().int().min(2).max(15), prompt: z.string().max(6000).default(''), questionType: z.enum(['short_answer', 'multiple_choice']).default('short_answer'), preview: z.boolean().default(false) });
const questionSchema = z.object({ id: z.string().max(160), question: z.string().min(1).max(12000), answer: z.string().min(1).max(4000), type: z.enum(['short_answer', 'multiple_choice']), choices: z.array(z.string().min(1).max(2000)).max(8).default([]), markingMode: z.enum(['automatic', 'manual']).default('automatic'), points: z.number().min(1).max(100), difficulty: z.enum(['easy','medium','hard']), topic: z.string().min(1).max(200), subtopic: z.string().max(200).default(''), skills: z.array(z.string().max(200)).max(5).default([]) });
type Question = z.infer<typeof questionSchema>;
type Variant = { key: string; label: string; studentId: string | null; percentage: number | null; weakTopics: string[]; questions: Question[] };

async function requireExerciseMember(classroomId: string, uid: string) {
  const member = await db.collection('classrooms').doc(classroomId).collection('members').doc(uid).get();
  // Existing approved memberships omit status; mirror the classroom rules.
  if (!member.exists || (member.get('status') !== undefined && member.get('status') !== 'active')) denied('You are not a member of this classroom.');
}

export const generatePersonalizedExercise = onCall({ region: 'asia-southeast1', enforceAppCheck: true, timeoutSeconds: 120 }, async request => {
  const auth = await requireTeacher(request);
  const input = inputSchema.parse(request.data);
  await requireClassroomOwner(input.classroomId, auth.uid);
  assertGenerationInput(input.prompt || 'Create practice based on the selected previous exercise.');
  const classroom = db.collection('classrooms').doc(input.classroomId);
  const source = await classroom.collection('exercises').doc(input.sourceId).get();
  if (!source.exists) failed('Choose an existing exercise in this classroom.');
  const members = await classroom.collection('members').get();
  const submissions = await source.ref.collection('submissions').get();
  const variants: Variant[] = [];
  const assignments: Record<string, string> = {};
  const skipped: string[] = [];
  for (const member of members.docs) {
    if (member.get('status') !== undefined && member.get('status') !== 'active') continue;
    const sub = submissions.docs.find(s => s.id === member.id) || submissions.docs.find(s => s.get('studentId') === member.id);
    const plan = planStudent(sub?.get('questionResults') || [], input.questionCount);
    if (!plan) { skipped.push(String(member.get('name') || member.get('displayName') || member.get('studentName') || member.id)); continue; }
    assignments[member.id] = plan.targeted ? member.id : 'shared';
    if (plan.targeted) variants.push({ key: member.id, studentId: member.id, label: String(sub?.get('studentName') || 'Student'), percentage: plan.percentage, weakTopics: plan.weakTopics, questions: [] });
  }
  if (Object.values(assignments).includes('shared')) variants.unshift({ key: 'shared', studentId: null, label: 'Shared practice · 60% and above', percentage: null, weakTopics: [], questions: [] });
  if (!variants.length) failed('No students have fully marked results for this exercise yet. Finish marking before personalizing.');
  if (variants.length > 400) failed('This classroom exceeds the supported batch size of 400 question sets. Split the classroom into smaller groups.');
  const questionTotal = variants.length * input.questionCount;
  const credits = config.personalizedQuotaEnabled ? questionTotal : 0;
  if (input.preview) return { credits, questionTotal, quotaEnabled: config.personalizedQuotaEnabled, sets: variants.length, students: Object.keys(assignments).length, skipped, focusCount: Math.round(input.questionCount * .7) };
  const tags = await classroom.collection('tags').limit(100).get();
  const classroomData = await classroom.get();
  const previousQuestions = source.get('questions')?.length ? source.get('questions') : submissions.docs.flatMap(s => (s.get('questionResults') || []).map((r: { questionText: string; expectedAnswer: string; topic: string; difficulty: string }) => ({ question: r.questionText, answer: r.expectedAnswer, topic: r.topic, difficulty: r.difficulty })));
  const ref = db.collection('personalizedDrafts').doc();
  const lock = db.collection('personalizedGenerationLocks').doc(auth.uid);
  await db.runTransaction(async tx => {
    const current = await tx.get(lock);
    if (Number(current.get('expiresAtMillis') || 0) > Date.now()) failed('Your personalized exercise is already generating. Resume it from saved drafts.');
    tx.set(lock, { draftId: ref.id, expiresAtMillis: Date.now() + 60 * 60 * 1000 });
    tx.create(ref, removeUndefinedValues({ ownerId: auth.uid, classroomId: input.classroomId, sourceId: input.sourceId, assignments, variants, skipped, questionCount: input.questionCount, questionType: input.questionType, prompt: input.prompt, subject: String(classroomData.get('subject') || 'General education'), sourceText: JSON.stringify(previousQuestions).slice(0, 60000), sourceSummary: String(source.get('title') || 'Previous exercise'), tags: tags.docs.map(t => ({ id: t.id, kind: String(t.get('kind')), label: String(t.get('label')) })), storageVersion: 2, quotaEnabled: config.personalizedQuotaEnabled, status: 'generating', completedSets: 0, failedSets: 0, totalSets: variants.length, createdAt: FieldValue.serverTimestamp() }));
    for (const variant of variants) tx.create(ref.collection('generationTasks').doc(variant.key), { key: variant.key, status: 'queued' });
  });
  // Separate task documents let Cloud Functions process a class in the background.
  // Persist each question set separately to avoid Firestore's per-document size limit.
  return { draftId: ref.id, status: 'generating', credits, skipped };
});

export const processPersonalizedSet = onDocumentCreated({ region: 'asia-southeast1', document: 'personalizedDrafts/{draftId}/generationTasks/{taskId}', secrets: providerSecrets, timeoutSeconds: 540, memory: '1GiB', maxInstances: 3, concurrency: 1 }, async event => {
  if (!event.data) return;
  const taskRef = event.data.ref;
  const ref = db.collection('personalizedDrafts').doc(event.params.draftId);
  const claimed = await db.runTransaction(async tx => {
    const task = await tx.get(taskRef);
    if (task.get('status') !== 'queued') return false;
    tx.update(taskRef, { status: 'processing' }); return true;
  });
  if (!claimed) return;
  const draft = await ref.get();
  const variant = (draft.get('variants') as Variant[]).find(v => v.key === event.params.taskId);
  if (!variant) return;
  variant.questions = [];
  let reservation: QuotaReservation | undefined;
  let errorMessage = '';
  try {
    await requireClassroomOwner(draft.get('classroomId'), draft.get('ownerId'));
    if (draft.get('quotaEnabled')) reservation = await reserveQuota(draft.get('ownerId'), draft.get('questionCount'), 0);
    const input = { questionCount: Number(draft.get('questionCount')), questionType: String(draft.get('questionType')), prompt: String(draft.get('prompt')) };
      // Separate calls enforce the rounded 70/30 allocation instead of trusting a prose instruction alone.
      const focusCount = variant.studentId ? Math.round(input.questionCount * .7) : 0;
      const portions = [{ count: focusCount, focused: true }, { count: input.questionCount - focusCount, focused: false }];
      for (const portion of portions) {
        if (!portion.count) continue;
        const generated = GeneratedQuizSchema.parse(await generateQuiz({
          prompt: `Create NEW self-contained practice questions similar in scope to the previous exercise. ${portion.focused ? `Focus ONLY on these weak topic labels: ${JSON.stringify(variant.weakTopics)}. Use these exact topic labels.` : 'Cover the previous exercise topics for reinforcement.'} Include any required statement in the question text. No diagrams, images or external references. Teacher guidance: ${input.prompt}`,
          sourceText: String(draft.get('sourceText')), sourceSummary: String(draft.get('sourceSummary')),
          questionCount: portion.count, subject: String(draft.get('subject')), language: 'English', difficulty: 'mixed',
          questionTypes: [input.questionType], learningObjectives: [], imageMode: 'none', imageCount: 0,
          existingTags: draft.get('tags'),
        }));
        if (generated.questions.length !== portion.count) failed('AI returned an incomplete set. Please generate again.');
        for (const q of validateQuestionSet(generated.questions)) {
          if (q.type !== input.questionType || (portion.focused && !variant.weakTopics.includes(q.topic))) failed('AI did not follow the requested question type or weak topics. Please retry.');
          if (q.type === 'multiple_choice' && (!q.choices?.includes(q.correctAnswer) || new Set(q.choices).size !== q.choices.length)) failed('AI produced invalid answer choices. Please retry.');
          variant.questions.push(questionSchema.parse({ ...q, id: randomUUID(), answer: q.correctAnswer, points: 2, markingMode: 'automatic' }));
        }
      }
    await ref.collection('sets').doc(variant.key).set(removeUndefinedValues(variant));
    if (reservation) await settleQuota(reservation, input.questionCount, 0);
  } catch (error) {
    if (reservation) await refundReservation(reservation);
    errorMessage = error instanceof Error ? error.message.slice(0, 1000) : 'Generation failed. Please retry this draft.';
  }
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    const lock = db.collection('personalizedGenerationLocks').doc(draft.get('ownerId'));
    const lockSnapshot = await tx.get(lock);
    const completedSets = Number(current.get('completedSets') || 0) + 1;
    const failedSets = Number(current.get('failedSets') || 0) + (errorMessage ? 1 : 0);
    const done = completedSets === current.get('totalSets');
    tx.update(taskRef, { status: errorMessage ? 'failed' : 'ready', error: errorMessage });
    tx.update(ref, { completedSets, failedSets, status: done ? (failedSets ? 'failed' : 'draft') : 'generating', ...(errorMessage ? { error: errorMessage } : {}) });
    if (done && lockSnapshot.get('draftId') === ref.id) tx.set(lock, { draftId: ref.id, expiresAtMillis: 0 });
  });
});

export const publishPersonalizedExercise = onCall({ region: 'asia-southeast1', enforceAppCheck: true }, async request => {
  const auth = await requireTeacher(request);
  const input = z.object({ draftId: id, title: z.string().trim().min(1).max(300), deadline: z.string().max(100).nullable(), allowLateSubmissions: z.boolean(), saveOnly: z.boolean().default(false), variants: z.array(z.object({ key: id, questions: z.array(questionSchema).min(2).max(15) })).min(1).max(400) }).parse(request.data);
  if (input.deadline && !Number.isFinite(Date.parse(input.deadline))) failed('Enter a valid deadline.');
  const ref = db.collection('personalizedDrafts').doc(input.draftId);
  const draft = await ref.get();
  if (!draft.exists || draft.get('ownerId') !== auth.uid) denied('Draft unavailable.');
  await requireClassroomOwner(draft.get('classroomId'), auth.uid);
  const original = draft.get('variants') as Variant[];
  if (input.variants.length !== original.length || new Set(input.variants.map(v => v.key)).size !== original.length) failed('Review all generated sets before publishing.');
  const variants = original.map(v => {
    const edited = input.variants.find(e => e.key === v.key);
    if (!edited || edited.questions.length !== draft.get('questionCount')) failed('Each student set must keep the configured question count.');
    for (const q of edited.questions) if (q.type === 'multiple_choice' && (!q.choices.includes(q.answer) || q.choices.length < 2 || new Set(q.choices).size !== q.choices.length)) failed('Every MCQ needs distinct choices and a matching correct answer.');
    return { ...v, questions: edited.questions.map(q => ({ ...q, markingMode: q.type === 'multiple_choice' ? 'automatic' : q.markingMode })) };
  });
  const exerciseRef = db.collection('classrooms').doc(draft.get('classroomId')).collection('exercises').doc(input.draftId);
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (current.get('status') !== 'draft') failed('This draft has already been published.');
    if (draft.get('storageVersion') === 2) for (const variant of variants) tx.set(ref.collection('sets').doc(variant.key), variant);
    tx.update(ref, { variants: draft.get('storageVersion') === 2 ? variants.map(v => ({ ...v, questions: [] })) : variants, title: input.title, deadline: input.deadline, allowLateSubmissions: input.allowLateSubmissions, status: input.saveOnly ? 'draft' : 'published', exerciseId: exerciseRef.id });
    if (input.saveOnly) return;
    tx.create(exerciseRef, { title: input.title, deadline: input.deadline, allowLateSubmissions: input.allowLateSubmissions, personalized: true, personalizedDraftId: ref.id, sourceExerciseId: draft.get('sourceId'), teacherId: auth.uid, questionCount: draft.get('questionCount'), questions: [], enhanced: true, createdAt: FieldValue.serverTimestamp() });
  });
  return { exerciseId: exerciseRef.id };
});

export const getPersonalizedQuestions = onCall({ region: 'asia-southeast1', enforceAppCheck: true }, async request => {
  const auth = requireAuth(request);
  const input = z.object({ classroomId: id, exerciseId: id }).parse(request.data);
  const exercise = await db.collection('classrooms').doc(input.classroomId).collection('exercises').doc(input.exerciseId).get();
  if (!exercise.exists || !exercise.get('personalized')) failed('Exercise unavailable.');
  const teacher = exercise.get('teacherId') === auth.uid;
  if (!teacher) await requireExerciseMember(input.classroomId, auth.uid);
  const draft = await db.collection('personalizedDrafts').doc(exercise.get('personalizedDraftId')).get();
  const variants = draft.get('variants') as Variant[];
  let variant = teacher ? variants[0] : variants.find(v => v.key === draft.get('assignments')?.[auth.uid]);
  if (variant && draft.get('storageVersion') === 2) variant = (await draft.ref.collection('sets').doc(variant.key).get()).data() as Variant;
  if (!variant) failed('Your previous exercise needs a completed, fully marked result. Ask your teacher for an assigned exercise.');
  return { questions: variant.questions.map(q => teacher ? q : { ...q, answer: '' }) };
});

export const submitPersonalizedExercise = onCall({ region: 'asia-southeast1', enforceAppCheck: true }, async request => {
  const auth = requireAuth(request);
  const input = z.object({ classroomId: id, exerciseId: id, answers: z.record(z.string(), z.string().max(12000)) }).parse(request.data);
  await requireExerciseMember(input.classroomId, auth.uid);
  const exerciseRef = db.collection('classrooms').doc(input.classroomId).collection('exercises').doc(input.exerciseId);
  const exercise = await exerciseRef.get();
  if (!exercise.exists || !exercise.get('personalized')) failed('Exercise unavailable.');
  const isLate = Boolean(exercise.get('deadline') && Date.now() > Date.parse(exercise.get('deadline')));
  if (isLate && !exercise.get('allowLateSubmissions')) failed('The exercise deadline has passed.');
  const draft = await db.collection('personalizedDrafts').doc(exercise.get('personalizedDraftId')).get();
  let variant = (draft.get('variants') as Variant[]).find(v => v.key === draft.get('assignments')?.[auth.uid]);
  if (variant && draft.get('storageVersion') === 2) variant = (await draft.ref.collection('sets').doc(variant.key).get()).data() as Variant;
  if (!variant) denied('No exercise assigned to you.');
  const questionResults = variant.questions.map((q, i) => {
    const answer = (input.answers[String(i)] || '').trim();
    const pendingReview = q.type !== 'multiple_choice' && q.markingMode === 'manual';
    const isCorrect = !pendingReview && answer.toLowerCase() === q.answer.trim().toLowerCase();
    return { questionIdx: i, questionText: q.question, expectedAnswer: q.answer, studentAnswer: answer, isCorrect, pointsEarned: isCorrect ? q.points : 0, pointsPossible: q.points, pendingReview, difficulty: q.difficulty, topic: q.topic, subtopic: q.subtopic, skills: q.skills };
  });
  const result = { studentId: auth.uid, studentName: String(auth.token.name || 'Student'), studentEmail: String(auth.token.email || ''), answers: input.answers, score: questionResults.reduce((n,r) => n+r.pointsEarned,0), totalPoints: questionResults.reduce((n,r) => n+r.pointsPossible,0), totalCorrect: questionResults.filter(r => r.isCorrect).length, totalWrong: questionResults.filter(r => !r.isCorrect && !r.pendingReview).length, questionResults, isLate, sourceExerciseId: draft.get('sourceId'), personalized: true };
  const subRef = exerciseRef.collection('submissions').doc(auth.uid);
  await db.runTransaction(async tx => {
    const existing = await tx.get(subRef);
    if (existing.exists) failed('You have already submitted this exercise.');
    tx.create(subRef, { ...result, submittedAt: FieldValue.serverTimestamp() });
  });
  return result;
});
