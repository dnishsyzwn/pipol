import { HttpsError } from 'firebase-functions/v2/https';

export function invalid(message: string, details?: unknown): never {
  throw new HttpsError('invalid-argument', message, details);
}

export function denied(message = 'You are not allowed to perform this action.'): never {
  throw new HttpsError('permission-denied', message);
}

export function failed(message: string, details?: unknown): never {
  throw new HttpsError('failed-precondition', message, details);
}

export function unavailable(message: string): never {
  throw new HttpsError('unavailable', message);
}

export function internal(message = 'The request could not be completed.'): never {
  throw new HttpsError('internal', message);
}
