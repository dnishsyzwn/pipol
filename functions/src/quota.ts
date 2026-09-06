import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { config } from './config.js';
import { db } from './firebase.js';
import { failed } from './errors.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type QuotaReservation = {
  ref: DocumentReference;
  summaryRef: DocumentReference;
  periodKey: string;
  questions: number;
  images: number;
  expiresAtMillis: number;
};

type Cycle = { key: string; start: Timestamp; end: Timestamp; anchor: Timestamp };

async function accountCycle(uid: string, now = Timestamp.now()): Promise<Cycle> {
  const user = await getAuth().getUser(uid);
  const createdAtMillis = Date.parse(user.metadata.creationTime);
  const anchorMillis = Number.isFinite(createdAtMillis) ? createdAtMillis : now.toMillis();
  const cycleIndex = Math.floor(Math.max(0, now.toMillis() - anchorMillis) / WEEK_MS);
  const startMillis = anchorMillis + cycleIndex * WEEK_MS;
  return {
    key: `${anchorMillis}_${cycleIndex}`,
    start: Timestamp.fromMillis(startMillis),
    end: Timestamp.fromMillis(startMillis + WEEK_MS),
    anchor: Timestamp.fromMillis(anchorMillis),
  };
}

function summary(uid: string, cycle: Cycle, questionsUsed: number, imagesUsed: number) {
  return {
    uid,
    quotaType: 'account_weekly_reset',
    windowDays: 7,
    questionLimit: config.questionQuota,
    imageLimit: config.imageQuota,
    questionsUsed: Math.max(0, questionsUsed),
    imagesUsed: Math.max(0, imagesUsed),
    cycleKey: cycle.key,
    cycleAnchorAt: cycle.anchor,
    cycleStartAt: cycle.start,
    nextResetAt: cycle.end,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function reserveQuota(uid: string, questions: number, images: number): Promise<QuotaReservation> {
  if (questions < 0 || images < 0) failed('Quota request is invalid.');
  const now = Timestamp.now();
  const cycle = await accountCycle(uid, now);
  const summaryRef = db.collection('usage').doc(uid);
  const ref = summaryRef.collection('events').doc();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(summaryRef);
    const currentCycle = snapshot.exists && snapshot.get('cycleKey') === cycle.key;
    const questionsUsed = currentCycle ? Number(snapshot.get('questionsUsed') ?? 0) : 0;
    const imagesUsed = currentCycle ? Number(snapshot.get('imagesUsed') ?? 0) : 0;
    if (questionsUsed + questions > config.questionQuota) failed(`This generation needs ${questions} question credits, but only ${Math.max(0, config.questionQuota - questionsUsed)} remain.`);
    if (imagesUsed + images > config.imageQuota) failed(`This generation needs ${images} image credits, but only ${Math.max(0, config.imageQuota - imagesUsed)} remain.`);
    transaction.set(ref, { uid, cycleKey: cycle.key, questions, images, status: 'reserved', createdAt: now, expiresAt: cycle.end });
    transaction.set(summaryRef, summary(uid, cycle, questionsUsed + questions, imagesUsed + images));
  });
  return { ref, summaryRef, periodKey: ref.id, questions, images, expiresAtMillis: cycle.end.toMillis() };
}

export async function settleQuota(reservation: QuotaReservation, actualQuestions: number, actualImages: number): Promise<void> {
  const now = Timestamp.now();
  const cycle = await accountCycle(reservation.summaryRef.id, now);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reservation.summaryRef);
    transaction.set(reservation.ref, { questions: Math.max(0, actualQuestions), images: Math.max(0, actualImages), status: 'used', settledAt: now }, { merge: true });
    if (!snapshot.exists || snapshot.get('cycleKey') !== cycle.key || reservation.expiresAtMillis !== cycle.end.toMillis()) return;
    const questionsUsed = Number(snapshot.get('questionsUsed') ?? 0) - reservation.questions + Math.max(0, actualQuestions);
    const imagesUsed = Number(snapshot.get('imagesUsed') ?? 0) - reservation.images + Math.max(0, actualImages);
    transaction.set(reservation.summaryRef, summary(reservation.summaryRef.id, cycle, questionsUsed, imagesUsed));
  });
}

export async function refundReservation(reservation: QuotaReservation): Promise<void> {
  const now = Timestamp.now();
  const cycle = await accountCycle(reservation.summaryRef.id, now);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reservation.summaryRef);
    transaction.set(reservation.ref, { status: 'refunded', refundedAt: now }, { merge: true });
    if (!snapshot.exists || snapshot.get('cycleKey') !== cycle.key || reservation.expiresAtMillis !== cycle.end.toMillis()) return;
    const questionsUsed = Number(snapshot.get('questionsUsed') ?? 0) - reservation.questions;
    const imagesUsed = Number(snapshot.get('imagesUsed') ?? 0) - reservation.images;
    transaction.set(reservation.summaryRef, summary(reservation.summaryRef.id, cycle, questionsUsed, imagesUsed));
  });
}

export async function resetQuota(uid: string, resetBy: string): Promise<void> {
  const cycle = await accountCycle(uid);
  await db.collection('usage').doc(uid).set({
    ...summary(uid, cycle, 0, 0),
    resetBy,
    manuallyResetAt: FieldValue.serverTimestamp(),
  });
}
