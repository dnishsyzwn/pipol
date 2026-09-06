'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Bot,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileUp,
  FileQuestion,
  GraduationCap,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LoaderCircle,
  Lock,
  LogIn,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Shuffle,
  Sparkles,
  Timer,
  Trash2,
  Unlock,
  Users,
  WandSparkles,
  WifiOff,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/toast';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@/components/ui/combobox';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { auth, db, functions, googleProvider, initializeSlearnAppCheck, storage } from '@/lib/firebase';
import { curriculumFor, resolveCurriculumSelection, SCHOOL_STAGES, SCHOOL_YEARS, subjectsFor, type SchoolStage } from '@/lib/malaysia-curriculum';
import { AnalyticsDetail, ClassroomsDetail, ProgressDetail } from './detail-pages';

type Role = 'teacher' | 'student';
type Difficulty = 'easy' | 'medium' | 'hard';
type View = 'dashboard' | 'classes' | 'progress' | 'analytics' | 'classroom' | 'quiz' | 'exercise';
type ClassroomData = {
  id: string;
  name: string;
  subject: string;
  code: string;
  teacherId: string;
  teacherName: string;
  students: number;
  maxStudents?: number;
  progress: number;
  subjectName?: string;
  schoolStage?: SchoolStage;
  schoolYear?: string;
  curriculum?: string;
};
type JoinRequest = {
  id: string;
  classId: string;
  className: string;
  code: string;
  teacherId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
};
type Membership = {
  id: string;
  classId: string;
  className: string;
  code: string;
  teacherId: string;
  teacherName: string;
  progress: number;
  tasks: number;
};
type ClassroomMember = {
  id: string;
  uid: string;
  name: string;
  email?: string;
  progress?: number;
  joinedAt?: any;
};
type QuestionItem = {
  id: string;
  question: string;
  answer: string;
  type?: 'short_answer' | 'multiple_choice';
  choices?: string[];
  markingMode?: 'automatic' | 'manual';
  points: number;
  enhanced: boolean;
  difficulty?: Difficulty;
  topic?: string;
  subtopic?: string;
  skills?: string[];
  tagIds?: string[];
  taggingConfidence?: 'high' | 'medium' | 'low';
  loading?: boolean;
};
type QuestionResult = {
  questionIdx: number;
  questionText: string;
  expectedAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  pointsEarned: number;
  pointsPossible: number;
  difficulty: Difficulty;
  topic: string;
  subtopic?: string;
  skills: string[];
  teacherRemarked?: boolean;
  pendingReview?: boolean;
  remarkedAt?: string;
};
type SubmissionData = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  answers: Record<number, string>;
  score: number;
  totalPoints: number;
  totalCorrect: number;
  totalWrong: number;
  questionResults: QuestionResult[];
  isLate?: boolean;
  submittedAt?: any;
};
type ExerciseAnalytics = {
  totalAnswered: number;
  totalCorrect: number;
  totalWrong: number;
  accuracyRate: number;
  questionBreakdown: {
    questionIdx: number;
    questionText: string;
    expectedAnswer: string;
    correctCount: number;
    wrongCount: number;
    totalAnswers: number;
    accuracyRate: number;
    difficulty: Difficulty;
  }[];
  difficultyBreakdown: {
    difficulty: Difficulty;
    correctCount: number;
    totalAnswers: number;
    accuracyRate: number;
  }[];
  topicBreakdown: TagPerformance[];
  skillBreakdown: TagPerformance[];
  submissions: SubmissionData[];
};
type TagPerformance = { label: string; correctCount: number; totalAnswers: number; unansweredCount: number; accuracyRate: number; status: 'strong' | 'on_track' | 'developing' | 'needs_support' | 'not_enough_data' };
type AuthParams = {
  provider: 'google' | 'email';
  mode: 'login' | 'signup';
  role: Role | null;
  email?: string;
  password?: string;
  name?: string;
};
const MAX_TEACHER_CLASSES = 3;
const difficultyOrder: Difficulty[] = ['easy', 'medium', 'hard'];
const difficultyColour = (difficulty: Difficulty) =>
  difficulty === 'easy' ? '#edf7df' : difficulty === 'hard' ? '#ffe1dc' : '#fff0d4';

const cleanTag = (value?: string) => (value || '').trim().replace(/\s+/g, ' ');
const tagId = (kind: string, value: string) => `${kind}-${cleanTag(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'general'}`;
function summarizeTagPerformance(results: QuestionResult[], dimension: 'topic' | 'skill'): TagPerformance[] {
  const groups = new Map<string, QuestionResult[]>();
  results.forEach((result) => {
    const labels = dimension === 'topic' ? [cleanTag(result.topic) || 'General'] : (result.skills?.length ? result.skills : ['General skill']);
    labels.forEach((label) => groups.set(label, [...(groups.get(label) || []), result]));
  });
  return [...groups.entries()].map(([label, matching]) => {
    const correctCount = matching.filter((result) => result.isCorrect).length;
    const unansweredCount = matching.filter((result) => !result.studentAnswer.trim()).length;
    const accuracyRate = matching.length ? Math.round((correctCount / matching.length) * 100) : 0;
    const status: TagPerformance['status'] = matching.length < 3 ? 'not_enough_data' : accuracyRate >= 80 ? 'strong' : accuracyRate >= 65 ? 'on_track' : accuracyRate >= 40 ? 'developing' : 'needs_support';
    return { label, correctCount, totalAnswers: matching.length, unansweredCount, accuracyRate, status };
  }).sort((a, b) => a.accuracyRate - b.accuracyRate || b.totalAnswers - a.totalAnswers);
}

function summarizeDifficulty(results: QuestionResult[]) {
  return difficultyOrder.map((difficulty) => {
    const matching = results.filter((result) => result.difficulty === difficulty);
    const correctCount = matching.filter((result) => result.isCorrect).length;
    return {
      difficulty,
      correctCount,
      totalAnswers: matching.length,
      accuracyRate: matching.length ? Math.round((correctCount / matching.length) * 100) : 0,
    };
  });
}

function capabilityFromResults(results: QuestionResult[]) {
  const summary = summarizeDifficulty(results);
  const mastered = [...summary].reverse().find((item) => item.totalAnswers > 0 && item.accuracyRate >= 70);
  return mastered ? `${mastered.difficulty[0]?.toUpperCase()}${mastered.difficulty.slice(1)} level` : 'Building foundations';
}
const colours = ['lime', 'blue', 'violet'];
const initials = (name?: string | null) =>
  (name || 'Learner')
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
const friendlyError = (e: unknown) => {
  if (e instanceof Error) {
    const msg = e.message;
    if (msg.includes('popup-closed') || msg.includes('cancelled-popup-request'))
      return 'Sign in cancelled. Try again when you’re ready.';
    if (msg.includes('email-already-in-use'))
      return 'This email is already registered. Please log in instead.';
    if (
      msg.includes('invalid-credential') ||
      msg.includes('wrong-password') ||
      msg.includes('user-not-found')
    )
      return 'Incorrect email or password. Please check your credentials.';
    if (msg.includes('weak-password'))
      return 'Password should be at least 6 characters.';
    if (msg.includes('invalid-email'))
      return 'Please enter a valid email address.';
    if (msg.includes('network-request-failed'))
      return 'Network error. Please check your connection and try again.';
    if (msg.includes('too-many-requests'))
      return 'Too many attempts. Please try again in a few moments.';
    return msg.replace(/^Firebase:\s*/, '');
  }
  return 'Something went wrong. Please try again.';
};
type AiQuota = {
  questionsUsed: number;
  imagesUsed: number;
  nextResetAt: Date | null;
};

function aiErrorDetails(error: unknown) {
  const value = error as { code?: unknown; message?: unknown };
  const rawCode = typeof value?.code === 'string' ? value.code : 'AI_GENERATION_FAILED';
  const code = rawCode.replace(/^functions\//, '').replace(/[^a-zA-Z0-9_-]/g, '_').toUpperCase();
  const message = friendlyError(error);
  return { code, message, copyText: `SLearn AI error ${code}\n${message}` };
}

function quotaDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const date = value ? new Date(value as string | number) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function nextAccountWeeklyReset(creationTime?: string): Date | null {
  const anchor = creationTime ? new Date(creationTime).getTime() : Number.NaN;
  if (!Number.isFinite(anchor)) return null;
  const week = 7 * 24 * 60 * 60 * 1000;
  const cycle = Math.floor(Math.max(0, Date.now() - anchor) / week);
  return new Date(anchor + (cycle + 1) * week);
}

function useAiQuota(user: User, enabled = true): AiQuota {
  const [quota, setQuota] = useState<AiQuota>({ questionsUsed: 0, imagesUsed: 0, nextResetAt: nextAccountWeeklyReset(user.metadata.creationTime) });
  useEffect(() => {
    if (!enabled) return;
    let latest: Record<string, unknown> = {};
    const refresh = () => {
      const now = Date.now();
      const nextResetAt = nextAccountWeeklyReset(user.metadata.creationTime);
      const storedReset = quotaDate(latest.nextResetAt);
      const currentCycle = latest.quotaType === 'account_weekly_reset' && storedReset && storedReset.getTime() > now;
      setQuota({
        questionsUsed: currentCycle ? Number(latest.questionsUsed ?? 0) : 0,
        imagesUsed: currentCycle ? Number(latest.imagesUsed ?? 0) : 0,
        nextResetAt,
      });
    };
    const unsubscribe = onSnapshot(doc(db, 'usage', user.uid), (snapshot) => {
      latest = snapshot.data() ?? {};
      refresh();
    });
    const timer = window.setInterval(refresh, 30_000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [enabled, user.metadata.creationTime, user.uid]);
  return quota;
}

function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

const OFFLINE_DB = 'slearn-offline-v1';
function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('exercises', { keyPath: 'key' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function cacheOfflineExercise(classroomId: string, exercise: unknown) {
  if (typeof indexedDB === 'undefined') return;
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction('exercises', 'readwrite'); tx.objectStore('exercises').put({ key: `${classroomId}:${(exercise as { id: string }).id}`, classroomId, exercise }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
async function readOfflineExercises(classroomId: string): Promise<any[]> {
  if (typeof indexedDB === 'undefined') return [];
  const database = await openOfflineDb();
  return await new Promise<any[]>((resolve, reject) => {
    const request = database.transaction('exercises', 'readonly').objectStore('exercises').getAll();
    request.onsuccess = () => { database.close(); resolve((request.result || []).filter((item: any) => item.classroomId === classroomId).map((item: any) => item.exercise)); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}
export function useOfflineExercisePack(user: User | null, role: Role | null) {
  useEffect(() => {
    if (!user || role !== 'student' || typeof window === 'undefined') return;
    const cachePack = async () => {
      if (!navigator.onLine) return;
      try {
        const memberships = await getDocs(collection(db, 'users', user.uid, 'memberships'));
        await Promise.all(memberships.docs.map(async (membership) => {
          const classroomId = membership.id;
          const exercises = await getDocs(collection(db, 'classrooms', classroomId, 'exercises'));
          await Promise.all(exercises.docs.map((exercise) => cacheOfflineExercise(classroomId, { id: exercise.id, ...exercise.data() })));
        }));
      } catch { /* Firestore persistence remains the fallback when a pack cannot refresh. */ }
    };
    const syncQueuedSubmissions = async () => {
      if (!navigator.onLine) return;
      const key = `slearn:offline-submissions:${user.uid}`;
      const queued = JSON.parse(window.localStorage.getItem(key) || '[]') as Array<any>;
      if (!queued.length) return;
      const remaining = [];
      for (const item of queued) {
        try {
          if (item.personalized) await httpsCallable(functions, 'submitPersonalizedExercise')(item);
          else await setDoc(doc(db, 'classrooms', item.classroomId, 'exercises', item.exerciseId, 'submissions', user.uid), item.submission);
        } catch { remaining.push(item); }
      }
      if (remaining.length) window.localStorage.setItem(key, JSON.stringify(remaining));
      else window.localStorage.removeItem(key);
    };
    void cachePack();
    void syncQueuedSubmissions();
    const handleOnline = () => { void cachePack(); void syncQueuedSubmissions(); };
    window.addEventListener('online', handleOnline);
    const retryTimer = window.setInterval(() => { if (navigator.onLine) void syncQueuedSubmissions(); }, 15_000);
    void navigator.serviceWorker?.register('/sw.js').catch(() => undefined);
    return () => { window.removeEventListener('online', handleOnline); window.clearInterval(retryTimer); };
  }, [user, role]);
}

function useApprovedSubjects(stage: SchoolStage, year: string) {
  const [subjects, setSubjects] = useState<string[]>([]);
  useEffect(() => onSnapshot(collection(db, 'subjectCatalog'), (snapshot) => {
    setSubjects(snapshot.docs.map((item) => item.data()).filter((item) => item.schoolStage === stage && (item.schoolYear === year || item.schoolYear === 'all')).map((item) => String(item.label || '')).filter(Boolean));
  }), [stage, year]);
  return subjects;
}

const OTHER_SUBJECT = 'Others — request a new subject';
function quotaCountdown(date: Date | null) {
  if (!date) return 'Reset schedule unavailable';
  const remaining = Math.max(0, date.getTime() - Date.now());
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${days}d ${hours}h ${minutes}m`;
}

function formatDeadline(deadlineStr?: string | null): {
  formatted: string;
  isPast: boolean;
  isUrgent: boolean;
} {
  if (!deadlineStr) return { formatted: '', isPast: false, isUrgent: false };
  const d = new Date(deadlineStr);
  if (isNaN(d.getTime()))
    return { formatted: '', isPast: false, isUrgent: false };
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const isPast = diffMs < 0;
  const isUrgent = !isPast && diffMs < 24 * 60 * 60 * 1000;

  const formattedDate = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    formatted: `${formattedDate}, ${formattedTime}`,
    isPast,
    isUrgent,
  };
}

function computeSubmissionStats(
  sub: Partial<SubmissionData> | any,
  ex: any,
): { correct: number; wrong: number; questionResults: QuestionResult[] } {
  const qList: any[] = ex?.questions?.length
    ? ex.questions
    : ex?.question
      ? [{ question: ex.question, answer: ex.answer || '', points: 2 }]
      : [];

  // 1. If submission has explicit questionResults
  if (
    sub?.questionResults &&
    Array.isArray(sub.questionResults) &&
    sub.questionResults.length > 0
  ) {
    const normalizedResults = sub.questionResults.map((result: QuestionResult, index: number) => ({
      ...result,
      difficulty: result.difficulty || qList[result.questionIdx ?? index]?.difficulty || 'medium',
      topic: result.topic || qList[result.questionIdx ?? index]?.topic || 'General',
      subtopic: result.subtopic || qList[result.questionIdx ?? index]?.subtopic || '',
      skills: result.skills?.length ? result.skills : qList[result.questionIdx ?? index]?.skills || [],
    }));
    const c = normalizedResults.filter(
      (r: QuestionResult) => r.isCorrect,
    ).length;
    const w = normalizedResults.filter(
      (r: QuestionResult) => !r.isCorrect,
    ).length;
    return { correct: c, wrong: w, questionResults: normalizedResults };
  }

  // 2. If submission has answers map, compare each with question answers
  if (qList.length > 0) {
    let c = 0;
    let w = 0;
    const results: QuestionResult[] = qList.map((q, idx) => {
      const userA = (
        sub?.answers && sub.answers[idx] !== undefined
          ? String(sub.answers[idx])
          : ''
      ).trim();
      const userALow = userA.toLowerCase();
      const expA = (q.answer ? String(q.answer) : '').trim();
      const expALow = expA.toLowerCase();
      const pts = Number(q.points) || 1;

      let isCorrect = false;
      if (
        userALow &&
        expALow &&
        (userALow === expALow ||
          expALow.includes(userALow) ||
          userALow.includes(expALow))
      ) {
        isCorrect = true;
        c++;
      } else {
        w++;
      }
      return {
        questionIdx: idx,
        questionText: q.question || `Question 0${idx + 1}`,
        expectedAnswer: expA,
        studentAnswer: userA,
        isCorrect,
        pointsEarned: isCorrect
          ? pts
          : userA
            ? Math.max(1, Math.round(pts * 0.5))
            : 0,
        pointsPossible: pts,
        difficulty: q.difficulty || 'medium',
        topic: q.topic || 'General',
        subtopic: q.subtopic || '',
        skills: Array.isArray(q.skills) ? q.skills : [],
      };
    });

    // If string matching yielded 0 correct but score > 0 (e.g. slight phrasing differences in older submissions)
    if (c === 0 && sub?.score > 0) {
      const totalPossible =
        sub.totalPoints ||
        qList.reduce((sum: number, q: any) => sum + (Number(q.points) || 1), 0);
      if (sub.score >= totalPossible) {
        c = qList.length;
        w = 0;
      } else {
        c = Math.max(
          1,
          Math.min(
            qList.length,
            Math.round((sub.score / totalPossible) * qList.length),
          ),
        );
        w = Math.max(0, qList.length - c);
      }
    }

    return { correct: c, wrong: w, questionResults: results };
  }

  // 3. Fallback based on stored totalCorrect / totalWrong if present
  if (
    typeof sub?.totalCorrect === 'number' &&
    typeof sub?.totalWrong === 'number' &&
    sub.totalCorrect + sub.totalWrong > 0
  ) {
    return {
      correct: sub.totalCorrect,
      wrong: sub.totalWrong,
      questionResults: [],
    };
  }

  // 4. Fallback based on score and totalPoints
  if (sub?.score !== undefined) {
    const total = sub.totalPoints || 2;
    const isFull = sub.score >= total;
    const c = isFull ? total : sub.score > 0 ? 1 : 0;
    const w = Math.max(0, total > 0 ? (isFull ? 0 : 1) : 0);
    return { correct: c, wrong: w, questionResults: [] };
  }

  return { correct: 0, wrong: 0, questionResults: [] };
}

function Brand() {
  return (
    <div className="brand-lockup">
      <span className="brand-mark">
        <span>S</span>
      </span>
      <div>
        <strong>SLearn</strong>
        <small>learn your way</small>
      </div>
    </div>
  );
}
function LoginPage({
 busy: globalBusy,
 error: globalError,
 onAuth
}:{
 busy: boolean;
 error: string;
 onAuth: (params: AuthParams) => Promise<void>;
}){
 const [modalOpen, setModalOpen] = useState(false);
 const [authMode, setAuthMode] = useState<'login'|'signup'|'reset'>('signup');
 const [authRole, setAuthRole] = useState<Role>('student');
 const [name, setName] = useState('');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [modalBusy, setModalBusy] = useState(false);
 const [modalError, setModalError] = useState('');
 const [resetMessage, setResetMessage] = useState('');

 const openModal = (mode: 'login'|'signup'|'reset', role?: Role) => {
  setAuthMode(mode);
  if (role) setAuthRole(role);
  setModalError('');
  setResetMessage('');
  setShowPassword(false);
  setModalOpen(true);
 };

 const switchMode = (mode: 'login'|'signup'|'reset') => {
  setAuthMode(mode);
  setModalError('');
  setResetMessage('');
  setShowPassword(false);
 };

 const handleEmailSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (authMode === 'reset') {
   if (!email.trim()) {
    setModalError('Please enter your email address.');
    return;
   }
   setModalBusy(true);
   setModalError('');
   setResetMessage('');
   try {
    const actionCodeSettings = typeof window !== 'undefined' ? {
      url: `${window.location.origin}/?mode=resetPassword`,
      handleCodeInApp: true,
    } : undefined;
    await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
    setResetMessage('Password reset link sent! Please check your inbox and spam folder.');
   } catch (err: any) {
    setModalError(err?.message || 'Could not send the reset email. Please try again.');
   } finally {
    setModalBusy(false);
   }
   return;
  }

  if (!email.trim() || !password.trim()) {
   setModalError('Please enter both email and password.');
   return;
  }
  if (authMode === 'signup' && password.length < 6) {
   setModalError('Password must be at least 6 characters.');
   return;
  }
  setModalBusy(true);
  setModalError('');
  try {
   await onAuth({
    provider: 'email',
    mode: authMode === 'signup' ? 'signup' : 'login',
    role: authMode === 'signup' ? authRole : null,
    email: email.trim(),
    password,
    name: name.trim()
   });
   setModalOpen(false);
  } catch (err: any) {
   setModalError(err?.message || 'Authentication failed. Please try again.');
  } finally {
   setModalBusy(false);
  }
 };

 const handleGoogleSubmit = async () => {
  setModalBusy(true);
  setModalError('');
  try {
   await onAuth({
    provider: 'google',
    mode: authMode === 'signup' ? 'signup' : 'login',
    role: authMode === 'signup' ? authRole : null
   });
   setModalOpen(false);
  } catch (err: any) {
   setModalError(err?.message || 'Google sign-in failed. Please try again.');
  } finally {
   setModalBusy(false);
  }
 };

 return (
  <main className="welcome-page">
   <nav className="welcome-nav">
    <Brand/>
    <button className="login-link" disabled={globalBusy} onClick={() => openModal('login')}>
     <LogIn/> Log in
    </button>
   </nav>

   <section className="welcome-hero">
    <div className="welcome-copy">
     <h1>One place for every <em>learning moment.</em></h1>
     <p>Create a classroom, bring learners together and turn everyday questions into guided practice.</p>
     <div className="welcome-actions">
      <button className="signup-card student-signup" disabled={globalBusy} onClick={() => openModal('signup', 'student')}>
       <span><BookOpen/></span>
       <div><b>Sign up as Student</b><small>Join classes and follow your progress</small></div>
       <ArrowRight/>
      </button>
      <button className="signup-card teacher-signup" disabled={globalBusy} onClick={() => openModal('signup', 'teacher')}>
       <span><GraduationCap/></span>
       <div><b>Sign up as Teacher</b><small>Create classes and guide every learner</small></div>
       <ArrowRight/>
      </button>
     </div>
     {globalBusy && <p className="auth-state"><LoaderCircle className="animate-spin" /> Authenticating…</p>}
     {globalError && <p className="auth-error">{globalError}</p>}
    </div>

    <div className="welcome-visual" aria-hidden="true">
     <div className="preview-window">
      <div className="preview-top">
       <span className="preview-logo">S</span>
       <span className="preview-dots"><i/><i/><i/></span>
      </div>
      <div className="preview-greeting">
       <small>GOOD MORNING</small>
       <h2>Ready to learn?</h2>
      </div>
      <div className="preview-focus">
       <span><Sparkles/></span>
       <div>
        <small>TODAY'S FOCUS</small>
        <h3>Small steps make<br/>big progress.</h3>
       </div>
       <strong>72<sup>%</sup></strong>
      </div>
      <div className="preview-classes">
       <article>
        <BookOpen/>
       <span><small>MY CLASS</small><b>Mathematics</b></span>
       <em>2 tasks</em>
      </article>
      </div>
     </div>
    </div>
   </section>

    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
     <DialogContent className="modal-card">
      <DialogHeader>
       <div
        style={{
         display: 'inline-flex',
         alignItems: 'center',
         justifyContent: 'center',
         width: 44,
         height: 44,
         borderRadius: '16px',
         background: '#f1ece5',
         color: '#111',
         marginBottom: 6,
        }}
       >
        {authMode === 'reset' ? (
         <KeyRound style={{ width: 20, height: 20 }} />
        ) : authMode === 'signup' ? (
         <Sparkles style={{ width: 20, height: 20 }} />
        ) : (
         <LogIn style={{ width: 20, height: 20 }} />
        )}
       </div>
       <DialogTitle>
        {authMode === 'signup'
         ? 'Create your account'
         : authMode === 'reset'
           ? 'Forgot password?'
           : 'Welcome back'}
       </DialogTitle>
       <DialogDescription>
        {authMode === 'signup'
         ? (authRole === 'teacher'
            ? 'Sign up as a teacher to create classrooms and guided exercises.'
            : 'Sign up as a student to join classes and track your learning.')
         : authMode === 'reset'
           ? "Enter your email address and we'll send you a link to reset your password."
           : 'Sign in to your SLearn account using email & password or Google.'}
       </DialogDescription>
      </DialogHeader>

      {authMode === 'signup' && (
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f1ece5', padding: '4px', borderRadius: '14px', marginTop: '4px' }}>
        <button
         type="button"
         onClick={() => setAuthRole('student')}
         style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '9px 12px',
          borderRadius: '10px',
          border: 0,
          fontSize: '0.84rem',
          fontWeight: 700,
          cursor: 'pointer',
          background: authRole === 'student' ? '#111' : 'transparent',
          color: authRole === 'student' ? '#fff' : '#555',
          transition: 'all 0.15s'
         }}
        >
         <BookOpen style={{ width: 16, height: 16 }} />
         Student
        </button>
        <button
         type="button"
         onClick={() => setAuthRole('teacher')}
         style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '9px 12px',
          borderRadius: '10px',
          border: 0,
          fontSize: '0.84rem',
          fontWeight: 700,
          cursor: 'pointer',
          background: authRole === 'teacher' ? '#111' : 'transparent',
          color: authRole === 'teacher' ? '#fff' : '#555',
          transition: 'all 0.15s'
         }}
        >
         <GraduationCap style={{ width: 16, height: 16 }} />
         Teacher
        </button>
       </div>
      )}

      <form onSubmit={handleEmailSubmit} style={{ display: 'grid', gap: '11px', marginTop: '6px' }}>
       {authMode === 'signup' && (
        <label className="form-label">
         Full Name
         <Input
          placeholder="e.g. Alex Tan"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={modalBusy}
         />
        </label>
       )}

       <label className="form-label">
        Email Address
        <Input
         type="email"
         placeholder="name@example.com"
         value={email}
         onChange={e => setEmail(e.target.value)}
         disabled={modalBusy}
         required
        />
       </label>

       {authMode !== 'reset' && (
        <div className="form-label">
         <div className="password-label-row">
          <span>Password</span>
          {authMode === 'login' && (
           <button
            type="button"
            onClick={() => switchMode('reset')}
            disabled={modalBusy}
           >
            Forgot password?
           </button>
          )}
         </div>
         <div className="password-field">
          <Input
           type={showPassword ? 'text' : 'password'}
           placeholder={authMode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
           value={password}
           onChange={e => setPassword(e.target.value)}
           disabled={modalBusy}
           required
          />
          <button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>
           {showPassword ? <EyeOff/> : <Eye/>}
          </button>
         </div>
        </div>
       )}

       {modalError && <p className="form-error" style={{ marginTop: '2px' }}>{modalError}</p>}
       {resetMessage && (
        <div
         style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '12px',
          padding: '10px 14px',
          color: '#166534',
          fontSize: '0.85rem',
          lineHeight: 1.45,
          marginTop: '2px',
         }}
        >
         <CheckCircle2
          style={{
           width: 16,
           height: 16,
           flexShrink: 0,
           marginTop: 2,
           color: '#16a34a',
          }}
         />
         <span>{resetMessage}</span>
        </div>
       )}

       <Button
        type="submit"
        className="primary-action"
        disabled={modalBusy || !email.trim() || (authMode !== 'reset' && !password.trim())}
        style={{ width: '100%', height: '46px', borderRadius: '14px', marginTop: '4px' }}
       >
        {modalBusy ? (
         <LoaderCircle className="animate-spin" />
        ) : authMode === 'signup' ? (
         <ArrowRight />
        ) : authMode === 'reset' ? (
         <Send />
        ) : (
         <LogIn />
        )}
        {authMode === 'signup'
         ? `Sign up as ${authRole === 'teacher' ? 'Teacher' : 'Student'}`
         : authMode === 'reset'
           ? 'Send reset link'
           : 'Log in with Email'}
       </Button>
      </form>

      {authMode !== 'reset' ? (
       <>
        <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0', gap: '10px' }}>
         <div style={{ flex: 1, height: 1, background: '#e9e4dc' }} />
         <span style={{ fontSize: '0.68rem', color: '#8b857d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>or</span>
         <div style={{ flex: 1, height: 1, background: '#e9e4dc' }} />
        </div>

        <button
         type="button"
         disabled={modalBusy}
         onClick={handleGoogleSubmit}
         style={{
          width: '100%',
          height: '46px',
          borderRadius: '14px',
          background: '#fff',
          border: '1px solid #ded8cf',
          fontWeight: 600,
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          color: '#111',
          cursor: 'pointer',
          boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
         }}
        >
         <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
         </svg>
         {authMode === 'signup' ? `Sign up with Google` : 'Log in with Google'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#7a746d', margin: '10px 0 0' }}>
         {authMode === 'signup' ? (
          <>Already have an account? <button type="button" onClick={() => switchMode('login')} style={{ background: 'none', border: 0, fontWeight: 700, textDecoration: 'underline', color: '#111', cursor: 'pointer' }}>Log in</button></>
         ) : (
          <>Don't have an account? <button type="button" onClick={() => switchMode('signup')} style={{ background: 'none', border: 0, fontWeight: 700, textDecoration: 'underline', color: '#111', cursor: 'pointer' }}>Sign up</button></>
         )}
        </p>
       </>
      ) : (
       <p style={{ textAlign: 'center', fontSize: '0.82rem', color: '#7a746d', margin: '12px 0 0' }}>
        Remember your password?{' '}
        <button
         type="button"
         onClick={() => switchMode('login')}
         style={{
          background: 'none',
          border: 0,
          fontWeight: 700,
          textDecoration: 'underline',
          color: '#111',
          cursor: 'pointer'
         }}
        >
         Back to Log in
        </button>
       </p>
      )}
     </DialogContent>
    </Dialog>
  </main>
 );
}

function ResetPasswordPage({
  oobCode,
  onDone,
}: {
  oobCode: string;
  onDone: () => void;
}) {
  const [verifying, setVerifying] = useState(true);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    async function verify() {
      try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        if (active) {
          setVerifiedEmail(email);
          setVerifying(false);
        }
      } catch (err: any) {
        if (active) {
          setVerifyError(
            err?.message ||
              'This password reset link is invalid or has expired. Please request a new one.'
          );
          setVerifying(false);
        }
      }
    }
    void verify();
    return () => {
      active = false;
    };
  }, [oobCode]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      setSaveError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      setSaveError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    setSaveError('');
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setSaveError(
        err?.message || 'Could not reset password. Please try again or request a new link.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="welcome-page">
      <nav className="welcome-nav">
        <Brand />
        <button className="login-link" onClick={onDone}>
          <LogIn /> Log in
        </button>
      </nav>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 'calc(100vh - 140px)',
          padding: '24px 16px',
        }}
      >
        <div
          className="modal-card"
          style={{
            width: '100%',
            maxWidth: '460px',
            background: '#fbfaf7',
            borderRadius: '24px',
            border: '1px solid #ebe5dd',
            boxShadow: '0 30px 90px #18130e20',
            padding: '32px 28px',
          }}
        >
          {verifying ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 0',
                gap: '14px',
                textAlign: 'center',
              }}
            >
              <LoaderCircle className="animate-spin" style={{ width: 32, height: 32, color: '#111' }} />
              <p style={{ fontSize: '0.92rem', color: '#6f6b64', fontWeight: 500 }}>
                Verifying reset link…
              </p>
            </div>
          ) : verifyError ? (
            <div style={{ display: 'grid', gap: '18px', textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 52,
                  height: 52,
                  borderRadius: '18px',
                  background: '#fef2f2',
                  color: '#dc2626',
                  margin: '0 auto',
                }}
              >
                <AlertCircle style={{ width: 26, height: 26 }} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#111', margin: '0 0 6px' }}>
                  Reset link expired or invalid
                </h2>
                <p style={{ fontSize: '0.88rem', color: '#6f6b64', lineHeight: 1.5, margin: 0 }}>
                  {verifyError}
                </p>
              </div>
              <Button
                type="button"
                className="primary-action"
                onClick={onDone}
                style={{ width: '100%', height: '46px', borderRadius: '14px', marginTop: '6px' }}
              >
                <ArrowLeft /> Return to login
              </Button>
            </div>
          ) : success ? (
            <div style={{ display: 'grid', gap: '18px', textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 52,
                  height: 52,
                  borderRadius: '18px',
                  background: '#f0fdf4',
                  color: '#16a34a',
                  margin: '0 auto',
                }}
              >
                <CheckCircle2 style={{ width: 28, height: 28 }} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.45rem', fontWeight: 600, color: '#111', margin: '0 0 6px' }}>
                  Password updated
                </h2>
                <p style={{ fontSize: '0.88rem', color: '#6f6b64', lineHeight: 1.5, margin: 0 }}>
                  Your password has been successfully reset. You can now log in with your new credentials.
                </p>
              </div>
              <Button
                type="button"
                className="primary-action"
                onClick={onDone}
                style={{ width: '100%', height: '46px', borderRadius: '14px', marginTop: '8px' }}
              >
                <LogIn /> Log in with new password
              </Button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: '16px',
                    background: '#f1ece5',
                    color: '#111',
                    marginBottom: 14,
                  }}
                >
                  <KeyRound style={{ width: 22, height: 22 }} />
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#111', margin: '0 0 4px' }}>
                  Reset your password
                </h2>
                <p style={{ fontSize: '0.88rem', color: '#6f6b64', margin: 0 }}>
                  for{' '}
                  <strong style={{ color: '#111', fontWeight: 600 }}>
                    {verifiedEmail || 'your account'}
                  </strong>
                </p>
              </div>

              <form onSubmit={handleSave} style={{ display: 'grid', gap: '14px' }}>
                <div className="form-label">
                  <div className="password-label-row">
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#44564c' }}>
                      New password
                    </span>
                  </div>
                  <div className="password-field">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter new password (min. 6 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={submitting}
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </div>

                {saveError && (
                  <p className="form-error" style={{ marginTop: 2, marginBottom: 0 }}>
                    {saveError}
                  </p>
                )}

                <Button
                  type="submit"
                  className="primary-action"
                  disabled={submitting || !newPassword.trim()}
                  style={{
                    width: '100%',
                    height: '46px',
                    borderRadius: '14px',
                    marginTop: 6,
                    fontSize: '0.92rem',
                    fontWeight: 600,
                  }}
                >
                  {submitting ? (
                    <>
                      <LoaderCircle className="animate-spin" /> Saving…
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </form>

              <p
                style={{
                  textAlign: 'center',
                  fontSize: '0.82rem',
                  color: '#7a746d',
                  margin: '18px 0 0',
                }}
              >
                Remember your old password?{' '}
                <button
                  type="button"
                  onClick={onDone}
                  style={{
                    background: 'none',
                    border: 0,
                    fontWeight: 700,
                    textDecoration: 'underline',
                    color: '#111',
                    cursor: 'pointer',
                  }}
                >
                  Back to Log in
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
type NavTarget = 'overview' | 'classes' | 'progress' | 'analytics';
function AppShell({
  role,
  user,
  onExit,
  onNavigate,
  children,
  active = 'dashboard',
  classCount = 0,
}: {
  role: Role;
  user: User;
  onExit: () => void;
  onNavigate?: (target: NavTarget) => void;
  children: React.ReactNode;
  active?: View;
  classCount?: number;
}) {
  const isOnline = useOnlineStatus();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState(user.displayName || '');
  const [profilePhoto, setProfilePhoto] = useState(user.photoURL || '');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState(user.photoURL || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalledApp, setIsInstalledApp] = useState(false);
  const profileQuota = useAiQuota(user, role === 'teacher');
  useEffect(() => {
    setIsInstalledApp(window.matchMedia('(display-mode: standalone)').matches);
    const captureInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    const installed = () => { setInstallPrompt(null); setIsInstalledApp(true); };
    window.addEventListener('beforeinstallprompt', captureInstall);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', captureInstall); window.removeEventListener('appinstalled', installed); };
  }, []);
  const installApp = async () => { if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); };
  useEffect(() => { if (!profileFile) { setProfilePreview(profilePhoto); return; } const url = URL.createObjectURL(profileFile); setProfilePreview(url); return () => URL.revokeObjectURL(url); }, [profileFile, profilePhoto]);
  const go = (target: NavTarget) => {
    if (onNavigate) {
      onNavigate(target);
      return;
    }
    window.dispatchEvent(new CustomEvent<NavTarget>('slearn:navigate', { detail: target }));
  };
  const openProfile = () => { setProfileName(user.displayName || ''); setProfilePhoto(user.photoURL || ''); setProfileFile(null); setProfileError(''); setProfileOpen(true); };
  const choosePhoto = (file?: File) => { if (!file) return; if (file.size > 5 * 1024 * 1024) { setProfileError('Please choose an image smaller than 5 MB.'); return; } if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setProfileError('Please choose a JPG, PNG or WebP image.'); return; } setProfileError(''); setProfileFile(file); };
  const saveProfile = async () => { const cleanName = profileName.trim(); if (!cleanName) { setProfileError('Please enter your name.'); return; } setProfileSaving(true); setProfileError(''); try { let photoURL = profilePhoto; if (profileFile) { const extension = profileFile.type === 'image/png' ? 'png' : profileFile.type === 'image/webp' ? 'webp' : 'jpg'; const photoRef = ref(storage, `users/${user.uid}/profile/avatar-${Date.now()}.${extension}`); await uploadBytes(photoRef, profileFile, { contentType: profileFile.type }); photoURL = await getDownloadURL(photoRef); } await updateProfile(user, { displayName: cleanName, photoURL: photoURL || null }); await setDoc(doc(db, 'users', user.uid), { displayName: cleanName, photoURL: photoURL || '', updatedAt: serverTimestamp() }, { merge: true }); setProfileName(cleanName); setProfilePhoto(photoURL || ''); setProfileFile(null); window.dispatchEvent(new Event('slearn:profile-updated')); setProfileOpen(false); } catch (error) { setProfileError(friendlyError(error)); } finally { setProfileSaving(false); } };
  const avatar = () => <span>{profilePhoto ? <img src={profilePhoto} alt="" /> : initials(profileName || user.displayName)}</span>;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Main navigation">
          <button
            className={active === 'dashboard' ? 'active' : ''}
            onClick={() => go('overview')}
            title="Overview"
          >
            <LayoutDashboard />
            <span>Overview</span>
          </button>
          <button
            className={active === 'classes' || active === 'classroom' || active === 'quiz' || active === 'exercise' ? 'active' : ''}
            onClick={() => go('classes')}
            title={role === 'student' ? 'Search Classrooms' : 'Classrooms'}
          >
            {role === 'student' ? <Search /> : <BookOpen />}
            <span>{role === 'student' ? 'Search' : 'Classrooms'}</span>
            <b>{classCount}</b>
          </button>
          <button className={active === 'progress' ? 'active' : ''} onClick={() => go('progress')} title="Progress">
            <BarChart3 />
            <span>Progress</span>
          </button>
          <button className={active === 'analytics' ? 'active' : ''} onClick={() => go('analytics')} title="Analytics">
            <LineChart />
            <span>Analytics</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          {!isInstalledApp && installPrompt && <button type="button" onClick={installApp} aria-label="Install SLearn desktop app" title="Install SLearn desktop app" style={{ color: '#173e30' }}><Download /><span>Install app</span></button>}
          <button type="button" className="mini-profile profile-trigger" onClick={openProfile} aria-label="Edit profile" title="Edit profile">
            {avatar()}
            <div>
              <b>{profileName || 'SLearn user'}</b>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <small>{role}</small>
                {!isOnline && (
                  <span className="offline-badge" title="No internet connection">
                    <WifiOff style={{ width: 10, height: 10 }} /> Offline
                  </span>
                )}
              </div>
            </div>
          </button>
          <button onClick={onExit} aria-label="Sign out" title="Sign out">
            <LogOut />
          </button>
        </div>
      </aside>
      <div className="mobile-bar">
        <Brand />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isOnline && (
            <span className="offline-badge" title="No internet connection">
              <WifiOff style={{ width: 10, height: 10 }} /> Offline
            </span>
          )}
          <button type="button" className="mobile-profile" onClick={openProfile} aria-label="Edit profile">{avatar()}</button>
        </div>
      </div>
      <section className="main-stage">
        {!isOnline && (
          <div className="offline-banner" role="status">
            <div className="offline-banner-icon">
              <WifiOff style={{ width: 18, height: 18 }} />
            </div>
            <div className="offline-banner-content">
              <strong>Offline Mode Active</strong>
              <span>
                You are currently disconnected. You can continue reviewing cached classrooms, viewing exercises, and drafting answers. Any changes will automatically sync once your connection is restored.
              </span>
            </div>
          </div>
        )}
        {children}
      </section>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="modal-card profile-modal"><DialogHeader><DialogTitle>Profile dashboard</DialogTitle><DialogDescription>Manage your profile and view your SLearn AI allowance.</DialogDescription></DialogHeader><div className="profile-editor"><div className="profile-photo-preview">{profilePreview ? <img src={profilePreview} alt="Profile preview" /> : <span>{initials(profileName)}</span>}<label title="Choose profile picture"><Camera/><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])}/></label></div><label className="form-label">Display name<Input value={profileName} maxLength={60} onChange={(event) => setProfileName(event.target.value)} placeholder="Your name"/></label><p className="profile-help">JPG, PNG or WebP · maximum 5 MB</p>{role === 'teacher' && <div style={{ background: '#f8faf7', border: '1px solid #dfe8df', borderRadius: 16, padding: '1rem', width: '100%' }}><span className="kicker">Personal weekly AI quota</span><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem', marginTop: '.6rem' }}><div><b>{Math.max(0, 15 - profileQuota.questionsUsed)}/15</b><small style={{ display: 'block' }}>questions available</small></div><div><b>{Math.max(0, 5 - profileQuota.imagesUsed)}/5</b><small style={{ display: 'block' }}>images available</small></div></div><div style={{ marginTop: '.8rem', paddingTop: '.8rem', borderTop: '1px solid #dfe8df' }}><b>Full quota resets in {quotaCountdown(profileQuota.nextResetAt)}</b><small style={{ display: 'block', marginTop: '.2rem' }}>{profileQuota.nextResetAt ? profileQuota.nextResetAt.toLocaleString() : 'The reset schedule is based on when this account was created.'}</small><small style={{ display: 'block', marginTop: '.25rem' }}>Unused credits do not carry over to the next cycle.</small></div></div>}{profileError && <p className="auth-error">{profileError}</p>}</div><DialogFooter><Button variant="outline" onClick={() => setProfileOpen(false)} disabled={profileSaving}>Close</Button><Button className="primary-action" onClick={saveProfile} disabled={profileSaving}>{profileSaving ? <><LoaderCircle/> Saving…</> : <><Check/> Save profile</>}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
function Topbar({ role, user }: { role: Role; user: User }) {
  const isOnline = useOnlineStatus();
  const first = (
    user.displayName || (role === 'teacher' ? 'Teacher' : 'Learner')
  ).split(' ')[0];
  return (
    <header className="topbar">
      <div>
        <span className="today">Your learning workspace</span>
        <h1>
          {role === 'teacher'
            ? `Welcome, ${first}.`
            : `Ready to learn, ${first}?`}
        </h1>
      </div>
      <div className="top-actions">
        {!isOnline && (
          <span className="offline-badge" title="No internet connection">
            <WifiOff style={{ width: 12, height: 12 }} /> Offline
          </span>
        )}
        <label>
          <Search />
          <input placeholder="Search" />
        </label>
        <span className={`role-badge ${role}`}>
          {role === 'teacher' ? <GraduationCap /> : <BookOpen />}
          {role}
        </span>
      </div>
    </header>
  );
}
function EmptyState({ role, action }: { role: Role; action: () => void }) {
  return (
    <section id="classrooms" className={`empty-dashboard ${role}`}>
      <span>{role === 'teacher' ? <GraduationCap /> : <BookOpen />}</span>
      <p className="kicker">Your space is ready</p>
      <h2>
        {role === 'teacher'
          ? 'Create your first classroom'
          : 'Join your first classroom'}
      </h2>
      <p>
        {role === 'teacher'
          ? 'Create a class and share its code or link with your students.'
          : 'Enter the code your teacher shared. You’ll get access after approval.'}
      </p>
      <Button onClick={action}>
        <Plus />
        {role === 'teacher' ? 'Create classroom' : 'Join classroom'}
      </Button>
    </section>
  );
}

function TeacherDashboard({
  user,
  onView,
  onExit,
  onSelectClass,
}: {
  user: User;
  onView: (v: View) => void;
  onExit: () => void;
  onSelectClass: (c: ClassroomData) => void;
}) {
  const [classes, setClasses] = useState<ClassroomData[]>([]),
    [requests, setRequests] = useState<JoinRequest[]>([]),
    [createOpen, setCreateOpen] = useState(false),
    [newName, setNewName] = useState(''),
    [schoolStage, setSchoolStage] = useState<SchoolStage>('primary'),
    [schoolYear, setSchoolYear] = useState('Tahun 1'),
    [newSubject, setNewSubject] = useState(''),
    [subjectSearch, setSubjectSearch] = useState(''),
    [customSubject, setCustomSubject] = useState(''),
    [subjectRequestMessage, setSubjectRequestMessage] = useState(''),
    [requestingSubject, setRequestingSubject] = useState(false),
    [newMaxStudents, setNewMaxStudents] = useState('30'),
    [saving, setSaving] = useState(false),
    [created, setCreated] = useState<ClassroomData | null>(null),
    [error, setError] = useState('');
  const [editTarget, setEditTarget] = useState<ClassroomData | null>(null),
    [editName, setEditName] = useState(''),
    [editSchoolStage, setEditSchoolStage] = useState<SchoolStage>('primary'),
    [editSchoolYear, setEditSchoolYear] = useState('Tahun 1'),
    [editSubject, setEditSubject] = useState(''),
    [editMaxStudents, setEditMaxStudents] = useState('30'),
    [savingEdit, setSavingEdit] = useState(false),
    [editError, setEditError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ClassroomData | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState('');
  const approvedSubjects = useApprovedSubjects(schoolStage, schoolYear);
  const approvedEditSubjects = useApprovedSubjects(editSchoolStage, editSchoolYear);
  const availableSubjects = [...subjectsFor(schoolStage, schoolYear), ...approvedSubjects.map((name) => ({ name, category: 'Admin-approved subjects' }))];
  const filteredSubjects = availableSubjects.filter((subject) => subject.name.toLocaleLowerCase().includes(subjectSearch.trim().toLocaleLowerCase()));
  const subjectGroups = [...new Set(filteredSubjects.map((subject) => subject.category))];
  const editAvailableSubjects = [...subjectsFor(editSchoolStage, editSchoolYear), ...approvedEditSubjects.map((name) => ({ name, category: 'Admin-approved subjects' }))];
  const editSubjectGroups = [...new Set(editAvailableSubjects.map((subject) => subject.category))];
  const requestCustomSubject = async () => {
    const label = cleanTag(customSubject);
    if (label.length < 2) return setSubjectRequestMessage('Enter a valid subject name.');
    const normalizedLabel = label.toLocaleLowerCase();
    const alreadyListed = availableSubjects.some((subject) => subject.name.trim().toLocaleLowerCase() === normalizedLabel);
    if (alreadyListed) {
      setSubjectRequestMessage('This subject already exists in the list. Please select it instead of requesting a duplicate.');
      return;
    }
    setRequestingSubject(true);
    try {
      const id = `${user.uid}-${schoolStage}-${schoolYear}-${tagId('subject', label)}`;
      await setDoc(doc(db, 'subjectProposals', id), { label, normalizedLabel, schoolStage, schoolYear, requesterId: user.uid, requesterName: user.displayName || 'Teacher', requesterEmail: user.email || '', status: 'pending', createdAt: serverTimestamp() });
      window.localStorage.setItem(`slearn:subject-proposal:${id}`, 'pending');
      setSubjectRequestMessage('Submitted for admin approval. It will appear in the subject list after approval.');
      setCustomSubject('');
    } catch (error) { setSubjectRequestMessage(friendlyError(error)); } finally { setRequestingSubject(false); }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'subjectProposals'), where('requesterId', '==', user.uid)),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const proposal = change.doc.data();
          if (proposal.status !== 'approved' && proposal.status !== 'rejected') return;
          const key = `slearn:subject-proposal:${change.doc.id}`;
          const previousStatus = window.localStorage.getItem(key);
          if (previousStatus === proposal.status) return;
          window.localStorage.setItem(key, String(proposal.status));
          const approved = proposal.status === 'approved';
          toast.add({
            title: approved ? 'Subject request approved' : 'Subject request declined',
            description: approved
              ? `${String(proposal.label || 'Your subject')} is now available in the subject dropdown.`
              : `${String(proposal.label || 'Your subject')} was not added. You can submit a revised request.`,
            type: approved ? 'success' : 'warning',
            timeout: 9000,
          });
        });
      },
    );
    return () => unsubscribe();
  }, [user.uid]);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'classrooms'), where('teacherId', '==', user.uid)),
        (s) =>
          setClasses(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as ClassroomData),
          ),
      ),
    [user.uid],
  );
  useEffect(() => {
    const groups = new Map<string, JoinRequest[]>();
    const unsubs = classes.map((c) =>
      onSnapshot(collection(db, 'classrooms', c.id, 'requests'), (s) => {
        groups.set(
          c.id,
          s.docs.map((d) => ({ id: d.id, ...d.data() }) as JoinRequest),
        );
        setRequests([...groups.values()].flat());
      }),
    );
    if (!classes.length) setRequests([]);
    return () => unsubs.forEach((u) => u());
  }, [classes.map((c) => c.id).join('|')]);

  useEffect(() => {
    if (!classes.length) return;
    const unsubs: (() => void)[] = [];

    classes.forEach((c) => {
      const classId = c.id;
      const exCol = collection(db, 'classrooms', classId, 'exercises');
      const unsubEx = onSnapshot(exCol, (exSnap) => {
        const exDocs = exSnap.docs;
        const totalExercises = exDocs.length;

        if (totalExercises === 0) {
          setClasses((prev) =>
            prev.map((item) =>
              item.id === classId ? { ...item, progress: 0 } : item,
            ),
          );
          if (c.progress !== 0) {
            setDoc(
              doc(db, 'classrooms', classId),
              { progress: 0 },
              { merge: true },
            ).catch(console.warn);
          }
          return;
        }

        const subCounts: Record<string, number> = {};
        const subUnsubs: (() => void)[] = [];

        const computeAndSetClassProgress = () => {
          const totalSubs = Object.values(subCounts).reduce((a, b) => a + b, 0);
          const studentCount = c.students || 0;
          let progressPct = 0;

          if (studentCount > 0 && totalExercises > 0) {
            progressPct = Math.min(
              100,
              Math.round((totalSubs / (totalExercises * studentCount)) * 100),
            );
          } else if (totalSubs > 0 && totalExercises > 0) {
            progressPct = Math.min(
              100,
              Math.round((totalSubs / totalExercises) * 100),
            );
          }

          setClasses((prev) =>
            prev.map((item) =>
              item.id === classId ? { ...item, progress: progressPct } : item,
            ),
          );

          setDoc(
            doc(db, 'classrooms', classId),
            { progress: progressPct },
            { merge: true },
          ).catch(console.warn);
        };

        exDocs.forEach((exDoc) => {
          const subCol = collection(
            db,
            'classrooms',
            classId,
            'exercises',
            exDoc.id,
            'submissions',
          );
          const uSub = onSnapshot(subCol, (subSnap) => {
            const studentIds = new Set<string>();
            subSnap.docs.forEach((docSnap) => {
              const d = docSnap.data();
              const sId = d.studentId || docSnap.id;
              if (sId) studentIds.add(sId);
            });
            subCounts[exDoc.id] = studentIds.size;
            computeAndSetClassProgress();
          });
          subUnsubs.push(uSub);
        });

        unsubs.push(() => subUnsubs.forEach((u) => u()));
      });

      unsubs.push(unsubEx);
    });

    return () => unsubs.forEach((u) => u());
  }, [
    user.uid,
    classes
      .map((c) => `${c.id}:${c.students || 0}`)
      .sort()
      .join(','),
  ]);

  const createClass = async () => {
    if (!newName.trim() || !newSubject || newSubject === OTHER_SUBJECT) return;
    if (classes.length >= MAX_TEACHER_CLASSES) {
      setError(
        `Teachers can only create a maximum of ${MAX_TEACHER_CLASSES} classrooms.`,
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      const maxStudentsNum = parseInt(newMaxStudents, 10) || 30;
      const code = `${
          newSubject
            .replace(/[^a-z0-9]/gi, '')
            .slice(0, 4)
            .toUpperCase() || 'CLAS'
        }-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        data = {
          name: newName.trim(),
          subject: `${newSubject} · ${schoolYear}`,
          subjectName: newSubject,
          schoolStage,
          schoolYear,
          curriculum: curriculumFor(schoolStage),
          code,
          teacherId: user.uid,
          teacherName: user.displayName || 'Teacher',
          students: 0,
          maxStudents: maxStudentsNum,
          progress: 0,
        };
      const ref = await addDoc(collection(db, 'classrooms'), {
        ...data,
        createdAt: serverTimestamp(),
      });
      setCreated({ id: ref.id, ...data });
      setNewName('');
      setNewSubject('');
      setNewMaxStudents('30');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c: ClassroomData) => {
    const selection = resolveCurriculumSelection(c);
    setEditTarget(c);
    setEditName(c.name);
    setEditSchoolStage(selection.stage);
    setEditSchoolYear(selection.schoolYear);
    setEditSubject(selection.subject);
    setEditMaxStudents(String(c.maxStudents || 30));
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editTarget || !editName.trim() || !editSubject) return;
    const maxCap = parseInt(editMaxStudents, 10) || 30;
    if (maxCap < (editTarget.students || 0)) {
      setEditError(
        `Capacity cannot be lower than current enrollment (${editTarget.students || 0} students).`,
      );
      return;
    }
    setSavingEdit(true);
    setEditError('');
    try {
      const classId = editTarget.id;
      const batch = writeBatch(db);
      batch.update(doc(db, 'classrooms', classId), {
        name: editName.trim(),
        subject: `${editSubject} · ${editSchoolYear}`,
        subjectName: editSubject,
        schoolStage: editSchoolStage,
        schoolYear: editSchoolYear,
        curriculum: curriculumFor(editSchoolStage),
        maxStudents: maxCap,
        updatedAt: serverTimestamp(),
      });
      const membersSnap = await getDocs(
        collection(db, 'classrooms', classId, 'members'),
      );
      membersSnap.docs.forEach((d) => {
        batch.update(doc(db, 'users', d.id, 'memberships', classId), {
          className: editName.trim(),
        });
      });
      await batch.commit();
      setEditTarget(null);
    } catch (e) {
      setEditError(friendlyError(e));
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const classId = deleteTarget.id;
      const [membersSnap, requestsSnap, exercisesSnap] = await Promise.all([
        getDocs(collection(db, 'classrooms', classId, 'members')),
        getDocs(collection(db, 'classrooms', classId, 'requests')),
        getDocs(collection(db, 'classrooms', classId, 'exercises')),
      ]);
      const batch = writeBatch(db);
      membersSnap.docs.forEach((d) => {
        batch.delete(doc(db, 'users', d.id, 'memberships', classId));
        batch.delete(doc(db, 'classrooms', classId, 'members', d.id));
      });
      requestsSnap.docs.forEach((d) => {
        batch.delete(doc(db, 'users', d.id, 'joinRequests', classId));
        batch.delete(doc(db, 'classrooms', classId, 'requests', d.id));
      });
      for (const exDoc of exercisesSnap.docs) {
        const subsSnap = await getDocs(
          collection(
            db,
            'classrooms',
            classId,
            'exercises',
            exDoc.id,
            'submissions',
          ),
        );
        subsSnap.docs.forEach((subDoc) =>
          batch.delete(
            doc(
              db,
              'classrooms',
              classId,
              'exercises',
              exDoc.id,
              'submissions',
              subDoc.id,
            ),
          ),
        );
        batch.delete(doc(db, 'classrooms', classId, 'exercises', exDoc.id));
      }
      batch.delete(doc(db, 'classrooms', classId));
      await batch.commit();
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(friendlyError(e));
    } finally {
      setDeleting(false);
    }
  };

  const decide = async (r: JoinRequest, approve: boolean) => {
    if (approve) {
      const target = classes.find((c) => c.id === r.classId);
      if (target && (target.students || 0) >= (target.maxStudents || 30)) {
        alert(
          `Cannot approve: ${target.name} has reached its maximum student capacity (${target.students}/${target.maxStudents || 30}).`,
        );
        return;
      }
    }
    const batch = writeBatch(db);
    batch.delete(doc(db, 'classrooms', r.classId, 'requests', r.studentId));
    batch.delete(doc(db, 'users', r.studentId, 'joinRequests', r.classId));
    if (approve) {
      batch.set(doc(db, 'classrooms', r.classId, 'members', r.studentId), {
        uid: r.studentId,
        name: r.studentName,
        email: r.studentEmail,
        progress: 0,
        joinedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', r.studentId, 'memberships', r.classId), {
        classId: r.classId,
        className: r.className,
        code: r.code,
        teacherId: user.uid,
        teacherName: user.displayName || 'Teacher',
        progress: 0,
        tasks: 0,
        joinedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'classrooms', r.classId), {
        students: increment(1),
      });
    }
    await batch.commit();
  };
  return (
    <AppShell
      role="teacher"
      user={user}
      onExit={onExit}
      classCount={classes.length}
    >
      <Topbar role="teacher" user={user} />
      {classes.length ? (
        <>
          <div id="progress" className="hero-strip">
            <div>
              <span className="hero-kicker">Class overview</span>
              <h2>
                {classes.length} / {MAX_TEACHER_CLASSES} classroom
                {classes.length > 1 ? 's' : ''} under your care.
              </h2>
              <p>
                {requests.length
                  ? `${requests.length} student request${requests.length > 1 ? 's' : ''} waiting for approval.`
                  : 'No join requests waiting right now.'}
              </p>
            </div>
            <div className="hero-score">
              <strong>
                {classes.reduce((n, c) => n + (c.students || 0), 0)}
              </strong>
              <small>total learners</small>
            </div>
          </div>
          <div className="section-head">
            <div>
              <span className="kicker">
                Your spaces ({classes.length}/{MAX_TEACHER_CLASSES})
              </span>
              <h2>Classrooms</h2>
            </div>
            <Button
              disabled={classes.length >= MAX_TEACHER_CLASSES}
              onClick={() => {
                if (classes.length >= MAX_TEACHER_CLASSES) return;
                setCreated(null);
                setCreateOpen(true);
              }}
              className="primary-action"
            >
              <Plus />{' '}
              {classes.length >= MAX_TEACHER_CLASSES
                ? `Class Limit Reached (${classes.length}/${MAX_TEACHER_CLASSES})`
                : 'Create classroom'}
            </Button>
          </div>
          <div id="classrooms" className="class-grid">
            {classes.map((c, i) => (
              <div
                key={c.id}
                className={`class-card ${colours[i % 3]}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelectClass(c);
                  onView('classroom');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectClass(c);
                    onView('classroom');
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="class-top">
                  <span>0{i + 1}</span>
                  <div
                    className="card-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="action-icon-btn"
                      title="Edit classroom"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(c);
                      }}
                      aria-label={`Edit ${c.name}`}
                    >
                      <Pencil style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      type="button"
                      className="action-icon-btn delete-btn"
                      title="Delete classroom"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(c);
                      }}
                      aria-label={`Delete ${c.name}`}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
                <div>
                  <small>{c.code}</small>
                  <h3>{c.name}</h3>
                </div>
                <div className="class-bottom">
                  <span>
                    <Users /> {c.students || 0} / {c.maxStudents || 30} learners
                  </span>
                  <span>{c.progress || 0}%</span>
                </div>
                <Progress value={c.progress || 0} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          role="teacher"
          action={() => {
            if (classes.length >= MAX_TEACHER_CLASSES) return;
            setCreateOpen(true);
          }}
        />
      )}
      <div className="dashboard-lower">
        <section className="panel requests">
          <div className="panel-head">
            <div>
              <span className="kicker">Needs your attention</span>
              <h2>
                Join requests <b>{requests.length}</b>
              </h2>
            </div>
          </div>
          {requests.length ? (
            requests.map((r) => (
              <div className="request-row" key={`${r.classId}-${r.studentId}`}>
                <span className="avatar">{initials(r.studentName)}</span>
                <div>
                  <b>{r.studentName}</b>
                  <small>{r.className}</small>
                </div>
                <button
                  className="decline"
                  onClick={() => decide(r, false)}
                  aria-label="Decline"
                >
                  <X />
                </button>
                <button className="approve" onClick={() => decide(r, true)}>
                  <Check /> Approve
                </button>
              </div>
            ))
          ) : (
            <div className="empty-success">
              <CheckCircle2 /> No pending student requests.
            </div>
          )}
        </section>
        {classes.length > 0 && (
          <section className="panel next-up">
            <div className="panel-head">
              <div>
                <span className="kicker">Quick action</span>
                <h2>Build with AI</h2>
              </div>
              <WandSparkles />
            </div>
            <div className="ai-card">
              <span className="ai-glyph">
                <Bot />
              </span>
              <h3>Make a question clearer and richer.</h3>
              <p>Open a classroom, then create an AI-enhanced exercise.</p>
            </div>
          </section>
        )}
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="modal-card">
          <DialogHeader>
            <DialogTitle>
              {created ? 'Classroom created!' : 'Create a classroom'}
            </DialogTitle>
            <DialogDescription>
              {created
                ? 'Share this code or link with students.'
                : 'Your class and student list will begin empty.'}
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="created-class">
              <small>CLASS CODE</small>
              <strong>{created.code}</strong>
              <p>{created.name}</p>
              <p>
                <small>
                  Student Capacity: {created.maxStudents || 30} learners
                </small>
              </p>
              <Button
                onClick={() =>
                  navigator.clipboard.writeText(
                    `${location.origin}/?join=${created.code}`,
                  )
                }
              >
                <Copy /> Copy invite link
              </Button>
            </div>
          ) : (
            <>
              <label className="form-label">
                Classroom name
                <Input
                  placeholder="e.g. 4 Bestari"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <div className="curriculum-fields">
                <label className="form-label">
                  School level
                  <NativeSelect
                    className="curriculum-select"
                    value={schoolStage}
                    onChange={(e) => {
                      const stage = e.target.value as SchoolStage;
                      setSchoolStage(stage);
                      setSchoolYear(SCHOOL_YEARS[stage][0]);
                      setNewSubject('');
                      setSubjectSearch('');
                    }}
                  >
                    {SCHOOL_STAGES.map((stage) => (
                      <NativeSelectOption key={stage.value} value={stage.value}>
                        {stage.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                <label className="form-label">
                  Year / form
                  <NativeSelect
                    className="curriculum-select"
                    value={schoolYear}
                    onChange={(e) => {
                      setSchoolYear(e.target.value);
                      setNewSubject('');
                      setSubjectSearch('');
                    }}
                  >
                    {SCHOOL_YEARS[schoolStage].map((year) => (
                      <NativeSelectOption key={year} value={year}>
                        {year}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
              </div>
              <label className="form-label">
                KPM subject
                <Combobox
                  value={newSubject || null}
                  onValueChange={(value) => { setNewSubject(String(value || '')); setSubjectSearch(''); }}
                  items={[...filteredSubjects.map((subject) => subject.name), OTHER_SUBJECT]}
                >
                  <ComboboxInput
                  className="curriculum-combobox"
                  placeholder="Search a subject, e.g. Fizik"
                  showClear
                  onChange={(event) => setSubjectSearch(event.target.value)}
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>No matching subject for this level.</ComboboxEmpty>
                    <ComboboxList>
                      {subjectGroups.map((group) => (
                        <ComboboxGroup key={group}>
                          <ComboboxLabel>{group}</ComboboxLabel>
                      {filteredSubjects
                            .filter((subject) => subject.category === group)
                            .map((subject) => (
                              <ComboboxItem key={subject.name} value={subject.name}>
                                {subject.name}
                              </ComboboxItem>
                            ))}
                        </ComboboxGroup>
                      ))}
                  {(!subjectSearch.trim() || OTHER_SUBJECT.toLocaleLowerCase().includes(subjectSearch.trim().toLocaleLowerCase())) && <ComboboxGroup>
                    <ComboboxLabel>Can’t find your subject?</ComboboxLabel>
                    <ComboboxItem value={OTHER_SUBJECT}>{OTHER_SUBJECT}</ComboboxItem>
                  </ComboboxGroup>}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <small className="curriculum-note">
                  {curriculumFor(schoolStage)} · {availableSubjects.length} subjects listed for {schoolYear}
                </small>
              </label>
              {newSubject === OTHER_SUBJECT && (
                <div className="custom-subject-request">
                  <label className="form-label">
                    New subject name
                    <Input value={customSubject} onChange={(e) => { setCustomSubject(e.target.value); setSubjectRequestMessage(''); }} placeholder="Enter the official subject name" maxLength={100} />
                  </label>
                  <Button type="button" variant="outline" onClick={requestCustomSubject} disabled={requestingSubject || customSubject.trim().length < 2}>
                    {requestingSubject ? <LoaderCircle /> : <Send />} Submit for admin approval
                  </Button>
                  {subjectRequestMessage && <p className="curriculum-note">{subjectRequestMessage}</p>}
                </div>
              )}
              <label className="form-label">
                Student capacity (Max learners)
                <Input
                  type="number"
                  min="1"
                  max="100"
                  placeholder="e.g. 30"
                  value={newMaxStudents}
                  onChange={(e) => setNewMaxStudents(e.target.value)}
                />
              </label>
              {error && <p className="form-error">{error}</p>}
            </>
          )}
          <DialogFooter>
            {created ? (
              <Button onClick={() => setCreateOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={createClass}
                  disabled={
                    saving ||
                    !newName.trim() ||
                    !newSubject ||
                    newSubject === OTHER_SUBJECT ||
                    classes.length >= MAX_TEACHER_CLASSES
                  }
                >
                  {saving ? <LoaderCircle /> : <Plus />} Create classroom
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="modal-card">
          <DialogHeader>
            <DialogTitle>Edit classroom</DialogTitle>
            <DialogDescription>
              Update details for {editTarget?.name}.
            </DialogDescription>
          </DialogHeader>
          <label className="form-label">
            Classroom name
            <Input
              placeholder="e.g. Mathematics · Form 4"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <div className="curriculum-fields">
            <label className="form-label">
              School level
              <NativeSelect className="curriculum-select" value={editSchoolStage} onChange={(e) => { const stage=e.target.value as SchoolStage; setEditSchoolStage(stage); setEditSchoolYear(SCHOOL_YEARS[stage][0]); setEditSubject(''); }}>
                {SCHOOL_STAGES.map((stage) => <NativeSelectOption key={stage.value} value={stage.value}>{stage.label}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <label className="form-label">
              Year / form
              <NativeSelect className="curriculum-select" value={editSchoolYear} onChange={(e) => { setEditSchoolYear(e.target.value); setEditSubject(''); }}>
                {SCHOOL_YEARS[editSchoolStage].map((year) => <NativeSelectOption key={year} value={year}>{year}</NativeSelectOption>)}
              </NativeSelect>
            </label>
          </div>
          <label className="form-label">
            KPM subject
            <Combobox value={editSubject || null} onValueChange={(value) => setEditSubject(String(value || ''))} items={editAvailableSubjects.map((subject) => subject.name)}>
              <ComboboxInput className="curriculum-combobox" placeholder="Search a subject, e.g. Fizik" showClear />
              <ComboboxContent><ComboboxEmpty>No matching subject for this level.</ComboboxEmpty><ComboboxList>{editSubjectGroups.map((group) => <ComboboxGroup key={group}><ComboboxLabel>{group}</ComboboxLabel>{editAvailableSubjects.filter((subject) => subject.category === group).map((subject) => <ComboboxItem key={subject.name} value={subject.name}>{subject.name}</ComboboxItem>)}</ComboboxGroup>)}</ComboboxList></ComboboxContent>
            </Combobox>
            <small className="curriculum-note">{curriculumFor(editSchoolStage)} · Existing legacy subjects can be replaced with a verified KPM option.</small>
          </label>
          <label className="form-label">
            Student capacity (Max learners)
            <Input
              type="number"
              min={Math.max(1, editTarget?.students || 1)}
              max="100"
              value={editMaxStudents}
              onChange={(e) => setEditMaxStudents(e.target.value)}
            />
            {editTarget && (editTarget.students || 0) > 0 && (
              <small style={{ color: '#706a63', fontSize: '0.72rem' }}>
                Currently enrolled: {editTarget.students} student
                {(editTarget.students || 0) > 1 ? 's' : ''}. Capacity cannot be
                lower.
              </small>
            )}
          </label>
          {editError && <p className="form-error">{editError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={savingEdit || !editName.trim() || !editSubject}
            >
              {savingEdit ? <LoaderCircle /> : <Check />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="modal-card">
          <DialogHeader>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                marginBottom: 10,
              }}
            >
              <Trash2 style={{ width: 20, height: 20 }} />
            </div>
            <DialogTitle>Delete classroom?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deleteTarget?.name}</strong> (Code:{' '}
              <code>{deleteTarget?.code}</code>)?
            </DialogDescription>
          </DialogHeader>
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 14,
              padding: '12px 14px',
              color: '#991b1b',
              fontSize: '0.8rem',
              lineHeight: 1.5,
            }}
          >
            <strong>Warning:</strong> This permanently deletes this classroom,
            its {deleteTarget?.students || 0} student membership(s), join
            requests, and all published exercises. This cannot be undone.
          </div>
          {deleteError && <p className="form-error">{deleteError}</p>}
          <DialogFooter style={{ marginTop: 12 }}>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              style={{ background: '#dc2626', color: '#fff' }}
            >
              {deleting ? <LoaderCircle /> : <Trash2 />}{' '}
              {deleting ? 'Deleting…' : 'Delete classroom'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StudentDashboard({
  user,
  onView,
  onExit,
  onSelectClass,
}: {
  user: User;
  onView: (v: View) => void;
  onExit: () => void;
  onSelectClass: (c: ClassroomData) => void;
}) {
  const [memberships, setMemberships] = useState<Membership[]>([]),
    [pending, setPending] = useState<JoinRequest[]>([]),
    [joinOpen, setJoinOpen] = useState(false),
    [joinCode, setJoinCode] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [classStatsMap, setClassStatsMap] = useState<
    Record<
      string,
      { total: number; completed: number; tasksDue: number; progressPct: number }
    >
  >({});
  useEffect(
    () =>
      onSnapshot(collection(db, 'users', user.uid, 'memberships'), (s) =>
        setMemberships(
          s.docs.map((d) => ({ id: d.id, ...d.data() }) as Membership),
        ),
      ),
    [user.uid],
  );
  useEffect(
    () =>
      onSnapshot(collection(db, 'users', user.uid, 'joinRequests'), (s) =>
        setPending(
          s.docs.map((d) => ({ id: d.id, ...d.data() }) as JoinRequest),
        ),
      ),
    [user.uid],
  );
  useEffect(() => {
    if (!memberships.length) {
      setClassStatsMap({});
      return;
    }

    const unsubs: (() => void)[] = [];
    memberships.forEach((m) => {
      const classId = m.classId;
      const exCol = collection(db, 'classrooms', classId, 'exercises');
      const unsub = onSnapshot(exCol, async (snapshot) => {
        const exDocs = snapshot.docs;
        const total = exDocs.length;
        if (total === 0) {
          setClassStatsMap((prev) => ({
            ...prev,
            [classId]: { total: 0, completed: 0, tasksDue: 0, progressPct: 0 },
          }));
          if (m.progress !== 0 || m.tasks !== 0) {
            setDoc(
              doc(db, 'users', user.uid, 'memberships', classId),
              { progress: 0, tasks: 0 },
              { merge: true },
            ).catch(console.warn);
          }
          return;
        }

        const checks = await Promise.all(
          exDocs.map(async (exDoc) => {
            try {
              const subDoc = await getDoc(
                doc(
                  db,
                  'classrooms',
                  classId,
                  'exercises',
                  exDoc.id,
                  'submissions',
                  user.uid,
                ),
              );
              if (subDoc.exists()) return true;
              const qSnap = await getDocs(
                query(
                  collection(
                    db,
                    'classrooms',
                    classId,
                    'exercises',
                    exDoc.id,
                    'submissions',
                  ),
                  where('studentId', '==', user.uid),
                  limit(1),
                ),
              );
              return !qSnap.empty;
            } catch (e) {
              return false;
            }
          }),
        );

        const completed = checks.filter(Boolean).length;
        const tasksDue = Math.max(0, total - completed);
        const progressPct =
          total > 0 ? Math.round((completed / total) * 100) : 0;

        setClassStatsMap((prev) => ({
          ...prev,
          [classId]: { total, completed, tasksDue, progressPct },
        }));

        if (m.progress !== progressPct || m.tasks !== tasksDue) {
          setDoc(
            doc(db, 'users', user.uid, 'memberships', classId),
            { progress: progressPct, tasks: tasksDue },
            { merge: true },
          ).catch(console.warn);
        }
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user.uid, memberships.map((m) => m.classId).sort().join(',')]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('join')?.trim().toUpperCase();
    if (!code) return;
    params.delete('join');
    const remainingQuery = params.toString();
    history.replaceState({}, '', `${location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${location.hash}`);
    const inviteKey = `slearn:invite-opened:${code}`;
    if (sessionStorage.getItem(inviteKey)) return;
    sessionStorage.setItem(inviteKey, 'true');
    setJoinCode(code);
    setJoinOpen(true);
  }, []);
  const requestJoin = async () => {
    setBusy(true);
    setMessage('');
    try {
      const code = joinCode.trim().toUpperCase(),
        found = await getDocs(
          query(
            collection(db, 'classrooms'),
            where('code', '==', code),
            limit(1),
          ),
        );
      if (found.empty) {
        setMessage('Class code not found. Check the code and try again.');
        return;
      }
      const c = {
        id: found.docs[0].id,
        ...found.docs[0].data(),
      } as ClassroomData;
      if ((c.students || 0) >= (c.maxStudents || 30)) {
        setMessage('This classroom is already full.');
        return;
      }
      if (memberships.some((m) => m.classId === c.id)) {
        setMessage('You are already enrolled in this classroom.');
        return;
      }
      if (pending.some((p) => p.classId === c.id)) {
        setMessage('You already requested to join this classroom.');
        return;
      }
      const data = {
        classId: c.id,
        className: c.name,
        code: c.code,
        teacherId: c.teacherId,
        teacherName: c.teacherName,
        studentId: user.uid,
        studentName: user.displayName || 'Student',
        studentEmail: user.email || '',
        createdAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      batch.set(doc(db, 'classrooms', c.id, 'requests', user.uid), data);
      batch.set(doc(db, 'users', user.uid, 'joinRequests', c.id), data);
      await batch.commit();
      setJoinOpen(false);
      setJoinCode('');
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const total = memberships.length
    ? Math.round(
        memberships.reduce((n, m) => {
          const stats = classStatsMap[m.classId];
          const pct =
            stats !== undefined ? stats.progressPct : m.progress || 0;
          return n + pct;
        }, 0) / memberships.length,
      )
    : 0;
  return (
    <AppShell
      role="student"
      user={user}
      onExit={onExit}
      classCount={memberships.length}
    >
      <Topbar role="student" user={user} />
      {memberships.length ? (
        <div id="progress" className="student-hero">
          <div>
            <span className="eyebrow">
              <Sparkles /> Your learning
            </span>
            <h2>
              Keep building
              <br />
              your momentum.
            </h2>
            <p>Your progress updates as you complete classroom activities.</p>
          </div>
          <div className="streak-ring">
            <strong>{total}</strong>
            <span>
              %<br />
              progress
            </span>
          </div>
        </div>
      ) : (
        <EmptyState role="student" action={() => setJoinOpen(true)} />
      )}{' '}
      {pending.map((p) => (
        <div className="pending-banner" key={p.classId}>
          <span>
            <Clock3 />
          </span>
          <div>
            <b>Waiting for teacher approval</b>
            <p>
              <strong>{p.className}</strong> · code {p.code}
            </p>
          </div>
        </div>
      ))}
      {memberships.length > 0 && (
        <>
          <div className="section-head">
            <div>
              <span className="kicker">Your learning spaces</span>
              <h2>My classrooms</h2>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent<NavTarget>('slearn:navigate', { detail: 'classes' }));
                }}
                className="primary-action"
              >
                <Search /> Find classrooms
              </Button>
              <Button
                variant="outline"
                onClick={() => setJoinOpen(true)}
                style={{ borderRadius: '999px', height: '42px', fontSize: '0.85rem' }}
              >
                <Plus /> Enter code
              </Button>
            </div>
          </div>
          <div id="classrooms" className="student-grid">
            {memberships.map((m, i) => {
              const stats = classStatsMap[m.classId];
              const tasksDue =
                stats !== undefined ? stats.tasksDue : m.tasks || 0;
              const progressPct =
                stats !== undefined ? stats.progressPct : m.progress || 0;
              return (
                <button
                  className={`student-class ${colours[i % 3]}`}
                  key={m.classId}
                  onClick={() => {
                    onSelectClass({
                      id: m.classId,
                      name: m.className,
                      subject: m.className,
                      code: m.code,
                      teacherId: m.teacherId,
                      teacherName: m.teacherName,
                      students: 0,
                      progress: progressPct,
                    });
                    onView('classroom');
                  }}
                >
                  <div className="subject-number">0{i + 1}</div>
                  <div className="student-class-info">
                    <small>{m.teacherName}</small>
                    <h3>{m.className}</h3>
                    <div className="task-line">
                      <span>{tasksDue} tasks due</span>
                      <span>{progressPct}% mastered</span>
                    </div>
                    <Progress value={progressPct} />
                  </div>
                  <ChevronRight />
                </button>
              );
            })}
          </div>
        </>
      )}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="modal-card">
          <DialogHeader>
            <DialogTitle>Join a classroom</DialogTitle>
            <DialogDescription>
              Enter the class code from your teacher. Access starts after
              approval.
            </DialogDescription>
          </DialogHeader>
          <label className="form-label">
            Classroom code
            <Input
              className="code-input"
              placeholder="e.g. MATH-4K2"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setMessage('');
              }}
            />
          </label>
          <div className="approval-note">
            <Clock3 /> Your request will appear on the teacher’s dashboard.
          </div>
          {message && <p className="form-error">{message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !joinCode.trim()} onClick={requestJoin}>
              {busy ? <LoaderCircle /> : <Send />} Request to join
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Classroom({
  role,
  user,
  classroom,
  onBack,
  onQuiz,
  onEditExercise,
  onStartExercise,
  onExit,
  onClassUpdated,
  onClassDeleted,
}: {
  role: Role;
  user: User;
  classroom: ClassroomData;
  onBack: () => void;
  onQuiz: () => void;
  onEditExercise?: (ex: any) => void;
  onStartExercise: (ex: any) => void;
  onExit: () => void;
  onClassUpdated?: (c: ClassroomData) => void;
  onClassDeleted?: () => void;
}) {
  const initialCurriculumSelection = resolveCurriculumSelection(classroom);
  const [currentClass, setCurrentClass] = useState<ClassroomData>(classroom);
  const [exercises, setExercises] = useState<
    {
      id: string;
      title: string;
      deadline?: string | null;
      allowLateSubmissions?: boolean;
      question?: string;
      questions?: any[];
      questionCount?: number;
      enhanced?: boolean;
      isExam?: boolean;
      timeLimitMinutes?: number | null;
      shuffleQuestions?: boolean;
      allowPrevious?: boolean;
      createdAt?: any;
    }[]
  >([]);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [exerciseSort, setExerciseSort] = useState<'newest' | 'oldest' | 'deadline' | 'title'>('newest');
  const [exercisePage, setExercisePage] = useState(1);
  const EXERCISES_PER_PAGE = 5;

  const [activeTab, setActiveTab] = useState<'exercises' | 'students'>('exercises');
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [removingStudent, setRemovingStudent] = useState<ClassroomMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const filteredAndSortedExercises = useMemo(() => {
    let result = [...exercises];
    if (exerciseSearch.trim()) {
      const q = exerciseSearch.trim().toLowerCase();
      result = result.filter((ex) => {
        const titleMatch = ex.title?.toLowerCase().includes(q);
        const singleQMatch = ex.question?.toLowerCase().includes(q);
        const multiQMatch = ex.questions?.some((item: any) =>
          item.question?.toLowerCase().includes(q),
        );
        return Boolean(titleMatch || singleQMatch || multiQMatch);
      });
    }

    result.sort((a, b) => {
      if (exerciseSort === 'newest') {
        const timeA = a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : a.createdAt?.seconds
            ? a.createdAt.seconds * 1000
            : a.createdAt
              ? new Date(a.createdAt).getTime()
              : 0;
        const timeB = b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : b.createdAt?.seconds
            ? b.createdAt.seconds * 1000
            : b.createdAt
              ? new Date(b.createdAt).getTime()
              : 0;
        return timeB - timeA;
      }
      if (exerciseSort === 'oldest') {
        const timeA = a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : a.createdAt?.seconds
            ? a.createdAt.seconds * 1000
            : a.createdAt
              ? new Date(a.createdAt).getTime()
              : 0;
        const timeB = b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : b.createdAt?.seconds
            ? b.createdAt.seconds * 1000
            : b.createdAt
              ? new Date(b.createdAt).getTime()
              : 0;
        return timeA - timeB;
      }
      if (exerciseSort === 'deadline') {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (exerciseSort === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });

    return result;
  }, [exercises, exerciseSearch, exerciseSort]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedExercises.length / EXERCISES_PER_PAGE));
  const currentPage = Math.min(Math.max(1, exercisePage), totalPages);

  const paginatedExercises = useMemo(() => {
    const start = (currentPage - 1) * EXERCISES_PER_PAGE;
    return filteredAndSortedExercises.slice(start, start + EXERCISES_PER_PAGE);
  }, [filteredAndSortedExercises, currentPage]);

  const [editOpen, setEditOpen] = useState(false),
    [editName, setEditName] = useState(classroom.name),
    [editSchoolStage, setEditSchoolStage] = useState<SchoolStage>(initialCurriculumSelection.stage),
    [editSchoolYear, setEditSchoolYear] = useState(initialCurriculumSelection.schoolYear),
    [editSubject, setEditSubject] = useState(initialCurriculumSelection.subject),
    [editMaxStudents, setEditMaxStudents] = useState(
      String(classroom.maxStudents || 30),
    ),
    [savingEdit, setSavingEdit] = useState(false),
    [editError, setEditError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState('');
  const approvedEditSubjects = useApprovedSubjects(editSchoolStage, editSchoolYear);
  const editAvailableSubjects = [...subjectsFor(editSchoolStage, editSchoolYear), ...approvedEditSubjects.map((name) => ({ name, category: 'Admin-approved subjects' }))];
  const editSubjectGroups = [...new Set(editAvailableSubjects.map((subject) => subject.category))];

  useEffect(
    () =>
      onSnapshot(doc(db, 'classrooms', classroom.id), (snap) => {
        if (snap.exists()) {
          const updated = { id: snap.id, ...snap.data() } as ClassroomData;
          setCurrentClass(updated);
          if (onClassUpdated) onClassUpdated(updated);
        }
      }),
    [classroom.id],
  );
  useEffect(() => {
    void readOfflineExercises(classroom.id).then((cached) => { if (cached.length && !navigator.onLine) setExercises(cached); }).catch(() => undefined);
    return onSnapshot(collection(db, 'classrooms', classroom.id, 'exercises'), (s) =>
      setExercises(s.docs.map((d) => ({ id: d.id, ...d.data() }) as any)),
      async () => { const cached = await readOfflineExercises(classroom.id).catch(() => []); if (cached.length) setExercises(cached); },
    );
  }, [classroom.id]);
  useEffect(
    () =>
      onSnapshot(collection(db, 'classrooms', classroom.id, 'members'), (s) =>
        setMembers(
          s.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              uid: data.uid || d.id,
              name: data.name || 'Student',
              email: data.email || '',
              progress: data.progress || 0,
              joinedAt: data.joinedAt,
            } as ClassroomMember;
          }),
        ),
      ),
    [classroom.id],
  );

  const saveEdit = async () => {
    if (!editName.trim() || !editSubject) return;
    const maxCap = parseInt(editMaxStudents, 10) || 30;
    if (maxCap < (currentClass.students || 0)) {
      setEditError(
        `Capacity cannot be lower than current enrollment (${currentClass.students || 0} students).`,
      );
      return;
    }
    setSavingEdit(true);
    setEditError('');
    try {
      const classId = classroom.id;
      const batch = writeBatch(db);
      batch.update(doc(db, 'classrooms', classId), {
        name: editName.trim(),
        subject: `${editSubject} · ${editSchoolYear}`,
        subjectName: editSubject,
        schoolStage: editSchoolStage,
        schoolYear: editSchoolYear,
        curriculum: curriculumFor(editSchoolStage),
        maxStudents: maxCap,
        updatedAt: serverTimestamp(),
      });
      const membersSnap = await getDocs(
        collection(db, 'classrooms', classId, 'members'),
      );
      membersSnap.docs.forEach((d) => {
        batch.update(doc(db, 'users', d.id, 'memberships', classId), {
          className: editName.trim(),
        });
      });
      await batch.commit();
      setEditOpen(false);
    } catch (e) {
      setEditError(friendlyError(e));
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const classId = classroom.id;
      const [membersSnap, requestsSnap, exercisesSnap] = await Promise.all([
        getDocs(collection(db, 'classrooms', classId, 'members')),
        getDocs(collection(db, 'classrooms', classId, 'requests')),
        getDocs(collection(db, 'classrooms', classId, 'exercises')),
      ]);
      const batch = writeBatch(db);
      membersSnap.docs.forEach((d) => {
        batch.delete(doc(db, 'users', d.id, 'memberships', classId));
        batch.delete(doc(db, 'classrooms', classId, 'members', d.id));
      });
      requestsSnap.docs.forEach((d) => {
        batch.delete(doc(db, 'users', d.id, 'joinRequests', classId));
        batch.delete(doc(db, 'classrooms', classId, 'requests', d.id));
      });
      for (const exDoc of exercisesSnap.docs) {
        const subsSnap = await getDocs(
          collection(
            db,
            'classrooms',
            classId,
            'exercises',
            exDoc.id,
            'submissions',
          ),
        );
        subsSnap.docs.forEach((subDoc) =>
          batch.delete(
            doc(
              db,
              'classrooms',
              classId,
              'exercises',
              exDoc.id,
              'submissions',
              subDoc.id,
            ),
          ),
        );
        batch.delete(doc(db, 'classrooms', classId, 'exercises', exDoc.id));
      }
      batch.delete(doc(db, 'classrooms', classId));
      await batch.commit();
      setDeleteOpen(false);
      if (onClassDeleted) onClassDeleted();
      else onBack();
    } catch (e) {
      setDeleteError(friendlyError(e));
    } finally {
      setDeleting(false);
    }
  };

  const [analyticsMap, setAnalyticsMap] = useState<
    Record<string, ExerciseAnalytics>
  >({});
  const [activeAnalyticsEx, setActiveAnalyticsEx] = useState<{
    id: string;
    title: string;
    deadline?: string | null;
    allowLateSubmissions?: boolean;
    questions?: any[];
    question?: string;
    questionCount?: number;
  } | null>(null);

  useEffect(() => {
    if (!exercises.length) {
      setAnalyticsMap({});
      return;
    }
    const unsubs = exercises.map((ex) => {
      const qList = ex.questions?.length
        ? ex.questions
        : ex.question
          ? [
              {
                question: ex.question,
                answer: (ex as any).answer || '',
                points: 2,
              },
            ]
          : [];
      const subCol = collection(
        db,
        'classrooms',
        classroom.id,
        'exercises',
        ex.id,
        'submissions',
      );
      const subQuery =
        role === 'student'
          ? query(subCol, where('studentId', '==', user.uid))
          : subCol;

      return onSnapshot(subQuery, (snap) => {
        const rawSubs: SubmissionData[] = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as SubmissionData,
        );

        // Deduplicate submissions so each student only counts once
        const subsMap = new Map<string, SubmissionData>();
        rawSubs.forEach((s) => {
          const key = s.studentId || s.studentEmail || s.id;
          if (!subsMap.has(key)) {
            subsMap.set(key, s);
          } else {
            const existing = subsMap.get(key)!;
            if ((s.score || 0) >= (existing.score || 0)) {
              subsMap.set(key, s);
            }
          }
        });
        const subs = Array.from(subsMap.values());
        const totalAnswered = subs.length;
        let totalCorrect = 0;
        let totalWrong = 0;

        const qStats = qList.map((q: any, qIdx: number) => {
          let cCount = 0;
          let wCount = 0;
          subs.forEach((s) => {
            const stats = computeSubmissionStats(s, ex);
            const qRes = stats.questionResults.find(
              (r) => r.questionIdx === qIdx,
            );
            if (qRes) {
              if (qRes.isCorrect) cCount++;
              else wCount++;
            }
          });
          return {
            questionIdx: qIdx,
            questionText: q.question || `Question 0${qIdx + 1}`,
            expectedAnswer: q.answer || '',
            correctCount: cCount,
            wrongCount: wCount,
            totalAnswers: cCount + wCount,
            accuracyRate:
              cCount + wCount > 0
                ? Math.round((cCount / (cCount + wCount)) * 100)
                : 0,
            difficulty: (q.difficulty || 'medium') as Difficulty,
          };
        });

        const allQuestionResults = subs.flatMap((submission) =>
          computeSubmissionStats(submission, ex).questionResults,
        );
        const difficultyBreakdown = summarizeDifficulty(allQuestionResults);
        const topicBreakdown = summarizeTagPerformance(allQuestionResults, 'topic');
        const skillBreakdown = summarizeTagPerformance(allQuestionResults, 'skill');

        subs.forEach((s) => {
          const stats = computeSubmissionStats(s, ex);
          totalCorrect += stats.correct;
          totalWrong += stats.wrong;
        });

        const grandTotal = totalCorrect + totalWrong;
        const accuracyRate =
          grandTotal > 0 ? Math.round((totalCorrect / grandTotal) * 100) : 0;

        setAnalyticsMap((prev) => ({
          ...prev,
          [ex.id]: {
            totalAnswered,
            totalCorrect,
            totalWrong,
            accuracyRate,
            questionBreakdown: qStats,
            difficultyBreakdown,
            topicBreakdown,
            skillBreakdown,
            submissions: subs,
          },
        }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [classroom.id, role, user.uid, exercises.map((e) => e.id).join('|')]);

  const totalClassSubs = Object.values(analyticsMap).reduce(
    (n, a) => n + a.totalAnswered,
    0,
  );
  const totalClassCorrect = Object.values(analyticsMap).reduce(
    (n, a) => n + a.totalCorrect,
    0,
  );
  const totalClassWrong = Object.values(analyticsMap).reduce(
    (n, a) => n + a.totalWrong,
    0,
  );
  const overallTotalAnswers = totalClassCorrect + totalClassWrong;
  const classAccuracy =
    overallTotalAnswers > 0
      ? Math.round((totalClassCorrect / overallTotalAnswers) * 100)
      : 0;

  const completedExercisesCount = exercises.filter((ex) =>
    analyticsMap[ex.id]?.submissions.some(
      (s) => s.studentId === user.uid || s.id === user.uid,
    ),
  ).length;
  const studentMasteryPct =
    exercises.length > 0
      ? Math.round((completedExercisesCount / exercises.length) * 100)
      : 0;

  useEffect(() => {
    if (role !== 'student') return;
    const tasksDue = Math.max(0, exercises.length - completedExercisesCount);
    setDoc(
      doc(db, 'users', user.uid, 'memberships', classroom.id),
      {
        progress: studentMasteryPct,
        tasks: tasksDue,
      },
      { merge: true },
    ).catch(console.warn);
  }, [
    role,
    classroom.id,
    user.uid,
    exercises.length,
    completedExercisesCount,
    studentMasteryPct,
  ]);

  const [editExTarget, setEditExTarget] = useState<any | null>(null);
  const [editExTitle, setEditExTitle] = useState('');
  const [editExDeadline, setEditExDeadline] = useState('');
  const [editExAllowLate, setEditExAllowLate] = useState(true);
  const [savingEditEx, setSavingEditEx] = useState(false);
  const [editExError, setEditExError] = useState('');

  const [deleteExTarget, setDeleteExTarget] = useState<any | null>(null);
  const [deletingEx, setDeletingEx] = useState(false);
  const [deleteExError, setDeleteExError] = useState('');

  const openEditExercise = (ex: any) => {
    setEditExTarget(ex);
    setEditExTitle(ex.title || '');
    setEditExDeadline(ex.deadline || '');
    setEditExAllowLate(ex.allowLateSubmissions !== false);
    setEditExError('');
  };

  const saveEditExercise = async () => {
    if (!editExTarget || !editExTitle.trim()) return;
    setSavingEditEx(true);
    setEditExError('');
    try {
      await updateDoc(
        doc(db, 'classrooms', classroom.id, 'exercises', editExTarget.id),
        {
          title: editExTitle.trim(),
          deadline: editExDeadline.trim() || null,
          allowLateSubmissions: editExAllowLate,
          updatedAt: serverTimestamp(),
        },
      );
      setEditExTarget(null);
    } catch (e) {
      setEditExError(friendlyError(e));
    } finally {
      setSavingEditEx(false);
    }
  };

  const openDeleteExercise = (ex: any) => {
    setDeleteExTarget(ex);
    setDeleteExError('');
  };

  const confirmDeleteExercise = async () => {
    if (!deleteExTarget) return;
    setDeletingEx(true);
    setDeleteExError('');
    try {
      const exId = deleteExTarget.id;
      const subsSnap = await getDocs(
        collection(
          db,
          'classrooms',
          classroom.id,
          'exercises',
          exId,
          'submissions',
        ),
      );
      const batch = writeBatch(db);
      subsSnap.docs.forEach((subDoc) =>
        batch.delete(
          doc(
            db,
            'classrooms',
            classroom.id,
            'exercises',
            exId,
            'submissions',
            subDoc.id,
          ),
        ),
      );
      batch.delete(doc(db, 'classrooms', classroom.id, 'exercises', exId));
      await batch.commit();
      setDeleteExTarget(null);
    } catch (e) {
      setDeleteExError(friendlyError(e));
    } finally {
      setDeletingEx(false);
    }
  };

  const handleRemoveStudent = async () => {
    if (!removingStudent) return;
    setRemoveBusy(true);
    setRemoveError('');
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'classrooms', classroom.id, 'members', removingStudent.id));
      batch.delete(doc(db, 'users', removingStudent.uid, 'memberships', classroom.id));
      batch.update(doc(db, 'classrooms', classroom.id), {
        students: increment(-1),
      });
      await batch.commit();
      setRemovingStudent(null);
    } catch (e) {
      setRemoveError(friendlyError(e));
    } finally {
      setRemoveBusy(false);
    }
  };

  const filteredMembers = useMemo(() => {
    if (!studentSearch.trim()) return members;
    const q = studentSearch.trim().toLowerCase();
    return members.filter(
      (m) => m.name?.toLowerCase().includes(q),
    );
  }, [members, studentSearch]);

  const studentPerformanceMap = useMemo(() => {
    const map: Record<string, { completed: number; totalScore: number }> = {};
    Object.values(analyticsMap).forEach((stat) => {
      stat.submissions.forEach((sub) => {
        const sId = sub.studentId || sub.id;
        if (!map[sId]) {
          map[sId] = { completed: 0, totalScore: 0 };
        }
        map[sId].completed += 1;
        map[sId].totalScore += sub.score || 0;
      });
    });
    return map;
  }, [analyticsMap]);


  return (
    <AppShell
      role={role}
      user={user}
      onExit={onExit}
      active="classroom"
      classCount={1}
    >
      <div className="detail-top">
        <button onClick={onBack}>
          <ArrowLeft /> Back to overview
        </button>
        <span className="sdg-pill">{currentClass.code}</span>
      </div>
      <div className="classroom-title">
        <div>
          <span className="kicker">Classroom</span>
          <h1>{currentClass.name}</h1>
          <p>
            {role === 'teacher'
              ? `${currentClass.students || 0} / ${currentClass.maxStudents || 30} learners · ${currentClass.subject}`
              : `${currentClass.teacherName} · You’re approved`}
          </p>
        </div>
        {role === 'teacher' && (
          <div className="classroom-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const selection = resolveCurriculumSelection(currentClass);
                setEditName(currentClass.name);
                setEditSchoolStage(selection.stage);
                setEditSchoolYear(selection.schoolYear);
                setEditSubject(selection.subject);
                setEditMaxStudents(String(currentClass.maxStudents || 30));
                setEditError('');
                setEditOpen(true);
              }}
            >
              <Pencil style={{ width: 14, height: 14 }} /> Edit class
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              style={{ color: '#dc2626', borderColor: '#fca5a5' }}
            >
              <Trash2 style={{ width: 14, height: 14 }} /> Delete
            </Button>
            <Button onClick={onQuiz} className="primary-action">
              <Plus /> Create exercise
            </Button>
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          marginTop: '1.25rem',
          marginBottom: '1rem',
          borderBottom: '1px solid #eeeae4',
          paddingBottom: '0.75rem',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('exercises')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '12px',
            border: activeTab === 'exercises' ? '1px solid #173e30' : '1px solid transparent',
            background: activeTab === 'exercises' ? '#173e30' : '#f4f1ea',
            color: activeTab === 'exercises' ? '#fff' : '#555',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <BookOpen style={{ width: 16, height: 16 }} /> Exercises
          <span
            style={{
              padding: '1px 7px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              background: activeTab === 'exercises' ? 'rgba(255,255,255,0.25)' : '#e5e0d7',
              color: activeTab === 'exercises' ? '#fff' : '#444',
            }}
          >
            {exercises.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('students')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '12px',
            border: activeTab === 'students' ? '1px solid #173e30' : '1px solid transparent',
            background: activeTab === 'students' ? '#173e30' : '#f4f1ea',
            color: activeTab === 'students' ? '#fff' : '#555',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Users style={{ width: 16, height: 16 }} /> Students
          <span
            style={{
              padding: '1px 7px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              background: activeTab === 'students' ? 'rgba(255,255,255,0.25)' : '#e5e0d7',
              color: activeTab === 'students' ? '#fff' : '#444',
            }}
          >
            {members.length || currentClass.students || 0}
          </span>
        </button>
      </div>

      {activeTab === 'exercises' ? (
        <div className="classroom-layout">
        <section className="panel activity-panel">
          <div className="panel-head">
            <div>
              <span className="kicker">Learning activities</span>
              <h2>
                {exercises.length
                  ? `${exercises.length} Exercise${exercises.length > 1 ? 's' : ''}`
                  : 'No exercises yet'}
              </h2>
            </div>
          </div>
          {exercises.length ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  marginTop: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    flex: '1 1 240px',
                    maxWidth: '380px',
                  }}
                >
                  <Search
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '16px',
                      height: '16px',
                      color: '#888',
                      pointerEvents: 'none',
                    }}
                  />
                  <Input
                    type="text"
                    placeholder="Search exercises by title or prompt..."
                    value={exerciseSearch}
                    onChange={(e) => {
                      setExerciseSearch(e.target.value);
                      setExercisePage(1);
                    }}
                    style={{
                      paddingLeft: '36px',
                      paddingRight: exerciseSearch ? '30px' : '12px',
                      height: '38px',
                      borderRadius: '12px',
                      fontSize: '0.84rem',
                      background: '#fff',
                      borderColor: '#ded8cf',
                    }}
                  />
                  {exerciseSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setExerciseSearch('');
                        setExercisePage(1);
                      }}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: '#888',
                        padding: 0,
                        display: 'flex',
                      }}
                      aria-label="Clear search"
                    >
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: '#666',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <ArrowUpDown style={{ width: 14, height: 14 }} /> Sort:
                  </span>
                  <select
                    value={exerciseSort}
                    onChange={(e) => {
                      setExerciseSort(e.target.value as any);
                      setExercisePage(1);
                    }}
                    style={{
                      height: '38px',
                      padding: '0 10px',
                      borderRadius: '12px',
                      border: '1px solid #ded8cf',
                      background: '#fff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#111',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="deadline">Deadline (soonest)</option>
                    <option value="title">Title (A–Z)</option>
                  </select>
                </div>
              </div>

              {filteredAndSortedExercises.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2.5rem 1.5rem',
                    background: '#fcfbf9',
                    borderRadius: '16px',
                    border: '1px dashed #ded8cf',
                    marginTop: '0.5rem',
                  }}
                >
                  <Search
                    style={{
                      width: 28,
                      height: 28,
                      margin: '0 auto 0.5rem',
                      color: '#999',
                    }}
                  />
                  <p
                    style={{
                      fontWeight: 600,
                      margin: '0 0 0.4rem',
                      color: '#333',
                    }}
                  >
                    No exercises match &ldquo;{exerciseSearch}&rdquo;
                  </p>
                  <small
                    style={{
                      color: '#777',
                      display: 'block',
                      marginBottom: '1rem',
                    }}
                  >
                    Try different keywords or clear your search.
                  </small>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExerciseSearch('');
                      setExercisePage(1);
                    }}
                  >
                    Clear search
                  </Button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: '0.85rem' }}>
                    {paginatedExercises.map((ex, i) => {
                const count = ex.questionCount || ex.questions?.length || 1;
                const firstQ =
                  ex.question ||
                  (ex.questions && ex.questions[0]?.question) ||
                  'Exercise checkpoint';
                const stats = analyticsMap[ex.id];
                const mySub =
                  role === 'student'
                    ? stats?.submissions.find(
                        (s) => s.studentId === user.uid || s.id === user.uid,
                      )
                    : null;
                const isDone = Boolean(mySub);
                const mySubStats = mySub
                  ? computeSubmissionStats(mySub, ex)
                  : null;
                const hasAnswered = stats && stats.totalAnswered > 0;
                const due = formatDeadline(ex.deadline);
                const allowsLate = ex.allowLateSubmissions !== false;
                const isClosedForStudent =
                  role === 'student' && !isDone && due.isPast && !allowsLate;
                return (
                  <div
                    key={ex.id || i}
                    className="ex-card"
                    style={
                      isClosedForStudent
                        ? { opacity: 0.85, background: '#fbfaf9' }
                        : undefined
                    }
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginBottom: '0.4rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <FileQuestion
                          style={{
                            width: '18px',
                            height: '18px',
                            color: '#111',
                          }}
                        />
                        <b style={{ fontSize: '1.05rem' }}>{ex.title}</b>
                        {role === 'teacher' && (
                          <div
                            className="card-actions"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="Edit exercise"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onEditExercise) onEditExercise(ex);
                                else openEditExercise(ex);
                              }}
                              aria-label={`Edit ${ex.title}`}
                              style={{ width: 26, height: 26 }}
                            >
                              <Pencil style={{ width: 12, height: 12 }} />
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn delete-btn"
                              title="Delete exercise"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteExercise(ex);
                              }}
                              aria-label={`Delete ${ex.title}`}
                              style={{ width: 26, height: 26 }}
                            >
                              <Trash2 style={{ width: 12, height: 12 }} />
                            </button>
                          </div>
                        )}
                        {ex.isExam && (
                          <span
                            style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fde68a',
                              fontSize: '0.68rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '99px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Timer style={{ width: '11px', height: '11px' }} />{' '}
                            Exam {ex.timeLimitMinutes ? `· ${ex.timeLimitMinutes}m` : ''}
                          </span>
                        )}
                        {ex.isExam && ex.shuffleQuestions && (
                          <span
                            style={{
                              background: '#f3f4f6',
                              color: '#4b5563',
                              border: '1px solid #e5e7eb',
                              fontSize: '0.66rem',
                              padding: '0.18rem 0.5rem',
                              borderRadius: '99px',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                            }}
                            title="Question order randomized for each student"
                          >
                            <Shuffle style={{ width: '10px', height: '10px' }} /> Shuffled
                          </span>
                        )}
                        {ex.isExam && ex.allowPrevious === false && (
                          <span
                            style={{
                              background: '#fef2f2',
                              color: '#991b1b',
                              border: '1px solid #fecaca',
                              fontSize: '0.66rem',
                              padding: '0.18rem 0.5rem',
                              borderRadius: '99px',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                            }}
                            title="Students cannot go back to previous questions"
                          >
                            <Lock style={{ width: '10px', height: '10px' }} /> No Backtracking
                          </span>
                        )}
                        <span
                          style={{
                            background: '#eef2ee',
                            color: '#44554b',
                            fontSize: '0.68rem',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '99px',
                            fontWeight: 600,
                          }}
                        >
                          {count} Question{count > 1 ? 's' : ''}
                        </span>
                        {ex.enhanced && (
                          <span
                            style={{
                              background: '#d9f1e5',
                              color: '#111',
                              fontSize: '0.65rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '99px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                            }}
                          >
                            <Sparkles
                              style={{ width: '10px', height: '10px' }}
                            />{' '}
                            AI Enhanced
                          </span>
                        )}
                        {due.formatted &&
                          (!isDone ? (
                            due.isPast ? (
                              <span
                                style={{
                                  background: allowsLate
                                    ? '#fef2f2'
                                    : '#fee2e2',
                                  color: allowsLate ? '#991b1b' : '#7f1d1d',
                                  border: `1px solid ${allowsLate ? '#fecaca' : '#fca5a5'}`,
                                  fontSize: '0.68rem',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '99px',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                }}
                              >
                                {allowsLate ? (
                                  <AlertCircle
                                    style={{ width: '11px', height: '11px' }}
                                  />
                                ) : (
                                  <Lock
                                    style={{ width: '11px', height: '11px' }}
                                  />
                                )}{' '}
                                {allowsLate
                                  ? `Past Due · ${due.formatted}`
                                  : `Closed · ${due.formatted}`}
                              </span>
                            ) : due.isUrgent ? (
                              <span
                                style={{
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a',
                                  fontSize: '0.68rem',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '99px',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                }}
                              >
                                <Clock3
                                  style={{ width: '11px', height: '11px' }}
                                />{' '}
                                Due Soon · {due.formatted}
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: '#f3f4f6',
                                  color: '#374151',
                                  border: '1px solid #e5e7eb',
                                  fontSize: '0.68rem',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '99px',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                }}
                              >
                                <Calendar
                                  style={{ width: '11px', height: '11px' }}
                                />{' '}
                                Due {due.formatted}
                              </span>
                            )
                          ) : (
                            <span
                              style={{
                                background: '#f8faf7',
                                color: '#55655a',
                                border: '1px solid #e5eae6',
                                fontSize: '0.68rem',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '99px',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                            >
                              <Calendar
                                style={{ width: '11px', height: '11px' }}
                              />{' '}
                              Due {due.formatted}
                            </span>
                          ))}
                        {ex.deadline && (
                          <span
                            style={{
                              fontSize: '0.66rem',
                              padding: '0.18rem 0.5rem',
                              borderRadius: '99px',
                              background: allowsLate ? '#f0fdf4' : '#fef2f2',
                              color: allowsLate ? '#166534' : '#991b1b',
                              border: `1px solid ${allowsLate ? '#bbf7d0' : '#fecaca'}`,
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            {allowsLate ? (
                              <Unlock style={{ width: 10, height: 10 }} />
                            ) : (
                              <Lock style={{ width: 10, height: 10 }} />
                            )}{' '}
                            {allowsLate
                              ? 'Late allowed'
                              : 'No late submissions'}
                          </span>
                        )}
                        {role === 'student' ? (
                          isDone && mySub ? (
                            <>
                              <span
                                className="ex-stat-chip correct"
                                style={{
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  fontWeight: 600,
                                }}
                              >
                                <CheckCircle2
                                  style={{ width: 12, height: 12 }}
                                />{' '}
                                Completed · {mySub.score}/
                                {mySub.totalPoints || count * 2} pts
                              </span>
                              <span className="ex-stat-chip correct">
                                <Check style={{ width: 12, height: 12 }} />{' '}
                                {mySubStats?.correct} correct
                              </span>
                              {mySubStats && mySubStats.wrong > 0 && (
                                <span className="ex-stat-chip wrong">
                                  <X style={{ width: 12, height: 12 }} />{' '}
                                  {mySubStats.wrong} wrong
                                </span>
                              )}
                              {mySub.isLate && (
                                <span
                                  style={{
                                    background: '#fee2e2',
                                    color: '#b91c1c',
                                    border: '1px solid #fca5a5',
                                    fontSize: '0.68rem',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '99px',
                                    fontWeight: 700,
                                  }}
                                >
                                  LATE
                                </span>
                              )}
                            </>
                          ) : (
                            <span
                              className="ex-stat-chip neutral"
                              style={{
                                background: isClosedForStudent
                                  ? '#fee2e2'
                                  : due.isPast
                                    ? '#fef2f2'
                                    : '#fef3c7',
                                color: isClosedForStudent
                                  ? '#7f1d1d'
                                  : due.isPast
                                    ? '#991b1b'
                                    : '#92400e',
                                border: `1px solid ${isClosedForStudent ? '#fca5a5' : due.isPast ? '#fecaca' : '#fde68a'}`,
                              }}
                            >
                              {isClosedForStudent ? (
                                <Lock style={{ width: 12, height: 12 }} />
                              ) : (
                                <Clock3 style={{ width: 12, height: 12 }} />
                              )}{' '}
                              {isClosedForStudent
                                ? 'Submissions closed'
                                : due.isPast
                                  ? 'Overdue · Not started'
                                  : 'Not started'}
                            </span>
                          )
                        ) : hasAnswered ? (
                          <>
                            <span className="ex-stat-chip answered">
                              <Users style={{ width: 12, height: 12 }} />{' '}
                              {stats.totalAnswered} answered
                            </span>
                            <span className="ex-stat-chip correct">
                              <Check style={{ width: 12, height: 12 }} />{' '}
                              {stats.totalCorrect} correct
                            </span>
                            <span className="ex-stat-chip wrong">
                              <X style={{ width: 12, height: 12 }} />{' '}
                              {stats.totalWrong} wrong
                            </span>
                            <span className="ex-stat-chip neutral">
                              {stats.accuracyRate}% accuracy
                            </span>
                          </>
                        ) : (
                          <span className="ex-stat-chip neutral">
                            <Users style={{ width: 12, height: 12 }} /> 0
                            answered
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          margin: 0,
                          color: '#666',
                          fontSize: '0.88rem',
                        }}
                      >
                        {firstQ}
                      </p>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                      }}
                    >
                      {role === 'teacher' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveAnalyticsEx(ex)}
                          style={{ gap: '0.35rem' }}
                        >
                          <BarChart3 style={{ width: 14, height: 14 }} />{' '}
                          Analytics
                        </Button>
                      )}
                      {isClosedForStudent ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          style={{
                            color: '#7f1d1d',
                            borderColor: '#fca5a5',
                            background: '#fef2f2',
                            cursor: 'not-allowed',
                            gap: '4px',
                          }}
                        >
                          <Lock style={{ width: 13, height: 13 }} /> Closed
                        </Button>
                      ) : (
                        <Button
                          variant={
                            role === 'teacher'
                              ? 'outline'
                              : isDone
                                ? 'outline'
                                : 'default'
                          }
                          size="sm"
                          onClick={() => onStartExercise(ex)}
                          className={
                            role === 'student' && !isDone
                              ? 'primary-action'
                              : ''
                          }
                          style={
                            role === 'student' && isDone
                              ? {
                                  borderColor: '#86efac',
                                  color: '#166534',
                                  background: '#f0fdf4',
                                }
                              : undefined
                          }
                        >
                          {role === 'teacher' ? (
                            'Preview'
                          ) : isDone ? (
                            <>
                              <Check
                                style={{
                                  width: 14,
                                  height: 14,
                                  marginRight: 4,
                                }}
                              />{' '}
                              View result
                            </>
                          ) : (
                            'Start exercise'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      marginTop: '1.25rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid #eeeae4',
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', color: '#666' }}>
                      Showing{' '}
                      <strong>
                        {(currentPage - 1) * EXERCISES_PER_PAGE + 1}–
                        {Math.min(
                          currentPage * EXERCISES_PER_PAGE,
                          filteredAndSortedExercises.length,
                        )}
                      </strong>{' '}
                      of <strong>{filteredAndSortedExercises.length}</strong>{' '}
                      exercise{filteredAndSortedExercises.length !== 1 ? 's' : ''}
                      {exerciseSearch.trim() && (
                        <span> (filtered from {exercises.length})</span>
                      )}
                    </span>

                    {totalPages > 1 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === 1}
                          onClick={() =>
                            setExercisePage((prev) => Math.max(1, prev - 1))
                          }
                          style={{
                            height: '32px',
                            padding: '0 10px',
                            fontSize: '0.76rem',
                          }}
                        >
                          <ArrowLeft style={{ width: 12, height: 12 }} /> Prev
                        </Button>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          {Array.from(
                            { length: totalPages },
                            (_, idx) => idx + 1,
                          ).map((pageNum) => (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setExercisePage(pageNum)}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor:
                                  currentPage === pageNum
                                    ? '#173e30'
                                    : '#e5e1da',
                                background:
                                  currentPage === pageNum ? '#173e30' : '#fff',
                                color:
                                  currentPage === pageNum ? '#fff' : '#444',
                                fontWeight:
                                  currentPage === pageNum ? 700 : 500,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                              }}
                            >
                              {pageNum}
                            </button>
                          ))}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === totalPages}
                          onClick={() =>
                            setExercisePage((prev) =>
                              Math.min(totalPages, prev + 1),
                            )
                          }
                          style={{
                            height: '32px',
                            padding: '0 10px',
                            fontSize: '0.76rem',
                          }}
                        >
                          Next <ArrowRight style={{ width: 12, height: 12 }} />
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="class-empty">
              <FileQuestion />
              <h3>
                {role === 'teacher'
                  ? `Build the first exercise`
                  : 'Your teacher is preparing the first activity'}
              </h3>
              <p>
                {role === 'teacher'
                  ? 'Start with your own question, then use AI Enhance.'
                  : 'New lessons and quizzes will appear here.'}
              </p>
              {role === 'teacher' && (
                <Button onClick={onQuiz}>
                  <Plus /> Create exercise
                </Button>
              )}
            </div>
          )}
        </section>
        <aside className="panel class-stats">
          <span className="kicker">
            {role === 'teacher' ? 'Class pulse' : 'My progress'}
          </span>
          <h2>
            {role === 'teacher'
              ? totalClassSubs > 0
                ? `${classAccuracy}% accuracy`
                : `${exercises.length} published`
              : exercises.length
                ? `${completedExercisesCount} / ${exercises.length} completed`
                : '0 completed'}
          </h2>
          <Progress
            value={
              role === 'teacher'
                ? totalClassSubs > 0
                  ? classAccuracy
                  : exercises.length
                    ? 100
                    : 0
                : studentMasteryPct
            }
          />
          {role === 'teacher' && totalClassSubs > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '1rem',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              <span style={{ color: '#166534' }}>
                <Check style={{ width: 13, height: 13, display: 'inline' }} />{' '}
                {totalClassCorrect} correct
              </span>
              <span style={{ color: '#991b1b' }}>
                <X style={{ width: 13, height: 13, display: 'inline' }} />{' '}
                {totalClassWrong} wrong
              </span>
              <span>
                <Users style={{ width: 13, height: 13, display: 'inline' }} />{' '}
                {totalClassSubs} learners
              </span>
            </div>
          )}
          {role === 'student' && exercises.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '1rem',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              <span style={{ color: '#166534' }}>
                <CheckCircle2
                  style={{ width: 13, height: 13, display: 'inline' }}
                />{' '}
                {completedExercisesCount} completed
              </span>
              <span style={{ color: '#666' }}>
                <Clock3 style={{ width: 13, height: 13, display: 'inline' }} />{' '}
                {exercises.length - completedExercisesCount} remaining
              </span>
            </div>
          )}
          <div className="tip" style={{ marginTop: '1rem' }}>
            <Sparkles />
            <p>
              {role === 'teacher'
                ? totalClassSubs > 0
                  ? `Class average accuracy is ${classAccuracy}%. Click "Analytics" on any card for question-by-question breakdown.`
                  : 'Insights appear after students complete an activity. Check Analytics on each exercise card.'
                : completedExercisesCount === exercises.length &&
                    exercises.length > 0
                  ? 'All exercises completed! Great job!'
                  : `Keep going! You have completed ${completedExercisesCount} of ${exercises.length} exercise${exercises.length > 1 ? 's' : ''}.`}
            </p>
          </div>
        </aside>
      </div>
      ) : (
        <div className="classroom-layout">
          <section className="panel activity-panel">
            <div className="panel-head">
              <div>
                <span className="kicker">Class roster</span>
                <h2>
                  {members.length
                    ? `${members.length} Enrolled Student${members.length > 1 ? 's' : ''}`
                    : 'No students enrolled yet'}
                </h2>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
                marginTop: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  flex: '1 1 240px',
                  maxWidth: '380px',
                }}
              >
                <Search
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '16px',
                    height: '16px',
                    color: '#888',
                    pointerEvents: 'none',
                  }}
                />
                <Input
                  type="text"
                  placeholder="Search students by name..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  style={{
                    paddingLeft: '36px',
                    paddingRight: studentSearch ? '30px' : '12px',
                    height: '38px',
                    borderRadius: '12px',
                    fontSize: '0.84rem',
                    background: '#fff',
                    borderColor: '#ded8cf',
                  }}
                />
                {studentSearch && (
                  <button
                    type="button"
                    onClick={() => setStudentSearch('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: '#888',
                      padding: 0,
                      display: 'flex',
                    }}
                    aria-label="Clear search"
                  >
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </div>

              <div style={{ fontSize: '0.82rem', color: '#666', fontWeight: 600 }}>
                Showing {filteredMembers.length} of {members.length} student{members.length !== 1 ? 's' : ''}
              </div>
            </div>

            {members.length === 0 ? (
              <div className="class-empty">
                <Users />
                <h3>No learners enrolled yet</h3>
                <p>
                  {role === 'teacher'
                    ? `Share the classroom code "${currentClass.code}" with your students so they can join.`
                    : 'You are the first student to explore this classroom!'}
                </p>
                {role === 'teacher' && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(currentClass.code);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                  >
                    {copiedCode ? (
                      <>
                        <Check style={{ width: 14, height: 14, color: '#166534' }} /> Code copied!
                      </>
                    ) : (
                      <>
                        <Copy style={{ width: 14, height: 14 }} /> Copy class code: {currentClass.code}
                      </>
                    )}
                  </Button>
                )}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2.5rem 1.5rem',
                  background: '#fcfbf9',
                  borderRadius: '16px',
                  border: '1px dashed #ded8cf',
                  marginTop: '0.5rem',
                }}
              >
                <Search
                  style={{
                    width: 28,
                    height: 28,
                    margin: '0 auto 0.5rem',
                    color: '#999',
                  }}
                />
                <p
                  style={{
                    fontWeight: 600,
                    margin: '0 0 0.4rem',
                    color: '#333',
                  }}
                >
                  No students match &ldquo;{studentSearch}&rdquo;
                </p>
                <small
                  style={{
                    color: '#777',
                    display: 'block',
                    marginBottom: '1rem',
                  }}
                >
                  Try searching by a different name.
                </small>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStudentSearch('')}
                >
                  Clear search
                </Button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {filteredMembers.map((member, i) => {
                  const isCurrentUser = member.uid === user.uid;
                  const stats = studentPerformanceMap[member.uid];
                  const completedCount = stats ? stats.completed : 0;
                  const pct =
                    exercises.length > 0
                      ? Math.round((completedCount / exercises.length) * 100)
                      : member.progress || 0;

                  const joinedDate = member.joinedAt
                    ? member.joinedAt.toDate
                      ? member.joinedAt.toDate().toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : typeof member.joinedAt === 'string'
                        ? new Date(member.joinedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Enrolled'
                    : 'Enrolled';

                  return (
                    <div
                      key={member.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        padding: '1rem 1.25rem',
                        background: isCurrentUser ? '#f5f9f6' : '#fff',
                        border: isCurrentUser
                          ? '1.5px solid #2e7d32'
                          : '1px solid #eeeae4',
                        borderRadius: '16px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          minWidth: '220px',
                        }}
                      >
                        <span
                          className={`avatar ${colours[i % colours.length]}`}
                          style={{
                            width: '42px',
                            height: '42px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {initials(member.name)}
                        </span>
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                color: '#111',
                              }}
                            >
                              {member.name}
                            </span>
                            {isCurrentUser && (
                              <span
                                style={{
                                  background: '#e8f5e9',
                                  color: '#1b5e20',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '999px',
                                  border: '1px solid #a5d6a7',
                                }}
                              >
                                You
                              </span>
                            )}
                          </div>
                          <small
                            style={{
                              color: '#888',
                              fontSize: '0.72rem',
                              display: 'block',
                              marginTop: '2px',
                            }}
                          >
                            {joinedDate}
                          </small>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1.25rem',
                          marginLeft: 'auto',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div
                          style={{
                            minWidth: '130px',
                            textAlign: 'right',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              color: '#111',
                              marginBottom: '4px',
                            }}
                          >
                            {completedCount} / {exercises.length} activities
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              justifyContent: 'flex-end',
                            }}
                          >
                            <div
                              style={{
                                width: '80px',
                                height: '6px',
                                background: '#eeeae4',
                                borderRadius: '999px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, pct)}%`,
                                  height: '100%',
                                  background: '#173e30',
                                  borderRadius: '999px',
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                color: '#555',
                                fontWeight: 600,
                              }}
                            >
                              {pct}%
                            </span>
                          </div>
                        </div>

                        {role === 'teacher' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRemovingStudent(member);
                              setRemoveError('');
                            }}
                            style={{
                              color: '#dc2626',
                              borderColor: '#fca5a5',
                              height: '32px',
                              padding: '0 10px',
                              fontSize: '0.75rem',
                            }}
                          >
                            <Trash2 style={{ width: 13, height: 13 }} /> Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="panel class-stats">
            <span className="kicker">Class overview</span>
            <h2>
              {members.length} / {currentClass.maxStudents || 30}
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '-4px', marginBottom: '1rem' }}>
              Enrolled learners in this class
            </p>

            <Progress
              value={
                currentClass.maxStudents
                  ? Math.round(
                      (members.length / (currentClass.maxStudents || 30)) * 100,
                    )
                  : 0
              }
            />

            <div
              style={{
                marginTop: '1.25rem',
                padding: '1rem',
                background: '#fcfbf9',
                borderRadius: '14px',
                border: '1px solid #eeeae4',
              }}
            >
              <div
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#666',
                  marginBottom: '6px',
                }}
              >
                Classroom Code
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    color: '#173e30',
                    fontFamily: 'monospace',
                  }}
                >
                  {currentClass.code}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(currentClass.code);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  style={{ height: '30px', padding: '0 8px', fontSize: '0.74rem' }}
                >
                  {copiedCode ? (
                    <>
                      <Check style={{ width: 12, height: 12, color: '#166534' }} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy style={{ width: 12, height: 12 }} /> Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="tip" style={{ marginTop: '1rem' }}>
              <Sparkles />
              <p>
                {role === 'teacher'
                  ? 'Students can enter the class code on their dashboard to send a join request. Once approved, they appear here.'
                  : 'You are viewing your classmates in this room. Keep learning together!'}
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* Remove Student Confirmation Dialog */}
      <Dialog
        open={!!removingStudent}
        onOpenChange={(open) => !open && setRemovingStudent(null)}
      >
        <DialogContent className="modal-card">
          <DialogHeader>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                marginBottom: 10,
              }}
            >
              <Trash2 style={{ width: 20, height: 20 }} />
            </div>
            <DialogTitle>Remove student from class?</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{removingStudent?.name}</strong> from {currentClass.name}?
            </DialogDescription>
          </DialogHeader>
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 14,
              padding: '12px 14px',
              color: '#991b1b',
              fontSize: '0.8rem',
              lineHeight: 1.5,
            }}
          >
            <strong>Note:</strong> Removing this student will revoke their access to this classroom and its exercises.
          </div>
          {removeError && <p className="form-error">{removeError}</p>}
          <DialogFooter style={{ marginTop: 12 }}>
            <Button
              variant="outline"
              onClick={() => setRemovingStudent(null)}
              disabled={removeBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRemoveStudent}
              disabled={removeBusy}
              style={{ background: '#dc2626', color: '#fff' }}
            >
              {removeBusy ? <LoaderCircle /> : <Trash2 />}{' '}
              {removeBusy ? 'Removing…' : 'Remove student'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!activeAnalyticsEx}
        onOpenChange={(open) => !open && setActiveAnalyticsEx(null)}
      >
        <DialogContent className="modal-card analytics-modal">
          <DialogHeader>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#e8f1e9',
                color: '#173e30',
                marginBottom: 8,
              }}
            >
              <BarChart3 style={{ width: 20, height: 20 }} />
            </div>
            <DialogTitle>{activeAnalyticsEx?.title} · Analytics</DialogTitle>
            <DialogDescription>
              Real-time submission results, accuracy rates, and question
              breakdown.
            </DialogDescription>
            {activeAnalyticsEx?.deadline &&
              (() => {
                const d = formatDeadline(activeAnalyticsEx.deadline);
                const allows = activeAnalyticsEx.allowLateSubmissions !== false;
                return (
                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        color: d.isPast ? '#991b1b' : '#4b5563',
                        background: d.isPast ? '#fef2f2' : '#f3f4f6',
                        border: `1px solid ${d.isPast ? '#fecaca' : '#e5e7eb'}`,
                        padding: '2px 8px',
                        borderRadius: 99,
                      }}
                    >
                      <Calendar style={{ width: 12, height: 12 }} /> Due:{' '}
                      {d.formatted} {d.isPast ? '(Past Due)' : ''}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: allows ? '#166534' : '#991b1b',
                        background: allows ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${allows ? '#bbf7d0' : '#fecaca'}`,
                        padding: '2px 8px',
                        borderRadius: 99,
                      }}
                    >
                      {allows ? (
                        <Unlock style={{ width: 11, height: 11 }} />
                      ) : (
                        <Lock style={{ width: 11, height: 11 }} />
                      )}{' '}
                      {allows
                        ? 'Late submissions allowed'
                        : 'Late submissions blocked'}
                    </span>
                  </div>
                );
              })()}
          </DialogHeader>
          {activeAnalyticsEx &&
            (() => {
              const stats = analyticsMap[activeAnalyticsEx.id] || {
                totalAnswered: 0,
                totalCorrect: 0,
                totalWrong: 0,
                accuracyRate: 0,
                questionBreakdown: [],
                difficultyBreakdown: [],
                topicBreakdown: [],
                skillBreakdown: [],
                submissions: [],
              };
              return (
                <div>
                  <div className="analytics-summary-grid">
                    <div className="analytics-metric-box">
                      <small>Students Answered</small>
                      <strong>
                        {stats.totalAnswered}{' '}
                        <span
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            color: '#888',
                          }}
                        >
                          / {currentClass.students || 0}
                        </span>
                      </strong>
                    </div>
                    <div className="analytics-metric-box">
                      <small>Class Accuracy</small>
                      <strong style={{ color: '#15803d' }}>
                        {stats.accuracyRate}%
                      </strong>
                    </div>
                    <div className="analytics-metric-box">
                      <small>Total Correct</small>
                      <strong style={{ color: '#166534' }}>
                        {stats.totalCorrect}
                      </strong>
                    </div>
                    <div className="analytics-metric-box">
                      <small>Total Wrong</small>
                      <strong style={{ color: '#b91c1c' }}>
                        {stats.totalWrong}
                      </strong>
                    </div>
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '.75rem' }}>Topics that need attention</h3>
                    {stats.topicBreakdown.length ? <div className="tag-performance-grid">{stats.topicBreakdown.map((item) => <div className="tag-performance-card" key={item.label}><header><b>{item.label}</b><strong className={item.status}>{item.totalAnswers ? `${item.accuracyRate}%` : '—'}</strong></header><small>{item.correctCount}/{item.totalAnswers} correct · {item.unansweredCount} unanswered</small><small>{item.status === 'needs_support' ? 'Needs support' : item.status === 'not_enough_data' ? 'Not enough data' : item.status.replace('_', ' ')}</small></div>)}</div> : <p style={{ color: '#777', fontSize: '.85rem' }}>Topic results will appear after tagged questions are answered.</p>}
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '.75rem' }}>Performance by skill</h3>
                    {stats.skillBreakdown.length ? <div className="tag-performance-grid">{stats.skillBreakdown.map((item) => <div className="tag-performance-card" key={item.label}><header><b>{item.label}</b><strong className={item.status}>{item.totalAnswers ? `${item.accuracyRate}%` : '—'}</strong></header><small>{item.correctCount}/{item.totalAnswers} correct · {item.unansweredCount} unanswered</small></div>)}</div> : <p style={{ color: '#777', fontSize: '.85rem' }}>Skill results will appear after tagged questions are answered.</p>}
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '.75rem' }}>Performance by Difficulty</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '.7rem' }}>
                      {stats.difficultyBreakdown.map((item) => (
                        <div key={item.difficulty} style={{ background: difficultyColour(item.difficulty), borderRadius: 12, padding: '.8rem' }}>
                          <b style={{ textTransform: 'capitalize' }}>{item.difficulty}</b>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{item.totalAnswers ? `${item.accuracyRate}%` : '—'}</div>
                          <small>{item.correctCount}/{item.totalAnswers} correct</small>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        marginBottom: '0.75rem',
                      }}
                    >
                      Question-by-Question Performance
                    </h3>
                    {stats.questionBreakdown.length ? (
                      stats.questionBreakdown.map((q) => (
                        <div key={q.questionIdx} className="q-breakdown-card">
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              marginBottom: 6,
                            }}
                          >
                            <div>
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  color: '#787268',
                                }}
                              >
                                Question 0{q.questionIdx + 1}{' '}
                                <span style={{ background: difficultyColour(q.difficulty), borderRadius: 999, padding: '2px 6px', marginLeft: 5 }}>{q.difficulty}</span>
                              </span>
                              <p
                                style={{
                                  margin: '2px 0 6px',
                                  fontSize: '0.92rem',
                                  fontWeight: 500,
                                  color: '#111',
                                }}
                              >
                                {q.questionText}
                              </p>
                              {q.expectedAnswer && (
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: '0.78rem',
                                    color: '#66786e',
                                  }}
                                >
                                  <strong>Expected Answer:</strong>{' '}
                                  {q.expectedAnswer}
                                </p>
                              )}
                            </div>
                            <span
                              style={{
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                color:
                                  q.accuracyRate >= 70
                                    ? '#15803d'
                                    : q.accuracyRate >= 40
                                      ? '#d97706'
                                      : '#b91c1c',
                              }}
                            >
                              {q.accuracyRate}%
                            </span>
                          </div>
                          <div className="split-bar">
                            <div
                              className="split-bar-fill"
                              style={{ width: `${q.accuracyRate}%` }}
                            />
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginTop: 6,
                              fontSize: '0.72rem',
                              color: '#6b7280',
                            }}
                          >
                            <span>
                              <Check
                                style={{
                                  width: 11,
                                  height: 11,
                                  display: 'inline',
                                  color: '#16a34a',
                                }}
                              />{' '}
                              {q.correctCount} correct
                            </span>
                            <span>
                              <X
                                style={{
                                  width: 11,
                                  height: 11,
                                  display: 'inline',
                                  color: '#dc2626',
                                }}
                              />{' '}
                              {q.wrongCount} wrong
                            </span>
                            <span>{q.totalAnswers} answered</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p style={{ color: '#777', fontSize: '0.85rem' }}>
                        No questions found for this exercise.
                      </p>
                    )}
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        marginBottom: '0.75rem',
                      }}
                    >
                      Student Submissions ({stats.submissions.length})
                    </h3>
                    {stats.submissions.length ? (
                      <div
                        style={{
                          display: 'grid',
                          gap: 8,
                          maxHeight: '240px',
                          overflowY: 'auto',
                        }}
                      >
                        {stats.submissions.map((sub) => {
                          const subStats = computeSubmissionStats(
                            sub,
                            activeAnalyticsEx,
                          );
                          const capability = capabilityFromResults(subStats.questionResults);
                          const totalPts =
                            sub.totalPoints ||
                            activeAnalyticsEx.questions?.reduce(
                              (n: number, q: any) =>
                                n + (Number(q.points) || 1),
                              0,
                            ) ||
                            2;
                          return (
                            <div
                              key={sub.id}
                              style={{
                                background: '#fff',
                                border: '1px solid #eeeae4',
                                borderRadius: 12,
                                padding: '10px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                }}
                              >
                                <span
                                  className="avatar"
                                  style={{
                                    width: 32,
                                    height: 32,
                                    fontSize: '0.65rem',
                                  }}
                                >
                                  {initials(sub.studentName)}
                                </span>
                                <div>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                    }}
                                  >
                                    <b style={{ fontSize: '0.85rem' }}>
                                      {sub.studentName}
                                    </b>
                                    {sub.isLate && (
                                      <span
                                        style={{
                                          background: '#fee2e2',
                                          color: '#b91c1c',
                                          border: '1px solid #fca5a5',
                                          fontSize: '0.65rem',
                                          padding: '1px 5px',
                                          borderRadius: 4,
                                          fontWeight: 700,
                                        }}
                                      >
                                        LATE
                                      </span>
                                    )}
                                  </div>
                                  <small style={{ color: '#315b42', display: 'block', fontSize: '.7rem', fontWeight: 700 }}>
                                    Capability: {capability}
                                  </small>
                                </div>
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  alignItems: 'center',
                                  fontSize: '0.8rem',
                                }}
                              >
                                <span
                                  style={{
                                    color: '#15803d',
                                    fontWeight: 600,
                                    background: '#f0fdf4',
                                    border: '1px solid #bbf7d0',
                                    padding: '2px 8px',
                                    borderRadius: 99,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <Check style={{ width: 12, height: 12 }} />{' '}
                                  {subStats.correct} correct
                                </span>
                                <span
                                  style={{
                                    color: '#b91c1c',
                                    fontWeight: 600,
                                    background: '#fef2f2',
                                    border: '1px solid #fecaca',
                                    padding: '2px 8px',
                                    borderRadius: 99,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <X style={{ width: 12, height: 12 }} />{' '}
                                  {subStats.wrong} wrong
                                </span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    background: '#f1ece5',
                                    padding: '2px 8px',
                                    borderRadius: 99,
                                  }}
                                >
                                  {sub.score}/{totalPts} pts
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        className="empty-success"
                        style={{
                          padding: '1.2rem',
                          borderRadius: 12,
                          background: '#f8faf7',
                        }}
                      >
                        <Users
                          style={{
                            width: 20,
                            height: 20,
                            margin: '0 auto 6px',
                          }}
                        />{' '}
                        No students have submitted this exercise yet.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          <DialogFooter style={{ marginTop: '1.2rem' }}>
            <Button onClick={() => setActiveAnalyticsEx(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="modal-card">
          <DialogHeader>
            <DialogTitle>Edit classroom</DialogTitle>
            <DialogDescription>
              Update details for {currentClass.name}.
            </DialogDescription>
          </DialogHeader>
          <label className="form-label">
            Classroom name
            <Input
              placeholder="e.g. Mathematics · Form 4"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <div className="curriculum-fields">
            <label className="form-label">
              School level
              <NativeSelect className="curriculum-select" value={editSchoolStage} onChange={(e) => { const stage=e.target.value as SchoolStage; setEditSchoolStage(stage); setEditSchoolYear(SCHOOL_YEARS[stage][0]); setEditSubject(''); }}>
                {SCHOOL_STAGES.map((stage) => <NativeSelectOption key={stage.value} value={stage.value}>{stage.label}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <label className="form-label">
              Year / form
              <NativeSelect className="curriculum-select" value={editSchoolYear} onChange={(e) => { setEditSchoolYear(e.target.value); setEditSubject(''); }}>
                {SCHOOL_YEARS[editSchoolStage].map((year) => <NativeSelectOption key={year} value={year}>{year}</NativeSelectOption>)}
              </NativeSelect>
            </label>
          </div>
          <label className="form-label">
            KPM subject
            <Combobox value={editSubject || null} onValueChange={(value) => setEditSubject(String(value || ''))} items={editAvailableSubjects.map((subject) => subject.name)}>
              <ComboboxInput className="curriculum-combobox" placeholder="Search a subject, e.g. Fizik" showClear />
              <ComboboxContent><ComboboxEmpty>No matching subject for this level.</ComboboxEmpty><ComboboxList>{editSubjectGroups.map((group) => <ComboboxGroup key={group}><ComboboxLabel>{group}</ComboboxLabel>{editAvailableSubjects.filter((subject) => subject.category === group).map((subject) => <ComboboxItem key={subject.name} value={subject.name}>{subject.name}</ComboboxItem>)}</ComboboxGroup>)}</ComboboxList></ComboboxContent>
            </Combobox>
            <small className="curriculum-note">{curriculumFor(editSchoolStage)} · Choose a verified subject for {editSchoolYear}.</small>
          </label>
          <label className="form-label">
            Student capacity (Max learners)
            <Input
              type="number"
              min={Math.max(1, currentClass.students || 1)}
              max="100"
              value={editMaxStudents}
              onChange={(e) => setEditMaxStudents(e.target.value)}
            />
            {currentClass.students > 0 && (
              <small style={{ color: '#706a63', fontSize: '0.72rem' }}>
                Currently enrolled: {currentClass.students} student
                {currentClass.students > 1 ? 's' : ''}. Capacity cannot be
                lower.
              </small>
            )}
          </label>
          {editError && <p className="form-error">{editError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={savingEdit || !editName.trim() || !editSubject}
            >
              {savingEdit ? <LoaderCircle /> : <Check />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="modal-card">
          <DialogHeader>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                marginBottom: 10,
              }}
            >
              <Trash2 style={{ width: 20, height: 20 }} />
            </div>
            <DialogTitle>Delete classroom?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{currentClass.name}</strong> (Code:{' '}
              <code>{currentClass.code}</code>)?
            </DialogDescription>
          </DialogHeader>
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 14,
              padding: '12px 14px',
              color: '#991b1b',
              fontSize: '0.8rem',
              lineHeight: 1.5,
            }}
          >
            <strong>Warning:</strong> This permanently deletes this classroom,
            its {currentClass.students || 0} student membership(s), join
            requests, and all published exercises. This cannot be undone.
          </div>
          {deleteError && <p className="form-error">{deleteError}</p>}
          <DialogFooter style={{ marginTop: 12 }}>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              style={{ background: '#dc2626', color: '#fff' }}
            >
              {deleting ? <LoaderCircle /> : <Trash2 />}{' '}
              {deleting ? 'Deleting…' : 'Delete classroom'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editExTarget}
        onOpenChange={(open) => !open && setEditExTarget(null)}
      >
        <DialogContent className="modal-card">
          <DialogHeader>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#f1ece5',
                color: '#111',
                marginBottom: 8,
              }}
            >
              <Pencil style={{ width: 18, height: 18 }} />
            </div>
            <DialogTitle>Edit Exercise Details</DialogTitle>
            <DialogDescription>
              Update the title, deadline, or late submission policy.
            </DialogDescription>
          </DialogHeader>
          <label className="form-label">
            Exercise name
            <Input
              placeholder="e.g. Mathematics Checkpoint 1"
              value={editExTitle}
              onChange={(e) => {
                setEditExTitle(e.target.value);
                setEditExError('');
              }}
            />
          </label>
          <label className="form-label" style={{ marginTop: '0.8rem' }}>
            Submission deadline (Optional)
            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                marginTop: '0.3rem',
              }}
            >
              <Input
                type="datetime-local"
                value={editExDeadline}
                onChange={(e) => {
                  setEditExDeadline(e.target.value);
                  setEditExError('');
                }}
                style={{ borderRadius: '10px' }}
              />
              {editExDeadline && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditExDeadline('')}
                  style={{ fontSize: '0.75rem', height: '36px' }}
                >
                  Clear
                </Button>
              )}
            </div>
            <small
              style={{
                color: '#706a63',
                fontSize: '0.72rem',
                display: 'block',
                marginTop: '4px',
              }}
            >
              {editExDeadline
                ? `Due: ${formatDeadline(editExDeadline).formatted}`
                : 'No deadline currently set.'}
            </small>
          </label>
          {editExDeadline && (
            <div
              style={{
                marginTop: '0.9rem',
                padding: '0.8rem 1rem',
                background: '#fbfaf7',
                borderRadius: '12px',
                border: '1px solid #eeeae4',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#111',
                }}
              >
                <input
                  type="checkbox"
                  checked={editExAllowLate}
                  onChange={(e) => setEditExAllowLate(e.target.checked)}
                  style={{
                    marginTop: '3px',
                    accentColor: '#173e30',
                    width: 16,
                    height: 16,
                  }}
                />
                <div>
                  <span>Allow students to submit after deadline</span>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '0.75rem',
                      fontWeight: 400,
                      color: '#666',
                    }}
                  >
                    {editExAllowLate
                      ? 'Students can still submit after the deadline, but will be tagged as Late.'
                      : 'Submissions will be automatically locked after the deadline passes.'}
                  </p>
                </div>
              </label>
            </div>
          )}
          {editExError && <p className="form-error">{editExError}</p>}
          <DialogFooter style={{ marginTop: 14 }}>
            {onEditExercise && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const target = editExTarget;
                  setEditExTarget(null);
                  onEditExercise(target);
                }}
                style={{ gap: '0.35rem', marginRight: 'auto' }}
              >
                <Pencil style={{ width: 14, height: 14 }} /> Edit in Builder
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditExTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveEditExercise}
              disabled={savingEditEx || !editExTitle.trim()}
            >
              {savingEditEx ? <LoaderCircle /> : <Check />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteExTarget}
        onOpenChange={(open) => !open && setDeleteExTarget(null)}
      >
        <DialogContent className="modal-card">
          <DialogHeader>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                marginBottom: 10,
              }}
            >
              <Trash2 style={{ width: 20, height: 20 }} />
            </div>
            <DialogTitle>Delete exercise?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deleteExTarget?.title}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 14,
              padding: '12px 14px',
              color: '#991b1b',
              fontSize: '0.8rem',
              lineHeight: 1.5,
            }}
          >
            <strong>Warning:</strong> This permanently deletes this exercise and
            all student submissions for it. This cannot be undone.
          </div>
          {deleteExError && <p className="form-error">{deleteExError}</p>}
          <DialogFooter style={{ marginTop: 12 }}>
            <Button
              variant="outline"
              onClick={() => setDeleteExTarget(null)}
              disabled={deletingEx}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteExercise}
              disabled={deletingEx}
              style={{ background: '#dc2626', color: '#fff' }}
            >
              {deletingEx ? <LoaderCircle /> : <Trash2 />}{' '}
              {deletingEx ? 'Deleting…' : 'Delete exercise'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StudentExerciseRunner(props: { role?: Role | null; user: User; classroom: ClassroomData; exercise: any; onBack: () => void; onExit: () => void }) {
  const [loaded, setLoaded] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!props.exercise.personalized) return;
    setLoaded(null); setError('');
    let active = true;
    httpsCallable(functions, 'getPersonalizedQuestions')({ classroomId: props.classroom.id, exerciseId: props.exercise.id })
      .then(result => { if (active) setLoaded({ ...props.exercise, ...(result.data as object) }); })
      .catch(err => { if (active) setError(friendlyError(err)); });
    return () => { active = false; };
  }, [props.classroom.id, props.exercise.id]);
  if (props.exercise.personalized && loaded?.id !== props.exercise.id) return <AppShell role={props.role || 'student'} user={props.user} onExit={props.onExit} active="classroom" classCount={1}><button onClick={props.onBack}>Back to classroom</button><p role="status">{error || 'Loading your assigned exercise…'}</p></AppShell>;
  return <StudentExerciseRunnerContent {...props} exercise={loaded || props.exercise} />;
}

function StudentExerciseRunnerContent({
  role,
  user,
  classroom,
  exercise,
  onBack,
  onExit,
}: {
  role?: Role | null;
  user: User;
  classroom: ClassroomData;
  exercise: any;
  onBack: () => void;
  onExit: () => void;
}) {
  const isTeacher = role === 'teacher';
  const rawQuestions: QuestionItem[] = exercise.questions?.length
    ? exercise.questions
    : exercise.question
      ? [
          {
            id: '1',
            question: exercise.question,
            answer: exercise.answer || '',
            points: 2,
            enhanced: exercise.enhanced || false,
          },
        ]
      : [];
  const isExam = Boolean(exercise.isExam);
  const timeLimitMinutes = isExam ? (Number(exercise.timeLimitMinutes) || 30) : null;
  const allowPrevious = isExam ? exercise.allowPrevious !== false : true;
  const isShuffle = Boolean(exercise.shuffleQuestions);

  // Derive question list, shuffling if enabled
  const [activeQuestions] = useState<QuestionItem[]>(() => {
    if (!isShuffle || rawQuestions.length <= 1) return rawQuestions;
    // Simple deterministic-feeling shuffle for student session
    const list = [...rawQuestions];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  });

  const [examStarted, setExamStarted] = useState(!isExam || isTeacher);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() => {
    if (!isExam || !timeLimitMinutes || isTeacher) return null;
    return timeLimitMinutes * 60;
  });
  const [autoSubmittedDueToTime, setAutoSubmittedDueToTime] = useState(false);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [isLateSubmission, setIsLateSubmission] = useState(false);
  const [earnedScore, setEarnedScore] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [totalCorrectState, setTotalCorrectState] = useState(0);
  const [totalWrongState, setTotalWrongState] = useState(0);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [allSubmissions, setAllSubmissions] = useState<SubmissionData[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(isTeacher);
  const [remarkingStudentId, setRemarkingStudentId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'needs_review' | 'correct'>('all');
  const [myQuestionResults, setMyQuestionResults] = useState<QuestionResult[]>([]);

  const dueInfo = formatDeadline(exercise.deadline);
  const totalPoints = activeQuestions.reduce(
    (n, q) => n + (Number(q.points) || 1),
    0,
  );
  const currentQ = activeQuestions[currentIdx] || {
    question: 'No question text provided',
    answer: '',
    points: 1,
    enhanced: false,
  };

  // Exam timer persistence via localStorage
  useEffect(() => {
    if (!isExam || !timeLimitMinutes || isTeacher || submitted || alreadyCompleted) return;

    const storageKey = `slearn_exam_${classroom.id}_${exercise.id}_${user.uid}`;
    let startTimeStr = localStorage.getItem(storageKey);

    if (examStarted) {
      if (!startTimeStr) {
        startTimeStr = String(Date.now());
        localStorage.setItem(storageKey, startTimeStr);
      }
      const startTime = Number(startTimeStr) || Date.now();
      const totalSeconds = timeLimitMinutes * 60;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);
      setSecondsRemaining(remaining);
    }
  }, [isExam, timeLimitMinutes, isTeacher, examStarted, submitted, alreadyCompleted, classroom.id, exercise.id, user.uid]);

  // Exam timer countdown interval & auto-submit
  useEffect(() => {
    if (!isExam || !examStarted || submitted || alreadyCompleted || secondsRemaining === null || isTeacher) {
      return;
    }

    if (secondsRemaining <= 0) {
      // Time is up! Auto-submit answers immediately
      setAutoSubmittedDueToTime(true);
      void submitExercise(true);
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timer);
          setAutoSubmittedDueToTime(true);
          void submitExercise(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isExam, examStarted, submitted, alreadyCompleted, secondsRemaining, isTeacher]);

  useEffect(() => {
    if (!isTeacher) return;
    setLoadingSubmissions(true);
    const subCol = collection(
      db,
      'classrooms',
      classroom.id,
      'exercises',
      exercise.id,
      'submissions',
    );
    const unsub = onSnapshot(
      subCol,
      (snap) => {
        const rawSubs: SubmissionData[] = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as SubmissionData,
        );
        const subsMap = new Map<string, SubmissionData>();
        rawSubs.forEach((s) => {
          const key = s.studentId || s.studentEmail || s.id;
          if (!subsMap.has(key)) {
            subsMap.set(key, s);
          } else {
            const existing = subsMap.get(key)!;
            if ((s.score || 0) >= (existing.score || 0)) {
              subsMap.set(key, s);
            }
          }
        });
        setAllSubmissions(Array.from(subsMap.values()));
        setLoadingSubmissions(false);
        setCheckingExisting(false);
      },
      (err) => {
        console.warn('Teacher preview submissions error:', err);
        setLoadingSubmissions(false);
        setCheckingExisting(false);
      },
    );
    return () => unsub();
  }, [isTeacher, classroom.id, exercise.id]);

  useEffect(() => {
    if (isTeacher) {
      setCheckingExisting(false);
      return;
    }
    // Real-time listener on student's own submission so teacher remarks update the UI live
    const subDocRef = doc(
      db,
      'classrooms',
      classroom.id,
      'exercises',
      exercise.id,
      'submissions',
      user.uid,
    );
    const unsub = onSnapshot(
      subDocRef,
      async (directSnap) => {
        if (directSnap.exists()) {
          const data = directSnap.data();
          const stats = computeSubmissionStats(
            { id: directSnap.id, ...data } as SubmissionData,
            exercise,
          );
          setAnswers(data.answers || {});
          setEarnedScore(data.score ?? 0);
          setTotalCorrectState(stats.correct);
          setTotalWrongState(stats.wrong);
          setMyQuestionResults(stats.questionResults);
          setIsLateSubmission(Boolean(data.isLate));
          setSubmitted(true);
          setAlreadyCompleted(true);
          setCheckingExisting(false);
        } else {
          // No direct doc — check old auto-id submissions once (fallback)
          try {
            const qSnap = await getDocs(
              query(
                collection(
                  db,
                  'classrooms',
                  classroom.id,
                  'exercises',
                  exercise.id,
                  'submissions',
                ),
                where('studentId', '==', user.uid),
                limit(1),
              ),
            );
            if (!qSnap.empty) {
              const d = qSnap.docs[0];
              const data = d.data();
              const stats = computeSubmissionStats(
                { id: d.id, ...data } as SubmissionData,
                exercise,
              );
              setAnswers(data.answers || {});
              setEarnedScore(data.score ?? 0);
              setTotalCorrectState(stats.correct);
              setTotalWrongState(stats.wrong);
              setMyQuestionResults(stats.questionResults);
              setIsLateSubmission(Boolean(data.isLate));
              setSubmitted(true);
              setAlreadyCompleted(true);
            }
          } catch (e) {
            console.warn('Check existing submission note:', e);
          } finally {
            setCheckingExisting(false);
          }
        }
      },
      (err) => {
        console.warn('Submission snapshot error:', err);
        setCheckingExisting(false);
      },
    );
    return () => unsub();
  }, [isTeacher, classroom.id, exercise.id, user.uid]);


  const handleAnswer = (text: string) => {
    if (isTeacher || alreadyCompleted || submitted) return;
    setAnswers((prev) => ({ ...prev, [currentIdx]: text }));
  };

  const handleTeacherRemark = async (
    sub: SubmissionData,
    questionIdx: number,
    markAsCorrect: boolean,
  ) => {
    const subId = sub.studentId || sub.id;
    setRemarkingStudentId(`${subId}-${questionIdx}`);
    try {
      // Build updated questionResults
      const updatedResults: QuestionResult[] = (sub.questionResults?.length
        ? sub.questionResults
        : computeSubmissionStats(sub, exercise).questionResults
      ).map((r) => {
        if (r.questionIdx !== questionIdx) return r;
        const pts = r.pointsPossible || Number(activeQuestions[questionIdx]?.points) || 1;
        const studentAns = r.studentAnswer || sub.answers?.[questionIdx] || '';
        const earned = markAsCorrect
          ? pts
          : studentAns.trim().length > 0
            ? Math.max(1, Math.round(pts * 0.5))
            : 0;
        return {
          ...r,
          isCorrect: markAsCorrect,
          pendingReview: false,
          teacherRemarked: markAsCorrect,
          remarkedAt: markAsCorrect ? new Date().toISOString() : undefined,
          pointsEarned: earned,
        };
      });

      const newScore = updatedResults.reduce((acc, r) => acc + (r.pointsEarned || 0), 0);
      const newCorrect = updatedResults.filter((r) => r.isCorrect).length;
      const newWrong = updatedResults.filter((r) => !r.isCorrect).length;

      await updateDoc(
        doc(db, 'classrooms', classroom.id, 'exercises', exercise.id, 'submissions', subId),
        {
          questionResults: updatedResults,
          score: newScore,
          totalCorrect: newCorrect,
          totalWrong: newWrong,
        },
      );
    } catch (e: any) {
      console.error('Remark error:', e);
    } finally {
      setRemarkingStudentId(null);
    }
  };

  const isPastDeadline = Boolean(
    exercise.deadline &&
    new Date().getTime() > new Date(exercise.deadline).getTime(),
  );
  const allowsLate = exercise.allowLateSubmissions !== false;
  const isLateLocked = !isTeacher && isPastDeadline && !allowsLate;

  const submitExercise = async (isAutoSubmit = false) => {
    if (isTeacher) return;
    if (alreadyCompleted || submitted) {
      setSubmitError('You have already completed this exercise.');
      return;
    }
    if (isLateLocked && !isAutoSubmit) {
      setSubmitError(
        'The deadline for this exercise has passed, and late submissions are not accepted.',
      );
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      let score = 0;
      let correctCount = 0;
      let wrongCount = 0;
      const questionResults: QuestionResult[] = [];

      activeQuestions.forEach((q, i) => {
        const userA = (answers[i] || '').trim();
        const userALow = userA.toLowerCase();
        const expA = (q.answer || '').trim();
        const expALow = expA.toLowerCase();
        const pts = Number(q.points) || 1;
        let earned = 0;
        let isCorrect = false;
        const manualReview = q.type !== 'multiple_choice' && q.markingMode === 'manual';

        if (!manualReview &&
          userALow &&
          expALow &&
          (userALow === expALow ||
            expALow.includes(userALow) ||
            userALow.includes(expALow))
        ) {
          earned = pts;
          isCorrect = true;
          correctCount++;
        } else {
          if (!manualReview) wrongCount++;
          if (userALow.length > 0) {
            earned = Math.max(1, Math.round(pts * 0.5));
          }
        }
        score += earned;

        questionResults.push({
          questionIdx: i,
          questionText: q.question,
          expectedAnswer: expA,
          studentAnswer: userA,
          isCorrect,
          pointsEarned: earned,
          pointsPossible: pts,
          difficulty: q.difficulty || 'medium',
          topic: q.topic || 'General',
          subtopic: q.subtopic || '',
          skills: Array.isArray(q.skills) ? q.skills : [],
          pendingReview: manualReview,
        });
      });

      setEarnedScore(score);
      setTotalCorrectState(correctCount);
      setTotalWrongState(wrongCount);

      const isLate = Boolean(
        exercise.deadline &&
        new Date().getTime() > new Date(exercise.deadline).getTime(),
      );
      setIsLateSubmission(isLate);

      // Save using user.uid as document ID so each student has strictly one submission
      if (exercise.personalized && typeof navigator !== 'undefined' && !navigator.onLine) {
        const queueKey = `slearn:offline-submissions:${user.uid}`;
        const queued = JSON.parse(window.localStorage.getItem(queueKey) || '[]') as unknown[];
        queued.push({ personalized: true, classroomId: classroom.id, exerciseId: exercise.id, answers });
        window.localStorage.setItem(queueKey, JSON.stringify(queued));
        setMyQuestionResults(questionResults);
        setSubmitError('Saved offline. Your result will be sent automatically when connection returns.');
      } else if (exercise.personalized) {
        const response = await httpsCallable(functions, 'submitPersonalizedExercise')({ classroomId: classroom.id, exerciseId: exercise.id, answers });
        const result = response.data as { score: number; totalCorrect: number; totalWrong: number; questionResults: QuestionResult[] };
        setEarnedScore(result.score);
        setTotalCorrectState(result.totalCorrect);
        setTotalWrongState(result.totalWrong);
        setMyQuestionResults(result.questionResults);
      } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const queueKey = `slearn:offline-submissions:${user.uid}`;
        const queued = JSON.parse(window.localStorage.getItem(queueKey) || '[]') as unknown[];
        queued.push({ personalized: false, classroomId: classroom.id, exerciseId: exercise.id, submission: { studentId: user.uid, studentName: user.displayName || 'Student', studentEmail: user.email || '', answers, score, totalPoints, totalCorrect: correctCount, totalWrong: wrongCount, questionResults, isLate, isExam, autoSubmitted: isAutoSubmit, submittedAt: new Date() } });
        window.localStorage.setItem(queueKey, JSON.stringify(queued));
        setMyQuestionResults(questionResults);
        setSubmitError('Waiting to sync. Your answers are saved on this device.');
      } else await setDoc(
        doc(
          db,
          'classrooms',
          classroom.id,
          'exercises',
          exercise.id,
          'submissions',
          user.uid,
        ),
        {
          studentId: user.uid,
          studentName: user.displayName || 'Student',
          studentEmail: user.email || '',
          answers,
          score,
          totalPoints,
          totalCorrect: correctCount,
          totalWrong: wrongCount,
          questionResults,
          isLate,
          isExam,
          autoSubmitted: isAutoSubmit,
          submittedAt: serverTimestamp(),
        },
      );

      try {
        const exSnap = await getDocs(
          collection(db, 'classrooms', classroom.id, 'exercises'),
        );
        const totalEx = exSnap.size;
        let completedCount = 0;
        await Promise.all(
          exSnap.docs.map(async (exDoc) => {
            if (exDoc.id === exercise.id) {
              completedCount++;
              return;
            }
            try {
              const directSub = await getDoc(
                doc(
                  db,
                  'classrooms',
                  classroom.id,
                  'exercises',
                  exDoc.id,
                  'submissions',
                  user.uid,
                ),
              );
              if (directSub.exists()) {
                completedCount++;
                return;
              }
              const qSnap = await getDocs(
                query(
                  collection(
                    db,
                    'classrooms',
                    classroom.id,
                    'exercises',
                    exDoc.id,
                    'submissions',
                  ),
                  where('studentId', '==', user.uid),
                  limit(1),
                ),
              );
              if (!qSnap.empty) {
                completedCount++;
              }
            } catch (err) {
              console.warn('Error checking exercise submission:', err);
            }
          }),
        );
        const progressPct =
          totalEx > 0 ? Math.round((completedCount / totalEx) * 100) : 0;
        const tasksDue = Math.max(0, totalEx - completedCount);
        await setDoc(
          doc(db, 'users', user.uid, 'memberships', classroom.id),
          {
            progress: progressPct,
            tasks: tasksDue,
          },
          { merge: true },
        );
      } catch (e) {
        console.warn('Membership progress note:', e);
      }

      setSubmitted(true);
      setAlreadyCompleted(true);
    } catch (e: any) {
      console.error('Error submitting exercise:', e);
      setSubmitError(
        e?.message?.includes('permission')
          ? 'Missing or insufficient permissions. Please refresh your page and try again.'
          : e?.message || 'Error submitting exercise.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const progressPct = Math.round(
    ((currentIdx + 1) / (rawQuestions.length || 1)) * 100,
  );
  const studentResults = exercise.personalized ? myQuestionResults : computeSubmissionStats({ answers }, exercise).questionResults;
  const studentDifficultyBreakdown = summarizeDifficulty(studentResults);
  const studentCapability = capabilityFromResults(studentResults);

  return (
    <AppShell
      role={role || 'student'}
      user={user}
      onExit={onExit}
      active="classroom"
      classCount={1}
    >
      <div className="detail-top">
        <button onClick={onBack}>
          <ArrowLeft /> Back to {classroom.name}
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {isExam && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fde68a',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2rem 0.65rem',
                borderRadius: 99,
              }}
            >
              <Timer style={{ width: 12, height: 12 }} /> Exam
            </span>
          )}
          {isExam && !submitted && !alreadyCompleted && !isTeacher && examStarted && secondsRemaining !== null && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: secondsRemaining <= 60 ? '#fef2f2' : secondsRemaining <= 300 ? '#fffbeb' : '#111',
                color: secondsRemaining <= 60 ? '#dc2626' : secondsRemaining <= 300 ? '#b45309' : '#fff',
                border: `1px solid ${secondsRemaining <= 60 ? '#fca5a5' : secondsRemaining <= 300 ? '#fde68a' : '#111'}`,
                fontSize: '0.82rem',
                fontWeight: 800,
                padding: '0.25rem 0.75rem',
                borderRadius: 99,
                letterSpacing: '0.04em',
                boxShadow: secondsRemaining <= 60 ? '0 0 10px rgba(220, 38, 38, 0.35)' : undefined,
              }}
            >
              <Clock3 style={{ width: 14, height: 14 }} />
              {String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:
              {String(secondsRemaining % 60).padStart(2, '0')}
              {secondsRemaining <= 60 && <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>Ending soon!</span>}
            </span>
          )}
          {isTeacher && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#ede9fe',
                color: '#5b21b6',
                border: '1px solid #ddd6fe',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2rem 0.65rem',
                borderRadius: 99,
              }}
            >
              <Eye style={{ width: 12, height: 12 }} /> Teacher Preview Mode
            </span>
          )}
          {dueInfo.formatted && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: dueInfo.isPast
                  ? allowsLate
                    ? '#fef2f2'
                    : '#fee2e2'
                  : dueInfo.isUrgent
                    ? '#fef3c7'
                    : '#f3f4f6',
                color: dueInfo.isPast
                  ? allowsLate
                    ? '#991b1b'
                    : '#7f1d1d'
                  : dueInfo.isUrgent
                    ? '#92400e'
                    : '#374151',
                border: `1px solid ${dueInfo.isPast ? (allowsLate ? '#fecaca' : '#fca5a5') : dueInfo.isUrgent ? '#fde68a' : '#e5e7eb'}`,
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.2rem 0.65rem',
                borderRadius: 99,
              }}
            >
              {dueInfo.isPast ? (
                allowsLate ? (
                  <AlertCircle style={{ width: 12, height: 12 }} />
                ) : (
                  <Lock style={{ width: 12, height: 12 }} />
                )
              ) : (
                <Calendar style={{ width: 12, height: 12 }} />
              )}
              {dueInfo.isPast
                ? allowsLate
                  ? `Past Due · ${dueInfo.formatted}`
                  : `Closed · ${dueInfo.formatted}`
                : `Due ${dueInfo.formatted}`}
            </span>
          )}
          <span className="sdg-pill">
            {isTeacher
              ? `Question ${currentIdx + 1} of ${activeQuestions.length}`
              : submitted
                ? 'Completed'
                : isLateLocked
                  ? 'Closed'
                  : `Question ${currentIdx + 1} of ${activeQuestions.length}`}
          </span>
        </div>
      </div>

      <div className="classroom-title">
        <div>
          <span className="kicker">
            {isTeacher ? 'Exercise Preview' : 'Exercise Checkpoint'}
          </span>
          <h1>{exercise.title}</h1>
          <p>
            {classroom.name} · {classroom.subject}
          </p>
        </div>
      </div>

      {checkingExisting ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#777' }}>
          <LoaderCircle
            className="animate-spin"
            style={{ width: 32, height: 32, margin: '0 auto 1rem' }}
          />
          <p>{isTeacher ? 'Loading exercise preview…' : 'Loading exercise checkpoint…'}</p>
        </div>
      ) : submitted && !isTeacher ? (
        <div
          style={{
            background: '#fff',
            borderRadius: '24px',
            padding: '2.5rem',
            boxShadow: '0 0 0 1px #eeeae4',
            maxWidth: '780px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              background: '#d9f1e5',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 1.5rem',
              color: '#173e30',
            }}
          >
            <CheckCircle2 style={{ width: '36px', height: '36px' }} />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '0.8rem',
            }}
          >
            {isExam && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #fde68a',
                  padding: '0.35rem 0.9rem',
                  borderRadius: 99,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                <Timer style={{ width: 14, height: 14 }} /> Timed Exam Assessment
              </div>
            )}
            {autoSubmittedDueToTime && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: '#fff7ed',
                  color: '#c2410c',
                  border: '1px solid #fdba74',
                  padding: '0.35rem 0.9rem',
                  borderRadius: 99,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                <Clock3 style={{ width: 14, height: 14 }} /> Auto-Submitted (Time Expired)
              </div>
            )}
            {alreadyCompleted && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: '#e0f2fe',
                  color: '#0369a1',
                  padding: '0.35rem 0.9rem',
                  borderRadius: 99,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 style={{ width: 14, height: 14 }} /> Previously
                Completed · One Submission Only
              </div>
            )}
            {isLateSubmission && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: '#fee2e2',
                  color: '#b91c1c',
                  border: '1px solid #fca5a5',
                  padding: '0.35rem 0.9rem',
                  borderRadius: 99,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                <AlertCircle style={{ width: 14, height: 14 }} /> Submitted
                After Deadline
              </div>
            )}
          </div>
          <h2
            style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 0.5rem' }}
          >
            {alreadyCompleted
              ? isExam
                ? 'Exam Already Submitted'
                : 'Exercise Already Completed'
              : isExam
                ? autoSubmittedDueToTime
                  ? 'Exam Finished (Time is Up)'
                  : 'Exam Submitted Successfully!'
                : 'Exercise Completed!'}
          </h2>
          <p style={{ color: '#66786e', margin: '0 0 2rem' }}>
            {autoSubmittedDueToTime
              ? 'Your exam timer reached 00:00. Your completed answers have been automatically collected.'
              : alreadyCompleted
                ? isExam
                  ? 'You have already completed this exam (single attempt policy). Review your results below.'
                  : 'You have already answered this exercise. Review your results below.'
                : isExam
                  ? 'Your exam has been submitted and recorded. Here is your result breakdown.'
                  : 'Your answers have been submitted to your teacher.'}
          </p>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '1.2rem',
              margin: '1.5rem 0 2.5rem',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                background: '#f8faf7',
                borderRadius: '16px',
                padding: '1.2rem 1.6rem',
                minWidth: '130px',
              }}
            >
              <small
                style={{
                  color: '#778',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
              >
                Score
              </small>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#111' }}>
                {earnedScore}{' '}
                <span style={{ fontSize: '0.9rem', color: '#888' }}>
                  / {totalPoints}
                </span>
              </div>
            </div>
            <div
              style={{
                background: '#f8faf7',
                borderRadius: '16px',
                padding: '1.2rem 1.6rem',
                minWidth: '130px',
              }}
            >
              <small
                style={{
                  color: '#778',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
              >
                Mastery
              </small>
              <div
                style={{ fontSize: '2rem', fontWeight: 700, color: '#173e30' }}
              >
                {Math.round((earnedScore / (totalPoints || 1)) * 100)}%
              </div>
            </div>
            <div
              style={{
                background: '#f0fdf4',
                borderRadius: '16px',
                padding: '1.2rem 1.6rem',
                minWidth: '130px',
                border: '1px solid #bbf7d0',
              }}
            >
              <small
                style={{
                  color: '#15803d',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
              >
                Correct
              </small>
              <div
                style={{ fontSize: '2rem', fontWeight: 700, color: '#166534' }}
              >
                {totalCorrectState}
              </div>
            </div>
            <div
              style={{
                background: '#fef2f2',
                borderRadius: '16px',
                padding: '1.2rem 1.6rem',
                minWidth: '130px',
                border: '1px solid #fecaca',
              }}
            >
              <small
                style={{
                  color: '#b91c1c',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
              >
                Wrong
              </small>
              <div
                style={{ fontSize: '2rem', fontWeight: 700, color: '#991b1b' }}
              >
                {totalWrongState}
              </div>
            </div>
          </div>

          <div style={{ margin: '-1rem 0 2rem' }}>
            <p style={{ margin: '0 0 .7rem', fontWeight: 700 }}>Your capability: {studentCapability}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '.7rem' }}>
              {studentDifficultyBreakdown.map((item) => (
                <div key={item.difficulty} style={{ background: difficultyColour(item.difficulty), borderRadius: 12, padding: '.75rem', textAlign: 'left' }}>
                  <b style={{ textTransform: 'capitalize' }}>{item.difficulty}</b>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{item.totalAnswers ? `${item.accuracyRate}%` : '—'}</div>
                  <small>{item.accuracyRate >= 70 ? 'Strength' : item.totalAnswers ? 'Needs practice' : 'Not assessed'}</small>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: '1.5rem',
              textAlign: 'left',
              background: '#fcfbf9',
              border: '1px solid #eeeae4',
              borderRadius: '18px',
              padding: '1.4rem',
              marginBottom: '2rem',
            }}
          >
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                margin: '0 0 1rem',
                color: '#111',
              }}
            >
              Review Your Answers
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {activeQuestions.map((q, i) => {
                const userAns = answers[i] || '';
                const qRes = myQuestionResults.find((r) => r.questionIdx === i);
                const isRemarks = Boolean(qRes?.teacherRemarked);
                const isCorrect = qRes
                  ? qRes.isCorrect
                  : (() => {
                      const userALow = userAns.trim().toLowerCase();
                      const expALow = (q.answer || '').trim().toLowerCase();
                      return Boolean(
                        userALow &&
                          expALow &&
                          (userALow === expALow ||
                            expALow.includes(userALow) ||
                            userALow.includes(expALow)),
                      );
                    })();
                return (
                  <div
                    key={i}
                    style={{
                      borderBottom:
                        i < activeQuestions.length - 1
                          ? '1px solid #eeeae4'
                          : 'none',
                      paddingBottom: i < activeQuestions.length - 1 ? '1rem' : '0',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: '#777',
                        }}
                      >
                        Question 0{i + 1}
                        <span style={{ background: difficultyColour(q.difficulty || 'medium'), borderRadius: 999, padding: '2px 6px', marginLeft: 6 }}>{q.difficulty || 'medium'}</span>
                      </span>
                      {isRemarks ? (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: '#6d28d9',
                            background: '#ede9fe',
                            border: '1px solid #c4b5fd',
                            padding: '1px 7px',
                            borderRadius: 99,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Check style={{ width: 10, height: 10 }} /> Remarked Correct by Teacher
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: isCorrect ? '#15803d' : '#b91c1c',
                            background: isCorrect ? '#f0fdf4' : '#fef2f2',
                            border: `1px solid ${isCorrect ? '#bbf7d0' : '#fecaca'}`,
                            padding: '1px 7px',
                            borderRadius: 99,
                          }}
                        >
                          {isCorrect ? 'Correct' : 'Needs Review'}
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        margin: '0 0 6px',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        color: '#111',
                      }}
                    >
                      {q.question}
                    </p>
                    <div
                      style={{
                        fontSize: '0.82rem',
                        color: '#444',
                        background: '#fff',
                        border: '1px solid #e9e4dc',
                        borderRadius: 10,
                        padding: '8px 12px',
                        marginBottom: 4,
                      }}
                    >
                      <strong>Your answer:</strong>{' '}
                      {userAns || (
                        <em style={{ color: '#999' }}>No answer provided</em>
                      )}
                    </div>
                    {(qRes?.expectedAnswer || q.answer) && (
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: '#166534',
                          marginTop: 3,
                        }}
                      >
                        <strong>Expected answer:</strong> {qRes?.expectedAnswer || q.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Button onClick={onBack} className="primary-action">
            <ArrowLeft /> Return to Classroom
          </Button>
        </div>
      ) : isLateLocked ? (
        <div
          style={{
            background: '#fff',
            borderRadius: '24px',
            padding: '3rem 2rem',
            boxShadow: '0 0 0 1px #eeeae4',
            maxWidth: '640px',
            margin: '2rem auto',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              background: '#fee2e2',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 1.2rem',
              color: '#dc2626',
            }}
          >
            <Lock style={{ width: '32px', height: '32px' }} />
          </div>
          <h2
            style={{
              fontSize: '1.6rem',
              fontWeight: 600,
              margin: '0 0 0.5rem',
              color: '#111',
            }}
          >
            Submissions Closed
          </h2>
          <p
            style={{
              color: '#666',
              fontSize: '0.92rem',
              margin: '0 0 1.5rem',
              lineHeight: 1.5,
            }}
          >
            The deadline for this exercise was{' '}
            <strong>{dueInfo.formatted}</strong>. Your teacher has configured
            this exercise not to accept late submissions.
          </p>
          <Button onClick={onBack} className="primary-action">
            <ArrowLeft /> Back to Classroom
          </Button>
        </div>
      ) : !examStarted && !isTeacher ? (
        <div
          style={{
            background: '#fff',
            borderRadius: '24px',
            padding: '3rem 2rem',
            boxShadow: '0 0 0 1px #eeeae4',
            maxWidth: '680px',
            margin: '2rem auto',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              background: '#fef3c7',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 1.2rem',
              color: '#92400e',
            }}
          >
            <Timer style={{ width: '32px', height: '32px' }} />
          </div>

          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#92400e',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              padding: '3px 10px',
              borderRadius: 99,
              display: 'inline-block',
              marginBottom: '0.6rem',
            }}
          >
            Official Assessment · Timed Exam
          </span>

          <h2
            style={{
              fontSize: '1.8rem',
              fontWeight: 700,
              margin: '0 0 0.5rem',
              color: '#111',
            }}
          >
            {exercise.title}
          </h2>
          <p
            style={{
              color: '#666',
              fontSize: '0.92rem',
              margin: '0 auto 1.8rem',
              maxWidth: '520px',
              lineHeight: 1.5,
            }}
          >
            This exercise is configured in <strong>Exam Mode</strong>. Please review the rules below carefully before beginning.
          </p>

          <div
            style={{
              background: '#fbfaf7',
              border: '1px solid #eeeae4',
              borderRadius: '16px',
              padding: '1.2rem 1.4rem',
              textAlign: 'left',
              display: 'grid',
              gap: '0.9rem',
              marginBottom: '2rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clock3 style={{ width: 18, height: 18, color: '#b45309', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '0.88rem', color: '#111', display: 'block' }}>
                  Time Limit: {timeLimitMinutes} minutes
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#666' }}>
                  The countdown timer begins immediately once you click "Start Exam Now". When the timer reaches 00:00, your exam will <strong>automatically submit</strong>.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircle2 style={{ width: 18, height: 18, color: '#15803d', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '0.88rem', color: '#111', display: 'block' }}>
                  Single Attempt Only
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#666' }}>
                  You can only submit this exam once. Once submitted, you cannot retake the questions.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {allowPrevious ? (
                <Check style={{ width: 18, height: 18, color: '#15803d', flexShrink: 0 }} />
              ) : (
                <Lock style={{ width: 18, height: 18, color: '#dc2626', flexShrink: 0 }} />
              )}
              <div>
                <strong style={{ fontSize: '0.88rem', color: '#111', display: 'block' }}>
                  Navigation: {allowPrevious ? 'Rechecking Allowed' : 'Strict Sequential (No Backtracking)'}
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#666' }}>
                  {allowPrevious
                    ? 'You can navigate freely between questions to review or update your answers before submitting.'
                    : 'Once you submit or proceed past a question, you cannot return to change your answer.'}
                </span>
              </div>
            </div>

            {isShuffle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Shuffle style={{ width: 18, height: 18, color: '#4b5563', flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '0.88rem', color: '#111', display: 'block' }}>
                    Randomized Question Order
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: '#666' }}>
                    Questions are arranged in a randomized sequence for your assessment.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft /> Return to Classroom
            </Button>
            <Button
              className="primary-action"
              onClick={() => setExamStarted(true)}
              style={{
                background: '#111',
                padding: '0 24px',
                height: '44px',
                borderRadius: '12px',
                fontSize: '0.92rem',
                fontWeight: 700,
              }}
            >
              <Timer style={{ width: 16, height: 16, marginRight: 6 }} /> Start Exam Now ({timeLimitMinutes}m)
            </Button>
          </div>
        </div>
      ) : (
        <div className="classroom-layout">
          <section className="panel activity-panel">
            <div className="panel-head" style={{ marginBottom: '1rem' }}>
              <div>
                <span className="kicker">
                  {isExam ? 'Exam Question' : 'Question'} 0{currentIdx + 1} of 0{activeQuestions.length}
                </span>
                <h2 style={{ fontSize: '1.3rem', marginTop: '0.2rem' }}>
                  {isTeacher ? 'Question Preview' : isExam ? 'Answer the exam question' : 'Solve the problem'}
                </h2>
              </div>
              <span
                style={{
                  background: difficultyColour(currentQ.difficulty || 'medium'),
                  padding: '0.3rem 0.8rem',
                  borderRadius: '99px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'capitalize',
                  marginLeft: 'auto',
                  marginRight: '.5rem',
                }}
              >
                {currentQ.difficulty || 'medium'}
              </span>
              <span
                style={{
                  background: '#f1ece5',
                  padding: '0.3rem 0.8rem',
                  borderRadius: '99px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                {currentQ.points || 1} Points
              </span>
            </div>

            <div
              style={{
                background: '#fbfaf7',
                border: '1px solid #eeeae4',
                borderRadius: '18px',
                padding: '1.5rem',
                marginBottom: '1.5rem',
              }}
            >
              <p
                style={{
                  fontSize: '1.15rem',
                  lineHeight: '1.6',
                  margin: 0,
                  fontWeight: 500,
                  color: '#111',
                }}
              >
                {currentQ.question}
              </p>
              {currentQ.enhanced && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginTop: '1rem',
                    background: '#eef5dc',
                    padding: '0.7rem 1rem',
                    borderRadius: '12px',
                    color: '#385b20',
                    fontSize: '0.8rem',
                  }}
                >
                  <Sparkles style={{ width: '16px', height: '16px' }} />
                  <span>
                    <strong>Guided Reasoning:</strong> Read carefully and show
                    how you reached your answer.
                  </span>
                </div>
              )}
            </div>

            {isTeacher ? (
              <>
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '18px',
                    padding: '1.25rem 1.5rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#15803d',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <CheckCircle2 style={{ width: 16, height: 16, color: '#16a34a' }} />
                    Correct Answer
                  </div>
                  <div
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: '#14532d',
                      background: '#fff',
                      padding: '0.85rem 1.1rem',
                      borderRadius: '12px',
                      border: '1px solid #dcfce7',
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}
                  >
                    {currentQ.answer ? (
                      currentQ.answer
                    ) : (
                      <span style={{ color: '#888', fontStyle: 'italic', fontWeight: 400 }}>
                        No answer specified for this question.
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.75rem',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                        Student Submissions
                      </h3>
                      <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#666' }}>
                        Answers submitted for Question 0{currentIdx + 1}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span
                        style={{
                          background: '#f1ece5',
                          padding: '3px 10px',
                          borderRadius: 99,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#444',
                        }}
                      >
                        {allSubmissions.length} submission{allSubmissions.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Filter tabs */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {(['all', 'needs_review', 'correct'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setFilterStatus(tab)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 99,
                          border: filterStatus === tab ? '1.5px solid #173e30' : '1.5px solid #e0dbd4',
                          background: filterStatus === tab ? '#173e30' : '#fff',
                          color: filterStatus === tab ? '#fff' : '#555',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {tab === 'all' ? 'All' : tab === 'needs_review' ? 'Needs Review' : 'Correct'}
                      </button>
                    ))}
                  </div>

                  {loadingSubmissions ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#777' }}>
                      <LoaderCircle
                        className="animate-spin"
                        style={{ width: 22, height: 22, margin: '0 auto 0.5rem' }}
                      />
                      <small>Loading student responses…</small>
                    </div>
                  ) : allSubmissions.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '2.5rem 1.5rem',
                        background: '#fcfbf9',
                        borderRadius: 16,
                        border: '1px dashed #ded8cf',
                        color: '#777',
                      }}
                    >
                      <Users
                        style={{ width: 32, height: 32, margin: '0 auto 0.6rem', opacity: 0.5 }}
                      />
                      <p style={{ margin: 0, fontWeight: 600, color: '#333' }}>
                        No student answers yet
                      </p>
                      <small style={{ display: 'block', marginTop: '0.3rem', color: '#888' }}>
                        When enrolled students complete this exercise, their responses and grading will appear here.
                      </small>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {allSubmissions
                        .filter((sub) => {
                          const res =
                            sub.questionResults?.find((r) => r.questionIdx === currentIdx) ||
                            computeSubmissionStats(sub, exercise).questionResults[currentIdx];
                          const studentAns = sub.answers?.[currentIdx] ?? res?.studentAnswer ?? '';
                          const hasAns = Boolean(studentAns && studentAns.trim().length > 0);
                          const isC = res ? res.isCorrect : false;
                          if (filterStatus === 'needs_review') return hasAns && !isC;
                          if (filterStatus === 'correct') return isC;
                          return true;
                        })
                        .map((sub) => {
                        const res =
                          sub.questionResults?.find((r) => r.questionIdx === currentIdx) ||
                          computeSubmissionStats(sub, exercise).questionResults[currentIdx];
                        const studentAns = sub.answers?.[currentIdx] ?? res?.studentAnswer ?? '';
                        const isCorrect = res ? res.isCorrect : false;
                        const isTeacherRemarked = Boolean(res?.teacherRemarked);
                        const hasAnswered = Boolean(studentAns && studentAns.trim().length > 0);
                        const subId = sub.studentId || sub.id;
                        const isRemarkingThis = remarkingStudentId === `${subId}-${currentIdx}`;

                        return (
                          <div
                            key={sub.id || sub.studentId}
                            style={{
                              background: '#fff',
                              border: isTeacherRemarked ? '1px solid #c4b5fd' : '1px solid #eeeae4',
                              borderRadius: 14,
                              padding: '0.9rem 1.1rem',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '0.5rem',
                                flexWrap: 'wrap',
                                gap: '8px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  className="avatar"
                                  style={{ width: 28, height: 28, fontSize: '0.65rem' }}
                                >
                                  {initials(sub.studentName || 'Student')}
                                </span>
                                <div>
                                  <strong style={{ fontSize: '0.85rem' }}>
                                    {sub.studentName || 'Student'}
                                  </strong>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {sub.isLate && (
                                  <span
                                    style={{
                                      background: '#fee2e2',
                                      color: '#b91c1c',
                                      border: '1px solid #fca5a5',
                                      fontSize: '0.65rem',
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                    }}
                                  >
                                    LATE
                                  </span>
                                )}
                                {hasAnswered ? (
                                  isTeacherRemarked ? (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        color: '#6d28d9',
                                        background: '#ede9fe',
                                        border: '1px solid #c4b5fd',
                                        padding: '2px 8px',
                                        borderRadius: 99,
                                      }}
                                    >
                                      <Check style={{ width: 11, height: 11 }} />
                                      Remarked Correct
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        color: isCorrect ? '#15803d' : '#b91c1c',
                                        background: isCorrect ? '#f0fdf4' : '#fef2f2',
                                        border: `1px solid ${isCorrect ? '#bbf7d0' : '#fecaca'}`,
                                        padding: '2px 8px',
                                        borderRadius: 99,
                                      }}
                                    >
                                      {isCorrect ? (
                                        <Check style={{ width: 11, height: 11 }} />
                                      ) : (
                                        <X style={{ width: 11, height: 11 }} />
                                      )}
                                      {isCorrect ? 'Correct' : 'Needs Review'}
                                    </span>
                                  )
                                ) : (
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      color: '#888',
                                      background: '#f3f4f6',
                                      padding: '2px 8px',
                                      borderRadius: 99,
                                    }}
                                  >
                                    Not answered
                                  </span>
                                )}
                              </div>
                            </div>

                            <div
                              style={{
                                background: '#fcfbf9',
                                border: '1px solid #f0ede8',
                                borderRadius: 10,
                                padding: '0.7rem 0.9rem',
                                fontSize: '0.85rem',
                                color: '#222',
                                lineHeight: 1.5,
                              }}
                            >
                              {hasAnswered ? (
                                studentAns
                              ) : (
                                <em style={{ color: '#999', fontSize: '0.8rem' }}>
                                  No answer provided for this question
                                </em>
                              )}
                            </div>

                            {/* Remark action — only show when student provided an answer */}
                            {hasAnswered && (
                              <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'flex-end' }}>
                                {isTeacherRemarked ? (
                                  <button
                                    disabled={isRemarkingThis}
                                    onClick={() => handleTeacherRemark(sub, currentIdx, false)}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      padding: '4px 12px',
                                      borderRadius: 99,
                                      border: '1px solid #c4b5fd',
                                      background: '#ede9fe',
                                      color: '#6d28d9',
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      cursor: isRemarkingThis ? 'not-allowed' : 'pointer',
                                      opacity: isRemarkingThis ? 0.6 : 1,
                                    }}
                                  >
                                    {isRemarkingThis ? (
                                      <LoaderCircle className="animate-spin" style={{ width: 11, height: 11 }} />
                                    ) : (
                                      <X style={{ width: 11, height: 11 }} />
                                    )}
                                    Undo Remark
                                  </button>
                                ) : (
                                  !isCorrect && (
                                    <button
                                      disabled={isRemarkingThis}
                                      onClick={() => handleTeacherRemark(sub, currentIdx, true)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '4px 12px',
                                        borderRadius: 99,
                                        border: '1px solid #173e30',
                                        background: '#173e30',
                                        color: '#fff',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        cursor: isRemarkingThis ? 'not-allowed' : 'pointer',
                                        opacity: isRemarkingThis ? 0.6 : 1,
                                      }}
                                    >
                                      {isRemarkingThis ? (
                                        <LoaderCircle className="animate-spin" style={{ width: 11, height: 11 }} />
                                      ) : (
                                        <Check style={{ width: 11, height: 11 }} />
                                      )}
                                      Remark as Correct
                                    </button>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '2rem',
                    paddingTop: '1.5rem',
                    borderTop: '1px solid #eeeae4',
                  }}
                >
                  <Button
                    variant="outline"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
                  >
                    <ArrowLeft /> Previous Question
                  </Button>
                  {currentIdx < activeQuestions.length - 1 ? (
                    <Button onClick={() => setCurrentIdx((prev) => prev + 1)}>
                      Next Question <ArrowRight />
                    </Button>
                  ) : (
                    <Button onClick={onBack} className="primary-action">
                      <Check /> Done Previewing
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                {currentQ.type === 'multiple_choice' ? (
                  <div style={{ display: 'grid', gap: '0.65rem', marginBottom: '1rem' }}>
                    {(currentQ.choices || []).map((choice) => (
                      <label key={choice} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.8rem 1rem', border: '1px solid #eeeae4', borderRadius: '12px', cursor: submitted || alreadyCompleted ? 'default' : 'pointer' }}>
                        <input type="radio" name={`question-${currentIdx}`} value={choice} checked={(answers[currentIdx] || '') === choice} onChange={(event) => handleAnswer(event.target.value)} disabled={submitted || alreadyCompleted} />
                        <span>{choice}</span>
                      </label>
                    ))}
                  </div>
                ) : <label
                  className="form-label"
                  style={{
                    fontSize: '0.9rem',
                    marginBottom: '0.5rem',
                    display: 'block',
                  }}
                >
                  Your Answer
                  <Textarea
                    rows={4}
                    placeholder="Type your answer or reasoning here..."
                    value={answers[currentIdx] || ''}
                    onChange={(e) => handleAnswer(e.target.value)}
                    style={{
                      marginTop: '0.4rem',
                      borderRadius: '14px',
                      fontSize: '1rem',
                    }}
                  />
                </label>}

                {submitError && (
                  <div
                    style={{
                      background: '#fde8e8',
                      color: '#c81e1e',
                      padding: '0.75rem 1rem',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      marginTop: '1rem',
                    }}
                  >
                    {submitError}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '2rem',
                    paddingTop: '1.5rem',
                    borderTop: '1px solid #eeeae4',
                  }}
                >
                  <Button
                    variant="outline"
                    disabled={currentIdx === 0 || !allowPrevious}
                    onClick={() => {
                      if (!allowPrevious) return;
                      setCurrentIdx((prev) => Math.max(0, prev - 1));
                    }}
                    title={!allowPrevious ? 'Exam rule: Returning to previous questions is locked' : undefined}
                    style={!allowPrevious ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    <ArrowLeft /> Previous {!allowPrevious && '(Locked)'}
                  </Button>
                  {currentIdx < activeQuestions.length - 1 ? (
                    <Button onClick={() => setCurrentIdx((prev) => prev + 1)}>
                      Next Question <ArrowRight />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => submitExercise(false)}
                      disabled={submitting}
                      className="primary-action"
                    >
                      {submitting ? <LoaderCircle /> : <Check />} Submit Exercise
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>

          <aside className="panel class-stats">
            <span className="kicker">
              {isTeacher ? 'Exercise Overview' : isExam ? 'Exam Progress' : 'Progress'}
            </span>
            <h2>
              {isTeacher ? `${activeQuestions.length} Questions` : `${progressPct}%`}
            </h2>
            {!isTeacher && <Progress value={progressPct} />}
            {isTeacher && (
              <p style={{ fontSize: '0.78rem', color: '#666', margin: '4px 0 0' }}>
                {allSubmissions.length} student submission{allSubmissions.length !== 1 ? 's' : ''} received
              </p>
            )}
            {!isTeacher && isExam && !allowPrevious && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '6px 10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  fontSize: '0.72rem',
                  color: '#991b1b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  lineHeight: 1.4,
                }}
              >
                <Lock style={{ width: 13, height: 13, flexShrink: 0 }} />
                <span>Strict sequential mode: Cannot return to previous questions.</span>
              </div>
            )}
            <div
              style={{ marginTop: '1.5rem', display: 'grid', gap: '0.5rem' }}
            >
              {activeQuestions.map((q, i) => {
                const isNavLocked = !isTeacher && isExam && !allowPrevious && i < currentIdx;
                const correctCount = isTeacher
                  ? allSubmissions.filter((s) => {
                      const res =
                        s.questionResults?.find((r) => r.questionIdx === i) ||
                        computeSubmissionStats(s, exercise).questionResults[i];
                      return res?.isCorrect;
                    }).length
                  : 0;

                return (
                  <button
                    key={i}
                    disabled={isNavLocked}
                    onClick={() => {
                      if (isNavLocked) return;
                      setCurrentIdx(i);
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.7rem 1rem',
                      borderRadius: '12px',
                      border: '1px solid',
                      borderColor: currentIdx === i ? '#111' : '#eeeae4',
                      background:
                        currentIdx === i
                          ? '#fff'
                          : isNavLocked
                            ? '#f5f5f4'
                            : !isTeacher && answers[i]?.trim()
                              ? '#eef2ee'
                              : '#fcfbf9',
                      cursor: isNavLocked ? 'not-allowed' : 'pointer',
                      opacity: isNavLocked ? 0.65 : 1,
                      textAlign: 'left',
                    }}
                    title={isNavLocked ? 'Exam rule: Cannot return to past questions' : undefined}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: currentIdx === i ? 700 : 500,
                          display: 'block',
                        }}
                      >
                        Question 0{i + 1}
                      </span>
                      {isTeacher && allSubmissions.length > 0 && (
                        <span style={{ fontSize: '0.7rem', color: '#777' }}>
                          {correctCount}/{allSubmissions.length} correct
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <small
                        style={{
                          background: difficultyColour(q.difficulty || 'medium'),
                          borderRadius: 999,
                          padding: '2px 6px',
                          textTransform: 'capitalize',
                        }}
                      >
                        {q.difficulty || 'medium'}
                      </small>
                      {!isTeacher &&
                        (answers[i]?.trim() ? (
                          <Check
                            style={{
                              width: '14px',
                              height: '14px',
                              color: '#173e30',
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: '#888' }}>
                            Pending
                          </span>
                        ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function QuizBuilder({
  user,
  classroom,
  initialExercise,
  onBack,
  onExit,
}: {
  user: User;
  classroom: ClassroomData;
  initialExercise?: any | null;
  onBack: () => void;
  onExit: () => void;
}) {
  const isEditing = Boolean(initialExercise);
  const [title, setTitle] = useState(initialExercise?.title || '');
  const [titleError, setTitleError] = useState('');
  const [personalized, setPersonalized] = useState(Boolean(initialExercise?.personalized));
  const [previousExercises, setPreviousExercises] = useState<Array<{ id: string; title: string }>>([]);
  const [sourceExerciseId, setSourceExerciseId] = useState('');
  const [personalType, setPersonalType] = useState<'short_answer' | 'multiple_choice'>('short_answer');
  const [personalDraftId, setPersonalDraftId] = useState('');
  const [personalSets, setPersonalSets] = useState<Array<{ key: string; label: string; percentage: number | null; weakTopics: string[]; questions: QuestionItem[] }>>([]);
  const [activeSet, setActiveSet] = useState('');
  const [personalEstimate, setPersonalEstimate] = useState<{ credits: number; quotaEnabled: boolean; sets: number; students: number; skipped: string[]; focusCount: number } | null>(null);
  const [personalGenerationId, setPersonalGenerationId] = useState('');
  const [personalProgress, setPersonalProgress] = useState('');
  const [personalError, setPersonalError] = useState('');
  const [savedPersonalDrafts, setSavedPersonalDrafts] = useState<Array<{ id: string; title?: string; deadline?: string; allowLateSubmissions?: boolean; variants: any[]; status?: string; storageVersion?: number; error?: string }>>([]);
  const [deadline, setDeadline] = useState(initialExercise?.deadline || '');
  const [allowLateSubmissions, setAllowLateSubmissions] = useState(
    initialExercise ? initialExercise.allowLateSubmissions !== false : true,
  );
  const [isExam, setIsExam] = useState(Boolean(initialExercise?.isExam));
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(
    initialExercise?.timeLimitMinutes ? Number(initialExercise.timeLimitMinutes) : 30,
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    Boolean(initialExercise?.shuffleQuestions),
  );
  const [allowPrevious, setAllowPrevious] = useState(
    initialExercise ? initialExercise.allowPrevious !== false : true,
  );
  const [questions, setQuestions] = useState<QuestionItem[]>(() => {
    if (initialExercise?.questions?.length) {
      return initialExercise.questions.map((q: any, idx: number) => ({
        id: q.id || String(idx + 1),
        question: q.question || '',
        answer: q.answer || '',
        type: q.type === 'multiple_choice' ? 'multiple_choice' : 'short_answer',
        choices: Array.isArray(q.choices) ? q.choices : [],
        markingMode: q.markingMode === 'manual' ? 'manual' : 'automatic',
        points: Number(q.points) || 2,
        enhanced: Boolean(q.enhanced),
        difficulty: q.difficulty || 'medium',
        topic: q.topic || '',
        subtopic: q.subtopic || '',
        skills: q.skills || [],
        tagIds: q.tagIds || [],
        taggingConfidence: q.taggingConfidence,
      }));
    }
    if (initialExercise?.question) {
      return [
        {
          id: '1',
          question: initialExercise.question,
          answer: initialExercise.answer || '',
          type: 'short_answer',
          choices: [],
          markingMode: 'automatic',
          points: 2,
          enhanced: Boolean(initialExercise.enhanced),
          difficulty: 'medium',
          topic: '',
          subtopic: '',
          skills: [],
        },
      ];
    }
    return [
      {
        id: '1',
        question: 'Solve for x: 3x + 5 = 20.',
        answer: 'x = 5',
        type: 'short_answer',
        choices: [],
        markingMode: 'automatic',
        points: 2,
        enhanced: false,
        topic: '',
        subtopic: '',
        skills: [],
      },
    ];
  });
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [questionCount, setQuestionCount] = useState(
    initialExercise?.questions?.length || 5,
  );
  const [imageCount, setImageCount] = useState(0);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>(
    initialExercise?.questions?.[0]?.difficulty || 'medium',
  );
  const [generating, setGenerating] = useState(false);
  const quota = useAiQuota(user);
  const [quickGenerateIndex, setQuickGenerateIndex] = useState<number | null>(null);
  const [quickPrompt, setQuickPrompt] = useState('');
  const [quickGenerating, setQuickGenerating] = useState(false);
  const [quickGenerateError, setQuickGenerateError] = useState('');
  const [classroomTags, setClassroomTags] = useState<Array<{ id: string; kind: string; label: string }>>([]);

  useEffect(() => onSnapshot(query(collection(db, 'personalizedDrafts'), where('ownerId', '==', user.uid)), snapshot => {
    setSavedPersonalDrafts(snapshot.docs.filter(d => d.get('classroomId') === classroom.id && d.get('status') !== 'published').map(d => ({ id: d.id, ...d.data(), variants: d.get('variants') })));
  }, () => {}), [classroom.id, user.uid]);

  const loadPersonalDraft = async (draftId: string) => {
    const saved = await getDoc(doc(db, 'personalizedDrafts', draftId));
    if (!saved.exists()) throw new Error('Draft unavailable.');
    if (saved.get('status') === 'generating') { setPersonalGenerationId(draftId); setGenerating(true); return; }
    if (saved.get('status') === 'failed') throw new Error(saved.get('error') || 'AI generation failed. Generate another draft to retry.');
    const variants = saved.get('storageVersion') === 2
      ? (await getDocs(collection(db, 'personalizedDrafts', draftId, 'sets'))).docs.map(d => d.data()) as typeof personalSets
      : saved.get('variants') as typeof personalSets;
    variants.sort((a,b) => a.key === 'shared' ? -1 : b.key === 'shared' ? 1 : a.label.localeCompare(b.label));
    if (!variants.length) throw new Error('The AI draft does not contain questions yet.');
    setPersonalDraftId(draftId); setPersonalSets(variants); setActiveSet(variants[0].key); setQuestions(variants[0].questions);
    setQuestionCount(saved.get('questionCount')); setSourceExerciseId(saved.get('sourceId'));
    setTitle((current: string) => saved.get('title') || current); setDeadline(saved.get('deadline') || ''); setAllowLateSubmissions(saved.get('allowLateSubmissions') !== false);
  };

  useEffect(() => {
    if (!personalGenerationId) return;
    return onSnapshot(doc(db, 'personalizedDrafts', personalGenerationId), snapshot => {
      setPersonalProgress(`${snapshot.get('completedSets') || 0} / ${snapshot.get('totalSets') || 0} question sets processed. You can leave this page and resume the draft later.`);
      if (snapshot.get('status') === 'draft') {
        setPersonalGenerationId(''); setGenerating(false);
        void loadPersonalDraft(snapshot.id).then(() => toast.add({ title: 'Personalized drafts ready', description: 'Review each AI-generated set before publishing.', type: 'success', timeout: 8000 })).catch(e => setPersonalError(friendlyError(e)));
      } else if (snapshot.get('status') === 'failed') {
        setPersonalError(snapshot.get('error') || 'AI generation failed. Please try again.'); setPersonalGenerationId(''); setGenerating(false);
      }
    }, e => { setPersonalError(friendlyError(e)); setGenerating(false); });
  }, [personalGenerationId]);

  useEffect(() => onSnapshot(collection(db, 'classrooms', classroom.id, 'exercises'), snapshot => {
    const list = snapshot.docs.filter(d => d.id !== initialExercise?.id).sort((a,b) => (b.get('createdAt')?.toMillis?.() || 0) - (a.get('createdAt')?.toMillis?.() || 0)).map(d => ({ id: d.id, title: String(d.get('title') || 'Untitled') }));
    setPreviousExercises(list);
    setSourceExerciseId(current => current || list[0]?.id || '');
  }), [classroom.id, initialExercise?.id]);

  useEffect(() => {
    if (!personalized || !sourceExerciseId || personalDraftId) return;
    let active = true;
    setPersonalEstimate(null); setPersonalError('');
    httpsCallable(functions, 'generatePersonalizedExercise')({ classroomId: classroom.id, sourceId: sourceExerciseId, questionCount: Number(questionCount), preview: true })
      .then(r => { if (active) setPersonalEstimate(r.data as any); })
      .catch(e => { if (active) setPersonalError(friendlyError(e)); });
    return () => { active = false; };
  }, [personalized, sourceExerciseId, questionCount, personalDraftId, classroom.id]);

  const generatePersonalized = async () => {
    setGenerating(true); setPersonalError('');
    const notice = toast.add({ title: 'Creating personalized practice', description: 'AI is generating the shared set and individual weak-topic sets.', type: 'info', timeout: 0 });
    try {
      const r = await httpsCallable(functions, 'generatePersonalizedExercise', { timeout: 540000 })({ classroomId: classroom.id, sourceId: sourceExerciseId, questionCount: Number(questionCount), prompt: aiPrompt, questionType: personalType });
      const draft = r.data as { draftId: string };
      setPersonalGenerationId(draft.draftId);
      toast.add({ title: 'AI generation started', description: 'Your question sets are generating in the background. You can resume this draft later.', type: 'success', timeout: 8000 });
    } catch (e) { setPersonalError(friendlyError(e)); }
    finally { toast.close(notice); setGenerating(false); }
  };

  const switchPersonalSet = (key: string) => {
    const saved = personalSets.map(v => v.key === activeSet ? { ...v, questions } : v);
    setPersonalSets(saved); setActiveSet(key); setQuestions(saved.find(v => v.key === key)!.questions);
  };

  useEffect(() => onSnapshot(collection(db, 'classrooms', classroom.id, 'tags'), (snapshot) => {
    setClassroomTags(snapshot.docs.map((item) => ({ id: item.id, kind: String(item.get('kind') || 'topic'), label: String(item.get('label') || '') })).filter((item) => item.label));
  }), [classroom.id]);

  const addSourceFiles = (incoming: File[]) => {
    const supported = /\.(pdf|pptx|docx|md|txt|rtf|odp|odt)$/i;
    setSourceFiles((current) => [...current, ...incoming.filter((file) => supported.test(file.name))].slice(0, 5));
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => addSourceFiles(Array.from(event.target.files ?? []));
  const onFileDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); addSourceFiles(Array.from(event.dataTransfer.files)); };

  const addQuestion = () => {
    if (personalized) return;
    if (questions.length >= 15) return;
    setQuestions((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2, 9),
        question: '',
        answer: '',
        type: 'short_answer',
        choices: [],
        markingMode: 'automatic',
        points: 2,
        enhanced: false,
        topic: '',
        subtopic: '',
        skills: [],
      },
    ]);
  };

  const updateQuestion = (
    index: number,
    field: keyof QuestionItem,
    value: any,
  ) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)),
    );
  };

  const removeQuestion = (index: number) => {
    if (personalized) return;
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const enhanceQuestion = async (index: number) => {
    updateQuestion(index, 'loading', true);
    setAiMessage('');
    try {
      const result = await httpsCallable(functions, 'enhanceStandaloneQuestion')({
        question: questions[index]?.question,
        answer: questions[index]?.answer,
        language: 'English',
      });
      const enhanced = (result.data as { question: { question: string; correctAnswer: string } }).question;
      setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, question: enhanced.question, answer: enhanced.correctAnswer, enhanced: true, loading: false } : question));
    } catch (error) {
      updateQuestion(index, 'loading', false);
      setAiMessage(error instanceof Error ? error.message : 'AI enhancement failed.');
    }
  };

  const generateSingleQuestion = async () => {
    if (quickGenerateIndex === null) return;
    if (quota.questionsUsed >= 15) {
      setQuickGenerateError('Your weekly AI question quota has been used. Check your profile dashboard for the next full reset time.');
      return;
    }
    setQuickGenerating(true);
    setQuickGenerateError('');
    try {
      const creation = await httpsCallable(functions, 'createQuizGenerationJob')({
        classroomId: classroom.id,
        title: title.trim() || `${classroom.subject} practice`,
        prompt: quickPrompt.trim() || `Create one original ${classroom.subject} practice question with a clear answer.`,
        materialIds: [],
        questionCount: 1,
        imageCount: 0,
        imageMode: 'none',
        subject: classroom.subject,
        language: 'English',
        difficulty,
        questionTypes: ['short_answer'],
        learningObjectives: [],
      });
      const jobId = (creation.data as { jobId: string }).jobId;
      const job = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const unsubscribe = onSnapshot(doc(db, 'quizJobs', jobId), (snapshot) => {
          const value = snapshot.data();
          if (value?.status === 'completed') { unsubscribe(); resolve(value); }
          if (value?.status === 'failed') { unsubscribe(); reject(new Error(String(value.error || 'Generation failed.'))); }
        }, reject);
      });
      const draft = await getDoc(doc(db, 'quizDrafts', String(job.draftId)));
      const generated = (draft.data()?.questions ?? [])[0] as { question?: string; correctAnswer?: string; type?: 'multiple_choice' | 'short_answer'; choices?: string[]; difficulty?: Difficulty; topic?: string; subtopic?: string; skills?: string[]; tagIds?: string[]; taggingConfidence?: 'high' | 'medium' | 'low' } | undefined;
      if (!generated?.question) throw new Error('No question was generated. Please try again.');
      setQuestions((current) => current.map((question, index) => index === quickGenerateIndex ? { ...question, question: generated.question || '', answer: generated.correctAnswer || '', type: generated.type === 'multiple_choice' ? 'multiple_choice' : 'short_answer', choices: generated.choices || [], markingMode: generated.type === 'multiple_choice' ? 'automatic' : question.markingMode || 'automatic', difficulty: generated.difficulty, topic: generated.topic || '', subtopic: generated.subtopic || '', skills: generated.skills || [], tagIds: generated.tagIds || [], taggingConfidence: generated.taggingConfidence, enhanced: true } : question));
      setQuickGenerateIndex(null);
      setQuickPrompt('');
    } catch (error) {
      setQuickGenerateError(error instanceof Error ? error.message : 'AI generation failed.');
    } finally {
      setQuickGenerating(false);
    }
  };

  const hasEnhancedAny = questions.some((q) => q.enhanced);
  const isValid = title.trim() && questions.some((q) => q.question.trim()) && (!personalized || Boolean(personalDraftId));
  const generateWithAi = async () => {
    const remainingQuestions = Math.max(0, 15 - quota.questionsUsed);
    const remainingImages = Math.max(0, 5 - quota.imagesUsed);
    if (!aiPrompt.trim() && sourceFiles.length === 0) {
      toast.add({ title: 'Add quiz content', description: 'Enter instructions or attach at least one source file.', type: 'warning' });
      return;
    }
    if (questionCount > remainingQuestions || imageCount > remainingImages) {
      toast.add({ title: 'Quota exceeded', description: 'This request is above your remaining shared AI quota.', type: 'warning' });
      return;
    }
    setGenerating(true);
    const loadingToastId = toast.add({ title: 'Preparing your quiz', description: 'Uploading and checking your learning materials…', type: 'loading', timeout: 0 });
    try {
      const materialIds: string[] = [];
      for (const file of sourceFiles) {
        const registration = await httpsCallable(functions, 'registerMaterial')({ classroomId: classroom.id, fileName: file.name, contentType: file.type || 'text/plain', sizeBytes: file.size });
        const material = registration.data as { materialId: string; storagePath: string };
        await uploadBytes(ref(storage, material.storagePath), file, { contentType: file.type || 'text/plain' });
        materialIds.push(material.materialId);
      }
      toast.update(loadingToastId, { title: 'Gemini is creating your draft', description: `Generating ${questionCount} editable question${questionCount === 1 ? '' : 's'}…`, type: 'loading', timeout: 0 });
      const creation = await httpsCallable(functions, 'createQuizGenerationJob')({
        classroomId: classroom.id,
        title: title.trim() || 'AI-generated exercise',
        prompt: aiPrompt.trim(),
        materialIds,
        questionCount,
        imageCount,
        imageMode: imageCount > 0 ? 'generate' : 'none',
        subject: classroom.subject,
        language: 'English',
        difficulty,
        questionTypes: ['multiple_choice', 'short_answer'],
        learningObjectives: [],
      });
      const jobId = (creation.data as { jobId: string }).jobId;
      const job = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const unsubscribe = onSnapshot(doc(db, 'quizJobs', jobId), (snapshot) => {
          const value = snapshot.data();
          if (value?.status === 'completed') { unsubscribe(); resolve(value); }
          if (value?.status === 'failed') { unsubscribe(); reject(new Error(String(value.error || 'Generation failed.'))); }
        }, reject);
      });
      const draft = await getDoc(doc(db, 'quizDrafts', String(job.draftId)));
      const generated = (draft.data()?.questions ?? []) as Array<{ id?: string; question: string; correctAnswer: string; type?: 'multiple_choice' | 'short_answer'; choices?: string[]; difficulty?: Difficulty; topic?: string; subtopic?: string; skills?: string[]; tagIds?: string[]; taggingConfidence?: 'high' | 'medium' | 'low' }>;
      setQuestions(generated.map((question, index) => ({ id: question.id || `ai-${index}`, question: question.question, answer: question.correctAnswer, type: question.type === 'multiple_choice' ? 'multiple_choice' : 'short_answer', choices: question.choices || [], markingMode: question.type === 'multiple_choice' ? 'automatic' : 'automatic', points: 2, enhanced: true, difficulty: question.difficulty, topic: question.topic || '', subtopic: question.subtopic || '', skills: question.skills || [], tagIds: question.tagIds || [], taggingConfidence: question.taggingConfidence })));
      if (!title.trim() && draft.data()?.title) setTitle(String(draft.data()?.title));
      const inferredLevel = String(draft.data()?.level || 'General education');
      toast.close(loadingToastId);
      toast.add({ title: 'Draft ready', description: `${inferredLevel} · ${generated.length} questions${imageCount ? ` · ${imageCount} images` : ''}. Review everything before publishing.`, type: 'success', timeout: 8000 });
    } catch (error) {
      toast.close(loadingToastId);
      const details = aiErrorDetails(error);
      toast.add({
        title: `Generation failed · ${details.code}`,
        description: details.message,
        type: 'error',
        timeout: 0,
        priority: 'high',
        actionProps: {
          children: <><Copy /> Copy details</>,
          onClick: () => void navigator.clipboard.writeText(details.copyText),
        },
      });
    } finally {
      setGenerating(false);
    }
  };

  const publish = async () => {
    if (personalized) {
      if (!personalDraftId || !title.trim()) { setPersonalError('Generate and review the personalized draft, and enter a title first.'); return; }
      setPublishing(true);
      try {
        const variants = personalSets.map(v => ({ key: v.key, questions: (v.key === activeSet ? questions : v.questions).map(q => ({ ...q, type: q.type || 'short_answer', markingMode: q.markingMode || 'automatic', difficulty: q.difficulty || 'medium' })) }));
        await httpsCallable(functions, 'publishPersonalizedExercise')({ draftId: personalDraftId, title: title.trim(), deadline: deadline || null, allowLateSubmissions, variants });
        setPublished(true); onBack();
      } catch (e) { setPersonalError(friendlyError(e)); }
      finally { setPublishing(false); }
      return;
    }
    if (!title.trim()) {
      setTitleError('Please enter an exercise name before saving.');
      return;
    }
    if (!questions.some((q) => q.question.trim())) return;
    setPublishing(true);
    try {
      const questionPayload = questions.map((q) => ({
        question: q.question.trim(),
        answer: q.answer.trim(),
        points: q.points,
        enhanced: q.enhanced,
        type: q.type || 'short_answer',
        ...(q.type === 'multiple_choice' ? { choices: (q.choices || []).map(cleanTag).filter(Boolean) } : {}),
        markingMode: q.type === 'multiple_choice' ? 'automatic' : (q.markingMode || 'automatic'),
        difficulty: q.difficulty || 'medium',
        topic: cleanTag(q.topic) || 'General',
        subtopic: cleanTag(q.subtopic),
        skills: (q.skills || []).map(cleanTag).filter(Boolean).slice(0, 5),
        tagIds: [
          tagId('topic', cleanTag(q.topic) || 'General'),
          ...(q.subtopic ? [tagId('subtopic', q.subtopic)] : []),
          ...(q.skills || []).map((skill) => tagId('skill', skill)),
        ],
        taggingConfidence:
          q.taggingConfidence || (q.enhanced ? 'medium' : 'high'),
      }));

      if (isEditing && initialExercise?.id) {
        await updateDoc(
          doc(db, 'classrooms', classroom.id, 'exercises', initialExercise.id),
          {
            title: title.trim(),
            deadline: deadline.trim() || null,
            allowLateSubmissions: deadline.trim() ? allowLateSubmissions : true,
            isExam: Boolean(isExam),
            timeLimitMinutes: isExam ? Math.max(1, Number(timeLimitMinutes) || 30) : null,
            shuffleQuestions: Boolean(shuffleQuestions),
            allowPrevious: isExam ? Boolean(allowPrevious) : true,
            questions: questionPayload,
            questionCount: questions.length,
            enhanced: hasEnhancedAny,
            updatedAt: serverTimestamp(),
          },
        );
      } else {
        await addDoc(collection(db, 'classrooms', classroom.id, 'exercises'), {
          title: title.trim(),
          deadline: deadline.trim() || null,
          allowLateSubmissions: deadline.trim() ? allowLateSubmissions : true,
          isExam: Boolean(isExam),
          timeLimitMinutes: isExam ? Math.max(1, Number(timeLimitMinutes) || 30) : null,
          shuffleQuestions: Boolean(shuffleQuestions),
          allowPrevious: isExam ? Boolean(allowPrevious) : true,
          questions: questionPayload,
          questionCount: questions.length,
          enhanced: hasEnhancedAny,
          teacherId: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      const approvedTags = questions.flatMap((question) => [
        { kind: 'topic', label: cleanTag(question.topic) || 'General' },
        ...(cleanTag(question.subtopic)
          ? [{ kind: 'subtopic', label: cleanTag(question.subtopic) }]
          : []),
        ...(question.skills || [])
          .map((skill) => ({ kind: 'skill', label: cleanTag(skill) }))
          .filter((tag) => tag.label),
      ]);
      await Promise.all(
        [
          ...new Map(
            approvedTags.map((tag) => [tagId(tag.kind, tag.label), tag]),
          ).entries(),
        ].map(([id, tag]) =>
          setDoc(
            doc(db, 'classrooms', classroom.id, 'tags', id),
            {
              ...tag,
              status: 'approved',
              updatedAt: serverTimestamp(),
              createdBy: user.uid,
            },
            { merge: true },
          ),
        ),
      );
      setPublished(true);
      setTimeout(() => onBack(), 800);
    } catch (e) {
      console.error(e);
      toast.add({ title: 'Could not publish exercise', description: friendlyError(e), type: 'error', timeout: 8000 });
    } finally {
      setPublishing(false);
    }
  };

  const savePersonalDraft = async () => {
    if (!title.trim()) { setPersonalError('Enter an exercise title before saving.'); return; }
    setPublishing(true);
    try {
      const variants = personalSets.map(v => ({ key: v.key, questions: (v.key === activeSet ? questions : v.questions).map(q => ({ ...q, type: q.type || 'short_answer', markingMode: q.markingMode || 'automatic', difficulty: q.difficulty || 'medium' })) }));
      await httpsCallable(functions, 'publishPersonalizedExercise')({ draftId: personalDraftId, title: title.trim(), deadline: deadline || null, allowLateSubmissions, variants, saveOnly: true });
      toast.add({ title: 'Draft saved', description: 'Your edited question sets are saved. Resume them from the personalized exercise section.', type: 'success', timeout: 6000 });
    } catch (e) { setPersonalError(friendlyError(e)); }
    finally { setPublishing(false); }
  };

  return (
    <AppShell
      role="teacher"
      user={user}
      onExit={onExit}
      active="quiz"
      classCount={1}
    >
      <div className="builder-bar">
        <button onClick={onBack}>
          <ArrowLeft /> {classroom.name}
        </button>
        <div>
          <span
            className="draft-dot"
            style={isEditing ? { background: '#15803d' } : undefined}
          />{' '}
          {isEditing ? 'Editing' : published ? 'Published' : 'Draft'} ·{' '}
          {title.trim() ? <b>{title.trim()}</b> : <em>Untitled Exercise</em>} (
          {questions.length} Question{questions.length > 1 ? 's' : ''})
        </div>
        <Button
          onClick={publish}
          disabled={published || publishing || !isValid}
          className="primary-action"
        >
          {publishing ? (
            <LoaderCircle />
          ) : published ? (
            <Check />
          ) : isEditing ? (
            <Check />
          ) : (
            <Send />
          )}{' '}
          {published
            ? isEditing
              ? 'Saved'
              : 'Published'
            : isEditing
              ? `Save changes (${questions.length})`
              : `Publish (${questions.length})`}
        </Button>
      </div>
      <div
        className="builder-head"
        style={{
          background: '#fff',
          border: '1px solid #eeeae4',
          borderRadius: '22px',
          padding: '1.8rem',
          marginBottom: '1.8rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}
        >
          <FileQuestion style={{ width: 18, height: 18, color: '#173e30' }} />
          <span className="kicker" style={{ margin: 0 }}>
            Exercise Setup
          </span>
        </div>
        <label
          className="form-label"
          style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '0.4rem' }}
        >
          Exercise Name / Title <span style={{ color: '#dc2626' }}>*</span>
          <Input
            placeholder="e.g. Mathematics Chapter 3 Practice, Form 4 Quadratic Equations"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError('');
            }}
            style={{
              fontSize: '1.15rem',
              fontWeight: 600,
              height: '48px',
              borderRadius: '14px',
              marginTop: '0.45rem',
              background: '#fcfbf9',
              border: titleError ? '2px solid #ef4444' : '1px solid #dce5dc',
            }}
          />
        </label>
        {titleError ? (
          <p
            style={{
              color: '#dc2626',
              fontSize: '0.78rem',
              fontWeight: 600,
              margin: '0.45rem 0 0',
            }}
          >
            {titleError}
          </p>
        ) : (
          <p
            style={{
              fontSize: '0.82rem',
              color: '#6e7e75',
              margin: '0.45rem 0 0',
            }}
          >
            Enter a clear title for this exercise so your learners recognize it
            in the classroom.
          </p>
        )}
        <div
          style={{
            marginTop: '1.2rem',
            paddingTop: '1.2rem',
            borderTop: '1px solid #f0ede6',
          }}
        >
          <label
            className="form-label"
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              display: 'block',
              marginBottom: '0.4rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar style={{ width: 15, height: 15, color: '#173e30' }} />{' '}
              Submission Deadline (Optional)
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '0.45rem',
                flexWrap: 'wrap',
              }}
            >
              <Input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                style={{
                  maxWidth: '320px',
                  borderRadius: '12px',
                  background: '#fcfbf9',
                }}
              />
              {deadline && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeadline('')}
                  style={{
                    fontSize: '0.78rem',
                    height: '38px',
                    borderRadius: '10px',
                  }}
                >
                  Clear deadline
                </Button>
              )}
            </div>
          </label>
          <p
            style={{
              fontSize: '0.8rem',
              color: '#6e7e75',
              margin: '0.4rem 0 0',
            }}
          >
            {deadline
              ? `Learners will see this due date: ${formatDeadline(deadline).formatted}.`
              : 'No deadline set. Learners can complete this activity at any time.'}
          </p>
          {deadline && (
            <div
              style={{
                marginTop: '0.9rem',
                padding: '0.8rem 1rem',
                background: '#fbfaf7',
                borderRadius: '12px',
                border: '1px solid #eeeae4',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#111',
                }}
              >
                <input
                  type="checkbox"
                  checked={allowLateSubmissions}
                  onChange={(e) => setAllowLateSubmissions(e.target.checked)}
                  style={{
                    marginTop: '3px',
                    accentColor: '#173e30',
                    width: 16,
                    height: 16,
                  }}
                />
                <div>
                  <span>Allow students to submit after deadline</span>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '0.75rem',
                      fontWeight: 400,
                      color: '#666',
                    }}
                  >
                    {allowLateSubmissions
                      ? 'Students can still submit after the deadline, but will be tagged as Late.'
                      : 'Submissions will be automatically locked after the deadline passes.'}
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Exam Mode & Assessment Controls */}
        <div
          style={{
            marginTop: '1.2rem',
            paddingTop: '1.2rem',
            borderTop: '1px solid #f0ede6',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Timer style={{ width: 17, height: 17, color: isExam ? '#b45309' : '#173e30' }} />
                <strong style={{ fontSize: '0.95rem', color: '#111' }}>
                  Exam / Assessment Mode
                </strong>
                {isExam && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                      padding: '2px 8px',
                      borderRadius: 99,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Timed Exam Active
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: '#6e7e75', margin: '3px 0 0' }}>
                Set a time limit with automatic submission, single-attempt policy, and integrity controls.
              </p>
            </div>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                background: isExam ? '#fef3c7' : '#f4f1eb',
                border: `1px solid ${isExam ? '#fde68a' : '#e5e1da'}`,
                padding: '6px 14px',
                borderRadius: 99,
                fontWeight: 600,
                fontSize: '0.82rem',
                color: isExam ? '#92400e' : '#444',
                transition: 'all 0.15s',
              }}
            >
              <input
                type="checkbox"
                checked={isExam}
                disabled={personalized}
                onChange={(e) => setIsExam(e.target.checked)}
                style={{ accentColor: '#b45309', width: 15, height: 15 }}
              />
              Enable Exam Mode
            </label>
          </div>

          {isExam && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1.2rem',
                background: '#fffdfa',
                border: '1px solid #fae8c8',
                borderRadius: '16px',
                display: 'grid',
                gap: '1.1rem',
              }}
            >
              {/* 1. Timer setting */}
              <div>
                <label className="form-label" style={{ fontSize: '0.86rem', fontWeight: 700, color: '#2d3748' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock3 style={{ width: 15, height: 15, color: '#b45309' }} />
                    Exam Duration / Timer Limit (Minutes)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                    <Input
                      type="number"
                      min="1"
                      max="300"
                      value={timeLimitMinutes}
                      onChange={(e) => setTimeLimitMinutes(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
                      style={{
                        width: '140px',
                        fontWeight: 700,
                        fontSize: '1rem',
                        background: '#fff',
                        borderRadius: '10px',
                      }}
                    />
                    <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 500 }}>minutes</span>

                    {/* Quick presets */}
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {[10, 15, 20, 30, 45, 60].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTimeLimitMinutes(preset)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '8px',
                            border: `1px solid ${timeLimitMinutes === preset ? '#b45309' : '#e5e1da'}`,
                            background: timeLimitMinutes === preset ? '#b45309' : '#fff',
                            color: timeLimitMinutes === preset ? '#fff' : '#555',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {preset}m
                        </button>
                      ))}
                    </div>
                  </div>
                </label>
                <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: '#7a6a55' }}>
                  When this timer reaches 00:00, the student's exam will automatically submit their current answers.
                </p>
              </div>

              {/* 2. Shuffle questions setting */}
              <div style={{ paddingTop: '0.9rem', borderTop: '1px solid #f3e8d8' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#111',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    style={{
                      marginTop: '3px',
                      accentColor: '#173e30',
                      width: 16,
                      height: 16,
                    }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Shuffle style={{ width: 14, height: 14, color: '#173e30' }} />
                      <span>Randomize / Shuffle question order for each student</span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', fontWeight: 400, color: '#666' }}>
                      Questions will appear in a randomized order to prevent students from copying adjacent question numbers.
                    </p>
                  </div>
                </label>
              </div>

              {/* 3. Allow previous questions navigation setting */}
              <div style={{ paddingTop: '0.9rem', borderTop: '1px solid #f3e8d8' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#111',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allowPrevious}
                    onChange={(e) => setAllowPrevious(e.target.checked)}
                    style={{
                      marginTop: '3px',
                      accentColor: '#173e30',
                      width: 16,
                      height: 16,
                    }}
                  />
                  <div>
                    <span>Allow students to go back to previous questions to recheck / reanswer</span>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', fontWeight: 400, color: '#666' }}>
                      {allowPrevious
                        ? 'Students can freely return to earlier questions before final submission.'
                        : 'Strict Sequential Mode: Students cannot return to or change answers on previous questions once they advance.'}
                    </p>
                  </div>
                </label>
              </div>

              {/* 4. Single Attempt notification */}
              <div
                style={{
                  background: '#f8faf7',
                  border: '1px solid #e2ece2',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.76rem',
                  color: '#284838',
                }}
              >
                <CheckCircle2 style={{ width: 15, height: 15, color: '#15803d', flexShrink: 0 }} />
                <span>
                  <strong>Single Attempt Enforced:</strong> Each student can only start and submit this exam once. Multiple submissions are strictly blocked.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <section style={{ background: personalized ? 'linear-gradient(135deg, #f4fbf6 0%, #fff 62%)' : '#fff', border: personalized ? '1px solid #b9d9c0' : '1px solid #dfe8df', borderRadius: 24, padding: '1.35rem', marginBottom: '1.8rem', boxShadow: personalized ? '0 10px 30px rgba(23,62,48,.07)' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontWeight: 750, cursor: initialExercise?.personalized ? 'default' : 'pointer' }}><input type="checkbox" checked={personalized} disabled={generating || Boolean(personalGenerationId) || Boolean(initialExercise?.personalized)} onChange={e => { setPersonalized(e.target.checked); setIsExam(false); setShuffleQuestions(false); }} style={{ width: 18, height: 18, marginTop: 3, accentColor: '#173e30' }} /><span><span style={{ display: 'block', fontSize: '1.08rem', color: '#173e30' }}>Personalized practice</span><span style={{ display: 'block', marginTop: 3, fontSize: '.82rem', color: '#66736b', fontWeight: 450 }}>AI adapts the next exercise to each learner’s previous results.</span></span></label>
          {personalized && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '.42rem .7rem', borderRadius: 999, background: '#e3f4d7', color: '#245a38', fontSize: '.75rem', fontWeight: 750 }}><Sparkles style={{ width: 14, height: 14 }} /> AI generated · No quota used</span>}
        </div>
        {personalized && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 18 }}><div style={{ padding: '1rem', borderRadius: 16, background: '#eaf5df', border: '1px solid #d4eac7' }}><div style={{ display: 'flex', justifyContent: 'space-between', color: '#245a38', fontWeight: 750 }}><span>On track</span><span>≥ 60%</span></div><p style={{ margin: '.45rem 0 0', fontSize: '.78rem', lineHeight: 1.45, color: '#45644f' }}>One shared practice set to maintain and sharpen skills.</p></div><div style={{ padding: '1rem', borderRadius: 16, background: '#fff1d8', border: '1px solid #f0dcaf' }}><div style={{ display: 'flex', justifyContent: 'space-between', color: '#8a5b16', fontWeight: 750 }}><span>Needs focus</span><span>&lt; 60%</span></div><p style={{ margin: '.45rem 0 0', fontSize: '.78rem', lineHeight: 1.45, color: '#806332' }}>A private set with 70% weak-topic practice and 30% reinforcement.</p></div></div>}
        {personalized && <div style={{ height: 7, display: 'flex', overflow: 'hidden', borderRadius: 99, marginTop: 10, background: '#eaf5df' }}><span style={{ width: '70%', background: '#e9bd62' }} /><span style={{ width: '30%', background: '#6aa77b' }} /></div>}
        {personalized && <div style={{ display: 'grid', gap: 14 }}>
          {initialExercise?.personalized ? <p>This personalized exercise is published. Create a new exercise to generate another round from updated results.</p> : <>
          {!personalDraftId && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(170px,.7fr) minmax(180px,.8fr)', gap: 12 }}>
              <label style={{ color: '#355543', fontSize: '.78rem', fontWeight: 700 }}>BASELINE EXERCISE<select value={sourceExerciseId} disabled={generating} onChange={e => setSourceExerciseId(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, minHeight: 43, padding: '0 .8rem', border: '1px solid #cbdccd', borderRadius: 12, background: '#fff', color: '#173e30' }}><option value="">Choose an exercise</option>{previousExercises.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select><span style={{ display: 'block', marginTop: 4, fontWeight: 450, color: '#738078' }}>Use the latest marked results.</span></label>
              <label style={{ color: '#355543', fontSize: '.78rem', fontWeight: 700 }}>QUESTIONS EACH<Input type="number" min={2} max={15} disabled={generating} value={questionCount} onChange={e => setQuestionCount(Math.max(2, Math.min(15, Number(e.target.value) || 2)))} style={{ marginTop: 6 }} /></label>
              <label style={{ color: '#355543', fontSize: '.78rem', fontWeight: 700 }}>ANSWER FORMAT<select value={personalType} disabled={generating} onChange={e => setPersonalType(e.target.value as typeof personalType)} style={{ display: 'block', width: '100%', marginTop: 6, minHeight: 43, padding: '0 .8rem', border: '1px solid #cbdccd', borderRadius: 12, background: '#fff', color: '#173e30' }}><option value="short_answer">Typed answer</option><option value="multiple_choice">Multiple choice</option></select></label>
            </div>
            <label style={{ color: '#355543', fontSize: '.78rem', fontWeight: 700 }}>TEACHER GUIDANCE<Textarea value={aiPrompt} disabled={generating} onChange={e => setAiPrompt(e.target.value)} placeholder="Optional: e.g. use real-life examples and keep the language simple." style={{ marginTop: 6, minHeight: 82 }} /></label>
            {personalEstimate && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.85rem 1rem', borderRadius: 14, background: '#fff', border: '1px solid #d8e6da', color: '#476052', fontSize: '.82rem', flexWrap: 'wrap' }}><Users style={{ width: 17, height: 17, color: '#4d8a5b' }} /><b>{personalEstimate.students} learners</b><span>·</span><b>{personalEstimate.sets} AI sets</b><span>·</span><span>{personalEstimate.quotaEnabled ? `${personalEstimate.credits} credits` : 'No quota used'}</span>{personalEstimate.skipped.length > 0 && <span style={{ color: '#8a5b16' }}>· {personalEstimate.skipped.length} waiting for marking</span>}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}><span style={{ color: '#718078', fontSize: '.78rem' }}>{personalEstimate ? `Each targeted set: ${personalEstimate.focusCount} weak-topic · ${questionCount - personalEstimate.focusCount} reinforcement` : 'Choose a baseline exercise to preview the learner groups.'}</span><Button onClick={generatePersonalized} disabled={generating || Boolean(personalGenerationId) || !personalEstimate || (personalEstimate.quotaEnabled && personalEstimate.credits > Math.max(0, 15 - quota.questionsUsed))} className="primary-action" style={{ minWidth: 230 }}>{generating || personalGenerationId ? <><LoaderCircle /> Generating…</> : <><WandSparkles /> Generate AI exercise</>}</Button></div>
            {personalGenerationId && <p role="status">{personalProgress || 'Preparing AI generation…'}</p>}
            {savedPersonalDrafts.length > 0 && <label>Resume a saved AI draft<select defaultValue="" disabled={Boolean(personalGenerationId)} onChange={e => { if (e.target.value) void loadPersonalDraft(e.target.value).catch(err => setPersonalError(friendlyError(err))); }}><option value="">Select saved draft</option>{savedPersonalDrafts.map((d,i) => <option key={d.id} value={d.id}>{d.title || `Draft ${i + 1}`} · {d.variants.length} sets · {d.status}</option>)}</select></label>}
          </>}
          {personalDraftId && <>
            <p>AI draft saved. Review and edit every set below, then publish when ready. Keep the same question count in each set.</p>
            <label>Review question set<select value={activeSet} onChange={e => switchPersonalSet(e.target.value)} style={{ display: 'block', width: '100%', padding: 10 }}>{personalSets.map(v => <option key={v.key} value={v.key}>{v.label}{v.percentage !== null ? ` · ${v.percentage.toFixed(1)}% previously` : ''}</option>)}</select></label>
            <p>Focus topics: {personalSets.find(v => v.key === activeSet)?.weakTopics.join(', ') || 'Previous exercise topics — shared reinforcement'}</p>
            <Button onClick={savePersonalDraft} disabled={publishing}>Save edited draft</Button>
          </>}
          </>}
          {personalError && <p role="alert" style={{ color: '#a00' }}>{personalError} <button onClick={() => void navigator.clipboard.writeText(personalError)}>Copy error</button></p>}
        </div>}
      </section>
      {!personalized && <section style={{ background: '#fff', border: '1px solid #dfe8df', borderRadius: 22, padding: '1.5rem', marginBottom: '1.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div><span className="kicker">Generate with SLearn AI</span><h2 style={{ margin: '.25rem 0' }}>Turn instructions or notes into a quiz draft</h2><p style={{ margin: 0, color: '#66736b' }}>The result stays editable and never publishes automatically.</p></div>
          <div style={{ display: 'flex', gap: '.5rem', fontSize: '.82rem', fontWeight: 700 }}><span style={{ padding: '.5rem .75rem', background: '#edf7df', borderRadius: 999 }}>{Math.max(0, 15 - quota.questionsUsed)}/15 questions left</span><span style={{ padding: '.5rem .75rem', background: '#fff0d4', borderRadius: 999 }}>{Math.max(0, 5 - quota.imagesUsed)}/5 images left</span></div>
        </div>
        <label className="form-label" style={{ display: 'block', marginTop: '1.2rem' }}>What should the quiz cover?<Textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Example: Create Form 4 algebra questions from these notes. Mix multiple choice and short answers, with simple explanations." style={{ minHeight: 110, marginTop: '.45rem' }}/></label>
        <div onDragOver={(event) => event.preventDefault()} onDrop={onFileDrop} style={{ marginTop: '1rem', border: '2px dashed #b9c9bb', borderRadius: 16, padding: '1.2rem', textAlign: 'center', background: '#fbfcfa' }}>
          <FileUp style={{ width: 28, height: 28, margin: '0 auto .5rem', color: '#173e30' }}/><b>Drag and drop notes or slides here</b><p style={{ margin: '.3rem 0 .8rem', color: '#6e7e75', fontSize: '.82rem' }}>PDF, PPTX, DOCX, MD, TXT, RTF, ODP or ODT · up to 5 files · 25 MB each</p><label><input type="file" multiple accept=".pdf,.pptx,.docx,.md,.txt,.rtf,.odp,.odt" onChange={onFileInput} style={{ display: 'none' }}/><span style={{ display: 'inline-block', padding: '.55rem .9rem', border: '1px solid #cad6cc', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>Choose files</span></label>
          {sourceFiles.length > 0 && <div style={{ marginTop: '.8rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '.4rem' }}>{sourceFiles.map((file, index) => <span key={`${file.name}-${index}`} style={{ padding: '.35rem .55rem', background: '#edf3ee', borderRadius: 8, fontSize: '.75rem' }}>{file.name} <button type="button" onClick={() => setSourceFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`} style={{ border: 0, background: 'none', cursor: 'pointer' }}>×</button></span>)}</div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '1rem', marginTop: '1rem', alignItems: 'end' }}>
          <label className="form-label">Questions<Input type="number" min={1} max={Math.min(15, Math.max(1, 15 - quota.questionsUsed))} value={questionCount} onChange={(event) => setQuestionCount(Math.max(1, Math.min(15, Number(event.target.value) || 1)))}/></label>
          <label className="form-label">Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as 'easy' | 'medium' | 'hard' | 'mixed')} style={{ width: '100%', height: 40, border: '1px solid #dce5dc', borderRadius: 10, padding: '0 .75rem', background: '#fff' }}><option value="easy">Easy</option><option value="medium">Moderate</option><option value="hard">Hard</option><option value="mixed">Randomized mix</option></select></label>
          <label className="form-label">AI-generated images<Input type="number" min={0} max={Math.min(5, Math.max(0, 5 - quota.imagesUsed))} value={imageCount} onChange={(event) => setImageCount(Math.max(0, Math.min(5, Number(event.target.value) || 0)))}/></label>
          <Button type="button" onClick={generateWithAi} disabled={generating || questionCount > Math.max(0, 15 - quota.questionsUsed) || imageCount > Math.max(0, 5 - quota.imagesUsed)} className="primary-action">{generating ? <LoaderCircle/> : <WandSparkles/>}{generating ? 'Generating draft…' : 'Generate editable draft'}</Button>
        </div>
      </section>}
      <div className="builder-grid" style={personalized && !personalDraftId ? { display: 'none' } : undefined}>
        <section
          className="question-editor"
          style={{ display: 'grid', gap: '1.5rem' }}
        >
          {aiMessage && <p style={{ margin: 0, color: '#a33', fontWeight: 600 }}>{aiMessage}</p>}
          {questions.map((q, idx) => (
            <div
              key={q.id}
              style={{
                borderBottom:
                  idx < questions.length - 1 ? '1px solid #e9eee9' : 'none',
                paddingBottom: idx < questions.length - 1 ? '1.5rem' : '0',
              }}
            >
              <div className="question-count">
                <span>Question 0{idx + 1}</span>
                <span style={{ marginLeft: 'auto', marginRight: questions.length > 1 ? '.5rem' : 0, padding: '.25rem .55rem', borderRadius: 999, background: difficultyColour(q.difficulty || 'medium'), fontSize: '.7rem', textTransform: 'capitalize' }}>{q.difficulty || 'medium'}</span>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(idx)}
                    aria-label="Remove question"
                    style={{
                      border: 0,
                      background: 'none',
                      color: '#a00',
                      cursor: 'pointer',
                    }}
                  >
                    <X style={{ width: '18px', height: '18px' }} />
                  </button>
                )}
              </div>
              <label className="form-label">
                Question type
                <select value={q.type || 'short_answer'} onChange={(event) => { const type = event.target.value as 'short_answer' | 'multiple_choice'; updateQuestion(idx, 'type', type); if (type === 'multiple_choice') updateQuestion(idx, 'markingMode', 'automatic'); }} style={{ width: '100%', height: 40, border: '1px solid #dce5dc', borderRadius: 10, padding: '0 .75rem', background: '#fff' }}>
                  <option value="short_answer">Type your answer</option>
                  <option value="multiple_choice">Multiple choice (MCQ)</option>
                </select>
              </label>
              {q.type === 'multiple_choice' ? (
                <div className="answer-block">
                  <label className="form-label">Choices<Input value={(q.choices || []).join(', ')} onChange={(event) => updateQuestion(idx, 'choices', event.target.value.split(',').map(cleanTag).filter(Boolean).slice(0, 8))} placeholder="Option A, Option B, Option C" /></label>
                  <label className="form-label">Correct choice<select value={q.answer} onChange={(event) => updateQuestion(idx, 'answer', event.target.value)} style={{ width: '100%', height: 40, border: '1px solid #dce5dc', borderRadius: 10, padding: '0 .75rem', background: '#fff' }}><option value="">Select correct choice</option>{(q.choices || []).map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select></label>
                </div>
              ) : (
                <label className="form-label">
                  Marking method
                  <select value={q.markingMode || 'automatic'} onChange={(event) => updateQuestion(idx, 'markingMode', event.target.value)} style={{ width: '100%', height: 40, border: '1px solid #dce5dc', borderRadius: 10, padding: '0 .75rem', background: '#fff' }}>
                    <option value="automatic">Automatic marking</option>
                    <option value="manual">Teacher marks manually</option>
                  </select>
                </label>)}
              {q.type !== 'multiple_choice' && <label className="form-label">
                Question text
                <Textarea
                  value={q.question}
                  onChange={(e) =>
                    updateQuestion(idx, 'question', e.target.value)
                  }
                  placeholder="Type question prompt..."
                  className="question-text"
                />
              </label>}
              {q.type === 'multiple_choice' && <label className="form-label">Question text<Textarea value={q.question} onChange={(e) => updateQuestion(idx, 'question', e.target.value)} placeholder="Type the question prompt..." className="question-text" /></label>}
              {q.type !== 'multiple_choice' && <div className="answer-block">
                <label className="form-label">
                  Answer
                  <Input
                    value={q.answer}
                    onChange={(e) =>
                      updateQuestion(idx, 'answer', e.target.value)
                    }
                    placeholder="Correct answer or explanation"
                  />
                </label>
                <label className="form-label">
                  Points
                  <Input
                    type="number"
                    min="1"
                    value={q.points}
                    onChange={(e) =>
                      updateQuestion(idx, 'points', Number(e.target.value) || 1)
                    }
                  />
                </label>
              </div>}
              <div className="question-tag-editor">
                <div className="question-tag-head"><div><b>Learning tags</b><small>Use a specific chapter or concept so performance reports stay useful.</small></div>{q.taggingConfidence && <span>{q.taggingConfidence} AI confidence</span>}</div>
                <div className="question-tag-grid">
                  <label className="form-label">Difficulty<select value={q.difficulty || 'medium'} onChange={(event) => updateQuestion(idx, 'difficulty', event.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
                  <label className="form-label">Topic<Input list={`topics-${q.id}`} value={q.topic || ''} onChange={(event) => updateQuestion(idx, 'topic', event.target.value)} placeholder="e.g. Quadratic equations"/><datalist id={`topics-${q.id}`}>{classroomTags.filter((tag) => tag.kind === 'topic').map((tag) => <option key={tag.id} value={tag.label}/>)}</datalist></label>
                  <label className="form-label">Subtopic<Input list={`subtopics-${q.id}`} value={q.subtopic || ''} onChange={(event) => updateQuestion(idx, 'subtopic', event.target.value)} placeholder="e.g. Factorisation method"/><datalist id={`subtopics-${q.id}`}>{classroomTags.filter((tag) => tag.kind === 'subtopic').map((tag) => <option key={tag.id} value={tag.label}/>)}</datalist></label>
                  <label className="form-label">Skills<Input value={(q.skills || []).join(', ')} onChange={(event) => updateQuestion(idx, 'skills', event.target.value.split(',').map(cleanTag).filter(Boolean).slice(0, 5))} placeholder="Calculate, Apply"/></label>
                </div>
              </div>
              <div className="ai-question-bar">
                <div className="ai-question-label">
                  <span><Bot /></span>
                  <p><b>SLearn AI</b><small>Refine or create</small></p>
                </div>
                <div className="ai-question-actions">
                  <Button className="ai-action enhance" onClick={() => enhanceQuestion(idx)} disabled={q.loading}>
                    {q.loading ? <><LoaderCircle /> Enhancing…</> : <><WandSparkles /> AI Enhance</>}
                  </Button>
                  <Button className="ai-action generate" onClick={() => { setQuickGenerateIndex(idx); setQuickPrompt(''); setQuickGenerateError(''); }} disabled={q.loading || generating}>
                    <Sparkles /> AI Generate
                  </Button>
                </div>
              </div>
              {q.enhanced && (
                <div className="enhanced-note">
                  <CheckCircle2 />
                  <div>
                    <b>Question 0{idx + 1} enhanced</b>
                    <p>
                      Added contextual problem framing & step-by-step reasoning
                      prompt.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addQuestion}
            disabled={questions.length >= 15}
            className="add-question"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '1rem',
              width: '100%',
              cursor: 'pointer',
            }}
          >
            <Plus style={{ width: '18px', height: '18px' }} /> {questions.length >= 15 ? '15-question limit reached' : <>Add Question 0{questions.length + 1}</>}
          </button>
          <div
            style={{
              marginTop: '1rem',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.8rem',
            }}
          >
            <Button variant="outline" onClick={onBack}>
              Cancel
            </Button>
            <Button
              onClick={publish}
              disabled={published || publishing || !isValid}
              className="primary-action"
            >
              {publishing ? <LoaderCircle /> : published ? <Check /> : <Send />}{' '}
              {published
                ? 'Published to Classroom'
                : publishing
                  ? 'Publishing...'
                  : `Publish Exercise (${questions.length} Question${questions.length > 1 ? 's' : ''})`}
            </Button>
          </div>
        </section>
        <aside className="ai-sidebar">
          <div className="ai-sidebar-head">
            <span>
              <Sparkles />
            </span>
            <div>
              <small>SLearn AI</small>
              <h3>Exercise overview</h3>
            </div>
          </div>
          <div className="quality-score">
            <div>
              <strong>{questions.length}</strong>
              <span>Questions</span>
            </div>
            <p>Exercise Size</p>
          </div>
          <div className="checks">
            {[
              'Clear learning objective',
              'Age-appropriate language',
              'Real-world relevance',
              'Guided reasoning',
            ].map((x, i) => (
              <div className={hasEnhancedAny || i < 2 ? 'ready' : ''} key={x}>
                <span>{hasEnhancedAny || i < 2 ? <Check /> : i + 1}</span>
                {x}
              </div>
            ))}
          </div>
        </aside>
      </div>
      <Dialog open={quickGenerateIndex !== null} onOpenChange={(open) => { if (!open && !quickGenerating) setQuickGenerateIndex(null); }}>
        <DialogContent className="modal-card quick-generate-modal">
          <DialogHeader>
            <DialogTitle>Generate a new question</DialogTitle>
            <DialogDescription>Describe what this question should test. SLearn AI will place the result directly into Question {quickGenerateIndex === null ? '' : String(quickGenerateIndex + 1).padStart(2, '0')}.</DialogDescription>
          </DialogHeader>
          <label className="form-label">Topic or instruction<Textarea value={quickPrompt} onChange={(event) => setQuickPrompt(event.target.value)} placeholder={`Example: Create a medium-difficulty ${classroom.subject} question about today's lesson.`} className="quick-generate-prompt" /></label>
          <div className="quick-generate-note"><Sparkles/><span><b>1 question will be generated</b><small>You can edit it before publishing.</small></span></div>
          {quickGenerateError && <p className="form-error">{quickGenerateError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickGenerateIndex(null)} disabled={quickGenerating}>Cancel</Button>
            <Button className="primary-action" onClick={generateSingleQuestion} disabled={quickGenerating || quota.questionsUsed >= 15}>{quickGenerating ? <><LoaderCircle/> Generating…</> : <><Sparkles/> Generate question</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [role, setRole] = useState<Role | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [view, setView] = useState<View>('dashboard'),
    [selectedClass, setSelectedClass] = useState<ClassroomData | null>(null),
    [selectedExercise, setSelectedExercise] = useState<any | null>(null),
    [detailCount, setDetailCount] = useState(0),
    [, setProfileVersion] = useState(0),
    [resetPasswordCode, setResetPasswordCode] = useState<string | null>(null),
    [navigationReady, setNavigationReady] = useState(false);

  useOfflineExercisePack(user, role);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      const oobCode = params.get('oobCode');
      if (mode === 'resetPassword' && oobCode) {
        setResetPasswordCode(oobCode);
      }
    }
  }, []);

  const handleDoneReset = () => {
    setResetPasswordCode(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      url.searchParams.delete('oobCode');
      url.searchParams.delete('apiKey');
      window.history.replaceState({}, document.title, url.pathname);
    }
  };

  useEffect(() => {
    void initializeSlearnAppCheck();
  }, []);
  useEffect(
    () =>
      onAuthStateChanged(auth, async (current) => {
        setNavigationReady(false);
        setUser(current);
        if (current) {
          const profile = await getDoc(doc(db, 'users', current.uid));
          const storedRole = profile.exists() ? profile.data().role : null;
          if (storedRole === 'admin') {
            window.location.replace('/admin');
            return;
          }
          setRole(storedRole as Role | null);
        } else setRole(null);
        setReady(true);
      }),
    [],
  );
  useEffect(() => {
    if (!user || !role) return;
    const restoreNavigation = async () => {
      try {
        const saved = window.localStorage.getItem(`slearn:navigation:${user.uid}`);
        if (!saved) return;
        const state = JSON.parse(saved) as { view?: View; classId?: string; exerciseId?: string };
        const simpleViews: View[] = ['dashboard', 'classes', 'progress', 'analytics'];
        if (state.view && simpleViews.includes(state.view)) {
          setView(state.view);
          return;
        }
        if (!state.classId) return;
        const classroomSnapshot = await getDoc(doc(db, 'classrooms', state.classId));
        if (!classroomSnapshot.exists()) return;
        const restoredClassroom = { id: classroomSnapshot.id, ...classroomSnapshot.data() } as ClassroomData;
        setSelectedClass(restoredClassroom);
        if (state.view === 'quiz' && role === 'teacher') {
          if (state.exerciseId) {
            const exerciseSnapshot = await getDoc(doc(db, 'classrooms', state.classId, 'exercises', state.exerciseId));
            if (exerciseSnapshot.exists()) setSelectedExercise({ id: exerciseSnapshot.id, ...exerciseSnapshot.data() });
          }
          setView('quiz');
          return;
        }
        if (state.view === 'exercise' && state.exerciseId) {
          const exerciseSnapshot = await getDoc(doc(db, 'classrooms', state.classId, 'exercises', state.exerciseId));
          if (exerciseSnapshot.exists()) {
            setSelectedExercise({ id: exerciseSnapshot.id, ...exerciseSnapshot.data() });
            setView('exercise');
            return;
          }
        }
        setView('classroom');
      } catch {
        window.localStorage.removeItem(`slearn:navigation:${user.uid}`);
      } finally {
        setNavigationReady(true);
      }
    };
    void restoreNavigation();
  }, [user, role]);
  useEffect(() => {
    if (!user || !role || !navigationReady) return;
    window.localStorage.setItem(`slearn:navigation:${user.uid}`, JSON.stringify({ view, classId: selectedClass?.id, exerciseId: selectedExercise?.id }));
  }, [user, role, navigationReady, view, selectedClass?.id, selectedExercise?.id]);
  useEffect(() => {
    const navigate = (event: Event) => { const target = (event as CustomEvent<NavTarget>).detail; setView(target === 'overview' ? 'dashboard' : target); setSelectedClass(null); setSelectedExercise(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const refreshProfile = () => setProfileVersion((version) => version + 1);
    window.addEventListener('slearn:navigate', navigate);
    window.addEventListener('slearn:profile-updated', refreshProfile);
    return () => { window.removeEventListener('slearn:navigate', navigate); window.removeEventListener('slearn:profile-updated', refreshProfile); };
  }, []);
  const handleAuth = async (action: AuthParams) => {
    setBusy(true);
    setError('');
    try {
      let userResult: User;
      if (action.provider === 'google') {
        const result = await signInWithPopup(auth, googleProvider);
        userResult = result.user;
      } else {
        if (action.mode === 'signup') {
          try {
            const result = await createUserWithEmailAndPassword(auth, action.email!, action.password!);
            if (action.name?.trim()) {
              await updateProfile(result.user, { displayName: action.name.trim() }).catch(() => {});
            }
            userResult = result.user;
          } catch (signUpErr: any) {
            if (signUpErr?.message?.includes('email-already-in-use') || signUpErr?.code === 'auth/email-already-in-use') {
              try {
                const signInRes = await signInWithEmailAndPassword(auth, action.email!, action.password!);
                const checkSnap = await getDoc(doc(db, 'users', signInRes.user.uid));
                if (!checkSnap.exists() || !checkSnap.data()?.role) {
                  if (action.name?.trim()) {
                    await updateProfile(signInRes.user, { displayName: action.name.trim() }).catch(() => {});
                  }
                  userResult = signInRes.user;
                } else {
                  throw signUpErr;
                }
              } catch {
                throw signUpErr;
              }
            } else {
              throw signUpErr;
            }
          }
        } else {
          const result = await signInWithEmailAndPassword(auth, action.email!, action.password!);
          userResult = result.user;
        }
      }

      const userRef = doc(db, 'users', userResult.uid);
      const existingSnap = await getDoc(userRef);
      const data = existingSnap.exists() ? existingSnap.data() : null;
      const existingRole = data?.role as Role | undefined;

      if (data?.role === 'admin') {
        window.location.assign('/admin');
        return;
      }

      if (action.mode === 'login') {
        const effectiveRole: Role = existingRole || action.role || 'student';
        await setDoc(
          userRef,
          {
            displayName: userResult.displayName || data?.displayName || action.name || userResult.email?.split('@')[0] || 'Learner',
            email: userResult.email || data?.email || action.email || '',
            photoURL: userResult.photoURL || data?.photoURL || '',
            role: effectiveRole,
            lastLoginAt: serverTimestamp(),
            ...(existingSnap.exists() ? {} : { createdAt: serverTimestamp() }),
          },
          { merge: true },
        );
        setUser(userResult);
        setRole(effectiveRole);
        setView('dashboard');
        return;
      }

      // Signup mode
      if (!action.role) return;
      if (existingRole && existingRole !== action.role) {
        await signOut(auth);
        throw new Error(`This account is already registered as a ${existingRole}. Use Log in to continue.`);
      }

      if (existingSnap.exists()) {
        await setDoc(
          userRef,
          {
            displayName: userResult.displayName || data?.displayName || action.name || '',
            email: userResult.email || data?.email || action.email || '',
            photoURL: userResult.photoURL || data?.photoURL || '',
            lastLoginAt: serverTimestamp(),
          },
          { merge: true },
        );
      } else {
        await setDoc(userRef, {
          displayName: userResult.displayName || action.name || userResult.email?.split('@')[0] || 'Learner',
          email: userResult.email || action.email || '',
          photoURL: userResult.photoURL || '',
          role: action.role,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        });
      }
      setUser(userResult);
      setRole(existingRole || action.role);
      setView('dashboard');
    } catch (e) {
      const friendly = friendlyError(e);
      setError(friendly);
      throw new Error(friendly);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    if (user) window.localStorage.removeItem(`slearn:navigation:${user.uid}`);
    await signOut(auth);
    setUser(null);
    setRole(null);
    setView('dashboard');
    setSelectedClass(null);
    setSelectedExercise(null);
  };
  if (!ready)
    return (
      <div className="loading-screen">
        <Brand />
        <LoaderCircle />
        <p>Preparing SLearn…</p>
      </div>
    );
  if (resetPasswordCode)
    return (
      <ResetPasswordPage
        oobCode={resetPasswordCode}
        onDone={handleDoneReset}
      />
    );
  if (!user || !role)
    return (
      <LoginPage
        busy={busy}
        error={error}
        onAuth={handleAuth}
      />
    );
  const openDetailedClass = (classroom: ClassroomData) => {
    setSelectedClass(classroom);
    setView('classroom');
  };
  if (view === 'classes')
    return (
      <AppShell role={role} user={user} onExit={logout} active="classes" classCount={detailCount}>
        <Topbar role={role} user={user} />
        <ClassroomsDetail role={role} user={user} onOpen={openDetailedClass} onCountChange={setDetailCount} />
      </AppShell>
    );
  if (view === 'progress')
    return (
      <AppShell role={role} user={user} onExit={logout} active="progress" classCount={detailCount}>
        <Topbar role={role} user={user} />
        <ProgressDetail role={role} user={user} onOpen={openDetailedClass} onCountChange={setDetailCount} />
      </AppShell>
    );
  if (view === 'analytics')
    return (
      <AppShell role={role} user={user} onExit={logout} active="analytics" classCount={detailCount}>
        <Topbar role={role} user={user} />
        <AnalyticsDetail role={role} user={user} />
      </AppShell>
    );
  if (view === 'exercise' && selectedClass && selectedExercise)
    return (
      <StudentExerciseRunner
        role={role}
        user={user}
        classroom={selectedClass}
        exercise={selectedExercise}
        onBack={() => setView('classroom')}
        onExit={logout}
      />
    );
  if (view === 'classroom' && selectedClass)
    return (
      <Classroom
        role={role}
        user={user}
        classroom={selectedClass}
        onBack={() => setView('classes')}
        onQuiz={() => {
          setSelectedExercise(null);
          setView('quiz');
        }}
        onEditExercise={(ex) => {
          setSelectedExercise(ex);
          setView('quiz');
        }}
        onStartExercise={(ex) => {
          setSelectedExercise(ex);
          setView('exercise');
        }}
        onExit={logout}
        onClassUpdated={setSelectedClass}
        onClassDeleted={() => {
          setSelectedClass(null);
          setView('classes');
        }}
      />
    );
  if (view === 'quiz' && selectedClass && role === 'teacher')
    return (
      <QuizBuilder
        user={user}
        classroom={selectedClass}
        initialExercise={selectedExercise}
        onBack={() => {
          setSelectedExercise(null);
          setView('classroom');
        }}
        onExit={logout}
      />
    );
  return role === 'teacher' ? (
    <TeacherDashboard
      user={user}
      onView={setView}
      onExit={logout}
      onSelectClass={setSelectedClass}
    />
  ) : (
    <StudentDashboard
      user={user}
      onView={setView}
      onExit={logout}
      onSelectClass={setSelectedClass}
    />
  );
}
