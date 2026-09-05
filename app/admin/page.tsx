'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  CircleAlert,
  Eye,
  EyeOff,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Search,
  ShieldCheck,
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
import { collection, doc, getDoc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import './admin.css';

type AdminTab = 'overview' | 'users' | 'classrooms' | 'reports';
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

const nav: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'classrooms', label: 'Classrooms', icon: BookOpen },
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
  const [email, setEmail] = useState('');
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

  const resetPassword = async () => {
    if (!email.trim()) {
      setMessage('Enter your admin email first, then select Forgot password.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage('Password reset email sent. Check your inbox.');
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
          <span className="admin-lock"><ShieldCheck /></span>
          <p className="admin-eyebrow">Secure workspace</p>
          <h1>Admin portal</h1>
          <p>View platform activity, users and classrooms from one focused dashboard.</p>
          <div className="admin-login-points">
            <span><Users /> User oversight</span>
            <span><BookOpen /> Classroom health</span>
            <span><BarChart3 /> Platform reports</span>
          </div>
        </div>
        <form className="admin-login-form" onSubmit={login}>
          <div>
            <p className="admin-eyebrow">Authorised access only</p>
            <h2>Welcome back</h2>
            <p>Sign in with an account assigned the admin role.</p>
          </div>
          <label>
            Email address
            <span className="admin-field"><Mail /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" required /></span>
          </label>
          <label>
            Password
            <span className="admin-field"><LockKeyhole /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></span>
          </label>
          <button className="admin-forgot" type="button" onClick={resetPassword}>Forgot password?</button>
          {message && <p className="admin-form-message"><CircleAlert /> {message}</p>}
          <button className="admin-primary admin-login-button" disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" /> : <ShieldCheck />} Sign in as admin</button>
          <div className="admin-divider"><span>or</span></div>
          <button className="admin-google" disabled={busy} type="button" onClick={googleLogin}><span>G</span> Continue with Google</button>
          <Link className="admin-back" href="/">Back to SLearn</Link>
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
        <button className="admin-primary" onClick={() => signOut(auth)}><LogOut /> Sign out</button>
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
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [dataError, setDataError] = useState('');

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setUser(nextUser);
    if (!nextUser) {
      setStatus('signed-out');
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
    return () => { stopUsers(); stopClasses(); };
  }, [status]);

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
    return classrooms.filter((item) => !query || `${item.name || ''} ${item.subject || ''} ${item.code || ''} ${item.teacherName || ''}`.toLowerCase().includes(query));
  }, [classrooms, search]);

  const selectTab = (next: AdminTab) => {
    setTab(next);
    setSearch('');
    setMenuOpen(false);
  };

  if (status === 'loading') return <main className="admin-loading"><span className="admin-brand"><span>S</span><b>SLearn</b></span><LoaderCircle className="spin" /><p>Checking secure access…</p></main>;
  if (status === 'signed-out') return <AdminLogin />;
  if (status === 'denied' && user) return <AccessDenied user={user} />;

  const currentTitle = nav.find((item) => item.id === tab)?.label || 'Overview';

  return (
    <main className="admin-app">
      <aside className={menuOpen ? 'admin-sidebar open' : 'admin-sidebar'}>
        <div className="admin-sidebar-head"><Link className="admin-brand" href="/"><span>S</span><b>SLearn</b></Link><button onClick={() => setMenuOpen(false)} className="admin-close" aria-label="Close menu"><X /></button></div>
        <div className="admin-badge"><ShieldCheck /><div><b>Admin portal</b><small>Platform control centre</small></div></div>
        <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => selectTab(id)}><Icon /> {label}<ChevronRight /></button>)}</nav>
        <div className="admin-account"><Avatar photo={user?.photoURL} name={user?.displayName || user?.email || 'A'} /><div><b>{user?.displayName || 'Administrator'}</b><small>{user?.email}</small></div><button onClick={() => signOut(auth)} aria-label="Sign out"><LogOut /></button></div>
      </aside>
      {menuOpen && <button className="admin-scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu" />}
      <section className="admin-content">
        <header className="admin-topbar"><div><button className="admin-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button><div><p className="admin-eyebrow">SLearn administration</p><h1>{currentTitle}</h1></div></div><div className="admin-live"><i /> Live data</div></header>
        {dataError && <p className="admin-data-error"><CircleAlert /> {dataError}</p>}

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

        {tab === 'users' && <section className="admin-panel admin-directory"><DirectoryHead eyebrow={`${users.length} accounts`} title="User directory" value={search} onChange={setSearch} placeholder="Search name, email or role" />{filteredUsers.length ? <div className="admin-table"><div className="admin-table-head"><span>User</span><span>Role</span><span>Joined</span><span>Status</span></div>{filteredUsers.map((item) => <div className="admin-table-row" key={item.id}><div className="admin-user-cell"><Avatar photo={item.photoURL} name={item.displayName || item.email} /><div><b>{item.displayName || 'New user'}</b><small>{item.email || 'No email'}</small></div></div><span><em className={`role-pill ${item.role || 'user'}`}>{item.role || 'user'}</em></span><span>{dateLabel(item.createdAt)}</span><span className="active-status"><i /> Active</span></div>)}</div> : <EmptyState icon={Search} title="No matching users" text="Try a different name, email or role." />}</section>}

        {tab === 'classrooms' && <section className="admin-panel admin-directory"><DirectoryHead eyebrow={`${classrooms.length} learning spaces`} title="Classroom directory" value={search} onChange={setSearch} placeholder="Search classroom, teacher or code" />{filteredClasses.length ? <div className="admin-class-grid">{filteredClasses.map((item, index) => <article className={`admin-class-card tone-${index % 4}`} key={item.id}><div className="admin-class-top"><span><BookOpen /></span><em>{item.code || 'NO-CODE'}</em></div><small>{item.subject || 'General learning'}</small><h3>{item.name || 'Untitled classroom'}</h3><p>Led by {item.teacherName || 'Teacher'}</p><div className="admin-class-metrics"><span><Users /> {item.students || 0}/{item.maxStudents || 30}</span><b>{item.progress || 0}% progress</b></div><div className="admin-progress"><i style={{ width: `${Math.min(100, item.progress || 0)}%` }} /></div></article>)}</div> : <EmptyState icon={Search} title="No matching classrooms" text="Try another classroom name, teacher or code." />}</section>}

        {tab === 'reports' && <>
          <section className="admin-report-grid">
            <article className="admin-report-card"><p className="admin-eyebrow">Community mix</p><h3>Users by role</h3><ReportBar label="Students" value={stats.students} total={Math.max(users.length, 1)} colour="mint" /><ReportBar label="Teachers" value={stats.teachers} total={Math.max(users.length, 1)} colour="peach" /><ReportBar label="Administrators" value={users.filter((item) => item.role === 'admin').length} total={Math.max(users.length, 1)} colour="black" /></article>
            <article className="admin-report-card"><p className="admin-eyebrow">Classroom capacity</p><h3>{stats.learners} of {stats.capacity} seats filled</h3><div className="admin-ring" style={{ '--value': `${stats.capacity ? Math.round(stats.learners / stats.capacity * 100) : 0}%` } as React.CSSProperties}><span>{stats.capacity ? Math.round(stats.learners / stats.capacity * 100) : 0}<small>%</small></span></div><p>Capacity updates whenever teachers approve new learners.</p></article>
            <article className="admin-report-card wide"><div><p className="admin-eyebrow">Learning health</p><h3>Progress across classrooms</h3></div>{classrooms.length ? classrooms.slice().sort((a, b) => (b.progress || 0) - (a.progress || 0)).map((item) => <div className="admin-progress-row" key={item.id}><span>{item.name || 'Untitled classroom'}</span><div className="admin-progress"><i style={{ width: `${Math.min(100, item.progress || 0)}%` }} /></div><b>{item.progress || 0}%</b></div>) : <EmptyState icon={BarChart3} title="No progress data" text="Reports will grow with classroom activity." />}</article>
          </section>
        </>}
      </section>
    </main>
  );
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
