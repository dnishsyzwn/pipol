import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { config, quotaPeriodKey } from './config.js';
import { db } from './firebase.js';
import { failed } from './errors.js';

export type QuotaReservation = {
  ref: DocumentReference;
  periodKey: string;
  questions: number;
  images: number;
};

export async function reserveQuota(uid: string, questions: number, images: number): Promise<QuotaReservation> {
  if (questions < 0 || images < 0) failed('Quota request is invalid.');
  const periodKey = quotaPeriodKey();
  const ref = db.collection('usage').doc(`${uid}_${periodKey}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() ?? {};
    const usedQuestions = Number(data.questionsUsed ?? 0);
    const usedImages = Number(data.imagesUsed ?? 0);
    const reservedQuestions = Number(data.questionsReserved ?? 0);
    const reservedImages = Number(data.imagesReserved ?? 0);
    if (usedQuestions + reservedQuestions + questions > config.questionQuota) {
      failed(`This generation needs ${questions} question credits, but only ${Math.max(0, config.questionQuota - usedQuestions - reservedQuestions)} remain.`);
    }
    if (usedImages + reservedImages + images > config.imageQuota) {
      failed(`This generation needs ${images} image credits, but only ${Math.max(0, config.imageQuota - usedImages - reservedImages)} remain.`);
    }
    transaction.set(
      ref,
      {
        uid,
        periodKey,
        questionLimit: config.questionQuota,
        imageLimit: config.imageQuota,
        questionsUsed: usedQuestions,
        imagesUsed: usedImages,
        questionsReserved: reservedQuestions + questions,
        imagesReserved: reservedImages + images,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  return { ref, periodKey, questions, images };
}

export async function settleQuota(reservation: QuotaReservation, actualQuestions: number, actualImages: number): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reservation.ref);
    const data = snapshot.data() ?? {};
    const questionsReserved = Math.max(0, Number(data.questionsReserved ?? 0) - reservation.questions);
    const imagesReserved = Math.max(0, Number(data.imagesReserved ?? 0) - reservation.images);
    transaction.set(
      reservation.ref,
      {
        questionsUsed: Number(data.questionsUsed ?? 0) + Math.max(0, actualQuestions),
        imagesUsed: Number(data.imagesUsed ?? 0) + Math.max(0, actualImages),
        questionsReserved,
        imagesReserved,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function refundReservation(reservation: QuotaReservation): Promise<void> {
  await settleQuota(reservation, 0, 0);
}
