'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Plus,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  curriculumFor,
  SCHOOL_STAGES,
  SCHOOL_YEARS,
  subjectsFor,
  type SchoolStage,
} from '@/lib/malaysia-curriculum';

type Role = 'teacher' | 'student';
export type DetailClassroom = {
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
type JoinRequest = {
  id: string;
  classId: string;
  className: string;
  code: string;
  teacherId: string;
  teacherName?: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
};
const colours = ['lime', 'blue', 'violet'];
const OTHER_SUBJECT = 'Others — request a new subject';
const subjectId = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'subject';

function useApprovedSubjects(stage: SchoolStage, year: string) {
  const [subjects, setSubjects] = useState<string[]>([]);
  useEffect(() => onSnapshot(collection(db, 'subjectCatalog'), (snapshot) => {
    setSubjects(snapshot.docs.map((item) => item.data()).filter((item) => item.schoolStage === stage && (item.schoolYear === year || item.schoolYear === 'all')).map((item) => String(item.label || '')).filter(Boolean));
  }), [stage, year]);
  return subjects;
}
const initials = (name?: string | null) =>
  (name || 'Learner')
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();

function useLearningSpaces(role: Role, user: User) {
  const [classes, setClasses] = useState<DetailClassroom[]>([]),
    [memberships, setMemberships] = useState<Membership[]>([]),
    [pending, setPending] = useState<JoinRequest[]>([]);
  useEffect(
    () =>
      role === 'teacher'
        ? onSnapshot(
            query(
              collection(db, 'classrooms'),
              where('teacherId', '==', user.uid),
            ),
            (s) =>
              setClasses(
                s.docs.map(
                  (d) => ({ id: d.id, ...d.data() }) as DetailClassroom,
                ),
              ),
          )
        : onSnapshot(collection(db, 'users', user.uid, 'memberships'), (s) =>
            setMemberships(
              s.docs.map((d) => ({ id: d.id, ...d.data() }) as Membership),
            ),
          ),
    [role, user.uid],
  );
  useEffect(() => {
    if (role !== 'student') return;
    return onSnapshot(collection(db, 'users', user.uid, 'joinRequests'), (s) =>
      setPending(s.docs.map((d) => ({ id: d.id, ...d.data() }) as JoinRequest)),
    );
  }, [role, user.uid]);
  useEffect(() => {
    if (role !== 'teacher') {
      return;
    }
    const groups = new Map<string, JoinRequest[]>();
    const unsubs = classes.map((c) =>
      onSnapshot(collection(db, 'classrooms', c.id, 'requests'), (s) => {
        groups.set(
          c.id,
          s.docs.map((d) => ({ id: d.id, ...d.data() }) as JoinRequest),
        );
        setPending([...groups.values()].flat());
      }),
    );
    if (!classes.length) setPending([]);
    return () => unsubs.forEach((unsub) => unsub());
  }, [role, classes.map((c) => c.id).join('|')]);
  useEffect(() => {
    if (role !== 'student' || !memberships.length) return;
    const unsubs = memberships.map((m) => {
      return onSnapshot(
        collection(db, 'classrooms', m.classId, 'exercises'),
        async (snap) => {
          const exDocs = snap.docs;
          const total = exDocs.length;
          if (total === 0) {
            setMemberships((prev) =>
              prev.map((item) =>
                item.classId === m.classId
                  ? { ...item, progress: 0, tasks: 0 }
                  : item,
              ),
            );
            if (m.progress !== 0 || m.tasks !== 0) {
              setDoc(
                doc(db, 'users', user.uid, 'memberships', m.classId),
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
                    m.classId,
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
                      m.classId,
                      'exercises',
                      exDoc.id,
                      'submissions',
                    ),
                    where('studentId', '==', user.uid),
                    limit(1),
                  ),
                );
                return !qSnap.empty;
              } catch {
                return false;
              }
            }),
          );
          const completed = checks.filter(Boolean).length;
          const tasksDue = Math.max(0, total - completed);
          const progressPct =
            total > 0 ? Math.round((completed / total) * 100) : 0;
          setMemberships((prev) =>
            prev.map((item) =>
              item.classId === m.classId
                ? { ...item, progress: progressPct, tasks: tasksDue }
                : item,
            ),
          );
          if (m.progress !== progressPct || m.tasks !== tasksDue) {
            setDoc(
              doc(db, 'users', user.uid, 'memberships', m.classId),
              { progress: progressPct, tasks: tasksDue },
              { merge: true },
            ).catch(console.warn);
          }
        },
      );
    });
    return () => unsubs.forEach((u) => u());
  }, [
    role,
    user.uid,
    memberships
      .map((m) => m.classId)
      .sort()
      .join(','),
  ]);
  return { classes, memberships, pending };
}

function StudentSearchDetail({
  user,
  onCountChange,
}: {
  user: User;
  onCountChange: (count: number) => void;
}) {
  const [allClassrooms, setAllClassrooms] = useState<DetailClassroom[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [pending, setPending] = useState<JoinRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'classrooms'), (s) => {
      setAllClassrooms(
        s.docs.map((d) => ({ id: d.id, ...d.data() }) as DetailClassroom),
      );
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'users', user.uid, 'memberships'), (s) => {
      setMemberships(
        s.docs.map((d) => ({ id: d.id, ...d.data() }) as Membership),
      );
    });
  }, [user.uid]);

  useEffect(() => {
    return onSnapshot(
      collection(db, 'users', user.uid, 'joinRequests'),
      (s) => {
        setPending(
          s.docs.map((d) => ({ id: d.id, ...d.data() }) as JoinRequest),
        );
      },
    );
  }, [user.uid]);

  const unjoined = allClassrooms.filter(
    (c) => !memberships.some((m) => m.classId === c.id),
  );

  const filtered = unjoined.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.code && c.code.toLowerCase().includes(q)) ||
      (c.subject && c.subject.toLowerCase().includes(q)) ||
      (c.teacherName && c.teacherName.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    onCountChange(unjoined.length);
  }, [unjoined.length, onCountChange]);

  const requestJoin = async (c: DetailClassroom) => {
    setMessage('');
    setSuccessMessage('');
    setRequestBusyId(c.id);
    try {
      const currentStudents = c.students || 0;
      const maxCap = c.maxStudents || 30;
      if (currentStudents >= maxCap) {
        setMessage(
          `This classroom has reached its maximum capacity (${currentStudents}/${maxCap} learners).`,
        );
        return;
      }
      if (memberships.some((m) => m.classId === c.id)) {
        setMessage('You already joined this classroom.');
        return;
      }
      if (pending.some((p) => p.classId === c.id)) {
        setMessage('Your request is already waiting for teacher approval.');
        return;
      }
      const data = {
        classId: c.id,
        className: c.name,
        code: c.code,
        teacherId: c.teacherId,
        teacherName: c.teacherName || 'Teacher',
        studentId: user.uid,
        studentName: user.displayName || 'Student',
        studentEmail: user.email || '',
        createdAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      batch.set(doc(db, 'classrooms', c.id, 'requests', user.uid), data);
      batch.set(doc(db, 'users', user.uid, 'joinRequests', c.id), data);
      await batch.commit();
      setSuccessMessage(
        `Requested access to "${c.name}"! Waiting for teacher approval.`,
      );
    } catch {
      setMessage('Something went wrong. Please try again.');
    } finally {
      setRequestBusyId(null);
    }
  };

  const requestJoinByCode = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    setMessage('');
    setSuccessMessage('');
    try {
      const code = joinCode.trim().toUpperCase();
      const found = await getDocs(
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
      } as DetailClassroom;
      await requestJoin(c);
      setJoinCode('');
      setJoinOpen(false);
    } catch {
      setMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="detail-page-head">
        <div>
          <span className="kicker">Discover Classrooms</span>
          <h1>Find & Join Groups</h1>
          <p>
            Browse available classrooms you haven't joined yet, or search new
            groups by name, subject, or code.
          </p>
        </div>
        <Button className="primary-action" onClick={() => setJoinOpen(true)}>
          <Plus /> Enter Class Code
        </Button>
      </header>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#fff',
          border: '1px solid #eeeae4',
          borderRadius: '20px',
          padding: '10px 18px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}
      >
        <Search style={{ width: 20, height: 20, color: '#777067' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search new groups by classroom name, subject, or code (e.g. MATH-4K2)..."
          style={{
            flex: 1,
            border: 0,
            outline: 'none',
            fontSize: '0.95rem',
            background: 'transparent',
            color: '#111',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              border: 0,
              background: 'none',
              cursor: 'pointer',
              color: '#777067',
              padding: '4px',
            }}
            title="Clear search"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>

      {successMessage && (
        <div
          style={{
            background: '#dcfce7',
            color: '#166534',
            borderRadius: '16px',
            padding: '12px 18px',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Check style={{ width: 16, height: 16 }} />
          {successMessage}
        </div>
      )}

      {message && <p className="form-error page-message">{message}</p>}

      {pending.length > 0 && (
        <section className="detail-panel">
          <div className="panel-head">
            <div>
              <span className="kicker">Needs Teacher Approval</span>
              <h2>
                Waiting for confirmation <b>{pending.length}</b>
              </h2>
            </div>
          </div>
          {pending.map((p) => (
            <div className="request-row" key={p.classId}>
              <span className="avatar">{initials(p.className)}</span>
              <div>
                <b>{p.className}</b>
                <small>
                  Code: <strong>{p.code}</strong> · Teacher: {p.teacherName}
                </small>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: '#92400e',
                  background: '#fef3c7',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600,
                }}
              >
                <Clock3 style={{ width: 13, height: 13 }} /> Pending Review
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="detail-panel classroom-page-list">
        <div className="panel-head">
          <div>
            <span className="kicker">
              {searchQuery
                ? `${filtered.length} matching classroom${filtered.length === 1 ? '' : 's'}`
                : `${unjoined.length} unjoined group${unjoined.length === 1 ? '' : 's'}`}
            </span>
            <h2>
              {searchQuery
                ? `Search results for "${searchQuery}"`
                : 'New Groups to Join'}
            </h2>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="detail-empty">
            <Search />
            <h3>
              {searchQuery
                ? `No classrooms matching "${searchQuery}"`
                : 'No new classrooms available to join'}
            </h3>
            <p>
              {searchQuery
                ? 'Check for typos or try searching with the 8-character class code.'
                : 'You have joined all available classrooms, or none have been created yet.'}
            </p>
          </div>
        ) : (
          <div className="class-grid">
            {filtered.map((c, i) => {
              const isPending = pending.some((p) => p.classId === c.id);
              const currentStudents = c.students || 0;
              const maxCap = c.maxStudents || 30;
              const isFull = currentStudents >= maxCap;
              const isRequesting = requestBusyId === c.id;

              return (
                <div
                  key={c.id}
                  className={`class-card ${colours[i % 3]}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '235px',
                  }}
                >
                  <div>
                    <div className="class-top" style={{ marginBottom: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          background: '#ffffffcc',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          color: '#111',
                        }}
                      >
                        {c.code}
                      </span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: '#444',
                          fontWeight: 600,
                        }}
                      >
                        {c.subject || 'General'}
                      </span>
                    </div>
                    <h3
                      style={{
                        margin: '8px 0 3px',
                        fontSize: '1.25rem',
                        fontWeight: 600,
                      }}
                    >
                      {c.name}
                    </h3>
                    <small
                      style={{
                        color: '#555',
                        fontSize: '0.8rem',
                        display: 'block',
                      }}
                    >
                      Instructor: <strong>{c.teacherName || 'Teacher'}</strong>
                    </small>
                  </div>

                  <div
                    style={{
                      marginTop: '16px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    <div
                      className="class-bottom"
                      style={{ marginBottom: '10px' }}
                    >
                      <span>
                        <Users style={{ width: 14, height: 14 }} />{' '}
                        {currentStudents} / {maxCap} learners
                      </span>
                      {isFull && (
                        <span style={{ color: '#dc2626', fontWeight: 700 }}>
                          Full
                        </span>
                      )}
                    </div>

                    {isPending ? (
                      <button
                        disabled
                        style={{
                          width: '100%',
                          height: '40px',
                          borderRadius: '12px',
                          background: '#ffffffaa',
                          border: '1px solid #ded8cf',
                          color: '#92400e',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          cursor: 'not-allowed',
                        }}
                      >
                        <Clock3 style={{ width: 14, height: 14 }} /> Waiting for
                        approval
                      </button>
                    ) : isFull ? (
                      <button
                        disabled
                        style={{
                          width: '100%',
                          height: '40px',
                          borderRadius: '12px',
                          background: '#ffffffaa',
                          border: '1px solid #ded8cf',
                          color: '#888',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'not-allowed',
                        }}
                      >
                        Classroom Full
                      </button>
                    ) : (
                      <Button
                        onClick={() => requestJoin(c)}
                        disabled={isRequesting}
                        className="primary-action"
                        style={{
                          width: '100%',
                          height: '40px',
                          borderRadius: '12px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        {isRequesting ? (
                          <LoaderCircle
                            className="animate-spin"
                            style={{ width: 15, height: 15 }}
                          />
                        ) : (
                          <Plus style={{ width: 15, height: 15 }} />
                        )}
                        {isRequesting ? 'Sending request…' : 'Request to join'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="modal-card">
          <DialogHeader>
            <DialogTitle>Join a classroom</DialogTitle>
            <DialogDescription>
              Enter your class code. Your teacher will approve the request.
            </DialogDescription>
          </DialogHeader>
          <label className="form-label">
            Classroom code
            <Input
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setMessage('');
              }}
              placeholder="e.g. MATH-4K2"
            />
          </label>
          {message && <p className="form-error">{message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={requestJoinByCode}
              disabled={busy || !joinCode.trim()}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Send />}{' '}
              Request to join
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ClassroomsDetail({
  role,
  user,
  onOpen,
  onCountChange,
}: {
  role: Role;
  user: User;
  onOpen: (c: DetailClassroom) => void;
  onCountChange: (count: number) => void;
}) {
  if (role === 'student') {
    return <StudentSearchDetail user={user} onCountChange={onCountChange} />;
  }

  const { classes, pending } = useLearningSpaces(role, user);
  const [createOpen, setCreateOpen] = useState(false),
    [newName, setNewName] = useState(''),
    [schoolStage, setSchoolStage] = useState<SchoolStage>('primary'),
    [schoolYear, setSchoolYear] = useState('Tahun 1'),
    [newSubject, setNewSubject] = useState(''),
    [customSubject, setCustomSubject] = useState(''),
    [requestingSubject, setRequestingSubject] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const count = classes.length;
  const approvedSubjects = useApprovedSubjects(schoolStage, schoolYear);
  const availableSubjects = [...subjectsFor(schoolStage, schoolYear), ...approvedSubjects.map((name) => ({ name, category: 'Admin-approved subjects' }))],
    subjectGroups = [
      ...new Set(availableSubjects.map((subject) => subject.category)),
    ];
  useEffect(() => onCountChange(count), [count, onCountChange]);
  const changeStage = (stage: SchoolStage) => {
    setSchoolStage(stage);
    setSchoolYear(SCHOOL_YEARS[stage][0]);
    setNewSubject('');
  };
  const changeYear = (year: string) => {
    setSchoolYear(year);
    setNewSubject('');
  };
  const createClass = async () => {
    if (!newName.trim() || !newSubject || newSubject === OTHER_SUBJECT || classes.length >= 3) return;
    setBusy(true);
    setMessage('');
    try {
      const subjectLabel = `${newSubject} · ${schoolYear}`;
      const code = `${
        newSubject
          .replace(/[^a-z0-9]/gi, '')
          .slice(0, 4)
          .toUpperCase() || 'CLAS'
      }-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      await addDoc(collection(db, 'classrooms'), {
        name: newName.trim(),
        subject: subjectLabel,
        subjectName: newSubject,
        schoolStage,
        schoolYear,
        curriculum: curriculumFor(schoolStage),
        code,
        teacherId: user.uid,
        teacherName: user.displayName || 'Teacher',
        students: 0,
        maxStudents: 30,
        progress: 0,
        createdAt: serverTimestamp(),
      });
      setNewName('');
      setNewSubject('');
      setCreateOpen(false);
    } catch {
      setMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const requestCustomSubject = async () => {
    const label = customSubject.trim().replace(/\s+/g, ' ');
    if (label.length < 2) return setMessage('Enter a valid subject name.');
    setRequestingSubject(true);
    setMessage('');
    try {
      await setDoc(doc(db, 'subjectProposals', `${user.uid}-${schoolStage}-${schoolYear}-${subjectId(label)}`), {
        label, normalizedLabel: label.toLowerCase(), schoolStage, schoolYear,
        requesterId: user.uid, requesterName: user.displayName || 'Teacher', requesterEmail: user.email || '',
        status: 'pending', createdAt: serverTimestamp(),
      });
      setCustomSubject('');
      setMessage('Submitted for admin approval. It will appear here once approved.');
    } catch {
      setMessage('The subject request could not be submitted. Please try again.');
    } finally {
      setRequestingSubject(false);
    }
  };
  const decide = async (r: JoinRequest, approve: boolean) => {
    if (approve) {
      const c = classes.find((x) => x.id === r.classId);
      if (c && (c.students || 0) >= (c.maxStudents || 30)) {
        setMessage(`${c.name} is already full.`);
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
    <>
      <header className="detail-page-head">
        <div>
          <span className="kicker">Teaching spaces</span>
          <h1>Your classrooms</h1>
          <p>Manage your classes and student access in one place.</p>
        </div>
        <Button
          className="primary-action"
          disabled={classes.length >= 3}
          onClick={() => setCreateOpen(true)}
        >
          <Plus /> Create classroom
        </Button>
      </header>
      {message && <p className="form-error page-message">{message}</p>}
      {pending.length > 0 && (
        <section className="detail-panel">
          <div className="panel-head">
            <div>
              <span className="kicker">Needs approval</span>
              <h2>
                Join requests <b>{pending.length}</b>
              </h2>
            </div>
          </div>
          {pending.map((r) => (
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
          ))}
        </section>
      )}
      <section className="detail-panel classroom-page-list">
        <div className="panel-head">
          <div>
            <span className="kicker">{count} total</span>
            <h2>All classrooms</h2>
          </div>
        </div>
        {count === 0 ? (
          <div className="detail-empty">
            <BookOpen />
            <h3>No classrooms yet</h3>
            <p>Create your first classroom to begin.</p>
          </div>
        ) : (
          <div className="class-grid">
            {classes.map((c, i) => (
              <button
                key={c.id}
                className={`class-card ${colours[i % 3]}`}
                onClick={() => onOpen(c)}
              >
                <div className="class-top">
                  <span>0{i + 1}</span>
                  <ChevronRight />
                </div>
                <div>
                  <small>
                    {c.code} · {c.subject}
                  </small>
                  <h3>{c.name}</h3>
                </div>
                <div>
                  <div className="class-bottom">
                    <span>
                      <Users /> {c.students || 0} learners
                    </span>
                    <span>{c.progress || 0}%</span>
                  </div>
                  <Progress value={c.progress || 0} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="modal-card curriculum-modal">
          <DialogHeader>
            <DialogTitle>Create a classroom</DialogTitle>
            <DialogDescription>
              Choose the Malaysian curriculum level and subject. Electives
              depend on what each school offers.
            </DialogDescription>
          </DialogHeader>
          <label className="form-label">
            Classroom name
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. 4 Bestari"
            />
          </label>
          <div className="curriculum-fields">
            <label className="form-label">
              School level
              <NativeSelect
                className="curriculum-select"
                value={schoolStage}
                onChange={(e) => changeStage(e.target.value as SchoolStage)}
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
                onChange={(e) => changeYear(e.target.value)}
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
              onValueChange={(value) => setNewSubject(String(value || ''))}
              items={[...availableSubjects.map((subject) => subject.name), OTHER_SUBJECT]}
            >
              <ComboboxInput
                className="curriculum-combobox"
                placeholder="Search a subject, e.g. Fizik"
                showClear
              />
              <ComboboxContent>
                <ComboboxEmpty>
                  No matching subject for this level.
                </ComboboxEmpty>
                <ComboboxList>
                  {subjectGroups.map((group) => (
                    <ComboboxGroup key={group}>
                      <ComboboxLabel>{group}</ComboboxLabel>
                      {availableSubjects
                        .filter((subject) => subject.category === group)
                        .map((subject) => (
                          <ComboboxItem key={subject.name} value={subject.name}>
                            {subject.name}
                          </ComboboxItem>
                        ))}
                    </ComboboxGroup>
                  ))}
                  <ComboboxGroup>
                    <ComboboxLabel>Can’t find your subject?</ComboboxLabel>
                    <ComboboxItem value={OTHER_SUBJECT}>{OTHER_SUBJECT}</ComboboxItem>
                  </ComboboxGroup>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <small className="curriculum-note">
              {curriculumFor(schoolStage)} · {availableSubjects.length} subjects
              listed for {schoolYear}
            </small>
          </label>
          {newSubject === OTHER_SUBJECT && (
            <div className="custom-subject-request">
              <label className="form-label">New subject name<Input value={customSubject} onChange={(e) => { setCustomSubject(e.target.value); setMessage(''); }} placeholder="Enter the official subject name" maxLength={100} /></label>
              <Button type="button" variant="outline" onClick={requestCustomSubject} disabled={requestingSubject || customSubject.trim().length < 2}>
                {requestingSubject ? <LoaderCircle /> : <Send />} Submit for admin approval
              </Button>
            </div>
          )}
          {message && <p className="form-error">{message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={createClass}
              disabled={busy || !newName.trim() || !newSubject || newSubject === OTHER_SUBJECT}
            >
              {busy ? <LoaderCircle /> : <Plus />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProgressDetail({
  role,
  user,
  onOpen,
  onCountChange,
}: {
  role: Role;
  user: User;
  onOpen: (c: DetailClassroom) => void;
  onCountChange: (count: number) => void;
}) {
  const { classes, memberships } = useLearningSpaces(role, user);
  const items = role === 'teacher' ? classes : memberships;
  const overall = items.length
    ? Math.round(
        items.reduce((n, x) => n + (x.progress || 0), 0) / items.length,
      )
    : 0;
  const learners = classes.reduce((n, c) => n + (c.students || 0), 0);
  useEffect(() => onCountChange(items.length), [items.length, onCountChange]);
  const open = (item: DetailClassroom | Membership) =>
    onOpen(
      role === 'teacher'
        ? (item as DetailClassroom)
        : {
            id: (item as Membership).classId,
            name: (item as Membership).className,
            subject: (item as Membership).className,
            code: (item as Membership).code,
            teacherId: (item as Membership).teacherId,
            teacherName: (item as Membership).teacherName,
            students: 0,
            progress: item.progress || 0,
          },
    );
  return (
    <>
      <header className="detail-page-head">
        <div>
          <span className="kicker">Performance</span>
          <h1>{role === 'teacher' ? 'Class progress' : 'My progress'}</h1>
          <p>
            {role === 'teacher'
              ? 'See how learners are progressing across every classroom.'
              : 'Track your learning progress across all active classes.'}
          </p>
        </div>
      </header>
      <section className="progress-summary">
        <article className="progress-primary">
          <small>OVERALL PROGRESS</small>
          <strong>
            {overall}
            <span>%</span>
          </strong>
          <Progress value={overall} />
          <p>
            {items.length
              ? `Across ${items.length} active classroom${items.length > 1 ? 's' : ''}`
              : 'Progress will appear after you join a classroom.'}
          </p>
        </article>
        <article>
          <span>
            <BookOpen />
          </span>
          <small>CLASSROOMS</small>
          <strong>{items.length}</strong>
        </article>
        <article>
          <span>
            <Users />
          </span>
          <small>{role === 'teacher' ? 'LEARNERS' : 'TASKS DUE'}</small>
          <strong>
            {role === 'teacher'
              ? learners
              : memberships.reduce((n, m) => n + (m.tasks || 0), 0)}
          </strong>
        </article>
      </section>
      <section className="detail-panel progress-breakdown">
        <div className="panel-head">
          <div>
            <span className="kicker">Breakdown</span>
            <h2>Progress by classroom</h2>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="detail-empty">
            <BarChart3 />
            <h3>No progress data yet</h3>
            <p>
              {role === 'teacher'
                ? 'Create a classroom to start tracking learners.'
                : 'Join a classroom and complete activities to build progress.'}
            </p>
          </div>
        ) : (
          items.map((item, i) => {
            const name =
              role === 'teacher'
                ? (item as DetailClassroom).name
                : (item as Membership).className;
            const subtitle =
              role === 'teacher'
                ? `${(item as DetailClassroom).students || 0} learners`
                : (item as Membership).teacherName;
            return (
              <button
                className="progress-row"
                key={item.id}
                onClick={() => open(item)}
              >
                <span className={`progress-number ${colours[i % 3]}`}>
                  0{i + 1}
                </span>
                <div>
                  <div>
                    <b>{name}</b>
                    <small>{subtitle}</small>
                  </div>
                  <Progress value={item.progress || 0} />
                </div>
                <strong>{item.progress || 0}%</strong>
                <ChevronRight />
              </button>
            );
          })
        )}
      </section>
    </>
  );
}
