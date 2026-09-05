import { FieldValue, Timestamp, type DocumentReference, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { config } from './config.js';
import { db } from './firebase.js';
import { failed } from './errors.js';

const ROLLING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type QuotaReservation = {
  ref: DocumentReference;
  summaryRef: DocumentReference;
  periodKey: string;
  questions: number;
  images: number;
  expiresAtMillis: number;
};

type Credit = {
  id: string;
  questions: number;
  images: number;
  expiresAt: Timestamp;
};

function creditsFromSnapshots(snapshots: QueryDocumentSnapshot[]): Credit[] {
  return snapshots
    .filter((snapshot) => snapshot.get('status') !== 'refunded')
    .map((snapshot) => ({
      id: snapshot.id,
      questions: Number(snapshot.get('questions') ?? 0),
      images: Number(snapshot.get('images') ?? 0),
      expiresAt: snapshot.get('expiresAt') as Timestamp,
    }));
}

function totals(credits: Credit[]) {
  return credits.reduce(
    (sum, credit) => ({
      questions: sum.questions + credit.questions,
      images: sum.images + credit.images,
    }),
    { questions: 0, images: 0 },
  );
}

function summary(uid: string, credits: Credit[]) {
  const usage = totals(credits);
  const nextResetAt = credits.length
    ? credits.reduce(
        (earliest, credit) =>
          credit.expiresAt.toMillis() < earliest.toMillis() ? credit.expiresAt : earliest,
        credits[0]!.expiresAt,
      )
    : null;
  return {
    uid,
    quotaType: 'rolling_7_day',
    windowDays: 7,
    questionLimit: config.questionQuota,
    imageLimit: config.imageQuota,
    questionsUsed: usage.questions,
    imagesUsed: usage.images,
    nextResetAt,
    activeCredits: credits,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function reserveQuota(uid: string, questions: number, images: number): Promise<QuotaReservation> {
  if (questions < 0 || images < 0) failed('Quota request is invalid.');
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + ROLLING_WINDOW_MS);
  const summaryRef = db.collection('usage').doc(uid);
  const ref = summaryRef.collection('events').doc();

  await db.runTransaction(async (transaction) => {
    const activeSnapshot = await transaction.get(summaryRef.collection('events').where('expiresAt', '>', now));
    const activeCredits = creditsFromSnapshots(activeSnapshot.docs);
    const activeUsage = totals(activeCredits);
    if (activeUsage.questions + questions > config.questionQuota) {
      failed(`This generation needs ${questions} question credits, but only ${Math.max(0, config.questionQuota - activeUsage.questions)} remain.`);
    }
    if (activeUsage.images + images > config.imageQuota) {
      failed(`This generation needs ${images} image credits, but only ${Math.max(0, config.imageQuota - activeUsage.images)} remain.`);
    }
    const credit = { id: ref.id, questions, images, expiresAt };
    transaction.set(ref, { uid, questions, images, status: 'reserved', createdAt: now, expiresAt });
    transaction.set(summaryRef, summary(uid, [...activeCredits, credit]));
  });
  return { ref, summaryRef, periodKey: ref.id, questions, images, expiresAtMillis: expiresAt.toMillis() };
}

export async function settleQuota(reservation: QuotaReservation, actualQuestions: number, actualImages: number): Promise<void> {
  const now = Timestamp.now();
  await db.runTransaction(async (transaction) => {
    const activeSnapshot = await transaction.get(reservation.summaryRef.collection('events').where('expiresAt', '>', now));
    const activeCredits = creditsFromSnapshots(activeSnapshot.docs).filter((credit) => credit.id !== reservation.ref.id);
    const settledCredit: Credit = {
      id: reservation.ref.id,
      questions: Math.max(0, actualQuestions),
      images: Math.max(0, actualImages),
      expiresAt: Timestamp.fromMillis(reservation.expiresAtMillis),
    };
    transaction.set(reservation.ref, { questions: settledCredit.questions, images: settledCredit.images, status: 'used', settledAt: now }, { merge: true });
    transaction.set(reservation.summaryRef, summary(reservation.summaryRef.id, [...activeCredits, settledCredit]));
  });
}

export async function refundReservation(reservation: QuotaReservation): Promise<void> {
  const now = Timestamp.now();
  await db.runTransaction(async (transaction) => {
    const activeSnapshot = await transaction.get(reservation.summaryRef.collection('events').where('expiresAt', '>', now));
    const remaining = creditsFromSnapshots(activeSnapshot.docs).filter((credit) => credit.id !== reservation.ref.id);
    transaction.set(reservation.ref, { status: 'refunded', refundedAt: now }, { merge: true });
    transaction.set(reservation.summaryRef, summary(reservation.summaryRef.id, remaining));
  });
}
