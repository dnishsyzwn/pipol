'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { User } from 'firebase/auth';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from 'firebase/auth';
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
  FileUp,
  FileQuestion,
  GraduationCap,
  Eye,
  EyeOff,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  LogIn,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { auth, db, functions, googleProvider, initializeSlearnAppCheck, storage } from '@/lib/firebase';
import { ClassroomsDetail, ProgressDetail } from './detail-pages';

type Role = 'teacher' | 'student';
type Difficulty = 'easy' | 'medium' | 'hard';
type View = 'dashboard' | 'classes' | 'progress' | 'classroom' | 'quiz' | 'exercise';
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
type QuestionItem = {
  id: string;
  question: string;
  answer: string;
  points: number;
  enhanced: boolean;
  difficulty?: Difficulty;
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
  submissions: SubmissionData[];
};
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
 const [authMode, setAuthMode] = useState<'login'|'signup'>('signup');
 const [authRole, setAuthRole] = useState<Role>('student');
 const [name, setName] = useState('');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [modalBusy, setModalBusy] = useState(false);
 const [modalError, setModalError] = useState('');
 const [resetMessage, setResetMessage] = useState('');

 const openModal = (mode: 'login'|'signup', role?: Role) => {
  setAuthMode(mode);
  if (role) setAuthRole(role);
  setModalError('');
  setResetMessage('');
  setShowPassword(false);
  setModalOpen(true);
 };

 const switchMode = (mode: 'login'|'signup') => {
  setAuthMode(mode);
  setModalError('');
  setResetMessage('');
  setShowPassword(false);
 };

 const handleForgotPassword = async () => {
  if (!email.trim()) {
   setModalError('Enter your email address first, then select Forgot password.');
   return;
  }
  setModalBusy(true);
  setModalError('');
  setResetMessage('');
  try {
   await sendPasswordResetEmail(auth, email.trim());
   setResetMessage('Password reset email sent. Check your inbox and spam folder.');
  } catch (err: any) {
   setModalError(err?.message || 'Could not send the reset email. Please try again.');
  } finally {
   setModalBusy(false);
  }
 };

 const handleEmailSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
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
    mode: authMode,
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
    mode: authMode,
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
      <DialogTitle>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</DialogTitle>
      <DialogDescription>
       {authMode === 'signup'
        ? (authRole === 'teacher' ? 'Sign up as a teacher to create classrooms and guided exercises.' : 'Sign up as a student to join classes and track your learning.')
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

      <div className="form-label">
       <div className="password-label-row"><span>Password</span>{authMode === 'login' && <button type="button" onClick={handleForgotPassword} disabled={modalBusy}>Forgot password?</button>}</div>
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

      {modalError && <p className="form-error" style={{ marginTop: '2px' }}>{modalError}</p>}
      {resetMessage && <p className="auth-success">{resetMessage}</p>}

      <Button
       type="submit"
       className="primary-action"
       disabled={modalBusy || !email.trim() || !password.trim()}
       style={{ width: '100%', height: '46px', borderRadius: '14px', marginTop: '4px' }}
      >
       {modalBusy ? <LoaderCircle className="animate-spin" /> : authMode === 'signup' ? <ArrowRight /> : <LogIn />}
       {authMode === 'signup' ? `Sign up as ${authRole === 'teacher' ? 'Teacher' : 'Student'}` : 'Log in with Email'}
      </Button>
     </form>

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
    </DialogContent>
   </Dialog>
  </main>
 );
}
type NavTarget = 'overview' | 'classes' | 'progress';
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState(user.displayName || '');
  const [profilePhoto, setProfilePhoto] = useState(user.photoURL || '');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState(user.photoURL || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
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
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="mini-profile profile-trigger" onClick={openProfile} aria-label="Edit profile" title="Edit profile">
            {avatar()}
            <div>
              <b>{profileName || 'SLearn user'}</b>
              <small>{role}</small>
            </div>
          </button>
          <button onClick={onExit} aria-label="Sign out" title="Sign out">
            <LogOut />
          </button>
        </div>
      </aside>
      <div className="mobile-bar">
        <Brand />
        <button type="button" className="mobile-profile" onClick={openProfile} aria-label="Edit profile">{avatar()}</button>
      </div>
      <section className="main-stage">{children}</section>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="modal-card profile-modal"><DialogHeader><DialogTitle>Edit your profile</DialogTitle><DialogDescription>Update how your name and photo appear in SLearn.</DialogDescription></DialogHeader><div className="profile-editor"><div className="profile-photo-preview">{profilePreview ? <img src={profilePreview} alt="Profile preview" /> : <span>{initials(profileName)}</span>}<label title="Choose profile picture"><Camera/><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])}/></label></div><label className="form-label">Display name<Input value={profileName} maxLength={60} onChange={(event) => setProfileName(event.target.value)} placeholder="Your name"/></label><p className="profile-help">JPG, PNG or WebP · maximum 5 MB</p>{profileError && <p className="auth-error">{profileError}</p>}</div><DialogFooter><Button variant="outline" onClick={() => setProfileOpen(false)} disabled={profileSaving}>Cancel</Button><Button className="primary-action" onClick={saveProfile} disabled={profileSaving}>{profileSaving ? <><LoaderCircle/> Saving…</> : <><Check/> Save profile</>}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
function Topbar({ role, user }: { role: Role; user: User }) {
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
    [newSubject, setNewSubject] = useState(''),
    [newMaxStudents, setNewMaxStudents] = useState('30'),
    [saving, setSaving] = useState(false),
    [created, setCreated] = useState<ClassroomData | null>(null),
    [error, setError] = useState('');
  const [editTarget, setEditTarget] = useState<ClassroomData | null>(null),
    [editName, setEditName] = useState(''),
    [editSubject, setEditSubject] = useState(''),
    [editMaxStudents, setEditMaxStudents] = useState('30'),
    [savingEdit, setSavingEdit] = useState(false),
    [editError, setEditError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ClassroomData | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState('');

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

  const createClass = async () => {
    if (!newName.trim() || !newSubject.trim()) return;
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
          subject: newSubject.trim(),
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
    setEditTarget(c);
    setEditName(c.name);
    setEditSubject(c.subject || '');
    setEditMaxStudents(String(c.maxStudents || 30));
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editTarget || !editName.trim() || !editSubject.trim()) return;
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
        subject: editSubject.trim(),
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
                  <small>
                    {r.className} · {r.studentEmail}
                  </small>
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
                  placeholder="e.g. Mathematics · Form 4"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <label className="form-label">
                Subject
                <Input
                  placeholder="e.g. Mathematics"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                />
              </label>
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
                    !newSubject.trim() ||
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
          <label className="form-label">
            Subject
            <Input
              placeholder="e.g. Mathematics"
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
            />
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
              disabled={savingEdit || !editName.trim() || !editSubject.trim()}
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
  onStartExercise: (ex: any) => void;
  onExit: () => void;
  onClassUpdated?: (c: ClassroomData) => void;
  onClassDeleted?: () => void;
}) {
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
    }[]
  >([]);
  const [editOpen, setEditOpen] = useState(false),
    [editName, setEditName] = useState(classroom.name),
    [editSubject, setEditSubject] = useState(classroom.subject || ''),
    [editMaxStudents, setEditMaxStudents] = useState(
      String(classroom.maxStudents || 30),
    ),
    [savingEdit, setSavingEdit] = useState(false),
    [editError, setEditError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState('');

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
  useEffect(
    () =>
      onSnapshot(collection(db, 'classrooms', classroom.id, 'exercises'), (s) =>
        setExercises(s.docs.map((d) => ({ id: d.id, ...d.data() }) as any)),
      ),
    [classroom.id],
  );

  const saveEdit = async () => {
    if (!editName.trim() || !editSubject.trim()) return;
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
        subject: editSubject.trim(),
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
                setEditName(currentClass.name);
                setEditSubject(currentClass.subject || '');
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
            <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
              {exercises.map((ex, i) => {
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
                                openEditExercise(ex);
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
                                  <small
                                    style={{
                                      color: '#777',
                                      display: 'block',
                                      fontSize: '0.72rem',
                                    }}
                                  >
                                    {sub.studentEmail}
                                  </small>
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
          <label className="form-label">
            Subject
            <Input
              placeholder="e.g. Mathematics"
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
            />
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
              disabled={savingEdit || !editName.trim() || !editSubject.trim()}
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

function StudentExerciseRunner({
  user,
  classroom,
  exercise,
  onBack,
  onExit,
}: {
  user: User;
  classroom: ClassroomData;
  exercise: any;
  onBack: () => void;
  onExit: () => void;
}) {
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

  const dueInfo = formatDeadline(exercise.deadline);
  const totalPoints = rawQuestions.reduce(
    (n, q) => n + (Number(q.points) || 1),
    0,
  );
  const currentQ = rawQuestions[currentIdx] || {
    question: 'No question text provided',
    answer: '',
    points: 1,
    enhanced: false,
  };

  useEffect(() => {
    let isMounted = true;
    const checkExisting = async () => {
      try {
        // 1. Direct doc check by user.uid
        const directSnap = await getDoc(
          doc(
            db,
            'classrooms',
            classroom.id,
            'exercises',
            exercise.id,
            'submissions',
            user.uid,
          ),
        );
        if (directSnap.exists() && isMounted) {
          const data = directSnap.data();
          const stats = computeSubmissionStats(
            { id: directSnap.id, ...data } as SubmissionData,
            exercise,
          );
          setAnswers(data.answers || {});
          setEarnedScore(data.score ?? 0);
          setTotalCorrectState(stats.correct);
          setTotalWrongState(stats.wrong);
          setIsLateSubmission(Boolean(data.isLate));
          setSubmitted(true);
          setAlreadyCompleted(true);
          setCheckingExisting(false);
          return;
        }

        // 2. Query check in case an older submission had random auto-id
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
        if (!qSnap.empty && isMounted) {
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
          setIsLateSubmission(Boolean(data.isLate));
          setSubmitted(true);
          setAlreadyCompleted(true);
          setCheckingExisting(false);
          return;
        }
      } catch (e) {
        console.warn('Check existing submission note:', e);
      } finally {
        if (isMounted) setCheckingExisting(false);
      }
    };
    checkExisting();
    return () => {
      isMounted = false;
    };
  }, [classroom.id, exercise.id, user.uid]);

  const handleAnswer = (text: string) => {
    if (alreadyCompleted || submitted) return;
    setAnswers((prev) => ({ ...prev, [currentIdx]: text }));
  };

  const isPastDeadline = Boolean(
    exercise.deadline &&
    new Date().getTime() > new Date(exercise.deadline).getTime(),
  );
  const allowsLate = exercise.allowLateSubmissions !== false;
  const isLateLocked = isPastDeadline && !allowsLate;

  const submitExercise = async () => {
    if (alreadyCompleted || submitted) {
      setSubmitError('You have already completed this exercise.');
      return;
    }
    if (isLateLocked) {
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

      rawQuestions.forEach((q, i) => {
        const userA = (answers[i] || '').trim();
        const userALow = userA.toLowerCase();
        const expA = (q.answer || '').trim();
        const expALow = expA.toLowerCase();
        const pts = Number(q.points) || 1;
        let earned = 0;
        let isCorrect = false;

        if (
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
          wrongCount++;
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
      await setDoc(
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
  const studentResults = computeSubmissionStats({ answers }, exercise).questionResults;
  const studentDifficultyBreakdown = summarizeDifficulty(studentResults);
  const studentCapability = capabilityFromResults(studentResults);

  return (
    <AppShell
      role="student"
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
            {submitted
              ? 'Completed'
              : isLateLocked
                ? 'Closed'
                : `Question ${currentIdx + 1} of ${rawQuestions.length}`}
          </span>
        </div>
      </div>

      <div className="classroom-title">
        <div>
          <span className="kicker">Exercise Checkpoint</span>
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
          <p>Loading exercise checkpoint…</p>
        </div>
      ) : submitted ? (
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
              ? 'Exercise Already Completed'
              : 'Exercise Completed!'}
          </h2>
          <p style={{ color: '#66786e', margin: '0 0 2rem' }}>
            {alreadyCompleted
              ? 'You have already answered this exercise. Review your results below.'
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
              {rawQuestions.map((q, i) => {
                const userAns = answers[i] || '';
                const userALow = userAns.trim().toLowerCase();
                const expALow = (q.answer || '').trim().toLowerCase();
                const isCorrect =
                  userALow &&
                  expALow &&
                  (userALow === expALow ||
                    expALow.includes(userALow) ||
                    userALow.includes(expALow));
                return (
                  <div
                    key={i}
                    style={{
                      borderBottom:
                        i < rawQuestions.length - 1
                          ? '1px solid #eeeae4'
                          : 'none',
                      paddingBottom: i < rawQuestions.length - 1 ? '1rem' : '0',
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
                    {q.answer && (
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: '#166534',
                          marginTop: 3,
                        }}
                      >
                        <strong>Expected answer:</strong> {q.answer}
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
      ) : (
        <div className="classroom-layout">
          <section className="panel activity-panel">
            <div className="panel-head" style={{ marginBottom: '1rem' }}>
              <div>
                <span className="kicker">
                  Question 0{currentIdx + 1} of 0{rawQuestions.length}
                </span>
                <h2 style={{ fontSize: '1.3rem', marginTop: '0.2rem' }}>
                  Solve the problem
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

            <label
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
            </label>

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
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
              >
                <ArrowLeft /> Previous
              </Button>
              {currentIdx < rawQuestions.length - 1 ? (
                <Button onClick={() => setCurrentIdx((prev) => prev + 1)}>
                  Next Question <ArrowRight />
                </Button>
              ) : (
                <Button
                  onClick={submitExercise}
                  disabled={submitting}
                  className="primary-action"
                >
                  {submitting ? <LoaderCircle /> : <Check />} Submit Exercise
                </Button>
              )}
            </div>
          </section>

          <aside className="panel class-stats">
            <span className="kicker">Progress</span>
            <h2>{progressPct}%</h2>
            <Progress value={progressPct} />
            <div
              style={{ marginTop: '1.5rem', display: 'grid', gap: '0.5rem' }}
            >
              {rawQuestions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
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
                        : answers[i]?.trim()
                          ? '#eef2ee'
                          : '#fcfbf9',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: currentIdx === i ? 700 : 500,
                    }}
                  >
                    Question 0{i + 1}
                  </span>
                  <small style={{ background: difficultyColour(q.difficulty || 'medium'), borderRadius: 999, padding: '2px 6px', textTransform: 'capitalize' }}>{q.difficulty || 'medium'}</small>
                  {answers[i]?.trim() ? (
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
                  )}
                </button>
              ))}
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
  onBack,
  onExit,
}: {
  user: User;
  classroom: ClassroomData;
  onBack: () => void;
  onExit: () => void;
}) {
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [deadline, setDeadline] = useState('');
  const [allowLateSubmissions, setAllowLateSubmissions] = useState(true);
  const [questions, setQuestions] = useState<QuestionItem[]>([
    {
      id: '1',
      question: 'Solve for x: 3x + 5 = 20.',
      answer: 'x = 5',
      points: 2,
      enhanced: false,
    },
  ]);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [questionCount, setQuestionCount] = useState(5);
  const [imageCount, setImageCount] = useState(0);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('medium');
  const [generating, setGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [quota, setQuota] = useState({ questionsUsed: 0, imagesUsed: 0 });
  const [quickGenerateIndex, setQuickGenerateIndex] = useState<number | null>(null);
  const [quickPrompt, setQuickPrompt] = useState('');
  const [quickGenerating, setQuickGenerating] = useState(false);
  const [quickGenerateError, setQuickGenerateError] = useState('');

  useEffect(() => {
    const periodKey = new Date().toISOString().slice(0, 7);
    return onSnapshot(doc(db, 'usage', `${user.uid}_${periodKey}`), (snapshot) => {
      const value = snapshot.data();
      setQuota({ questionsUsed: Number(value?.questionsUsed ?? 0), imagesUsed: Number(value?.imagesUsed ?? 0) });
    });
  }, [user.uid]);

  const addSourceFiles = (incoming: File[]) => {
    const supported = /\.(pdf|pptx|docx|md|txt|rtf|odp|odt)$/i;
    setSourceFiles((current) => [...current, ...incoming.filter((file) => supported.test(file.name))].slice(0, 5));
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => addSourceFiles(Array.from(event.target.files ?? []));
  const onFileDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); addSourceFiles(Array.from(event.dataTransfer.files)); };

  const addQuestion = () => {
    if (questions.length >= 15) return;
    setQuestions((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2, 9),
        question: '',
        answer: '',
        points: 2,
        enhanced: false,
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
      setQuickGenerateError('Your monthly AI question quota has been used.');
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
      const generated = (draft.data()?.questions ?? [])[0] as { question?: string; correctAnswer?: string; difficulty?: 'easy' | 'medium' | 'hard' } | undefined;
      if (!generated?.question) throw new Error('No question was generated. Please try again.');
      setQuestions((current) => current.map((question, index) => index === quickGenerateIndex ? { ...question, question: generated.question || '', answer: generated.correctAnswer || '', difficulty: generated.difficulty, enhanced: true } : question));
      setQuickGenerateIndex(null);
      setQuickPrompt('');
    } catch (error) {
      setQuickGenerateError(error instanceof Error ? error.message : 'AI generation failed.');
    } finally {
      setQuickGenerating(false);
    }
  };

  const hasEnhancedAny = questions.some((q) => q.enhanced);
  const isValid = title.trim() && questions.some((q) => q.question.trim());
  const generateWithAi = async () => {
    const remainingQuestions = Math.max(0, 15 - quota.questionsUsed);
    const remainingImages = Math.max(0, 5 - quota.imagesUsed);
    if (!aiPrompt.trim() && sourceFiles.length === 0) { setGenerationStatus('Add instructions or at least one source file.'); return; }
    if (questionCount > remainingQuestions || imageCount > remainingImages) { setGenerationStatus('This request is above your remaining shared quota.'); return; }
    setGenerating(true);
    setGenerationStatus('Uploading and checking your learning materials…');
    try {
      const materialIds: string[] = [];
      for (const file of sourceFiles) {
        const registration = await httpsCallable(functions, 'registerMaterial')({ classroomId: classroom.id, fileName: file.name, contentType: file.type || 'text/plain', sizeBytes: file.size });
        const material = registration.data as { materialId: string; storagePath: string };
        await uploadBytes(ref(storage, material.storagePath), file, { contentType: file.type || 'text/plain' });
        materialIds.push(material.materialId);
      }
      setGenerationStatus('Gemini is creating your draft…');
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
      const generated = (draft.data()?.questions ?? []) as Array<{ id?: string; question: string; correctAnswer: string; difficulty?: 'easy' | 'medium' | 'hard' }>;
      setQuestions(generated.map((question, index) => ({ id: question.id || `ai-${index}`, question: question.question, answer: question.correctAnswer, points: 2, enhanced: true, difficulty: question.difficulty })));
      if (!title.trim() && draft.data()?.title) setTitle(String(draft.data()?.title));
      const inferredLevel = String(draft.data()?.level || 'General education');
      setGenerationStatus(`Draft ready for ${inferredLevel}: ${generated.length} questions${imageCount ? ` and ${imageCount} images` : ''}. Review before publishing.`);
    } catch (error) {
      setGenerationStatus(error instanceof Error ? error.message : 'AI generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const publish = async () => {
    if (!title.trim()) {
      setTitleError('Please enter an exercise name before publishing.');
      return;
    }
    if (!questions.some((q) => q.question.trim())) return;
    setPublishing(true);
    try {
      await addDoc(collection(db, 'classrooms', classroom.id, 'exercises'), {
        title: title.trim(),
        deadline: deadline.trim() || null,
        allowLateSubmissions: deadline.trim() ? allowLateSubmissions : true,
        questions: questions.map((q) => ({
          question: q.question.trim(),
          answer: q.answer.trim(),
          points: q.points,
          enhanced: q.enhanced,
          difficulty: q.difficulty || 'medium',
        })),
        questionCount: questions.length,
        enhanced: hasEnhancedAny,
        teacherId: user.uid,
        createdAt: serverTimestamp(),
      });
      setPublished(true);
      setTimeout(() => onBack(), 800);
    } catch (e) {
      console.error(e);
    } finally {
      setPublishing(false);
    }
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
          <span className="draft-dot" /> {published ? 'Published' : 'Draft'} ·{' '}
          {title.trim() ? <b>{title.trim()}</b> : <em>Untitled Exercise</em>} (
          {questions.length} Question{questions.length > 1 ? 's' : ''})
        </div>
        <Button
          onClick={publish}
          disabled={published || publishing || !isValid}
          className="primary-action"
        >
          {publishing ? <LoaderCircle /> : published ? <Check /> : <Send />}{' '}
          {published ? 'Published' : `Publish (${questions.length})`}
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
      </div>
      <section style={{ background: '#fff', border: '1px solid #dfe8df', borderRadius: 22, padding: '1.5rem', marginBottom: '1.8rem' }}>
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
        {generationStatus && <p style={{ margin: '.8rem 0 0', color: generationStatus.includes('failed') || generationStatus.includes('above') ? '#a33' : '#315b42', fontWeight: 600 }}>{generationStatus}</p>}
      </section>
      <div className="builder-grid">
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
                Question text
                <Textarea
                  value={q.question}
                  onChange={(e) =>
                    updateQuestion(idx, 'question', e.target.value)
                  }
                  placeholder="Type question prompt..."
                  className="question-text"
                />
              </label>
              <div className="answer-block">
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
    [, setProfileVersion] = useState(0);
  useEffect(() => {
    void initializeSlearnAppCheck();
  }, []);
  useEffect(
    () =>
      onAuthStateChanged(auth, async (current) => {
        setUser(current);
        if (current) {
          const profile = await getDoc(doc(db, 'users', current.uid));
          setRole(profile.exists() ? (profile.data().role as Role) : null);
        } else setRole(null);
        setReady(true);
      }),
    [],
  );
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
  if (view === 'exercise' && selectedClass && selectedExercise)
    return (
      <StudentExerciseRunner
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
        onQuiz={() => setView('quiz')}
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
        onBack={() => setView('classroom')}
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
