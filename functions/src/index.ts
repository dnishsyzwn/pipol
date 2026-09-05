import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { config, providerSecrets } from './config.js';
import { bucket, db } from './firebase.js';
import { denied, failed, internal, invalid, unavailable } from './errors.js';
import { requireAuth, requireClassroomMember, requireClassroomOwner, requireTeacher } from './auth.js';
import { extractMaterial, extensionOf, supportedExtensions } from './content.js';
import { generateImage, generateQuiz, testVertexConnection, transformQuestion } from './provider.js';
import { assertGenerationInput, assertImagePromptAllowed, markSensitiveReview } from './safety.js';
import {
  AttemptSchema,
  CreateMaterialSchema,
  CreateQuizJobSchema,
  EnhanceStandaloneQuestionSchema,
  GeneratedQuizSchema,
  PublishDraftSchema,
  QuizQuestionSchema,
  TransformQuestionSchema,
  UpdateDraftSchema,
  VisualSchema,
  removeUndefinedValues,
  validateQuestionSet,
} from './schemas.js';
import { refundReservation, reserveQuota, settleQuota, type QuotaReservation } from './quota.js';
import type { QuizQuestion } from './types.js';

setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10, enforceAppCheck: true });

export const testAiConnection = onCall({ secrets: providerSecrets }, async (request) => {
  await requireTeacher(request);
  return { ok: true, response: await testVertexConnection() };
});

function data<T>(request: CallableRequest<unknown>, schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } }): T {
  const parsed = schema.safeParse(request.data);
  if (!parsed.success) invalid('The request format is invalid.', parsed.error);
  return parsed.data as T;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
}

async function canEditDraft(draftId: string, uid: string) {
  const draft = await db.collection('quizDrafts').doc(draftId).get();
  if (!draft.exists) failed('Quiz draft not found.');
  const ownerId = draft.get('ownerId');
  const reviewers = (draft.get('reviewerIds') as string[] | undefined) ?? [];
  if (ownerId !== uid && !reviewers.includes(uid)) denied('You cannot edit this quiz draft.');
  return draft;
}

async function loadMaterials(uid: string, classroomId: string, materialIds: string[]) {
  const materials: Array<{ id: string; fileName: string; text: string; warnings: string[] }> = [];
  for (const materialId of materialIds) {
    const ref = db.collection('materials').doc(materialId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.get('ownerId') !== uid || snapshot.get('classroomId') !== classroomId) {
      denied('One of the selected learning materials is not available to you.');
    }
    const fileName = String(snapshot.get('fileName'));
    const storagePath = String(snapshot.get('storagePath'));
    const file = bucket.file(storagePath);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    if (!size || size > config.maxDocumentBytes) invalid(`${fileName} is too large to process.`);
    const [bytes] = await file.download();
    const extracted = await extractMaterial(bytes, fileName);
    await ref.set(
      {
        extractionStatus: 'completed',
        extractedText: extracted.text,
        sections: extracted.sections,
        warnings: extracted.warnings,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    materials.push({ id: materialId, fileName, text: extracted.text, warnings: extracted.warnings });
  }
  return materials;
}

export const registerMaterial = onCall(async (request) => {
  const auth = await requireTeacher(request);
  const input = data(request, CreateMaterialSchema);
  await requireClassroomOwner(input.classroomId, auth.uid);
  const extension = extensionOf(input.fileName);
  if (!supportedExtensions.has(extension)) {
    invalid(`.${extension || 'unknown'} is not supported. Convert legacy .doc/.ppt files to .docx/.pptx.`);
  }
  const materialRef = db.collection('materials').doc();
  const storagePath = `users/${auth.uid}/materials/${materialRef.id}/${safeFileName(input.fileName)}`;
  await materialRef.set({
    ownerId: auth.uid,
    classroomId: input.classroomId,
    fileName: safeFileName(input.fileName),
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    storagePath,
    extractionStatus: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { materialId: materialRef.id, storagePath };
});

export const createManualQuizDraft = onCall(async (request) => {
  const auth = await requireTeacher(request);
  const input = data(
    request,
    CreateQuizJobSchema.pick({ classroomId: true, title: true, language: true }),
  );
  await requireClassroomOwner(input.classroomId, auth.uid);
  const ref = db.collection('quizDrafts').doc();
  await ref.set({
    ownerId: auth.uid,
    classroomId: input.classroomId,
    title: input.title || 'Untitled quiz',
    language: input.language || 'English',
    questions: [],
    status: 'draft',
    reviewerIds: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { draftId: ref.id, status: 'draft' as const };
});

export const createQuizGenerationJob = onCall(
  { secrets: providerSecrets, timeoutSeconds: 30 },
  async (request) => {
    const auth = await requireTeacher(request);
    const input = data(request, CreateQuizJobSchema);
    assertGenerationInput(input.prompt, input.subject);
    await requireClassroomOwner(input.classroomId, auth.uid);
    if (!input.prompt.trim() && input.materialIds.length === 0) invalid('Add a prompt or learning material.');
    const requestedImages = input.imageMode === 'generate' ? input.imageCount : 0;
    const reservation = await reserveQuota(auth.uid, input.questionCount, requestedImages);
    const jobRef = db.collection('quizJobs').doc();
    await jobRef.set({
      ownerId: auth.uid,
      classroomId: input.classroomId,
      title: input.title || 'AI learning check',
      prompt: input.prompt.trim(),
      materialIds: input.materialIds,
      settings: input,
      status: 'queued',
      reservation: {
        periodKey: reservation.periodKey,
        questions: reservation.questions,
        images: reservation.images,
        expiresAtMillis: reservation.expiresAtMillis,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { jobId: jobRef.id, status: 'queued' as const, quota: { questionsReserved: input.questionCount, imagesReserved: requestedImages } };
  },
);

export const processQuizGenerationJob = onDocumentCreated(
  { document: 'quizJobs/{jobId}', secrets: providerSecrets, timeoutSeconds: 540, memory: '1GiB' },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const jobId = event.params.jobId;
    const jobRef = snapshot.ref;
    let reservation: QuotaReservation | undefined;
    const claimed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(jobRef);
      if (!current.exists || current.get('status') !== 'queued') return false;
      transaction.update(jobRef, { status: 'processing', updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) return;
    try {
      const job = (await jobRef.get()).data();
      if (!job) throw new Error('Generation job disappeared.');
      const materials = await loadMaterials(String(job.ownerId), String(job.classroomId), (job.materialIds as string[]) ?? []);
      const sourceText = materials
        .map((material) => `SOURCE FILE: ${material.fileName}\n${material.text}`)
        .join('\n\n---\n\n');
      const settings = job.settings as Record<string, unknown>;
      const generated = await generateQuiz({
        prompt: String(job.prompt ?? ''),
        sourceText,
        sourceSummary: materials.map((material) => `${material.id}:${material.fileName}`).join(', '),
        questionCount: Number(settings.questionCount),
        subject: typeof settings.subject === 'string' ? settings.subject : undefined,
        level: typeof settings.level === 'string' ? settings.level : undefined,
        language: String(settings.language ?? 'English'),
        difficulty: String(settings.difficulty ?? 'medium'),
        questionTypes: (settings.questionTypes as string[]) ?? ['multiple_choice', 'short_answer'],
        learningObjectives: (settings.learningObjectives as string[]) ?? [],
        imageMode: String(settings.imageMode ?? 'none') as 'none' | 'upload' | 'generate',
      });
      const parsed = GeneratedQuizSchema.parse(generated);
      const questions = validateQuestionSet(parsed.questions.slice(0, Number(settings.questionCount))).map((question) => ({
        ...question,
        id: question.id || randomUUID(),
        needsReview: question.needsReview || markSensitiveReview(`${question.question} ${question.explanation}`),
      }));
      const draftRef = db.collection('quizDrafts').doc();
      const requestedImages = settings.imageMode === 'generate' ? Math.min(Number(settings.imageCount ?? 0), questions.length) : 0;
      let generatedImages = 0;
      for (let index = 0; index < requestedImages; index += 1) {
        const question = questions[index];
        if (!question) continue;
        const image = await generateImage(`Educational visual for this quiz question: ${question.question}`, parsed.inferredLevel);
        const assetId = db.collection('quizAssets').doc().id;
        const storagePath = `users/${job.ownerId}/quiz-assets/${draftRef.id}/${assetId}.png`;
        await bucket.file(storagePath).save(image.bytes, { resumable: false, metadata: { contentType: image.contentType, metadata: { ownerId: String(job.ownerId), draftId: draftRef.id } } });
        await db.collection('quizAssets').doc(assetId).set({ ownerId: job.ownerId, draftId: draftRef.id, storagePath, contentType: image.contentType, createdAt: FieldValue.serverTimestamp() });
        questions[index] = { ...question, visual: { mode: 'generate', assetId, purpose: 'AI-generated educational visual', status: 'ready', altText: `Educational visual for: ${question.question}` } };
        generatedImages += 1;
      }
      await draftRef.set(removeUndefinedValues({
        ownerId: job.ownerId,
        classroomId: job.classroomId,
        title: parsed.title || job.title,
        instructions: parsed.instructions,
        language: settings.language ?? 'English',
        subject: settings.subject,
        level: parsed.inferredLevel,
        questions,
        learningObjectives: parsed.learningObjectives,
        status: 'ready_for_review',
        reviewerIds: [],
        sourceMaterialIds: job.materialIds ?? [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }));
      const reservationData = job.reservation as { periodKey: string; questions: number; images: number; expiresAtMillis: number };
      const summaryRef = db.collection('usage').doc(String(job.ownerId));
      reservation = { ref: summaryRef.collection('events').doc(reservationData.periodKey), summaryRef, periodKey: reservationData.periodKey, questions: reservationData.questions, images: reservationData.images, expiresAtMillis: reservationData.expiresAtMillis };
      await settleQuota(reservation, questions.length, generatedImages);
      await jobRef.update({ status: 'completed', draftId: draftRef.id, questionsGenerated: questions.length, imagesGenerated: generatedImages, updatedAt: FieldValue.serverTimestamp() });
      console.info('Quiz job completed', { jobId, draftId: draftRef.id, questions: questions.length });
    } catch (error) {
      try {
        const job = (await jobRef.get()).data();
        const reservationData = job?.reservation as { periodKey: string; questions: number; images: number; expiresAtMillis: number } | undefined;
        if (job?.ownerId && reservationData) {
          const summaryRef = db.collection('usage').doc(String(job.ownerId));
          await refundReservation({ ref: summaryRef.collection('events').doc(reservationData.periodKey), summaryRef, periodKey: reservationData.periodKey, questions: reservationData.questions, images: reservationData.images, expiresAtMillis: reservationData.expiresAtMillis });
        }
      } finally {
        await jobRef.update({ status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'Generation failed.', updatedAt: FieldValue.serverTimestamp() });
      }
      throw error;
    }
  },
);

export const updateQuizDraft = onCall(async (request) => {
  const auth = await requireTeacher(request);
  const input = data(request, UpdateDraftSchema);
  const draft = await canEditDraft(input.draftId, auth.uid);
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.instructions !== undefined) updates.instructions = input.instructions;
  if (input.questions !== undefined) updates.questions = validateQuestionSet(input.questions);
  if (input.status !== undefined) updates.status = input.status;
  if (draft.get('status') === 'published') failed('Published quizzes must be duplicated before editing.');
  await draft.ref.update(updates);
  return { draftId: input.draftId, updated: true };
});

export const addDraftReviewer = onCall(async (request) => {
  const auth = await requireTeacher(request);
  const input = data(request, { safeParse: (value: unknown) => {
    const object = value as Record<string, unknown>;
    return typeof object?.draftId === 'string' && typeof object?.reviewerUid === 'string'
      ? { success: true, data: object as { draftId: string; reviewerUid: string } }
      : { success: false, error: 'draftId and reviewerUid are required' };
  } });
  const draft = await canEditDraft(input.draftId, auth.uid);
  if (draft.get('ownerId') !== auth.uid) denied('Only the quiz owner can add reviewers.');
  const reviewer = await db.collection('users').doc(input.reviewerUid).get();
  if (!reviewer.exists || reviewer.get('role') !== 'teacher') invalid('Reviewer must be a teacher account.');
  await draft.ref.update({ reviewerIds: FieldValue.arrayUnion(input.reviewerUid), updatedAt: FieldValue.serverTimestamp() });
  return { draftId: input.draftId, reviewerUid: input.reviewerUid };
});

export const publishQuizDraft = onCall(async (request) => {
  const auth = await requireTeacher(request);
  const input = data(request, PublishDraftSchema);
  const draft = await canEditDraft(input.draftId, auth.uid);
  if (draft.get('ownerId') !== auth.uid) denied('Only the quiz owner can publish this quiz.');
  if (draft.get('status') === 'published') return { quizId: input.draftId, status: 'published' as const };
  const questions = (draft.get('questions') as QuizQuestion[] | undefined) ?? [];
  if (!questions.length) failed('Add at least one question before publishing.');
  if (questions.some((question) => question.needsReview || question.visual?.status === 'pending')) {
    failed('Review or remove every flagged question and pending visual before publishing.');
  }
  const classroomId = String(draft.get('classroomId'));
  await requireClassroomOwner(classroomId, auth.uid);
  const quizRef = db.collection('quizzes').doc(input.draftId);
  await db.runTransaction(async (transaction) => {
    transaction.set(quizRef, { ...draft.data(), id: input.draftId, status: 'published', publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(draft.ref, { status: 'published', publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return { quizId: input.draftId, status: 'published' as const };
});

export const generateQuestionVisual = onCall(
  { secrets: providerSecrets, timeoutSeconds: 180, memory: '1GiB' },
  async (request) => {
    const auth = await requireTeacher(request);
    const input = data(request, VisualSchema);
    const draft = await canEditDraft(input.draftId, auth.uid);
    if (draft.get('status') === 'published') failed('Create a new draft before changing a published quiz.');
    const questions = [...((draft.get('questions') as QuizQuestion[] | undefined) ?? [])];
    const index = questions.findIndex((question) => question.id === input.questionId);
    if (index < 0) invalid('Question not found.');
    const question = questions[index];
    if (!question) invalid('Question not found.');
    assertImagePromptAllowed(`${input.purpose} ${question.question}`);
    const reservation = await reserveQuota(auth.uid, 0, 1);
    try {
      const image = await generateImage(`${input.purpose}. Related question: ${question.question}`, input.level);
      const assetId = db.collection('quizAssets').doc().id;
      const storagePath = `users/${auth.uid}/quiz-assets/${input.draftId}/${assetId}.png`;
      const file = bucket.file(storagePath);
      await file.save(image.bytes, { resumable: false, metadata: { contentType: image.contentType, metadata: { ownerId: auth.uid, draftId: input.draftId } } });
      await db.collection('quizAssets').doc(assetId).set({ ownerId: auth.uid, draftId: input.draftId, storagePath, contentType: image.contentType, createdAt: FieldValue.serverTimestamp() });
      questions[index] = { ...question, visual: { mode: 'generate', assetId, purpose: input.purpose, status: 'ready', altText: input.purpose } };
      await draft.ref.update({ questions, updatedAt: FieldValue.serverTimestamp() });
      await settleQuota(reservation, 0, 1);
      return { assetId, status: 'ready' as const };
    } catch (error) {
      await refundReservation(reservation);
      throw error;
    }
  },
);

export const enhanceStandaloneQuestion = onCall(
  { secrets: providerSecrets, timeoutSeconds: 120 },
  async (request) => {
    const auth = await requireTeacher(request);
    const input = data(request, EnhanceStandaloneQuestionSchema);
    const reservation = await reserveQuota(auth.uid, 1, 0);
    try {
      const question: QuizQuestion = {
        id: randomUUID(),
        type: 'short_answer',
        question: input.question,
        correctAnswer: input.answer || 'Teacher review required.',
        explanation: input.answer || 'Teacher review required.',
        hints: [],
        difficulty: 'medium',
        confidence: 'low',
        needsReview: true,
      };
      const enhanced = QuizQuestionSchema.parse(await transformQuestion(question, 'Rewrite this into a clear, contextual educational question. Improve the answer and explanation. Do not merely append instructions.', input.language));
      await settleQuota(reservation, 1, 0);
      return { question: { ...enhanced, id: question.id, needsReview: true } };
    } catch (error) {
      await refundReservation(reservation);
      throw error;
    }
  },
);

export const transformQuizQuestion = onCall(
  { secrets: providerSecrets, timeoutSeconds: 120 },
  async (request) => {
    const auth = await requireTeacher(request);
    const input = data(request, TransformQuestionSchema);
    const draft = await canEditDraft(input.draftId, auth.uid);
    const questions = [...((draft.get('questions') as QuizQuestion[] | undefined) ?? [])];
    const index = questions.findIndex((question) => question.id === input.questionId);
    if (index < 0) invalid('Question not found.');
    const question = questions[index];
    if (!question) invalid('Question not found.');
    const reservation = await reserveQuota(auth.uid, 1, 0);
    try {
      const transformed = QuizQuestionSchema.parse(await transformQuestion(question, input.operation, input.language));
      questions[index] = { ...transformed, id: question.id, needsReview: true, confidence: 'low' };
      await draft.ref.update({ questions, updatedAt: FieldValue.serverTimestamp() });
      await settleQuota(reservation, 1, 0);
      return { question: questions[index] };
    } catch (error) {
      await refundReservation(reservation);
      throw error;
    }
  },
);

export const saveQuestionToBank = onCall(async (request) => {
  const auth = await requireTeacher(request);
  const input = data(request, { safeParse: (value: unknown) => {
    const object = value as Record<string, unknown>;
    return typeof object?.draftId === 'string' && typeof object?.questionId === 'string'
      ? { success: true, data: object as { draftId: string; questionId: string } }
      : { success: false, error: 'draftId and questionId are required' };
  } });
  const draft = await canEditDraft(input.draftId, auth.uid);
  const questions = (draft.get('questions') as QuizQuestion[] | undefined) ?? [];
  const question = questions.find((candidate) => candidate.id === input.questionId);
  if (!question) invalid('Question not found.');
  const ref = db.collection('questionBank').doc();
  await ref.set({ ownerId: auth.uid, classroomId: draft.get('classroomId'), question, createdAt: FieldValue.serverTimestamp() });
  return { bankQuestionId: ref.id };
});

export const recordQuizAttempt = onCall(async (request) => {
  const auth = requireAuth(request);
  const input = data(request, AttemptSchema);
  const quiz = await db.collection('quizzes').doc(input.quizId).get();
  if (!quiz.exists || quiz.get('status') !== 'published') failed('Quiz is not available.');
  const classroomId = String(quiz.get('classroomId'));
  await requireClassroomMember(classroomId, auth.uid);
  const questions = (quiz.get('questions') as QuizQuestion[] | undefined) ?? [];
  const results = questions.map((question) => ({
    questionId: question.id,
    difficulty: question.difficulty,
    correct: input.answers[question.id]?.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase(),
  }));
  const score = results.length ? Math.round((results.filter((result) => result.correct).length / results.length) * 100) : 0;
  const attemptRef = db.collection('quizAttempts').doc();
  await attemptRef.set({ quizId: input.quizId, classroomId, studentId: auth.uid, answers: input.answers, results, score, completedAt: FieldValue.serverTimestamp() });
  const analyticsRef = db.collection('quizAnalytics').doc(input.quizId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(analyticsRef);
    const current = snapshot.data() ?? {};
    const attempts = Number(current.attempts ?? 0) + 1;
    const totalScore = Number(current.totalScore ?? 0) + score;
    const questionStats = { ...((current.questionStats as Record<string, { attempts: number; incorrect: number }> | undefined) ?? {}) };
    for (const result of results) {
      const previous = questionStats[result.questionId] ?? { attempts: 0, incorrect: 0 };
      questionStats[result.questionId] = { attempts: previous.attempts + 1, incorrect: previous.incorrect + (result.correct ? 0 : 1) };
    }
    transaction.set(analyticsRef, { quizId: input.quizId, classroomId, attempts, totalScore, averageScore: Math.round(totalScore / attempts), questionStats, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { attemptId: attemptRef.id, score, results };
});

export const getQuizInsights = onCall(async (request) => {
  const auth = await requireTeacher(request);
  const quizId = String((request.data as { quizId?: unknown })?.quizId ?? '');
  if (!quizId) invalid('quizId is required.');
  const quiz = await db.collection('quizzes').doc(quizId).get();
  if (!quiz.exists) failed('Quiz not found.');
  await requireClassroomOwner(String(quiz.get('classroomId')), auth.uid);
  const analytics = await db.collection('quizAnalytics').doc(quizId).get();
  return analytics.exists ? analytics.data() : { quizId, attempts: 0, averageScore: 0, questionStats: {} };
});

export const exportQuiz = onCall(async (request) => {
  const auth = await requireAuth(request);
  const payload = request.data as { quizId?: unknown; format?: unknown };
  const quizId = String(payload.quizId ?? '');
  const format = String(payload.format ?? 'json');
  if (!quizId || !['json', 'csv', 'markdown'].includes(format)) invalid('quizId and a supported export format are required.');
  const quiz = await db.collection('quizzes').doc(quizId).get();
  if (!quiz.exists) failed('Quiz not found.');
  if (quiz.get('status') !== 'published') await canEditDraft(quizId, auth.uid);
  else await requireClassroomMember(String(quiz.get('classroomId')), auth.uid);
  const questions = (quiz.get('questions') as QuizQuestion[] | undefined) ?? [];
  if (format === 'json') return { format, content: JSON.stringify(quiz.data(), null, 2) };
  if (format === 'markdown') {
    return { format, content: `# ${quiz.get('title')}\n\n${questions.map((question, index) => `## ${index + 1}. ${question.question}\n\n**Answer:** ${question.correctAnswer}\n\n**Explanation:** ${question.explanation}`).join('\n\n')}` };
  }
  return { format, content: ['Question,Answer,Explanation', ...questions.map((question) => [question.question, question.correctAnswer, question.explanation].map((value) => `"${value.replace(/"/g, '""')}"`).join(','))].join('\n') };
});
