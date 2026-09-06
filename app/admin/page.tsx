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
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SCHOOL_STAGES, SCHOOL_YEARS, type SchoolStage } from '@/lib/malaysia-curriculum';
import './admin.css';

type AdminTab = 'overview' | 'users' | 'classrooms' | 'subjects' | 'reports';
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

const ADMIN_EMAIL = 'admin@slearn.my';

const nav: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'classrooms', label: 'Classrooms', icon: BookOpen },
  { id: 'subjects', label: 'Subjects', icon: BookOpen },
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
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const login = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
    } catch (error) {
      setMessage(friendlyError(error));
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
            <p>Use the dedicated SLearn administrator account.</p>
          </div>
          <label>
            Email address
            <span className="admin-field admin-fixed-email"><Mail /><input type="email" value={ADMIN_EMAIL} readOnly aria-label="Administrator email" /></span>
          </label>
          <label>
            Password
            <span className="admin-field"><LockKeyhole /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></span>
          </label>
          {message && <p className="admin-form-message"><CircleAlert /> {message}</p>}
          <button className="admin-primary admin-login-button" disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" /> : <ShieldCheck />} Sign in</button>
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

        {tab === 'subjects' && <section className="admin-subject-space">
          <section className="admin-panel admin-subject-catalog">
            <div className="admin-directory-head"><div><p className="admin-eyebrow">{subjectCatalog.length} custom subjects</p><h2>Subject management</h2></div><button className="admin-primary admin-add-subject" onClick={() => openSubjectEditor()}><Plus /> Add subject</button></div>
            {subjectCatalog.length ? <div className="admin-subject-grid">{subjectCatalog.slice().sort((a, b) => a.label.localeCompare(b.label)).map((item) => <article className="admin-subject-card" key={item.id}><span><BookOpen /></span><div><small>{item.schoolStage} · {item.schoolYear}</small><h3>{item.label}</h3><p>Available to teachers creating or editing classrooms.</p></div><button onClick={() => openSubjectEditor(item)} aria-label={`Edit ${item.label}`}><Pencil /> Edit</button></article>)}</div> : <EmptyState icon={BookOpen} title="No custom subjects yet" text="Add a subject to make it available to teachers." />}
          </section>
          <section className="admin-panel admin-subject-requests">
            <div className="admin-panel-head"><div><p className="admin-eyebrow">{subjectProposals.filter((item) => item.status === 'pending').length} pending</p><h3>Teacher requests</h3></div></div>
            <div className="subject-request-list">{subjectProposals.filter((item) => item.status === 'pending').length ? subjectProposals.filter((item) => item.status === 'pending').map((item) => <article className="subject-request-card" key={item.id}><div><small>{item.schoolStage} · {item.schoolYear}</small><h3>{item.label}</h3><p>Requested by {item.requesterName || item.requesterEmail || 'Teacher'} · {dateLabel(item.createdAt)}</p></div><div><button className="subject-reject" disabled={reviewingSubject === item.id} onClick={() => reviewSubject(item, false)}><X /> Reject</button><button className="admin-primary" disabled={reviewingSubject === item.id} onClick={() => reviewSubject(item, true)}>{reviewingSubject === item.id ? <LoaderCircle className="spin" /> : <Check />} Approve</button></div></article>) : <EmptyState icon={Check} title="No pending requests" text="New teacher-submitted subjects will appear here." />}</div>
          </section>
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
