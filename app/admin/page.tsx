'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  RotateCcw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions, googleProvider, initializeSlearnAppCheck } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SCHOOL_STAGES, SCHOOL_YEARS, type SchoolStage } from '@/lib/malaysia-curriculum';
import './admin.css';

type AdminTab = 'overview' | 'users' | 'classrooms' | 'subjects' | 'ai-quota' | 'reports';
type ViewMode = 'admin' | 'teacher' | 'student';
type ClassSort = 'name' | 'newest' | 'students' | 'progress';
type UserRow = {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  createdAt?: Timestamp;
  photoURL?: string;
};
type ClassroomRow = {
  id: string;
  name?: string;
  subject?: string;
  code?: string;
  teacherName?: string;
  teacherId?: string;
  students?: number;
  maxStudents?: number;
  progress?: number;
  createdAt?: Timestamp;
};
type SubjectProposal = {
  id: string;
  label: string;
  normalizedLabel?: string;
  schoolStage: string;
  schoolYear: string;
  requesterId: string;
  requesterName?: string;
  requesterEmail?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: Timestamp;
};
type CatalogSubject = {
  id: string;
  label: string;
  normalizedLabel?: string;
  schoolStage: SchoolStage;
  schoolYear: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
type AiQuotaRow = { id: string; displayName: string; email: string; photoURL?: string; questionsUsed: number; imagesUsed: number };

const ADMIN_EMAIL = 'admin@slearn.my';

const nav: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'classrooms', label: 'Classrooms', icon: BookOpen },
  { id: 'subjects', label: 'Subjects', icon: BookOpen },
  { id: 'ai-quota', label: 'AI quota', icon: Sparkles },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

const friendlyError = (error: unknown) => {
  const code = (error as { code?: string })?.code || '';
  if (code.includes('invalid-credential')) return 'Email or password is incorrect.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
  if (code.includes('popup-closed')) return 'Google sign-in was cancelled.';
  if (code.includes('network')) return 'Connection problem. Please try again.';
  return 'Something went wrong. Please try again.';
};

const initials = (value?: string | null) =>
  (value || 'User')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const dateLabel = (value?: Timestamp) => {
  if (!value?.toDate) return 'Recently';
  return value.toDate().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
};

function AdminLogin() {
  const [adminMode, setAdminMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const login = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setMessage(friendlyError(error));
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    setBusy(true);
    setMessage('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setMessage(friendlyError(error));
      setBusy(false);
    }
  };

  const resetPassword = async (event?: SyntheticEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
    if (!email.trim()) {
      setMessage('Enter your admin email address to receive a password reset link.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const actionCodeSettings = typeof window !== 'undefined' ? {
        url: `${window.location.origin}/?mode=resetPassword`,
        handleCodeInApp: true,
      } : undefined;
      await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
      setMessage('Password reset email sent! Please check your inbox and spam folder.');
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-login-page">
      <Link className="admin-brand login-brand" href="/" aria-label="Back to SLearn">
        <span>S</span>
        <b>SLearn</b>
      </Link>
      <section className="admin-login-card">
        <div className="admin-login-intro">
          <span className="admin-lock">{adminMode === 'reset' ? <KeyRound /> : <ShieldCheck />}</span>
          <p className="admin-eyebrow">{adminMode === 'reset' ? 'Password recovery' : 'Secure workspace'}</p>
          <h1>{adminMode === 'reset' ? 'Reset password' : 'Admin portal'}</h1>
          <p>{adminMode === 'reset' ? 'Receive a secure link to restore access to your admin workspace.' : 'View platform activity, users and classrooms from one focused dashboard.'}</p>
          <div className="admin-login-points">
            <span><Users /> User oversight</span>
            <span><BookOpen /> Classroom health</span>
            <span><BarChart3 /> Platform reports</span>
          </div>
        </div>
        <form className="admin-login-form" onSubmit={adminMode === 'reset' ? resetPassword : login}>
          <div>
            <p className="admin-eyebrow">{adminMode === 'reset' ? 'Account recovery' : 'Authorised access only'}</p>
            <h2>{adminMode === 'reset' ? 'Forgot password?' : 'Welcome back'}</h2>
            <p>{adminMode === 'reset' ? 'Enter your admin email to receive a password reset link.' : 'Sign in with an account assigned the admin role.'}</p>
          </div>
          <label>
            Email address
            <span className="admin-field"><Mail /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@slearn.my" required /></span>
          </label>
          {adminMode === 'login' && (
            <label>
              Password
              <span className="admin-field"><LockKeyhole /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></span>
            </label>
          )}
          {adminMode === 'login' && (
            <button className="admin-forgot" type="button" onClick={() => { setAdminMode('reset'); setMessage(''); }}>Forgot password?</button>
          )}
          {message && <p className="admin-form-message"><CircleAlert /> {message}</p>}
          {adminMode === 'reset' ? (
            <button className="admin-primary admin-login-button" disabled={busy || !email.trim()} type="submit">{busy ? <LoaderCircle className="spin" /> : <Send />} Send reset link</button>
          ) : (
            <button className="admin-primary admin-login-button" disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" /> : <ShieldCheck />} Sign in as admin</button>
          )}
          {adminMode === 'reset' ? (
            <button type="button" className="admin-back" onClick={() => { setAdminMode('login'); setMessage(''); }}>Back to admin login</button>
          ) : (
            <>
              <div className="admin-divider"><span>or</span></div>
              <button className="admin-google" disabled={busy} type="button" onClick={googleLogin}><span>G</span> Continue with Google</button>
              <Link className="admin-back" href="/">Back to SLearn</Link>
            </>
          )}
        </form>
      </section>
    </main>
  );
}

function AccessDenied({ user }: { user: User }) {
  return (
    <main className="admin-denied-page">
      <section className="admin-denied-card">
        <span className="admin-lock denied"><LockKeyhole /></span>
        <p className="admin-eyebrow">Restricted area</p>
        <h1>Admin access required</h1>
        <p><strong>{user.email}</strong> is signed in, but this account has not been assigned the admin role.</p>
        <div className="admin-denied-note">For safety, admin access cannot be created from this page. Ask the project owner to assign it in the user record.</div>
        <button className="admin-primary" onClick={async () => { await signOut(auth); window.location.replace('/'); }}><LogOut /> Sign out</button>
        <Link className="admin-back" href="/">Return to SLearn</Link>
      </section>
    </main>
  );
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'loading' | 'signed-out' | 'denied' | 'ready'>('loading');
  const [tab, setTab] = useState<AdminTab>('overview');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [subjectProposals, setSubjectProposals] = useState<SubjectProposal[]>([]);
  const [subjectCatalog, setSubjectCatalog] = useState<CatalogSubject[]>([]);
  const [reviewingSubject, setReviewingSubject] = useState('');
  const [subjectEditorOpen, setSubjectEditorOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<CatalogSubject | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [subjectStage, setSubjectStage] = useState<SchoolStage>('primary');
  const [subjectYear, setSubjectYear] = useState(SCHOOL_YEARS.primary[0]);
  const [savingSubject, setSavingSubject] = useState(false);
  const [subjectError, setSubjectError] = useState('');
  const [subjectToDelete, setSubjectToDelete] = useState<CatalogSubject | null>(null);
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('admin');
  const [classCategory, setClassCategory] = useState('all');
  const [classSort, setClassSort] = useState<ClassSort>('name');
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
  const [classToDelete, setClassToDelete] = useState<ClassroomRow | null>(null);
  const [adminActionBusy, setAdminActionBusy] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [dataError, setDataError] = useState('');
  const [quotaRows, setQuotaRows] = useState<AiQuotaRow[]>([]);
  const [quotaLimits, setQuotaLimits] = useState({ questions: 15, images: 5 });
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaTarget, setQuotaTarget] = useState<AiQuotaRow | 'all' | null>(null);
  const [quotaBusy, setQuotaBusy] = useState(false);

  useEffect(() => { void initializeSlearnAppCheck(); }, []);

  const logoutAdmin = async () => {
    await signOut(auth);
    window.location.replace('/');
  };

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setUser(nextUser);
    if (!nextUser) {
      setStatus('signed-out');
      window.location.replace('/');
      return;
    }
    try {
      const profile = await getDoc(doc(db, 'users', nextUser.uid));
      setStatus(profile.data()?.role === 'admin' ? 'ready' : 'denied');
    } catch {
      setStatus('denied');
    }
  }), []);

  useEffect(() => {
    if (status !== 'ready') return;
    const stopUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as UserRow)));
      setDataError('');
    }, () => setDataError('User data could not be loaded.'));
    const stopClasses = onSnapshot(collection(db, 'classrooms'), (snapshot) => {
      setClassrooms(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ClassroomRow)));
      setDataError('');
    }, () => setDataError('Classroom data could not be loaded.'));
    const stopSubjects = onSnapshot(collection(db, 'subjectProposals'), (snapshot) => {
      setSubjectProposals(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SubjectProposal)));
    }, () => setDataError('Subject requests could not be loaded.'));
    const stopCatalog = onSnapshot(collection(db, 'subjectCatalog'), (snapshot) => {
      setSubjectCatalog(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as CatalogSubject)));
    }, () => setDataError('Subject catalogue could not be loaded.'));
    return () => { stopUsers(); stopClasses(); stopSubjects(); stopCatalog(); };
  }, [status]);

  const openSubjectEditor = (subject?: CatalogSubject) => {
    setEditingSubject(subject || null);
    setSubjectName(subject?.label || '');
    setSubjectStage(subject?.schoolStage || 'primary');
    setSubjectYear(subject?.schoolYear || SCHOOL_YEARS.primary[0]);
    setSubjectError('');
    setSubjectEditorOpen(true);
  };

  const removeSubject = async () => {
    if (!subjectToDelete) return;
    setDeletingSubject(true);
    setDataError('');
    try {
      await deleteDoc(doc(db, 'subjectCatalog', subjectToDelete.id));
      setSubjectToDelete(null);
    } catch {
      setDataError('The subject could not be deleted. Please try again.');
    } finally {
      setDeletingSubject(false);
    }
  };

  const saveSubject = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !subjectName.trim()) return;
    setSavingSubject(true);
    setSubjectError('');
    try {
      const cleanName = subjectName.trim();
      const catalogId = editingSubject?.id || `${subjectStage}-${subjectYear}-${cleanName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
      await setDoc(doc(db, 'subjectCatalog', catalogId), {
        label: cleanName,
        normalizedLabel: cleanName.toLowerCase(),
        schoolStage: subjectStage,
        schoolYear: subjectYear,
        managedBy: user.uid,
        updatedAt: serverTimestamp(),
        ...(editingSubject ? {} : { createdAt: serverTimestamp() }),
      }, { merge: true });
      setSubjectEditorOpen(false);
    } catch {
      setSubjectError('The subject could not be saved. Please try again.');
    } finally {
      setSavingSubject(false);
    }
  };

  const reviewSubject = async (proposal: SubjectProposal, approved: boolean) => {
    if (!user) return;
    setReviewingSubject(proposal.id);
    setDataError('');
    try {
      if (approved) {
        const catalogId = `${proposal.schoolStage}-${proposal.schoolYear}-${proposal.normalizedLabel || proposal.label.toLowerCase()}`.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
        await setDoc(doc(db, 'subjectCatalog', catalogId), {
          label: proposal.label,
          normalizedLabel: proposal.normalizedLabel || proposal.label.toLowerCase(),
          schoolStage: proposal.schoolStage,
          schoolYear: proposal.schoolYear,
          approvedFrom: proposal.id,
          approvedBy: user.uid,
          approvedAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, 'subjectProposals', proposal.id), {
        status: approved ? 'approved' : 'rejected',
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp(),
      });
    } catch {
      setDataError('The subject request could not be reviewed. Please try again.');
    } finally {
      setReviewingSubject('');
    }
  };

  const stats = useMemo(() => {
    const students = users.filter((item) => item.role === 'student').length;
    const teachers = users.filter((item) => item.role === 'teacher').length;
    const learners = classrooms.reduce((sum, item) => sum + (item.students || 0), 0);
    const capacity = classrooms.reduce((sum, item) => sum + (item.maxStudents || 30), 0);
    const progress = classrooms.length ? Math.round(classrooms.reduce((sum, item) => sum + (item.progress || 0), 0) / classrooms.length) : 0;
    return { students, teachers, learners, capacity, progress };
  }, [users, classrooms]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((item) => !query || `${item.displayName || ''} ${item.email || ''} ${item.role || ''}`.toLowerCase().includes(query));
  }, [users, search]);

  const filteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return classrooms
      .filter((item) => classCategory === 'all' || (item.subject || 'Uncategorised') === classCategory)
      .filter((item) => !query || `${item.name || ''} ${item.subject || ''} ${item.code || ''} ${item.teacherName || ''}`.toLowerCase().includes(query))
      .sort((a, b) => {
        if (classSort === 'students') return (b.students || 0) - (a.students || 0);
        if (classSort === 'progress') return (b.progress || 0) - (a.progress || 0);
        if (classSort === 'newest') return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [classrooms, search, classCategory, classSort]);

  const filteredSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return subjectCatalog.filter((item) => !query || `${item.label} ${item.schoolStage} ${item.schoolYear}`.toLowerCase().includes(query));
  }, [subjectCatalog, search]);

  const classCategories = useMemo(() => Array.from(new Set(classrooms.map((item) => item.subject || 'Uncategorised'))).sort(), [classrooms]);

  const updateUserRole = async (target: UserRow, role: 'student' | 'teacher') => {
    if (target.id === user?.uid || target.role === role) return;
    setAdminActionBusy(`role-${target.id}`);
    setDataError('');
    try {
      await httpsCallable(functions, 'adminUpdateUserRole')({ userId: target.id, role });
    } catch {
      setDataError('The user role could not be updated. Please try again.');
    } finally {
      setAdminActionBusy('');
    }
  };

  const removeUser = async () => {
    if (!userToDelete) return;
    setAdminActionBusy(`delete-user-${userToDelete.id}`);
    setDataError('');
    try {
      await httpsCallable(functions, 'adminDeleteUser')({ userId: userToDelete.id });
      setUserToDelete(null);
    } catch {
      setDataError('The user could not be deleted. Please try again.');
    } finally {
      setAdminActionBusy('');
    }
  };

  const removeClassroom = async () => {
    if (!classToDelete) return;
    setAdminActionBusy(`delete-class-${classToDelete.id}`);
    setDataError('');
    try {
      await httpsCallable(functions, 'adminDeleteClassroom')({ classroomId: classToDelete.id });
      setClassToDelete(null);
    } catch {
      setDataError('The classroom could not be deleted. Please try again.');
    } finally {
      setAdminActionBusy('');
    }
  };

  const loadQuotas = async () => {
    setQuotaLoading(true);
    setDataError('');
    try {
      const result = await httpsCallable(functions, 'adminListAiQuotas')();
      const payload = result.data as { teachers?: AiQuotaRow[]; questionLimit?: number; imageLimit?: number };
      setQuotaRows(payload.teachers || []);
      setQuotaLimits({ questions: payload.questionLimit || 15, images: payload.imageLimit || 5 });
    } catch { setDataError('AI quota data could not be loaded. Please try again.'); }
    finally { setQuotaLoading(false); }
  };

  const resetAiQuota = async () => {
    if (!quotaTarget) return;
    setQuotaBusy(true);
    setDataError('');
    try {
      await httpsCallable(functions, 'adminResetAiQuota')(quotaTarget === 'all' ? { resetAll: true } : { userId: quotaTarget.id });
      setQuotaTarget(null);
      await loadQuotas();
    } catch { setDataError('The AI quota could not be reset. Please try again.'); }
    finally { setQuotaBusy(false); }
  };

  const selectTab = (next: AdminTab) => {
    setTab(next);
    if (next === 'ai-quota') void loadQuotas();
    setSearch('');
    setClassCategory('all');
    setMenuOpen(false);
  };

  if (status === 'loading') return <main className="admin-loading"><span className="admin-brand"><span>S</span><b>SLearn</b></span><LoaderCircle className="spin" /><p>Checking secure access…</p></main>;
  if (status === 'signed-out') return <main className="admin-loading"><span className="admin-brand"><span>S</span><b>SLearn</b></span><LoaderCircle className="spin" /><p>Returning to SLearn…</p></main>;
  if (status === 'denied' && user) return <AccessDenied user={user} />;

  const currentTitle = nav.find((item) => item.id === tab)?.label || 'Overview';

  return (
    <main className="admin-app">
      <aside className={menuOpen ? 'admin-sidebar open' : 'admin-sidebar'}>
        <div className="admin-sidebar-head"><Link className="admin-brand" href="/"><span>S</span><b>SLearn</b></Link><button onClick={() => setMenuOpen(false)} className="admin-close" aria-label="Close menu"><X /></button></div>
        <div className="admin-badge"><ShieldCheck /><div><b>Admin portal</b><small>Platform control centre</small></div></div>
        <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => selectTab(id)}><Icon /> {label}<ChevronRight /></button>)}</nav>
        <div className="admin-account"><Avatar photo={user?.photoURL} name={user?.displayName || user?.email || 'A'} /><div><b>{user?.displayName || 'Administrator'}</b><small>{user?.email}</small></div><button onClick={() => void logoutAdmin()} aria-label="Sign out"><LogOut /></button></div>
      </aside>
      {menuOpen && <button className="admin-scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu" />}
      <section className="admin-content">
        <header className="admin-topbar"><div><button className="admin-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button><div><p className="admin-eyebrow">SLearn administration</p><h1>{viewMode === 'admin' ? currentTitle : `${viewMode === 'teacher' ? 'Teacher' : 'Student'} view`}</h1></div></div><div className="admin-top-actions"><div className="admin-view-toggle" aria-label="Preview role"><button className={viewMode === 'admin' ? 'active' : ''} onClick={() => setViewMode('admin')}>Admin</button><button className={viewMode === 'teacher' ? 'active' : ''} onClick={() => setViewMode('teacher')}>Teacher</button><button className={viewMode === 'student' ? 'active' : ''} onClick={() => setViewMode('student')}>Student</button></div><div className="admin-live"><i /> Live data</div></div></header>
        {dataError && <p className="admin-data-error"><CircleAlert /> {dataError}</p>}

        {viewMode !== 'admin' ? <RolePreview key={viewMode} role={viewMode} classrooms={classrooms} users={users} /> : <>

        {tab === 'overview' && <>
          <section className="admin-welcome"><div><p className="admin-eyebrow">Platform pulse</p><h2>Everything in one calm view.</h2><p>Monitor growth, classroom activity and the learning community without stepping into their workspace.</p></div><span><GraduationCap /></span></section>
          <section className="admin-stat-grid">
            <article className="mint"><span><Users /></span><small>Total users</small><strong>{users.length}</strong><p>{stats.students} students · {stats.teachers} teachers</p></article>
            <article className="peach"><span><BookOpen /></span><small>Classrooms</small><strong>{classrooms.length}</strong><p>{stats.learners} active enrolments</p></article>
            <article className="lilac"><span><GraduationCap /></span><small>Students</small><strong>{stats.students}</strong><p>Across the whole platform</p></article>
            <article className="yellow"><span><BarChart3 /></span><small>Average progress</small><strong>{stats.progress}%</strong><p>Across all classrooms</p></article>
          </section>
          <section className="admin-two-column">
            <article className="admin-panel"><div className="admin-panel-head"><div><p className="admin-eyebrow">Newest spaces</p><h3>Recent classrooms</h3></div><button onClick={() => selectTab('classrooms')}>View all <ChevronRight /></button></div>{classrooms.length ? classrooms.slice(0, 4).map((item) => <div className="admin-list-row" key={item.id}><span className="class-icon"><BookOpen /></span><div><b>{item.name || 'Untitled classroom'}</b><small>{item.teacherName || 'Teacher'} · {item.code || 'No code'}</small></div><strong>{item.students || 0}/{item.maxStudents || 30}</strong></div>) : <EmptyState icon={BookOpen} title="No classrooms yet" text="New classrooms will appear here." />}</article>
            <article className="admin-panel"><div className="admin-panel-head"><div><p className="admin-eyebrow">Community</p><h3>Recent users</h3></div><button onClick={() => selectTab('users')}>View all <ChevronRight /></button></div>{users.length ? users.slice(0, 4).map((item) => <div className="admin-list-row" key={item.id}><Avatar photo={item.photoURL} name={item.displayName || item.email} /><div><b>{item.displayName || 'New user'}</b><small>{item.email || 'No email'}</small></div><em className={`role-pill ${item.role || 'user'}`}>{item.role || 'user'}</em></div>) : <EmptyState icon={Users} title="No users yet" text="Signed-up users will appear here." />}</article>
          </section>
        </>}

        {tab === 'users' && <section className="admin-panel admin-directory"><DirectoryHead eyebrow={`${users.length} accounts`} title="User directory" value={search} onChange={setSearch} placeholder="Search name, email or role" />{filteredUsers.length ? <div className="admin-table admin-user-table"><div className="admin-table-head"><span>User</span><span>Role</span><span>Joined</span><span>Status</span><span>Actions</span></div>{filteredUsers.map((item) => <div className="admin-table-row" key={item.id}><div className="admin-user-cell"><Avatar photo={item.photoURL} name={item.displayName || item.email} /><div><b>{item.displayName || 'New user'}</b><small>{item.email || 'No email'}</small></div></div><span>{item.role === 'admin' ? <em className="role-pill admin">admin</em> : <select className="admin-role-select" value={item.role === 'teacher' ? 'teacher' : 'student'} disabled={adminActionBusy === `role-${item.id}`} onChange={(event) => void updateUserRole(item, event.target.value as 'student' | 'teacher')}><option value="student">Student</option><option value="teacher">Teacher</option></select>}</span><span>{dateLabel(item.createdAt)}</span><span className="active-status"><i /> Active</span><span><button className="admin-row-delete" disabled={item.id === user?.uid || Boolean(adminActionBusy)} onClick={() => setUserToDelete(item)} aria-label={`Delete ${item.displayName || item.email}`}><Trash2 /> Delete</button></span></div>)}</div> : <EmptyState icon={Search} title="No matching users" text="Try a different name, email or role." />}</section>}

        {tab === 'classrooms' && <section className="admin-panel admin-directory"><div className="admin-directory-head admin-class-directory-head"><div><p className="admin-eyebrow">{filteredClasses.length} of {classrooms.length} learning spaces</p><h2>Classroom directory</h2></div><div className="admin-directory-tools"><label className="admin-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search classroom, teacher or code" /></label><label className="admin-filter"><BookOpen /><select value={classCategory} onChange={(event) => setClassCategory(event.target.value)} aria-label="Filter by subject"><option value="all">All subjects</option>{classCategories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label><label className="admin-filter"><SlidersHorizontal /><select value={classSort} onChange={(event) => setClassSort(event.target.value as ClassSort)} aria-label="Sort classrooms"><option value="name">Name A–Z</option><option value="newest">Newest first</option><option value="students">Most students</option><option value="progress">Highest progress</option></select></label></div></div>{filteredClasses.length ? <div className="admin-class-grid">{filteredClasses.map((item, index) => <article className={`admin-class-card tone-${index % 4}`} key={item.id}><div className="admin-class-top"><span><BookOpen /></span><div><em>{item.code || 'NO-CODE'}</em><button className="admin-class-delete" onClick={() => setClassToDelete(item)} aria-label={`Delete ${item.name || 'classroom'}`}><Trash2 /></button></div></div><small>{item.subject || 'General learning'}</small><h3>{item.name || 'Untitled classroom'}</h3><p>Led by {item.teacherName || 'Teacher'}</p><div className="admin-class-metrics"><span><Users /> {item.students || 0}/{item.maxStudents || 30}</span><b>{item.progress || 0}% progress</b></div><div className="admin-progress"><i style={{ width: `${Math.min(100, item.progress || 0)}%` }} /></div></article>)}</div> : <EmptyState icon={Search} title="No matching classrooms" text="Try another search, subject category or sorting option." />}</section>}

        {tab === 'subjects' && <section className="admin-subject-space">
          <section className="admin-panel admin-subject-catalog">
            <div className="admin-directory-head"><div><p className="admin-eyebrow">{filteredSubjects.length} of {subjectCatalog.length} custom subjects</p><h2>Subject management</h2></div><div className="admin-subject-head-tools"><label className="admin-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subject, level or year" /></label><button className="admin-primary admin-add-subject" onClick={() => openSubjectEditor()}><Plus /> Add subject</button></div></div>
            {filteredSubjects.length ? <div className="admin-subject-grid">{filteredSubjects.slice().sort((a, b) => a.label.localeCompare(b.label)).map((item) => <article className="admin-subject-card" key={item.id}><span><BookOpen /></span><div><small>{item.schoolStage} · {item.schoolYear}</small><h3>{item.label}</h3><p>Available to teachers creating or editing classrooms.</p></div><div className="admin-subject-actions"><button onClick={() => openSubjectEditor(item)} aria-label={`Edit ${item.label}`}><Pencil /> Edit</button><button className="admin-delete-subject" onClick={() => setSubjectToDelete(item)} aria-label={`Delete ${item.label}`}><Trash2 /> Delete</button></div></article>)}</div> : <EmptyState icon={Search} title="No matching subjects" text="Try another subject name, school level or year." />}
          </section>
          <section className="admin-panel admin-subject-requests">
            <div className="admin-panel-head"><div><p className="admin-eyebrow">{subjectProposals.filter((item) => item.status === 'pending').length} pending</p><h3>Teacher requests</h3></div></div>
            <div className="subject-request-list">{subjectProposals.filter((item) => item.status === 'pending').length ? subjectProposals.filter((item) => item.status === 'pending').map((item) => <article className="subject-request-card" key={item.id}><div><small>{item.schoolStage} · {item.schoolYear}</small><h3>{item.label}</h3><p>Requested by {item.requesterName || item.requesterEmail || 'Teacher'} · {dateLabel(item.createdAt)}</p></div><div><button className="subject-reject" disabled={reviewingSubject === item.id} onClick={() => reviewSubject(item, false)}><X /> Reject</button><button className="admin-primary" disabled={reviewingSubject === item.id} onClick={() => reviewSubject(item, true)}>{reviewingSubject === item.id ? <LoaderCircle className="spin" /> : <Check />} Approve</button></div></article>) : <EmptyState icon={Check} title="No pending requests" text="New teacher-submitted subjects will appear here." />}</div>
          </section>
        </section>}

        {tab === 'ai-quota' && <section className="admin-panel admin-directory admin-quota-directory">
          <div className="admin-directory-head"><div><p className="admin-eyebrow">Weekly AI allowance</p><h2>AI quota management</h2><p className="admin-directory-copy">Monitor question and image generation credits for every teacher.</p></div><button className="admin-primary admin-reset-all" disabled={quotaLoading || quotaRows.length === 0} onClick={() => setQuotaTarget('all')}><RotateCcw /> Reset all teachers</button></div>
          <div className="admin-quota-summary"><article><Sparkles /><span><small>QUESTION LIMIT</small><strong>{quotaLimits.questions}</strong><p>per teacher, weekly</p></span></article><article><BookOpen /><span><small>IMAGE LIMIT</small><strong>{quotaLimits.images}</strong><p>per teacher, weekly</p></span></article></div>
          {quotaLoading ? <div className="admin-quota-loading"><LoaderCircle className="spin" /> Loading teacher quotas…</div> : quotaRows.length ? <div className="admin-quota-list">{quotaRows.map((item) => <article className="admin-quota-card" key={item.id}><div className="admin-quota-person"><Avatar photo={item.photoURL} name={item.displayName || item.email} /><div><b>{item.displayName}</b><small>{item.email || 'No email'}</small></div></div><QuotaMeter label="Questions" used={item.questionsUsed} limit={quotaLimits.questions} /><QuotaMeter label="Images" used={item.imagesUsed} limit={quotaLimits.images} image /><button className="admin-quota-reset" onClick={() => setQuotaTarget(item)}><RotateCcw /> Reset quota</button></article>)}</div> : <EmptyState icon={Sparkles} title="No teachers yet" text="Teacher AI usage will appear here after an account is created." />}
        </section>}

        {tab === 'reports' && <>
          <section className="admin-report-grid">
            <article className="admin-report-card"><p className="admin-eyebrow">Community mix</p><h3>Users by role</h3><ReportBar label="Students" value={stats.students} total={Math.max(users.length, 1)} colour="mint" /><ReportBar label="Teachers" value={stats.teachers} total={Math.max(users.length, 1)} colour="peach" /><ReportBar label="Administrators" value={users.filter((item) => item.role === 'admin').length} total={Math.max(users.length, 1)} colour="black" /></article>
            <article className="admin-report-card"><p className="admin-eyebrow">Classroom capacity</p><h3>{stats.learners} of {stats.capacity} seats filled</h3><div className="admin-ring" style={{ '--value': `${stats.capacity ? Math.round(stats.learners / stats.capacity * 100) : 0}%` } as React.CSSProperties}><span>{stats.capacity ? Math.round(stats.learners / stats.capacity * 100) : 0}<small>%</small></span></div><p>Capacity updates whenever teachers approve new learners.</p></article>
            <article className="admin-report-card wide"><div><p className="admin-eyebrow">Learning health</p><h3>Progress across classrooms</h3></div>{classrooms.length ? classrooms.slice().sort((a, b) => (b.progress || 0) - (a.progress || 0)).map((item) => <div className="admin-progress-row" key={item.id}><span>{item.name || 'Untitled classroom'}</span><div className="admin-progress"><i style={{ width: `${Math.min(100, item.progress || 0)}%` }} /></div><b>{item.progress || 0}%</b></div>) : <EmptyState icon={BarChart3} title="No progress data" text="Reports will grow with classroom activity." />}</article>
          </section>
        </>}
        <Dialog open={subjectEditorOpen} onOpenChange={setSubjectEditorOpen}>
          <DialogContent className="admin-subject-dialog">
            <form onSubmit={saveSubject}>
              <DialogHeader><DialogTitle>{editingSubject ? 'Edit subject' : 'Add a new subject'}</DialogTitle><DialogDescription>This subject will appear in the classroom subject list for the selected school level and year.</DialogDescription></DialogHeader>
              <div className="admin-subject-form">
                <label htmlFor="admin-subject-name">Subject name<Input id="admin-subject-name" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="e.g. Computer Science" maxLength={80} required /></label>
                <label htmlFor="admin-subject-stage">School level<select id="admin-subject-stage" value={subjectStage} onChange={(event) => { const stage = event.target.value as SchoolStage; setSubjectStage(stage); setSubjectYear(SCHOOL_YEARS[stage][0]); }}>{SCHOOL_STAGES.map((stage) => <option value={stage.value} key={stage.value}>{stage.label}</option>)}</select></label>
                <label htmlFor="admin-subject-year">Year / Form<select id="admin-subject-year" value={subjectYear} onChange={(event) => setSubjectYear(event.target.value)}>{SCHOOL_YEARS[subjectStage].map((year) => <option value={year} key={year}>{year}</option>)}</select></label>
                {subjectError && <p className="admin-form-message"><CircleAlert /> {subjectError}</p>}
              </div>
              <DialogFooter><Button variant="outline" type="button" onClick={() => setSubjectEditorOpen(false)} disabled={savingSubject}>Cancel</Button><Button type="submit" disabled={savingSubject || !subjectName.trim()}>{savingSubject ? <LoaderCircle className="spin" /> : <Check />} {editingSubject ? 'Save changes' : 'Add subject'}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <AlertDialog open={Boolean(subjectToDelete)} onOpenChange={(open) => { if (!open && !deletingSubject) setSubjectToDelete(null); }}>
          <AlertDialogContent className="admin-delete-dialog">
            <AlertDialogHeader><AlertDialogMedia><Trash2 /></AlertDialogMedia><AlertDialogTitle>Delete {subjectToDelete?.label}?</AlertDialogTitle><AlertDialogDescription>This removes the subject from the shared classroom list. Existing classrooms using it will keep their current subject name.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel disabled={deletingSubject}>Cancel</AlertDialogCancel><AlertDialogAction className="admin-confirm-delete" disabled={deletingSubject} onClick={() => void removeSubject()}>{deletingSubject ? <LoaderCircle className="spin" /> : <Trash2 />} Delete subject</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={Boolean(userToDelete)} onOpenChange={(open) => { if (!open && !adminActionBusy) setUserToDelete(null); }}>
          <AlertDialogContent className="admin-delete-dialog"><AlertDialogHeader><AlertDialogMedia><Trash2 /></AlertDialogMedia><AlertDialogTitle>Delete {userToDelete?.displayName || userToDelete?.email}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the account, its profile, memberships and pending join requests. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={Boolean(adminActionBusy)}>Cancel</AlertDialogCancel><AlertDialogAction className="admin-confirm-delete" disabled={Boolean(adminActionBusy)} onClick={() => void removeUser()}>{adminActionBusy ? <LoaderCircle className="spin" /> : <Trash2 />} Delete user</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={Boolean(classToDelete)} onOpenChange={(open) => { if (!open && !adminActionBusy) setClassToDelete(null); }}>
          <AlertDialogContent className="admin-delete-dialog"><AlertDialogHeader><AlertDialogMedia><Trash2 /></AlertDialogMedia><AlertDialogTitle>Delete {classToDelete?.name}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the classroom, exercises, submissions, memberships and pending requests. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={Boolean(adminActionBusy)}>Cancel</AlertDialogCancel><AlertDialogAction className="admin-confirm-delete" disabled={Boolean(adminActionBusy)} onClick={() => void removeClassroom()}>{adminActionBusy ? <LoaderCircle className="spin" /> : <Trash2 />} Delete classroom</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={Boolean(quotaTarget)} onOpenChange={(open) => { if (!open && !quotaBusy) setQuotaTarget(null); }}>
          <AlertDialogContent className="admin-delete-dialog admin-quota-dialog"><AlertDialogHeader><AlertDialogMedia><RotateCcw /></AlertDialogMedia><AlertDialogTitle>{quotaTarget === 'all' ? 'Reset every teacher quota?' : `Reset ${quotaTarget && typeof quotaTarget !== 'string' ? quotaTarget.displayName : 'teacher'}’s quota?`}</AlertDialogTitle><AlertDialogDescription>This immediately restores all weekly question and image generation credits. The normal weekly reset schedule will stay the same.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={quotaBusy}>Cancel</AlertDialogCancel><AlertDialogAction className="admin-confirm-reset" disabled={quotaBusy} onClick={() => void resetAiQuota()}>{quotaBusy ? <LoaderCircle className="spin" /> : <RotateCcw />} Reset quota</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
        </>}
      </section>
    </main>
  );
}

function RolePreview({ role, classrooms, users }: { role: 'teacher' | 'student'; classrooms: ClassroomRow[]; users: UserRow[] }) {
  const [page, setPage] = useState<'dashboard' | 'classrooms' | 'progress' | 'profile'>('dashboard');
  const teachers = users.filter((item) => item.role === 'teacher').length;
  const students = users.filter((item) => item.role === 'student').length;
  const sample = classrooms.slice(0, page === 'classrooms' ? classrooms.length : 3);
  const averageProgress = classrooms.length ? Math.round(classrooms.reduce((sum, item) => sum + (item.progress || 0), 0) / classrooms.length) : 0;
  const pages = [{ id: 'dashboard', label: 'Home', icon: LayoutDashboard }, { id: 'classrooms', label: 'Classrooms', icon: BookOpen }, { id: 'progress', label: 'Progress', icon: BarChart3 }, { id: 'profile', label: 'Profile', icon: Users }] as const;
  return <section className={`admin-role-preview ${role}`}>
    <nav className="admin-preview-nav">{pages.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon />{label}</button>)}<span><Eye /> Read-only preview</span></nav>
    {page === 'dashboard' && <><div className="admin-preview-banner"><div><p className="admin-eyebrow">{role} home</p><h2>{role === 'teacher' ? 'Ready to teach?' : 'Ready to learn?'}</h2><p>{role === 'teacher' ? 'Review classrooms, learner activity and teaching progress.' : 'Continue learning, check classes and follow your progress.'}</p></div><span>{role === 'teacher' ? <GraduationCap /> : <BookOpen />}</span></div><div className="admin-preview-stats"><article><small>{role === 'teacher' ? 'YOUR CLASSROOMS' : 'MY CLASSROOMS'}</small><strong>{classrooms.length}</strong></article><article><small>{role === 'teacher' ? 'TOTAL LEARNERS' : 'OVERALL PROGRESS'}</small><strong>{role === 'teacher' ? students : `${averageProgress}%`}</strong></article><article><small>{role === 'teacher' ? 'ACTIVE STUDENTS' : 'TEACHERS'}</small><strong>{role === 'teacher' ? students : teachers}</strong></article></div></>}
    {(page === 'dashboard' || page === 'classrooms') && <div className="admin-panel"><div className="admin-panel-head"><div><p className="admin-eyebrow">{page === 'classrooms' ? 'All learning spaces' : 'Role experience'}</p><h3>{role === 'teacher' ? 'Classroom overview' : 'My learning spaces'}</h3></div>{page === 'dashboard' && <button onClick={() => setPage('classrooms')}>View all <ChevronRight /></button>}</div>{sample.length ? <div className="admin-class-grid">{sample.map((item, index) => <article className={`admin-class-card tone-${index % 4}`} key={item.id}><div className="admin-class-top"><span><BookOpen /></span><em>{item.code || 'CLASS'}</em></div><small>{item.subject || 'General learning'}</small><h3>{item.name || 'Classroom'}</h3><p>{role === 'teacher' ? `${item.students || 0} learners enrolled` : `Teacher · ${item.teacherName || 'Teacher'}`}</p><div className="admin-class-metrics"><span><Users /> {item.students || 0}</span><b>{item.progress || 0}% progress</b></div><div className="admin-progress"><i style={{ width: `${item.progress || 0}%` }} /></div></article>)}</div> : <EmptyState icon={BookOpen} title="No classrooms to preview" text="Classrooms will appear here once created." />}</div>}
    {page === 'progress' && <div className="admin-panel admin-preview-detail"><div className="admin-panel-head"><div><p className="admin-eyebrow">Learning performance</p><h3>{role === 'teacher' ? 'Class progress overview' : 'My progress'}</h3></div><strong>{averageProgress}% average</strong></div>{classrooms.length ? classrooms.map((item) => <div className="admin-progress-row" key={item.id}><span>{item.name || 'Untitled classroom'}</span><div className="admin-progress"><i style={{ width: `${Math.min(100, item.progress || 0)}%` }} /></div><b>{item.progress || 0}%</b></div>) : <EmptyState icon={BarChart3} title="No progress data" text="Progress will appear after classroom activities begin." />}</div>}
    {page === 'profile' && <div className="admin-panel admin-preview-profile"><div className="admin-preview-avatar">A</div><div><p className="admin-eyebrow">Preview account</p><h2>{role === 'teacher' ? 'Teacher profile' : 'Student profile'}</h2><p>This preview shows the profile area without changing the administrator account or another user’s data.</p><div className="admin-profile-fields"><div>Display name<span>Administrator preview</span></div><div>Account role<span className={`role-pill ${role}`}>{role}</span></div><div>Access mode<span>Read only</span></div></div></div></div>}
  </section>;
}

function QuotaMeter({ label, used, limit, image = false }: { label: string; used: number; limit: number; image?: boolean }) {
  const percent = Math.min(100, limit ? used / limit * 100 : 0);
  return <div className="admin-quota-meter"><div><span>{label}</span><b>{used}/{limit} used</b></div><div className={`admin-progress${image ? ' image' : ''}`}><i style={{ width: `${percent}%` }} /></div></div>;
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof BookOpen; title: string; text: string }) {
  return <div className="admin-empty"><Icon /><b>{title}</b><p>{text}</p></div>;
}

function Avatar({ photo, name }: { photo?: string | null; name?: string | null }) {
  return <span className="user-avatar" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>{photo ? null : initials(name)}</span>;
}

function DirectoryHead({ eyebrow, title, value, onChange, placeholder }: { eyebrow: string; title: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="admin-directory-head"><div><p className="admin-eyebrow">{eyebrow}</p><h2>{title}</h2></div><label className="admin-search"><Search /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label></div>;
}

function ReportBar({ label, value, total, colour }: { label: string; value: number; total: number; colour: string }) {
  const width = Math.max(value ? 5 : 0, Math.round(value / total * 100));
  return <div className="admin-report-bar"><div><span>{label}</span><b>{value}</b></div><div><i className={colour} style={{ width: `${width}%` }} /></div></div>;
}
