import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from './firebase.js';
import { denied, invalid } from './errors.js';

export type AuthContext = {
  uid: string;
  token: Record<string, unknown>;
};

export function requireAuth(request: CallableRequest<unknown>): AuthContext {
  if (!request.auth?.uid) denied('Sign in to continue.');
  return { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> };
}

export async function requireTeacher(request: CallableRequest<unknown>): Promise<AuthContext> {
  const auth = requireAuth(request);
  const profile = await db.collection('users').doc(auth.uid).get();
  const role = profile.get('role') ?? auth.token.role;
  if (role !== 'teacher') denied('Only teachers can use this action.');
  return auth;
}

export async function requireAdmin(request: CallableRequest<unknown>): Promise<AuthContext> {
  const auth = requireAuth(request);
  const profile = await db.collection('users').doc(auth.uid).get();
  const role = profile.get('role') ?? auth.token.role;
  if (role !== 'admin') denied('Only administrators can use this action.');
  return auth;
}

export async function requireClassroomOwner(classroomId: string, uid: string): Promise<void> {
  if (!classroomId || classroomId.length > 160) invalid('A valid classroom is required.');
  const classroom = await db.collection('classrooms').doc(classroomId).get();
  if (!classroom.exists || classroom.get('teacherId') !== uid) denied('You do not own this classroom.');
}

export async function requireClassroomMember(classroomId: string, uid: string): Promise<void> {
  const member = await db.collection('classrooms').doc(classroomId).collection('members').doc(uid).get();
  if (!member.exists || member.get('status') !== 'active') denied('You are not a member of this classroom.');
}

export function assertSafeId(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) invalid(`${label} is invalid.`);
  return value;
}
