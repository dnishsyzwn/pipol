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
  Award,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  FileQuestion,
  LineChart,
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

function formatDeadline(deadlineStr?: string | null): {
  formatted: string;
  isPast: boolean;
  isUrgent: boolean;
} {
  if (!deadlineStr) return { formatted: '', isPast: false, isUrgent: false };
  const d = new Date(deadlineStr);
  if (isNaN(d.getTime())) return { formatted: '', isPast: false, isUrgent: false };
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

  useEffect(() => {
    if (role !== 'teacher' || !classes.length) return;
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

        // Listen to submissions across all exercises for this classroom
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
            // Count unique students who submitted
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

        // Cleanup previous exercise submission listeners when exercises list updates
        unsubs.push(() => subUnsubs.forEach((u) => u()));
      });

      unsubs.push(unsubEx);
    });

    return () => unsubs.forEach((u) => u());
  }, [
    role,
    user.uid,
    classes
      .map((c) => `${c.id}:${c.students || 0}`)
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
    [subjectSearch, setSubjectSearch] = useState(''),
    [customSubject, setCustomSubject] = useState(''),
    [requestingSubject, setRequestingSubject] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const count = classes.length;
  const approvedSubjects = useApprovedSubjects(schoolStage, schoolYear);
  const availableSubjects = [...subjectsFor(schoolStage, schoolYear), ...approvedSubjects.map((name) => ({ name, category: 'Admin-approved subjects' }))],
    filteredSubjects = availableSubjects.filter((subject) => subject.name.toLocaleLowerCase().includes(subjectSearch.trim().toLocaleLowerCase())),
    subjectGroups = [
      ...new Set(filteredSubjects.map((subject) => subject.category)),
    ];
  useEffect(() => onCountChange(count), [count, onCountChange]);
  const changeStage = (stage: SchoolStage) => {
    setSchoolStage(stage);
    setSchoolYear(SCHOOL_YEARS[stage][0]);
    setNewSubject('');
    setSubjectSearch('');
  };
  const changeYear = (year: string) => {
    setSchoolYear(year);
    setNewSubject('');
    setSubjectSearch('');
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
    const normalizedLabel = label.toLocaleLowerCase();
    if (availableSubjects.some((subject) => subject.name.trim().toLocaleLowerCase() === normalizedLabel)) {
      setMessage('This subject already exists in the list. Please select it instead of requesting a duplicate.');
      return;
    }
    setRequestingSubject(true);
    setMessage('');
    try {
      await setDoc(doc(db, 'subjectProposals', `${user.uid}-${schoolStage}-${schoolYear}-${subjectId(label)}`), {
        label, normalizedLabel, schoolStage, schoolYear,
        requesterId: user.uid, requesterName: user.displayName || 'Teacher', requesterEmail: user.email || '',
        status: 'pending', createdAt: serverTimestamp(),
      });
      window.localStorage.setItem(`slearn:subject-proposal:${user.uid}-${schoolStage}-${schoolYear}-${subjectId(label)}`, 'pending');
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
                <ComboboxEmpty>
                  No matching subject for this level.
                </ComboboxEmpty>
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

export function AnalyticsDetail({
  role,
  user,
}: {
  role: Role;
  user: User;
}) {
  const { classes, memberships } = useLearningSpaces(role, user);
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Auto-select first class when classes are loaded
  useEffect(() => {
    if (role === 'teacher' && classes.length > 0) {
      setSelectedClassId((prev) => (classes.some((c) => c.id === prev) ? prev : classes[0].id));
    }
  }, [role, classes]);

  // Selected teacher class object
  const activeClass = classes.find((c) => c.id === selectedClassId) || classes[0] || null;

  // Teacher states for selected classroom
  const [classExercises, setClassExercises] = useState<any[]>([]);
  const [classMembers, setClassMembers] = useState<any[]>([]);
  const [exerciseSubsMap, setExerciseSubsMap] = useState<Record<string, any[]>>({});
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherFilterStudentId, setTeacherFilterStudentId] = useState<string>('all');
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<'students' | 'exercises'>('students');
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);

  // Listen to exercises and members for the active classroom (Teacher)
  useEffect(() => {
    if (role !== 'teacher' || !activeClass) {
      setClassExercises([]);
      setClassMembers([]);
      setExerciseSubsMap({});
      return;
    }

    const unsubEx = onSnapshot(collection(db, 'classrooms', activeClass.id, 'exercises'), (snap) => {
      setClassExercises(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubMem = onSnapshot(collection(db, 'classrooms', activeClass.id, 'members'), (snap) => {
      setClassMembers(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            uid: data.uid || d.id,
            name: data.name || 'Student',
            email: data.email || '',
            progress: data.progress || 0,
          };
        }),
      );
    });

    return () => {
      unsubEx();
      unsubMem();
    };
  }, [role, activeClass?.id]);

  // Listen to submissions across all exercises for this classroom (Teacher)
  useEffect(() => {
    if (role !== 'teacher' || !activeClass || !classExercises.length) {
      setExerciseSubsMap({});
      return;
    }

    const unsubs = classExercises.map((ex) => {
      return onSnapshot(
        collection(db, 'classrooms', activeClass.id, 'exercises', ex.id, 'submissions'),
        (snap) => {
          setExerciseSubsMap((prev) => ({
            ...prev,
            [ex.id]: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          }));
        },
      );
    });

    return () => unsubs.forEach((u) => u());
  }, [role, activeClass?.id, classExercises.map((e) => e.id).join('|')]);

  // Student states: listen to their own submissions across all classrooms
  const [studentSubsMap, setStudentSubsMap] = useState<
    Record<string, { exercise: any; submission: any; classroomName: string }>
  >({});
  const [studentExercises, setStudentExercises] = useState<
    { ex: any; classroom: Membership }[]
  >([]);

  useEffect(() => {
    if (role !== 'student' || !memberships.length) {
      setStudentExercises([]);
      setStudentSubsMap({});
      return;
    }

    const unsubs = memberships.map((m) => {
      return onSnapshot(collection(db, 'classrooms', m.classId, 'exercises'), (snap) => {
        const exs = snap.docs.map((d) => ({ ex: { id: d.id, ...d.data() }, classroom: m }));
        setStudentExercises((prev) => {
          const others = prev.filter((p) => p.classroom.classId !== m.classId);
          return [...others, ...exs];
        });

        // Listen to student's own submission for each exercise
        snap.docs.forEach((d) => {
          onSnapshot(
            doc(db, 'classrooms', m.classId, 'exercises', d.id, 'submissions', user.uid),
            (subDoc) => {
              if (subDoc.exists()) {
                setStudentSubsMap((prev) => ({
                  ...prev,
                  [d.id]: {
                    exercise: { id: d.id, ...d.data() },
                    submission: { id: subDoc.id, ...subDoc.data() },
                    classroomName: m.className,
                  },
                }));
              } else {
                setStudentSubsMap((prev) => {
                  const copy = { ...prev };
                  delete copy[d.id];
                  return copy;
                });
              }
            },
          );
        });
      });
    });

    return () => unsubs.forEach((u) => u());
  }, [role, user.uid, memberships.map((m) => m.classId).sort().join(',')]);

  // Teacher computation
  const teacherStats = () => {
    let totalScore = 0;
    let totalMaxScore = 0;
    let totalSubmissionsCount = 0;
    const studentPerformanceMap: Record<
      string,
      {
        uid: string;
        name: string;
        email: string;
        completedCount: number;
        earnedPoints: number;
        totalPoints: number;
        scoreAvg: number;
      }
    > = {};

    // Initialize with class members
    classMembers.forEach((m) => {
      studentPerformanceMap[m.uid] = {
        uid: m.uid,
        name: m.name,
        email: m.email,
        completedCount: 0,
        earnedPoints: 0,
        totalPoints: 0,
        scoreAvg: 0,
      };
    });

    Object.entries(exerciseSubsMap).forEach(([exId, subs]) => {
      const ex = classExercises.find((e) => e.id === exId);
      const exMaxPoints =
        ex?.questions?.reduce((n: number, q: any) => n + (Number(q.points) || 1), 0) ||
        (ex?.question ? 2 : 1);

      subs.forEach((sub: any) => {
        const sId = sub.studentId || sub.id;
        const pts = Number(sub.score) || 0;
        const maxPts = Number(sub.totalPoints) || exMaxPoints;

        totalScore += pts;
        totalMaxScore += maxPts;
        totalSubmissionsCount += 1;

        if (!studentPerformanceMap[sId]) {
          studentPerformanceMap[sId] = {
            uid: sId,
            name: sub.studentName || 'Student',
            email: sub.studentEmail || '',
            completedCount: 0,
            earnedPoints: 0,
            totalPoints: 0,
            scoreAvg: 0,
          };
        }

        studentPerformanceMap[sId].completedCount += 1;
        studentPerformanceMap[sId].earnedPoints += pts;
        studentPerformanceMap[sId].totalPoints += maxPts;
      });
    });

    // Calculate score averages
    Object.values(studentPerformanceMap).forEach((st) => {
      st.scoreAvg =
        st.totalPoints > 0 ? Math.round((st.earnedPoints / st.totalPoints) * 100) : 0;
    });

    const overallAccuracy =
      totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;

    // Topic and Subtopic performance computation
    const topicStatsMap: Record<
      string,
      { label: string; earned: number; possible: number; answersCount: number }
    > = {};

    Object.entries(exerciseSubsMap).forEach(([exId, subs]) => {
      const ex = classExercises.find((e) => e.id === exId);
      if (!ex) return;
      const qList: any[] = Array.isArray(ex.questions) && ex.questions.length > 0
        ? ex.questions
        : ex.question
          ? [{ question: ex.question, answer: ex.answer || '', points: 2, topic: ex.topic, subtopic: ex.subtopic }]
          : [];

      if (qList.length === 0) return;

      subs.forEach((sub: any) => {
        // If submission has explicit questionResults
        if (Array.isArray(sub?.questionResults) && sub.questionResults.length > 0) {
          sub.questionResults.forEach((qr: any, qIdx: number) => {
            const topic = (qr.topic || qList[qr.questionIdx ?? qIdx]?.topic || ex.topic || 'General').trim();
            const subtopic = (qr.subtopic || qList[qr.questionIdx ?? qIdx]?.subtopic || ex.subtopic || '').trim();
            const label = subtopic ? `${topic} · ${subtopic}` : topic;
            if (!topicStatsMap[label]) {
              topicStatsMap[label] = { label, earned: 0, possible: 0, answersCount: 0 };
            }
            const pts = Number(qr.pointsEarned) || (qr.isCorrect ? Number(qr.pointsPossible) || 1 : 0);
            const maxPts = Number(qr.pointsPossible) || Number(qList[qr.questionIdx ?? qIdx]?.points) || 1;
            topicStatsMap[label].earned += pts;
            topicStatsMap[label].possible += maxPts;
            topicStatsMap[label].answersCount += 1;
          });
        } else {
          // Compare answers or calculate per question
          qList.forEach((q: any, qIdx: number) => {
            const topic = (q.topic || ex.topic || 'General').trim();
            const subtopic = (q.subtopic || ex.subtopic || '').trim();
            const label = subtopic ? `${topic} · ${subtopic}` : topic;
            if (!topicStatsMap[label]) {
              topicStatsMap[label] = { label, earned: 0, possible: 0, answersCount: 0 };
            }

            const userA = (sub?.answers && sub.answers[qIdx] !== undefined ? String(sub.answers[qIdx]) : '').trim().toLowerCase();
            const expA = (q.answer ? String(q.answer) : '').trim().toLowerCase();
            const qPts = Number(q.points) || 1;
            const isCorrect = userA && expA && (userA === expA || expA.includes(userA) || userA.includes(expA));
            const earned = isCorrect ? qPts : 0;

            topicStatsMap[label].earned += earned;
            topicStatsMap[label].possible += qPts;
            topicStatsMap[label].answersCount += 1;
          });
        }
      });
    });

    const topicPerformanceList = Object.values(topicStatsMap).map((t) => {
      const accuracy = t.possible > 0 ? Math.round((t.earned / t.possible) * 100) : 0;
      return {
        ...t,
        accuracy,
      };
    });

    return {
      totalSubmissionsCount,
      overallAccuracy,
      studentsList: Object.values(studentPerformanceMap),
      topicPerformanceList,
    };
  };

  // Student computation
  const studentStats = () => {
    const subs = Object.values(studentSubsMap);
    let totalEarned = 0;
    let totalPossible = 0;

    subs.forEach((item) => {
      const s = item.submission;
      const ex = item.exercise;
      const exMaxPoints =
        ex?.questions?.reduce((n: number, q: any) => n + (Number(q.points) || 1), 0) ||
        (ex?.question ? 2 : 1);

      const pts = Number(s.score) || 0;
      const maxPts = Number(s.totalPoints) || exMaxPoints;

      totalEarned += pts;
      totalPossible += maxPts;
    });

    const accuracyRate =
      totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
    const completedCount = subs.length;
    const totalAssigned = studentExercises.length;
    const completionRate =
      totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;

    return {
      completedCount,
      totalAssigned,
      completionRate,
      accuracyRate,
      totalEarned,
      totalPossible,
      submissions: subs,
    };
  };

  // TEACHER VIEW
  if (role === 'teacher') {
    const { totalSubmissionsCount, overallAccuracy, studentsList, topicPerformanceList } = teacherStats();

    const filteredStudents = studentsList.filter((st) => {
      if (teacherFilterStudentId !== 'all' && st.uid !== teacherFilterStudentId) {
        return false;
      }
      if (!teacherSearch.trim()) return true;
      const q = teacherSearch.toLowerCase().trim();
      return st.name.toLowerCase().includes(q) || st.email.toLowerCase().includes(q);
    });

    return (
      <>
        <header className="detail-page-head">
          <div>
            <span className="kicker">Performance &amp; Insights</span>
            <h1>Class Analytics</h1>
            <p>Review student performance, accuracy, and submission completion per classroom.</p>
          </div>
        </header>

        {classes.length === 0 ? (
          <section className="detail-panel">
            <div className="detail-empty">
              <BarChart3 />
              <h3>No classrooms created</h3>
              <p>Create a classroom and publish exercises to start viewing student analytics.</p>
            </div>
          </section>
        ) : (
          <>
            {/* Classroom Selector Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                background: '#fff',
                padding: '1rem 1.25rem',
                borderRadius: '16px',
                border: '1px solid #eeeae4',
                marginBottom: '1.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#173e30',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <BookOpen style={{ width: 16, height: 16 }} /> Select Classroom:
                </span>
                <NativeSelect
                  value={activeClass?.id || ''}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setTeacherFilterStudentId('all');
                  }}
                  style={{
                    minWidth: '220px',
                    height: '40px',
                    borderRadius: '10px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                  }}
                >
                  {classes.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.name} ({c.code}) · {c.students || 0} students
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              {activeClass && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.8rem', color: '#666' }}>
                  <span>Subject: <strong>{activeClass.subject || 'General'}</strong></span>
                  <span>·</span>
                  <span>Code: <strong style={{ fontFamily: 'monospace' }}>{activeClass.code}</strong></span>
                </div>
              )}
            </div>

            {/* Quick Metrics Bar */}
            <section className="progress-summary">
              <article className="progress-primary">
                <small>CLASS AVERAGE ACCURACY</small>
                <strong>
                  {overallAccuracy}
                  <span>%</span>
                </strong>
                <Progress value={overallAccuracy} />
                <p>
                  {totalSubmissionsCount
                    ? `Based on ${totalSubmissionsCount} completed submission${totalSubmissionsCount > 1 ? 's' : ''}`
                    : 'No submissions received yet.'}
                </p>
              </article>
              <article>
                <span>
                  <Users />
                </span>
                <small>ACTIVE LEARNERS</small>
                <strong>{classMembers.length}</strong>
              </article>
            </section>

            {/* ── Visual Charts Section ───────────────────────────── */}
            {classExercises.length > 0 && totalSubmissionsCount > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '1.25rem',
                  marginTop: '1.5rem',
                }}
              >
                {/* Chart 1: Student Mastery Distribution (donut) */}
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #eeeae4',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#555',
                      margin: '0 0 0.85rem 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Users style={{ width: 13, height: 13 }} />
                    Student Mastery Distribution
                  </h3>
                  {(() => {
                    const strong = studentsList.filter((s) => s.totalPoints > 0 && s.scoreAvg >= 80).length;
                    const onTrack = studentsList.filter(
                      (s) => s.totalPoints > 0 && s.scoreAvg >= 60 && s.scoreAvg < 80,
                    ).length;
                    const needs = studentsList.filter(
                      (s) => s.totalPoints > 0 && s.scoreAvg < 60,
                    ).length;
                    const noData = studentsList.filter((s) => s.totalPoints === 0).length;
                    const total = studentsList.length || 1;
                    const segments = [
                      { label: 'Strong Mastery (≥80%)', count: strong, color: '#173e30' },
                      { label: 'On Track (60–79%)', count: onTrack, color: '#d97706' },
                      { label: 'Needs Support (<60%)', count: needs, color: '#dc2626' },
                      { label: 'No Submissions', count: noData, color: '#d1d5db' },
                    ];
                    const r = 42;
                    const cx = 58;
                    const cy = 58;
                    const circ = 2 * Math.PI * r;
                    let cumulative = 0;
                    return (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1.25rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <svg
                          width="116"
                          height="116"
                          viewBox="0 0 116 116"
                          style={{ flexShrink: 0 }}
                        >
                          {/* Background ring */}
                          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0ece6" strokeWidth="14" />
                          {segments.map((seg, i) => {
                            if (seg.count === 0) return null;
                            const pct = seg.count / total;
                            const dash = pct * circ;
                            const offset = -(cumulative * circ) + circ * 0.25;
                            cumulative += pct;
                            return (
                              <circle
                                key={i}
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth="14"
                                strokeDasharray={`${dash} ${circ - dash}`}
                                strokeDashoffset={offset}
                              />
                            );
                          })}
                          <text
                            x={cx}
                            y={cy - 5}
                            textAnchor="middle"
                            style={{ fontSize: '17px', fontWeight: 800, fill: '#173e30', fontFamily: 'inherit' }}
                          >
                            {studentsList.length}
                          </text>
                          <text
                            x={cx}
                            y={cy + 10}
                            textAnchor="middle"
                            style={{ fontSize: '8px', fill: '#888', fontFamily: 'inherit' }}
                          >
                            STUDENTS
                          </text>
                        </svg>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1 }}>
                          {segments.map((seg) => (
                            <div
                              key={seg.label}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                              <span
                                style={{
                                  width: '9px',
                                  height: '9px',
                                  borderRadius: '50%',
                                  background: seg.color,
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ fontSize: '0.74rem', color: '#555', flex: 1 }}>
                                {seg.label}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 800,
                                  color: seg.color,
                                }}
                              >
                                {seg.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Chart 2: Topic & Subtopic Mastery (donut + hardest & easiest) */}
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #eeeae4',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#555',
                      margin: '0 0 0.85rem 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <BookOpen style={{ width: 13, height: 13 }} />
                    Topic &amp; Subtopic Mastery
                  </h3>

                  {topicPerformanceList.length === 0 ? (
                    <div style={{ padding: '1rem', color: '#888', fontSize: '0.82rem', textAlign: 'center' }}>
                      No topics assigned yet in questions.
                    </div>
                  ) : (
                    (() => {
                      const strongTopics = topicPerformanceList.filter((t) => t.accuracy >= 80).length;
                      const onTrackTopics = topicPerformanceList.filter((t) => t.accuracy >= 60 && t.accuracy < 80).length;
                      const needsSupportTopics = topicPerformanceList.filter((t) => t.accuracy < 60).length;
                      const totalTopics = topicPerformanceList.length || 1;

                      const topicSegments = [
                        { label: 'Mastered Topics (≥80%)', count: strongTopics, color: '#173e30' },
                        { label: 'On Track (60–79%)', count: onTrackTopics, color: '#d97706' },
                        { label: 'Needs Support (<60%)', count: needsSupportTopics, color: '#dc2626' },
                      ];

                      // Sort topics to find easiest and hardest
                      const sortedTopics = [...topicPerformanceList].sort((a, b) => b.accuracy - a.accuracy);
                      const easiestTopic = sortedTopics[0];
                      const hardestTopic = sortedTopics[sortedTopics.length - 1];

                      const r = 42;
                      const cx = 58;
                      const cy = 58;
                      const circ = 2 * Math.PI * r;
                      let cumulative = 0;

                      return (
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '1.25rem',
                              flexWrap: 'wrap',
                            }}
                          >
                            <svg
                              width="116"
                              height="116"
                              viewBox="0 0 116 116"
                              style={{ flexShrink: 0 }}
                            >
                              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0ece6" strokeWidth="14" />
                              {topicSegments.map((seg, i) => {
                                if (seg.count === 0) return null;
                                const pct = seg.count / totalTopics;
                                const dash = pct * circ;
                                const offset = -(cumulative * circ) + circ * 0.25;
                                cumulative += pct;
                                return (
                                  <circle
                                    key={i}
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill="none"
                                    stroke={seg.color}
                                    strokeWidth="14"
                                    strokeDasharray={`${dash} ${circ - dash}`}
                                    strokeDashoffset={offset}
                                  />
                                );
                              })}
                              <text
                                x={cx}
                                y={cy - 5}
                                textAnchor="middle"
                                style={{ fontSize: '17px', fontWeight: 800, fill: '#173e30', fontFamily: 'inherit' }}
                              >
                                {topicPerformanceList.length}
                              </text>
                              <text
                                x={cx}
                                y={cy + 10}
                                textAnchor="middle"
                                style={{ fontSize: '8px', fill: '#888', fontFamily: 'inherit' }}
                              >
                                TOPICS
                              </text>
                            </svg>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1 }}>
                              {topicSegments.map((seg) => (
                                <div
                                  key={seg.label}
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                  <span
                                    style={{
                                      width: '9px',
                                      height: '9px',
                                      borderRadius: '50%',
                                      background: seg.color,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <span style={{ fontSize: '0.74rem', color: '#555', flex: 1 }}>
                                    {seg.label}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '0.8rem',
                                      fontWeight: 800,
                                      color: seg.color,
                                    }}
                                  >
                                    {seg.count}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Easiest vs Hardest Highlight Cards */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                              gap: '0.65rem',
                              marginTop: '1rem',
                              paddingTop: '0.85rem',
                              borderTop: '1px solid #f0ece6',
                            }}
                          >
                            <div
                              style={{
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '10px',
                                padding: '8px 10px',
                              }}
                            >
                              <small style={{ fontSize: '0.66rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
                                ★ Easiest Topic
                              </small>
                              <div
                                title={easiestTopic.label}
                                style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  color: '#14532d',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginTop: '2px',
                                }}
                              >
                                {easiestTopic.label}
                              </div>
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#166534' }}>
                                {easiestTopic.accuracy}% accuracy
                              </span>
                            </div>

                            <div
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '10px',
                                padding: '8px 10px',
                              }}
                            >
                              <small style={{ fontSize: '0.66rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase' }}>
                                ⚠ Hardest Topic
                              </small>
                              <div
                                title={hardestTopic.label}
                                style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  color: '#7f1d1d',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginTop: '2px',
                                }}
                              >
                                {hardestTopic.label}
                              </div>
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#991b1b' }}>
                                {hardestTopic.accuracy}% accuracy
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            )}

            {/* Analytics View Selector Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginTop: '1.5rem',
                marginBottom: '1rem',
                borderBottom: '1px solid #eeeae4',
                paddingBottom: '0.5rem',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveAnalyticsTab('students')}
                style={{
                  background: activeAnalyticsTab === 'students' ? '#173e30' : '#f4efe8',
                  color: activeAnalyticsTab === 'students' ? '#fff' : '#555',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                }}
              >
                <Users style={{ width: 14, height: 14 }} /> By Student ({classMembers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveAnalyticsTab('exercises')}
                style={{
                  background: activeAnalyticsTab === 'exercises' ? '#173e30' : '#f4efe8',
                  color: activeAnalyticsTab === 'exercises' ? '#fff' : '#555',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                }}
              >
                <FileQuestion style={{ width: 14, height: 14 }} /> By Exercise ({classExercises.length})
              </button>
            </div>

            {/* TAB 1: BY STUDENT (with expandable per-exercise performance) */}
            {activeAnalyticsTab === 'students' && (
              <section className="detail-panel">
                <div className="panel-head">
                  <div>
                    <span className="kicker">Roster performance</span>
                    <h2>Student Analytics &amp; Exercise Scores</h2>
                    <p style={{ fontSize: '0.8rem', color: '#777', margin: 0 }}>
                      Click on any student row to inspect their detailed scores across all assigned exercises.
                    </p>
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
                  <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '360px' }}>
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
                      placeholder="Search student by name or email..."
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                      style={{
                        paddingLeft: '36px',
                        height: '38px',
                        borderRadius: '12px',
                        fontSize: '0.84rem',
                        background: '#fff',
                        borderColor: '#ded8cf',
                      }}
                    />
                    {teacherSearch && (
                      <button
                        type="button"
                        onClick={() => setTeacherSearch('')}
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
                        }}
                        aria-label="Clear search"
                      >
                        <X style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: '#666', fontWeight: 600 }}>
                      Filter student:
                    </span>
                    <NativeSelect
                      value={teacherFilterStudentId}
                      onChange={(e) => setTeacherFilterStudentId(e.target.value)}
                      style={{ height: '38px', fontSize: '0.82rem', borderRadius: '10px' }}
                    >
                      <NativeSelectOption value="all">All Students ({studentsList.length})</NativeSelectOption>
                      {studentsList.map((st) => (
                        <NativeSelectOption key={st.uid} value={st.uid}>
                          {st.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                </div>

                {studentsList.length === 0 ? (
                  <div className="detail-empty">
                    <Users />
                    <h3>No students in this class yet</h3>
                    <p>Share class code &ldquo;{activeClass?.code}&rdquo; with your learners so they can join.</p>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '2.5rem 1.5rem',
                      background: '#fcfbf9',
                      borderRadius: '16px',
                      border: '1px dashed #ded8cf',
                    }}
                  >
                    <Search style={{ width: 28, height: 28, margin: '0 auto 0.5rem', color: '#999' }} />
                    <p style={{ fontWeight: 600, color: '#333', margin: '0 0 0.4rem' }}>
                      No students match &ldquo;{teacherSearch}&rdquo;
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setTeacherSearch('')}>
                      Clear search
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {filteredStudents.map((st, i) => {
                      const completionPct =
                        classExercises.length > 0
                          ? Math.min(100, Math.round((st.completedCount / classExercises.length) * 100))
                          : 0;
                      const isExpanded = expandedStudentId === st.uid;

                      return (
                        <div
                          key={st.uid}
                          style={{
                            background: '#fff',
                            border: isExpanded ? '1.5px solid #173e30' : '1px solid #eeeae4',
                            borderRadius: '16px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                            overflow: 'hidden',
                            transition: 'border 0.2s',
                          }}
                        >
                          <div
                            onClick={() => setExpandedStudentId(isExpanded ? null : st.uid)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '1rem',
                              padding: '1rem 1.25rem',
                              cursor: 'pointer',
                              flexWrap: 'wrap',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
                              <span
                                className={`avatar ${colours[i % colours.length]}`}
                                style={{ width: '40px', height: '40px', fontSize: '0.85rem', fontWeight: 700 }}
                              >
                                {initials(st.name)}
                              </span>
                              <div>
                                <b style={{ fontSize: '0.95rem', color: '#111', display: 'block' }}>{st.name}</b>
                                <small style={{ color: '#777', fontSize: '0.78rem' }}>{st.email || 'Enrolled student'}</small>
                              </div>
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1.5rem',
                                flexWrap: 'wrap',
                              }}
                            >
                              {/* Exercises completed */}
                              <div style={{ minWidth: '130px' }}>
                                <small style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#777', fontWeight: 700 }}>
                                  Completion
                                </small>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                  <div style={{ width: '70px', height: '6px', background: '#eeeae4', borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{ width: `${completionPct}%`, height: '100%', background: '#173e30', borderRadius: '999px' }} />
                                  </div>
                                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#333' }}>
                                    {st.completedCount}/{classExercises.length} ({completionPct}%)
                                  </span>
                                </div>
                              </div>

                              {/* Accuracy Score */}
                              <div style={{ minWidth: '110px' }}>
                                <small style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#777', fontWeight: 700 }}>
                                  Average Accuracy
                                </small>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                  <Award style={{ width: 14, height: 14, color: st.scoreAvg >= 70 ? '#166534' : st.scoreAvg >= 50 ? '#d97706' : '#991b1b' }} />
                                  <strong
                                    style={{
                                      fontSize: '0.95rem',
                                      color: st.scoreAvg >= 70 ? '#166534' : st.scoreAvg >= 50 ? '#d97706' : '#991b1b',
                                    }}
                                  >
                                    {st.totalPoints > 0 ? `${st.scoreAvg}%` : '—'}
                                  </strong>
                                  <small style={{ color: '#777', fontSize: '0.74rem' }}>
                                    ({st.earnedPoints}/{st.totalPoints} pts)
                                  </small>
                                </div>
                              </div>

                              {/* Performance badge */}
                              <div>
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '3px 10px',
                                    borderRadius: '999px',
                                    background:
                                      st.totalPoints === 0
                                        ? '#f3f4f6'
                                        : st.scoreAvg >= 80
                                          ? '#f0fdf4'
                                          : st.scoreAvg >= 60
                                            ? '#fefce8'
                                            : '#fef2f2',
                                    color:
                                      st.totalPoints === 0
                                        ? '#6b7280'
                                        : st.scoreAvg >= 80
                                          ? '#15803d'
                                          : st.scoreAvg >= 60
                                            ? '#a16207'
                                            : '#b91c1c',
                                    border: `1px solid ${
                                      st.totalPoints === 0
                                        ? '#e5e7eb'
                                        : st.scoreAvg >= 80
                                          ? '#bbf7d0'
                                          : st.scoreAvg >= 60
                                            ? '#fef08a'
                                            : '#fecaca'
                                    }`,
                                  }}
                                >
                                  {st.totalPoints === 0
                                    ? 'No submissions'
                                    : st.scoreAvg >= 80
                                      ? 'Strong Mastery'
                                      : st.scoreAvg >= 60
                                        ? 'On Track'
                                        : 'Needs Support'}
                                </span>
                              </div>

                              <button
                                type="button"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#888',
                                  padding: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                              >
                                {isExpanded ? <ChevronUp style={{ width: 18, height: 18 }} /> : <ChevronDown style={{ width: 18, height: 18 }} />}
                              </button>
                            </div>
                          </div>

                          {/* Expandable Per-Exercise Breakdown for this Student */}
                          {isExpanded && (
                            <div
                              style={{
                                padding: '1rem 1.25rem',
                                background: '#faf9f6',
                                borderTop: '1px solid #eeeae4',
                              }}
                            >
                              <h4
                                style={{
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  color: '#555',
                                  marginBottom: '0.75rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <FileQuestion style={{ width: 14, height: 14 }} />
                                Performance by Exercise for {st.name}
                              </h4>

                              {classExercises.length === 0 ? (
                                <p style={{ fontSize: '0.82rem', color: '#888', margin: 0 }}>
                                  No exercises published in this classroom yet.
                                </p>
                              ) : (
                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                  {classExercises.map((ex, exIdx) => {
                                    const subs = exerciseSubsMap[ex.id] || [];
                                    const studentSub = subs.find(
                                      (s) => (s.studentId || s.id) === st.uid,
                                    );

                                    const exMaxPoints =
                                      ex?.questions?.reduce(
                                        (n: number, q: any) => n + (Number(q.points) || 1),
                                        0,
                                      ) || (ex?.question ? 2 : 1);

                                    const pts = studentSub ? Number(studentSub.score) || 0 : 0;
                                    const maxPts = studentSub ? Number(studentSub.totalPoints) || exMaxPoints : exMaxPoints;
                                    const acc = studentSub && maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0;

                                    return (
                                      <div
                                        key={ex.id}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          background: '#fff',
                                          border: '1px solid #eae6df',
                                          borderRadius: '12px',
                                          padding: '10px 14px',
                                          gap: '1rem',
                                          flexWrap: 'wrap',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <span
                                            style={{
                                              fontSize: '0.72rem',
                                              fontWeight: 800,
                                              color: '#888',
                                            }}
                                          >
                                            0{exIdx + 1}
                                          </span>
                                          <div>
                                            <b style={{ fontSize: '0.88rem', color: '#222' }}>{ex.title}</b>
                                            {ex.deadline && (
                                              <small style={{ display: 'block', color: '#888', fontSize: '0.72rem' }}>
                                                Deadline: {formatDeadline(ex.deadline).formatted}
                                              </small>
                                            )}
                                          </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                          {studentSub ? (
                                            <>
                                              <div style={{ textAlign: 'right' }}>
                                                <b
                                                  style={{
                                                    fontSize: '0.88rem',
                                                    color: acc >= 70 ? '#166534' : acc >= 50 ? '#d97706' : '#991b1b',
                                                  }}
                                                >
                                                  {pts} / {maxPts} pts ({acc}%)
                                                </b>
                                                {studentSub.isLate && (
                                                  <small style={{ display: 'block', color: '#dc2626', fontSize: '0.68rem', fontWeight: 600 }}>
                                                    Submitted Late
                                                  </small>
                                                )}
                                              </div>
                                              <span
                                                style={{
                                                  fontSize: '0.7rem',
                                                  fontWeight: 700,
                                                  padding: '2px 8px',
                                                  borderRadius: 99,
                                                  background: acc >= 80 ? '#f0fdf4' : acc >= 50 ? '#fefce8' : '#fef2f2',
                                                  color: acc >= 80 ? '#15803d' : acc >= 50 ? '#a16207' : '#b91c1c',
                                                  border: `1px solid ${acc >= 80 ? '#bbf7d0' : acc >= 50 ? '#fef08a' : '#fecaca'}`,
                                                }}
                                              >
                                                {acc >= 80 ? 'Mastered' : acc >= 50 ? 'Passed' : 'Review Needed'}
                                              </span>
                                            </>
                                          ) : (
                                            <span
                                              style={{
                                                fontSize: '0.72rem',
                                                color: '#888',
                                                background: '#f3f4f6',
                                                padding: '3px 8px',
                                                borderRadius: 6,
                                              }}
                                            >
                                              Not submitted
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* TAB 2: BY EXERCISE (Inspect entire class submissions for each exercise) */}
            {activeAnalyticsTab === 'exercises' && (
              <section className="detail-panel">
                <div className="panel-head">
                  <div>
                    <span className="kicker">Curriculum overview</span>
                    <h2>Exercise Performance Breakdown</h2>
                    <p style={{ fontSize: '0.8rem', color: '#777', margin: 0 }}>
                      Inspect student submissions, points, and completion rates per exercise.
                    </p>
                  </div>
                </div>

                {classExercises.length === 0 ? (
                  <div className="detail-empty">
                    <FileQuestion />
                    <h3>No exercises published yet</h3>
                    <p>Create and publish exercises in this classroom to track performance here.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
                    {classExercises.map((ex, idx) => {
                      const subs = exerciseSubsMap[ex.id] || [];
                      const isExpanded = expandedExerciseId === ex.id;
                      const exMaxPoints =
                        ex?.questions?.reduce((n: number, q: any) => n + (Number(q.points) || 1), 0) ||
                        (ex?.question ? 2 : 1);

                      let totalEarned = 0;
                      let totalPossible = 0;
                      subs.forEach((s) => {
                        totalEarned += Number(s.score) || 0;
                        totalPossible += Number(s.totalPoints) || exMaxPoints;
                      });

                      const avgAcc = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
                      const completionRate =
                        classMembers.length > 0
                          ? Math.min(100, Math.round((subs.length / classMembers.length) * 100))
                          : 0;

                      return (
                        <div
                          key={ex.id}
                          style={{
                            background: '#fff',
                            border: isExpanded ? '1.5px solid #173e30' : '1px solid #eeeae4',
                            borderRadius: '16px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            onClick={() => setExpandedExerciseId(isExpanded ? null : ex.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '1rem',
                              padding: '1rem 1.25rem',
                              cursor: 'pointer',
                              flexWrap: 'wrap',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  background: '#e8f1e9',
                                  color: '#173e30',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 800,
                                  fontSize: '0.85rem',
                                }}
                              >
                                0{idx + 1}
                              </span>
                              <div>
                                <b style={{ fontSize: '1rem', color: '#111', display: 'block' }}>{ex.title}</b>
                                <small style={{ color: '#666', fontSize: '0.78rem' }}>
                                  {ex.questions?.length || (ex.question ? 1 : 0)} questions · {exMaxPoints} max points
                                  {ex.deadline ? ` · Due: ${formatDeadline(ex.deadline).formatted}` : ''}
                                </small>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                              {/* Submissions count */}
                              <div>
                                <small style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#777', fontWeight: 700 }}>
                                  Turned in
                                </small>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#222', marginTop: '2px' }}>
                                  {subs.length} / {classMembers.length} ({completionRate}%)
                                </div>
                              </div>

                              {/* Accuracy */}
                              <div>
                                <small style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#777', fontWeight: 700 }}>
                                  Class Accuracy
                                </small>
                                <div
                                  style={{
                                    fontSize: '0.95rem',
                                    fontWeight: 800,
                                    color: avgAcc >= 70 ? '#166534' : avgAcc >= 50 ? '#d97706' : '#991b1b',
                                    marginTop: '2px',
                                  }}
                                >
                                  {subs.length > 0 ? `${avgAcc}%` : '—'}
                                </div>
                              </div>

                              <button
                                type="button"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#888',
                                  padding: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                              >
                                {isExpanded ? <ChevronUp style={{ width: 18, height: 18 }} /> : <ChevronDown style={{ width: 18, height: 18 }} />}
                              </button>
                            </div>
                          </div>

                          {/* Expandable Submissions List for this Exercise */}
                          {isExpanded && (
                            <div
                              style={{
                                padding: '1rem 1.25rem',
                                background: '#faf9f6',
                                borderTop: '1px solid #eeeae4',
                              }}
                            >
                              <h4
                                style={{
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  color: '#555',
                                  marginBottom: '0.75rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <Users style={{ width: 14, height: 14 }} />
                                Student Results for &ldquo;{ex.title}&rdquo; ({subs.length} submissions)
                              </h4>

                              {subs.length === 0 ? (
                                <p style={{ fontSize: '0.82rem', color: '#888', margin: 0 }}>
                                  No student has submitted answers for this exercise yet.
                                </p>
                              ) : (
                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                  {subs.map((sub, sIdx) => {
                                    const pts = Number(sub.score) || 0;
                                    const maxPts = Number(sub.totalPoints) || exMaxPoints;
                                    const acc = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0;
                                    const submittedDate = sub.submittedAt
                                      ? sub.submittedAt.toDate
                                        ? sub.submittedAt.toDate().toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                          })
                                        : typeof sub.submittedAt === 'string'
                                          ? new Date(sub.submittedAt).toLocaleDateString('en-US', {
                                              month: 'short',
                                              day: 'numeric',
                                              year: 'numeric',
                                            })
                                          : 'Submitted'
                                      : 'Submitted';

                                    return (
                                      <div
                                        key={sub.id || sIdx}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          background: '#fff',
                                          border: '1px solid #eae6df',
                                          borderRadius: '12px',
                                          padding: '10px 14px',
                                          gap: '1rem',
                                          flexWrap: 'wrap',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                          <span
                                            className={`avatar ${colours[sIdx % colours.length]}`}
                                            style={{ width: '32px', height: '32px', fontSize: '0.75rem', fontWeight: 700 }}
                                          >
                                            {initials(sub.studentName)}
                                          </span>
                                          <div>
                                            <b style={{ fontSize: '0.88rem', color: '#222' }}>{sub.studentName}</b>
                                            <small style={{ display: 'block', color: '#888', fontSize: '0.72rem' }}>
                                              {submittedDate}
                                            </small>
                                          </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                          <div style={{ textAlign: 'right' }}>
                                            <b
                                              style={{
                                                fontSize: '0.88rem',
                                                color: acc >= 70 ? '#166534' : acc >= 50 ? '#d97706' : '#991b1b',
                                              }}
                                            >
                                              {pts} / {maxPts} pts ({acc}%)
                                            </b>
                                            {sub.isLate && (
                                              <small style={{ display: 'block', color: '#dc2626', fontSize: '0.68rem', fontWeight: 600 }}>
                                                Late Submission
                                              </small>
                                            )}
                                          </div>
                                          <span
                                            style={{
                                              fontSize: '0.7rem',
                                              fontWeight: 700,
                                              padding: '2px 8px',
                                              borderRadius: 99,
                                              background: acc >= 80 ? '#f0fdf4' : acc >= 50 ? '#fefce8' : '#fef2f2',
                                              color: acc >= 80 ? '#15803d' : acc >= 50 ? '#a16207' : '#b91c1c',
                                              border: `1px solid ${acc >= 80 ? '#bbf7d0' : acc >= 50 ? '#fef08a' : '#fecaca'}`,
                                            }}
                                          >
                                            {acc >= 80 ? 'Mastered' : acc >= 50 ? 'Passed' : 'Needs Review'}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </>
    );
  }

  // STUDENT VIEW (Self-Analytics Only)
  const {
    completedCount,
    totalAssigned,
    completionRate,
    accuracyRate,
    totalEarned,
    totalPossible,
    submissions,
  } = studentStats();

  return (
    <>
      <header className="detail-page-head">
        <div>
          <span className="kicker">Personal Insights</span>
          <h1>My Learning Analytics</h1>
          <p>Analyze your personal learning trends, points earned, and question accuracy across your classes.</p>
        </div>
      </header>

      <section className="progress-summary">
        <article className="progress-primary">
          <small>YOUR OVERALL ACCURACY</small>
          <strong>
            {accuracyRate}
            <span>%</span>
          </strong>
          <Progress value={accuracyRate} />
          <p>
            {totalPossible > 0
              ? `${totalEarned} of ${totalPossible} total points earned across submissions`
              : 'Complete exercises to build your personal accuracy profile.'}
          </p>
        </article>
        <article>
          <span>
            <Check />
          </span>
          <small>EXERCISES COMPLETED</small>
          <strong>
            {completedCount} <span style={{ fontSize: '0.85rem', color: '#888' }}>/ {totalAssigned}</span>
          </strong>
        </article>
        <article>
          <span>
            <Award />
          </span>
          <small>COMPLETION RATE</small>
          <strong>{completionRate}%</strong>
        </article>
      </section>

      {/* Score by Exercise Chart */}
      {submissions.length > 0 && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #eeeae4',
            borderRadius: '16px',
            padding: '1.25rem',
            marginTop: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <h3
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#555',
              margin: '0 0 0.85rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <BarChart3 style={{ width: 13, height: 13 }} />
            My Score by Exercise
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {submissions.map((item, idx) => {
              const ex = item.exercise;
              const sub = item.submission;
              const pts = Number(sub.score) || 0;
              const maxPts =
                Number(sub.totalPoints) ||
                ex?.questions?.reduce((n: number, q: any) => n + (Number(q.points) || 1), 0) ||
                (ex?.question ? 2 : 1);
              const acc = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0;
              const barColor = acc >= 80 ? '#173e30' : acc >= 50 ? '#d97706' : '#dc2626';
              const rawTitle = ex?.title || 'Exercise';
              const label = rawTitle.length > 24 ? rawTitle.slice(0, 24) + '…' : rawTitle;
              return (
                <div
                  key={ex?.id || idx}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <span
                    style={{
                      fontSize: '0.68rem',
                      color: '#aaa',
                      fontWeight: 700,
                      minWidth: '18px',
                      textAlign: 'right',
                    }}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span
                    title={rawTitle}
                    style={{
                      fontSize: '0.74rem',
                      color: '#333',
                      minWidth: '120px',
                      maxWidth: '120px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: '9px',
                      background: '#f0ece6',
                      borderRadius: '999px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${acc}%`,
                        height: '100%',
                        background: barColor,
                        borderRadius: '999px',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      color: barColor,
                      minWidth: '32px',
                      textAlign: 'right',
                    }}
                  >
                    {acc}%
                  </span>
                  <span
                    style={{
                      fontSize: '0.71rem',
                      color: '#999',
                      minWidth: '58px',
                      textAlign: 'right',
                    }}
                  >
                    {pts}/{maxPts} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submissions breakdown */}
      <section className="detail-panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-head">
          <div>
            <span className="kicker">Recent Activity</span>
            <h2>My Exercise Submissions ({submissions.length})</h2>
          </div>
        </div>

        {submissions.length === 0 ? (
          <div className="detail-empty">
            <LineChart />
            <h3>No submission history yet</h3>
            <p>Once you solve exercises assigned by your teachers, your score breakdown and analytics will appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
            {submissions.map((item, idx) => {
              const ex = item.exercise;
              const sub = item.submission;
              const pts = Number(sub.score) || 0;
              const maxPts =
                Number(sub.totalPoints) ||
                ex?.questions?.reduce((n: number, q: any) => n + (Number(q.points) || 1), 0) ||
                (ex?.question ? 2 : 1);
              const acc = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0;

              const submittedDate = sub.submittedAt
                ? sub.submittedAt.toDate
                  ? sub.submittedAt.toDate().toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : typeof sub.submittedAt === 'string'
                    ? new Date(sub.submittedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Completed'
                : 'Completed';

              return (
                <div
                  key={item.exercise.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    padding: '1.1rem 1.25rem',
                    background: '#fff',
                    border: '1px solid #eeeae4',
                    borderRadius: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          color: '#173e30',
                          background: '#e8f1e9',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {item.classroomName}
                      </span>
                      <small style={{ color: '#888' }}>Submitted {submittedDate}</small>
                    </div>
                    <b style={{ fontSize: '1.05rem', color: '#111' }}>{ex.title || 'Exercise'}</b>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: acc >= 70 ? '#166534' : acc >= 50 ? '#d97706' : '#991b1b' }}>
                        {pts} / {maxPts} pts
                      </div>
                      <small style={{ color: '#777', fontWeight: 600 }}>{acc}% accuracy</small>
                    </div>

                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: acc >= 80 ? '#f0fdf4' : acc >= 50 ? '#fefce8' : '#fef2f2',
                        color: acc >= 80 ? '#15803d' : acc >= 50 ? '#a16207' : '#b91c1c',
                        border: `1px solid ${acc >= 80 ? '#bbf7d0' : acc >= 50 ? '#fef08a' : '#fecaca'}`,
                      }}
                    >
                      {acc >= 80 ? 'Mastered' : acc >= 50 ? 'Passing' : 'Needs Practice'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

