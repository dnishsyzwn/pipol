import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const bucket = getStorage().bucket();
export const adminAuth = getAuth();
