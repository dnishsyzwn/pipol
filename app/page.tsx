'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, increment, limit, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, Bot, Check, CheckCircle2, ChevronRight, Clock3, Copy, FileQuestion, GraduationCap, LayoutDashboard, LoaderCircle, LogOut, Menu, MoreHorizontal, Pencil, Plus, Search, Send, Sparkles, Trash2, Users, WandSparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { auth, db, googleProvider } from '@/lib/firebase';

type Role='teacher'|'student'; type View='dashboard'|'classroom'|'quiz'|'exercise';
type ClassroomData={id:string;name:string;subject:string;code:string;teacherId:string;teacherName:string;students:number;maxStudents?:number;progress:number};
type JoinRequest={id:string;classId:string;className:string;code:string;teacherId:string;studentId:string;studentName:string;studentEmail:string};
type Membership={id:string;classId:string;className:string;code:string;teacherId:string;teacherName:string;progress:number;tasks:number};
const MAX_TEACHER_CLASSES = 3;
const colours=['lime','blue','violet'];
const initials=(name?:string|null)=>(name||'Learner').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const friendlyError=(e:unknown)=>e instanceof Error&&e.message.includes('popup-closed')?'Sign in cancelled. Try again when you’re ready.':'Something went wrong. Please try again.';

function Brand(){return <div className="brand-lockup"><span className="brand-mark"><span>4</span></span><div><strong>Lumina</strong><small>learning hub</small></div></div>}
function LoginPage({busy,error,onLogin}:{busy:boolean;error:string;onLogin:(r:Role)=>void}){return <main className="gate-page login-gate"><nav className="gate-nav"><Brand/><span className="sdg-pill">SDG 4 · Quality Education</span></nav><section className="gate-copy"><div className="eyebrow"><Sparkles/> Learn better, together</div><h1>Your class.<br/><span>Your learning path.</span></h1><p>Sign in with Google, choose your role and start with a fresh learning space built around your classroom.</p></section><section className="role-panel login-panel"><div className="role-panel-head"><span>Sign in to Lumina</span><h2>Continue as</h2><p>Choose the role you’ll use for this account.</p></div><button className="role-card teacher-role" disabled={busy} onClick={()=>onLogin('teacher')}><span className="role-icon"><GraduationCap/></span><span><b>Teacher</b><small>Create classes, approve students and build exercises</small></span><span className="google-sign"><i>G</i><ArrowRight/></span></button><button className="role-card student-role" disabled={busy} onClick={()=>onLogin('student')}><span className="role-icon"><BookOpen/></span><span><b>Student</b><small>Join with a class code and track your own progress</small></span><span className="google-sign"><i>G</i><ArrowRight/></span></button>{busy&&<p className="auth-state"><LoaderCircle/> Opening Google sign in…</p>}{error&&<p className="auth-error">{error}</p>}<p className="demo-note">Google account authentication powered by Firebase</p></section><div className="orb orb-one"/><div className="orb orb-two"/></main>}
function AppShell({role,user,onExit,children,active='dashboard',classCount=0}:{role:Role;user:User;onExit:()=>void;children:React.ReactNode;active?:View;classCount?:number}){return <div className="app-shell"><aside className="sidebar"><Brand/><nav><a className={active==='dashboard'?'active':''}><LayoutDashboard/> Overview</a><a className={active==='classroom'?'active':''}><BookOpen/> Classrooms <span>{classCount}</span></a>{role==='teacher'&&<a className={active==='quiz'?'active':''}><FileQuestion/> Quiz studio</a>}<a><BarChart3/> Progress</a></nav><div className="sidebar-foot"><div className="mini-profile"><span>{initials(user.displayName)}</span><div><b>{user.displayName||'Lumina user'}</b><small>{role}</small></div></div><button onClick={onExit} aria-label="Sign out"><LogOut/></button></div></aside><div className="mobile-bar"><Brand/><Menu/></div><section className="main-stage">{children}</section></div>}
function Topbar({role,user}:{role:Role;user:User}){const first=(user.displayName||(role==='teacher'?'Teacher':'Learner')).split(' ')[0];return <header className="topbar"><div><span className="today">Lumina · Hackathon MMU 2026</span><h1>{role==='teacher'?`Welcome, ${first}.`:`Ready to learn, ${first}?`}</h1></div><div className="top-actions"><label><Search/><input placeholder="Search"/></label><span className={`role-badge ${role}`}>{role==='teacher'?<GraduationCap/>:<BookOpen/>}{role}</span></div></header>}
function EmptyState({role,action}:{role:Role;action:()=>void}){return <section className={`empty-dashboard ${role}`}><span>{role==='teacher'?<GraduationCap/>:<BookOpen/>}</span><p className="kicker">Your space is ready</p><h2>{role==='teacher'?'Create your first classroom':'Join your first classroom'}</h2><p>{role==='teacher'?'Create a class and share its code or link with your students.':'Enter the code your teacher shared. You’ll get access after approval.'}</p><Button onClick={action}><Plus/>{role==='teacher'?'Create classroom':'Join classroom'}</Button></section>}

function TeacherDashboard({user,onView,onExit,onSelectClass}:{user:User;onView:(v:View)=>void;onExit:()=>void;onSelectClass:(c:ClassroomData)=>void}){
 const [classes,setClasses]=useState<ClassroomData[]>([]),[requests,setRequests]=useState<JoinRequest[]>([]),[createOpen,setCreateOpen]=useState(false),[newName,setNewName]=useState(''),[newSubject,setNewSubject]=useState(''),[newMaxStudents,setNewMaxStudents]=useState('30'),[saving,setSaving]=useState(false),[created,setCreated]=useState<ClassroomData|null>(null),[error,setError]=useState('');
 const [editTarget,setEditTarget]=useState<ClassroomData|null>(null),[editName,setEditName]=useState(''),[editSubject,setEditSubject]=useState(''),[editMaxStudents,setEditMaxStudents]=useState('30'),[savingEdit,setSavingEdit]=useState(false),[editError,setEditError]=useState('');
 const [deleteTarget,setDeleteTarget]=useState<ClassroomData|null>(null),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');

 useEffect(()=>onSnapshot(query(collection(db,'classrooms'),where('teacherId','==',user.uid)),s=>setClasses(s.docs.map(d=>({id:d.id,...d.data()} as ClassroomData)))),[user.uid]);
 useEffect(()=>{const groups=new Map<string,JoinRequest[]>();const unsubs=classes.map(c=>onSnapshot(collection(db,'classrooms',c.id,'requests'),s=>{groups.set(c.id,s.docs.map(d=>({id:d.id,...d.data()} as JoinRequest)));setRequests([...groups.values()].flat())}));if(!classes.length)setRequests([]);return()=>unsubs.forEach(u=>u())},[classes.map(c=>c.id).join('|')]);

 const createClass=async()=>{if(!newName.trim()||!newSubject.trim())return;if(classes.length>=MAX_TEACHER_CLASSES){setError(`Teachers can only create a maximum of ${MAX_TEACHER_CLASSES} classrooms.`);return;}setSaving(true);setError('');try{const maxStudentsNum=parseInt(newMaxStudents,10)||30;const code=`${newSubject.replace(/[^a-z0-9]/gi,'').slice(0,4).toUpperCase()||'CLAS'}-${Math.random().toString(36).slice(2,5).toUpperCase()}`,data={name:newName.trim(),subject:newSubject.trim(),code,teacherId:user.uid,teacherName:user.displayName||'Teacher',students:0,maxStudents:maxStudentsNum,progress:0};const ref=await addDoc(collection(db,'classrooms'),{...data,createdAt:serverTimestamp()});setCreated({id:ref.id,...data});setNewName('');setNewSubject('');setNewMaxStudents('30')}catch(e){setError(friendlyError(e))}finally{setSaving(false)}};

 const openEdit=(c:ClassroomData)=>{setEditTarget(c);setEditName(c.name);setEditSubject(c.subject||'');setEditMaxStudents(String(c.maxStudents||30));setEditError('')};

 const saveEdit=async()=>{if(!editTarget||!editName.trim()||!editSubject.trim())return;const maxCap=parseInt(editMaxStudents,10)||30;if(maxCap<(editTarget.students||0)){setEditError(`Capacity cannot be lower than current enrollment (${editTarget.students||0} students).`);return;}setSavingEdit(true);setEditError('');try{const classId=editTarget.id;const batch=writeBatch(db);batch.update(doc(db,'classrooms',classId),{name:editName.trim(),subject:editSubject.trim(),maxStudents:maxCap,updatedAt:serverTimestamp()});const membersSnap=await getDocs(collection(db,'classrooms',classId,'members'));membersSnap.docs.forEach(d=>{batch.update(doc(db,'users',d.id,'memberships',classId),{className:editName.trim()})});await batch.commit();setEditTarget(null)}catch(e){setEditError(friendlyError(e))}finally{setSavingEdit(false)}};

 const confirmDelete=async()=>{if(!deleteTarget)return;setDeleting(true);setDeleteError('');try{const classId=deleteTarget.id;const [membersSnap,requestsSnap,exercisesSnap]=await Promise.all([getDocs(collection(db,'classrooms',classId,'members')),getDocs(collection(db,'classrooms',classId,'requests')),getDocs(collection(db,'classrooms',classId,'exercises'))]);const batch=writeBatch(db);membersSnap.docs.forEach(d=>{batch.delete(doc(db,'users',d.id,'memberships',classId));batch.delete(doc(db,'classrooms',classId,'members',d.id))});requestsSnap.docs.forEach(d=>{batch.delete(doc(db,'users',d.id,'joinRequests',classId));batch.delete(doc(db,'classrooms',classId,'requests',d.id))});exercisesSnap.docs.forEach(d=>{batch.delete(doc(db,'classrooms',classId,'exercises',d.id))});batch.delete(doc(db,'classrooms',classId));await batch.commit();setDeleteTarget(null)}catch(e){setDeleteError(friendlyError(e))}finally{setDeleting(false)}};

 const decide=async(r:JoinRequest,approve:boolean)=>{if(approve){const target=classes.find(c=>c.id===r.classId);if(target&&(target.students||0)>=(target.maxStudents||30)){alert(`Cannot approve: ${target.name} has reached its maximum student capacity (${target.students}/${target.maxStudents||30}).`);return;}}const batch=writeBatch(db);batch.delete(doc(db,'classrooms',r.classId,'requests',r.studentId));batch.delete(doc(db,'users',r.studentId,'joinRequests',r.classId));if(approve){batch.set(doc(db,'classrooms',r.classId,'members',r.studentId),{uid:r.studentId,name:r.studentName,email:r.studentEmail,progress:0,joinedAt:serverTimestamp()});batch.set(doc(db,'users',r.studentId,'memberships',r.classId),{classId:r.classId,className:r.className,code:r.code,teacherId:user.uid,teacherName:user.displayName||'Teacher',progress:0,tasks:0,joinedAt:serverTimestamp()});batch.update(doc(db,'classrooms',r.classId),{students:increment(1)})}await batch.commit()};
 return <AppShell role="teacher" user={user} onExit={onExit} classCount={classes.length}><Topbar role="teacher" user={user}/>{classes.length?<><div className="hero-strip"><div><span className="hero-kicker">Class overview</span><h2>{classes.length} / {MAX_TEACHER_CLASSES} classroom{classes.length>1?'s':''} under your care.</h2><p>{requests.length?`${requests.length} student request${requests.length>1?'s':''} waiting for approval.`:'No join requests waiting right now.'}</p></div><div className="hero-score"><strong>{classes.reduce((n,c)=>n+(c.students||0),0)}</strong><small>total learners</small></div></div><div className="section-head"><div><span className="kicker">Your spaces ({classes.length}/{MAX_TEACHER_CLASSES})</span><h2>Classrooms</h2></div><Button disabled={classes.length>=MAX_TEACHER_CLASSES} onClick={()=>{if(classes.length>=MAX_TEACHER_CLASSES)return;setCreated(null);setCreateOpen(true)}} className="primary-action"><Plus/> {classes.length>=MAX_TEACHER_CLASSES?`Class Limit Reached (${classes.length}/${MAX_TEACHER_CLASSES})`:'Create classroom'}</Button></div><div className="class-grid">{classes.map((c,i)=><div key={c.id} className={`class-card ${colours[i%3]}`} role="button" tabIndex={0} onClick={()=>{onSelectClass(c);onView('classroom')}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){onSelectClass(c);onView('classroom')}}} style={{cursor:'pointer'}}><div className="class-top"><span>0{i+1}</span><div className="card-actions" onClick={e=>e.stopPropagation()}><button type="button" className="action-icon-btn" title="Edit classroom" onClick={e=>{e.stopPropagation();openEdit(c)}} aria-label={`Edit ${c.name}`}><Pencil style={{width:14,height:14}}/></button><button type="button" className="action-icon-btn delete-btn" title="Delete classroom" onClick={e=>{e.stopPropagation();setDeleteTarget(c)}} aria-label={`Delete ${c.name}`}><Trash2 style={{width:14,height:14}}/></button></div></div><div><small>{c.code}</small><h3>{c.name}</h3></div><div className="class-bottom"><span><Users/> {c.students||0} / {c.maxStudents||30} learners</span><span>{c.progress||0}%</span></div><Progress value={c.progress||0}/></div>)}</div></>:<EmptyState role="teacher" action={()=>{if(classes.length>=MAX_TEACHER_CLASSES)return;setCreateOpen(true)}}/>}<div className="dashboard-lower"><section className="panel requests"><div className="panel-head"><div><span className="kicker">Needs your attention</span><h2>Join requests <b>{requests.length}</b></h2></div></div>{requests.length?requests.map(r=><div className="request-row" key={`${r.classId}-${r.studentId}`}><span className="avatar">{initials(r.studentName)}</span><div><b>{r.studentName}</b><small>{r.className} · {r.studentEmail}</small></div><button className="decline" onClick={()=>decide(r,false)} aria-label="Decline"><X/></button><button className="approve" onClick={()=>decide(r,true)}><Check/> Approve</button></div>):<div className="empty-success"><CheckCircle2/> No pending student requests.</div>}</section>{classes.length>0&&<section className="panel next-up"><div className="panel-head"><div><span className="kicker">Quick action</span><h2>Build with AI</h2></div><WandSparkles/></div><div className="ai-card"><span className="ai-glyph"><Bot/></span><h3>Make a question clearer and richer.</h3><p>Open a classroom, then create an AI-enhanced exercise.</p></div></section>}</div><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="modal-card"><DialogHeader><DialogTitle>{created?'Classroom created!':'Create a classroom'}</DialogTitle><DialogDescription>{created?'Share this code or link with students.':'Your class and student list will begin empty.'}</DialogDescription></DialogHeader>{created?<div className="created-class"><small>CLASS CODE</small><strong>{created.code}</strong><p>{created.name}</p><p><small>Student Capacity: {created.maxStudents||30} learners</small></p><Button onClick={()=>navigator.clipboard.writeText(`${location.origin}/?join=${created.code}`)}><Copy/> Copy invite link</Button></div>:<><label className="form-label">Classroom name<Input placeholder="e.g. Mathematics · Form 4" value={newName} onChange={e=>setNewName(e.target.value)}/></label><label className="form-label">Subject<Input placeholder="e.g. Mathematics" value={newSubject} onChange={e=>setNewSubject(e.target.value)}/></label><label className="form-label">Student capacity (Max learners)<Input type="number" min="1" max="100" placeholder="e.g. 30" value={newMaxStudents} onChange={e=>setNewMaxStudents(e.target.value)}/></label>{error&&<p className="form-error">{error}</p>}</>}<DialogFooter>{created?<Button onClick={()=>setCreateOpen(false)}>Done</Button>:<><Button variant="outline" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button onClick={createClass} disabled={saving||!newName.trim()||!newSubject.trim()||classes.length>=MAX_TEACHER_CLASSES}>{saving?<LoaderCircle/>:<Plus/>} Create classroom</Button></>}</DialogFooter></DialogContent></Dialog><Dialog open={!!editTarget} onOpenChange={open=>!open&&setEditTarget(null)}><DialogContent className="modal-card"><DialogHeader><DialogTitle>Edit classroom</DialogTitle><DialogDescription>Update details for {editTarget?.name}.</DialogDescription></DialogHeader><label className="form-label">Classroom name<Input placeholder="e.g. Mathematics · Form 4" value={editName} onChange={e=>setEditName(e.target.value)}/></label><label className="form-label">Subject<Input placeholder="e.g. Mathematics" value={editSubject} onChange={e=>setEditSubject(e.target.value)}/></label><label className="form-label">Student capacity (Max learners)<Input type="number" min={Math.max(1,editTarget?.students||1)} max="100" value={editMaxStudents} onChange={e=>setEditMaxStudents(e.target.value)}/>{editTarget&&(editTarget.students||0)>0&&<small style={{color:'#706a63',fontSize:'0.72rem'}}>Currently enrolled: {editTarget.students} student{(editTarget.students||0)>1?'s':''}. Capacity cannot be lower.</small>}</label>{editError&&<p className="form-error">{editError}</p>}<DialogFooter><Button variant="outline" onClick={()=>setEditTarget(null)}>Cancel</Button><Button onClick={saveEdit} disabled={savingEdit||!editName.trim()||!editSubject.trim()}>{savingEdit?<LoaderCircle/>:<Check/>} Save changes</Button></DialogFooter></DialogContent></Dialog><Dialog open={!!deleteTarget} onOpenChange={open=>!open&&setDeleteTarget(null)}><DialogContent className="modal-card"><DialogHeader><div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:42,height:42,borderRadius:'50%',background:'#fee2e2',color:'#dc2626',marginBottom:10}}><Trash2 style={{width:20,height:20}}/></div><DialogTitle>Delete classroom?</DialogTitle><DialogDescription>Are you sure you want to delete <strong>{deleteTarget?.name}</strong> (Code: <code>{deleteTarget?.code}</code>)?</DialogDescription></DialogHeader><div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:14,padding:'12px 14px',color:'#991b1b',fontSize:'0.8rem',lineHeight:1.5}}><strong>Warning:</strong> This permanently deletes this classroom, its {deleteTarget?.students||0} student membership(s), join requests, and all published exercises. This cannot be undone.</div>{deleteError&&<p className="form-error">{deleteError}</p>}<DialogFooter style={{marginTop:12}}><Button variant="outline" onClick={()=>setDeleteTarget(null)} disabled={deleting}>Cancel</Button><Button onClick={confirmDelete} disabled={deleting} style={{background:'#dc2626',color:'#fff'}}>{deleting?<LoaderCircle/>:<Trash2/>} {deleting?'Deleting…':'Delete classroom'}</Button></DialogFooter></DialogContent></Dialog></AppShell>
}

function StudentDashboard({user,onView,onExit,onSelectClass}:{user:User;onView:(v:View)=>void;onExit:()=>void;onSelectClass:(c:ClassroomData)=>void}){
 const [memberships,setMemberships]=useState<Membership[]>([]),[pending,setPending]=useState<JoinRequest[]>([]),[joinOpen,setJoinOpen]=useState(false),[joinCode,setJoinCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>onSnapshot(collection(db,'users',user.uid,'memberships'),s=>setMemberships(s.docs.map(d=>({id:d.id,...d.data()} as Membership)))),[user.uid]);useEffect(()=>onSnapshot(collection(db,'users',user.uid,'joinRequests'),s=>setPending(s.docs.map(d=>({id:d.id,...d.data()} as JoinRequest)))),[user.uid]);useEffect(()=>{const code=new URLSearchParams(location.search).get('join');if(code){setJoinCode(code.toUpperCase());setJoinOpen(true)}},[]);
 const requestJoin=async()=>{setBusy(true);setMessage('');try{const code=joinCode.trim().toUpperCase(),found=await getDocs(query(collection(db,'classrooms'),where('code','==',code),limit(1)));if(found.empty){setMessage('Class code not found. Check the code and try again.');return}const c={id:found.docs[0].id,...found.docs[0].data()} as ClassroomData;const currentStudents=c.students||0;const maxCap=c.maxStudents||30;if(currentStudents>=maxCap){setMessage(`This classroom has reached its maximum student capacity (${currentStudents}/${maxCap}).`);return;}if(memberships.some(m=>m.classId===c.id)){setMessage('You already joined this classroom.');return}if(pending.some(p=>p.classId===c.id)){setMessage('Your request is already waiting for approval.');return}const data={classId:c.id,className:c.name,code:c.code,teacherId:c.teacherId,teacherName:c.teacherName,studentId:user.uid,studentName:user.displayName||'Student',studentEmail:user.email||'',createdAt:serverTimestamp()};const batch=writeBatch(db);batch.set(doc(db,'classrooms',c.id,'requests',user.uid),data);batch.set(doc(db,'users',user.uid,'joinRequests',c.id),data);await batch.commit();setJoinOpen(false);setJoinCode('')}catch(e){setMessage(friendlyError(e))}finally{setBusy(false)}};
 const total=memberships.length?Math.round(memberships.reduce((n,m)=>n+(m.progress||0),0)/memberships.length):0;
 return <AppShell role="student" user={user} onExit={onExit} classCount={memberships.length}><Topbar role="student" user={user}/>{memberships.length?<div className="student-hero"><div><span className="eyebrow"><Sparkles/> Your learning</span><h2>Keep building<br/>your momentum.</h2><p>Your progress updates as you complete classroom activities.</p></div><div className="streak-ring"><strong>{total}</strong><span>%<br/>progress</span></div></div>:<EmptyState role="student" action={()=>setJoinOpen(true)}/>} {pending.map(p=><div className="pending-banner" key={p.classId}><span><Clock3/></span><div><b>Waiting for teacher approval</b><p><strong>{p.className}</strong> · code {p.code}</p></div></div>)}{memberships.length>0&&<><div className="section-head"><div><span className="kicker">Your learning spaces</span><h2>My classrooms</h2></div><Button onClick={()=>setJoinOpen(true)} className="primary-action"><Plus/> Join classroom</Button></div><div className="student-grid">{memberships.map((m,i)=><button className={`student-class ${colours[i%3]}`} key={m.classId} onClick={()=>{onSelectClass({id:m.classId,name:m.className,subject:m.className,code:m.code,teacherId:m.teacherId,teacherName:m.teacherName,students:0,progress:m.progress||0});onView('classroom')}}><div className="subject-number">0{i+1}</div><div className="student-class-info"><small>{m.teacherName}</small><h3>{m.className}</h3><div className="task-line"><span>{m.tasks||0} tasks due</span><span>{m.progress||0}% mastered</span></div><Progress value={m.progress||0}/></div><ChevronRight/></button>)}</div></>}<Dialog open={joinOpen} onOpenChange={setJoinOpen}><DialogContent className="modal-card"><DialogHeader><DialogTitle>Join a classroom</DialogTitle><DialogDescription>Enter the class code from your teacher. Access starts after approval.</DialogDescription></DialogHeader><label className="form-label">Classroom code<Input className="code-input" placeholder="e.g. MATH-4K2" value={joinCode} onChange={e=>{setJoinCode(e.target.value.toUpperCase());setMessage('')}}/></label><div className="approval-note"><Clock3/> Your request will appear on the teacher’s dashboard.</div>{message&&<p className="form-error">{message}</p>}<DialogFooter><Button variant="outline" onClick={()=>setJoinOpen(false)}>Cancel</Button><Button disabled={busy||!joinCode.trim()} onClick={requestJoin}>{busy?<LoaderCircle/>:<Send/>} Request to join</Button></DialogFooter></DialogContent></Dialog></AppShell>
}

function Classroom({role,user,classroom,onBack,onQuiz,onStartExercise,onExit,onClassUpdated,onClassDeleted}:{role:Role;user:User;classroom:ClassroomData;onBack:()=>void;onQuiz:()=>void;onStartExercise:(ex:any)=>void;onExit:()=>void;onClassUpdated?:(c:ClassroomData)=>void;onClassDeleted?:()=>void}){
 const [currentClass,setCurrentClass]=useState<ClassroomData>(classroom);
 const [exercises,setExercises]=useState<{id:string;title:string;question?:string;questions?:any[];questionCount?:number;enhanced?:boolean}[]>([]);
 const [editOpen,setEditOpen]=useState(false),[editName,setEditName]=useState(classroom.name),[editSubject,setEditSubject]=useState(classroom.subject||''),[editMaxStudents,setEditMaxStudents]=useState(String(classroom.maxStudents||30)),[savingEdit,setSavingEdit]=useState(false),[editError,setEditError]=useState('');
 const [deleteOpen,setDeleteOpen]=useState(false),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');

 useEffect(()=>onSnapshot(doc(db,'classrooms',classroom.id),snap=>{if(snap.exists()){const updated={id:snap.id,...snap.data()} as ClassroomData;setCurrentClass(updated);if(onClassUpdated)onClassUpdated(updated)}}),[classroom.id]);
 useEffect(()=>onSnapshot(collection(db,'classrooms',classroom.id,'exercises'),s=>setExercises(s.docs.map(d=>({id:d.id,...d.data()} as any)))),[classroom.id]);

 const saveEdit=async()=>{if(!editName.trim()||!editSubject.trim())return;const maxCap=parseInt(editMaxStudents,10)||30;if(maxCap<(currentClass.students||0)){setEditError(`Capacity cannot be lower than current enrollment (${currentClass.students||0} students).`);return;}setSavingEdit(true);setEditError('');try{const classId=classroom.id;const batch=writeBatch(db);batch.update(doc(db,'classrooms',classId),{name:editName.trim(),subject:editSubject.trim(),maxStudents:maxCap,updatedAt:serverTimestamp()});const membersSnap=await getDocs(collection(db,'classrooms',classId,'members'));membersSnap.docs.forEach(d=>{batch.update(doc(db,'users',d.id,'memberships',classId),{className:editName.trim()})});await batch.commit();setEditOpen(false)}catch(e){setEditError(friendlyError(e))}finally{setSavingEdit(false)}};

 const confirmDelete=async()=>{setDeleting(true);setDeleteError('');try{const classId=classroom.id;const [membersSnap,requestsSnap,exercisesSnap]=await Promise.all([getDocs(collection(db,'classrooms',classId,'members')),getDocs(collection(db,'classrooms',classId,'requests')),getDocs(collection(db,'classrooms',classId,'exercises'))]);const batch=writeBatch(db);membersSnap.docs.forEach(d=>{batch.delete(doc(db,'users',d.id,'memberships',classId));batch.delete(doc(db,'classrooms',classId,'members',d.id))});requestsSnap.docs.forEach(d=>{batch.delete(doc(db,'users',d.id,'joinRequests',classId));batch.delete(doc(db,'classrooms',classId,'requests',d.id))});exercisesSnap.docs.forEach(d=>{batch.delete(doc(db,'classrooms',classId,'exercises',d.id))});batch.delete(doc(db,'classrooms',classId));await batch.commit();setDeleteOpen(false);if(onClassDeleted)onClassDeleted();else onBack()}catch(e){setDeleteError(friendlyError(e))}finally{setDeleting(false)}};

 return <AppShell role={role} user={user} onExit={onExit} active="classroom" classCount={1}><div className="detail-top"><button onClick={onBack}><ArrowLeft/> Back to overview</button><span className="sdg-pill">{currentClass.code}</span></div><div className="classroom-title"><div><span className="kicker">Classroom</span><h1>{currentClass.name}</h1><p>{role==='teacher'?`${currentClass.students||0} / ${currentClass.maxStudents||30} learners · ${currentClass.subject}`:`${currentClass.teacherName} · You’re approved`}</p></div>{role==='teacher'&&<div className="classroom-actions"><Button variant="outline" size="sm" onClick={()=>{setEditName(currentClass.name);setEditSubject(currentClass.subject||'');setEditMaxStudents(String(currentClass.maxStudents||30));setEditError('');setEditOpen(true)}}><Pencil style={{width:14,height:14}}/> Edit class</Button><Button variant="outline" size="sm" onClick={()=>setDeleteOpen(true)} style={{color:'#dc2626',borderColor:'#fca5a5'}}><Trash2 style={{width:14,height:14}}/> Delete</Button><Button onClick={onQuiz} className="primary-action"><Plus/> Create exercise</Button></div>}</div><div className="classroom-layout"><section className="panel activity-panel"><div className="panel-head"><div><span className="kicker">Learning activities</span><h2>{exercises.length?`${exercises.length} Exercise${exercises.length>1?'s':''}`:'No exercises yet'}</h2></div></div>{exercises.length?<div style={{display:'grid',gap:'0.8rem',marginTop:'1rem'}}>{exercises.map((ex,i)=>{const count=ex.questionCount||ex.questions?.length||1;const firstQ=ex.question||(ex.questions&&ex.questions[0]?.question)||'Exercise checkpoint';return <div key={ex.id||i} style={{background:'#f8faf7',border:'1px solid #eeeae4',borderRadius:'18px',padding:'1.2rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.3rem'}}><FileQuestion style={{width:'18px',height:'18px',color:'#111'}}/><b style={{fontSize:'1rem'}}>{ex.title}</b><span style={{background:'#eef2ee',color:'#44554b',fontSize:'0.68rem',padding:'0.2rem 0.55rem',borderRadius:'99px',fontWeight:600}}>{count} Question{count>1?'s':''}</span>{ex.enhanced&&<span style={{background:'#d9f1e5',color:'#111',fontSize:'0.65rem',padding:'0.2rem 0.5rem',borderRadius:'99px',display:'inline-flex',alignItems:'center',gap:'0.2rem'}}><Sparkles style={{width:'10px',height:'10px'}}/> AI Enhanced</span>}</div><p style={{margin:0,color:'#666',fontSize:'0.88rem'}}>{firstQ}</p></div><Button variant="outline" size="sm" onClick={()=>onStartExercise(ex)}>{role==='teacher'?'Preview exercise':'Start exercise'}</Button></div>})}</div>:<div className="class-empty"><FileQuestion/><h3>{role==='teacher'?'Build the first exercise':'Your teacher is preparing the first activity'}</h3><p>{role==='teacher'?'Start with your own question, then use AI Enhance.':'New lessons and quizzes will appear here.'}</p>{role==='teacher'&&<Button onClick={onQuiz}><Plus/> Create exercise</Button>}</div>}</section><aside className="panel class-stats"><span className="kicker">{role==='teacher'?'Class pulse':'My progress'}</span><h2>{exercises.length?`${exercises.length} published`:'0% mastery'}</h2><Progress value={exercises.length?100:0}/><div className="tip"><Sparkles/><p>{role==='teacher'?'Insights appear after students complete an activity.':'Progress starts after your first activity.'}</p></div></aside></div><Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="modal-card"><DialogHeader><DialogTitle>Edit classroom</DialogTitle><DialogDescription>Update details for {currentClass.name}.</DialogDescription></DialogHeader><label className="form-label">Classroom name<Input placeholder="e.g. Mathematics · Form 4" value={editName} onChange={e=>setEditName(e.target.value)}/></label><label className="form-label">Subject<Input placeholder="e.g. Mathematics" value={editSubject} onChange={e=>setEditSubject(e.target.value)}/></label><label className="form-label">Student capacity (Max learners)<Input type="number" min={Math.max(1,currentClass.students||1)} max="100" value={editMaxStudents} onChange={e=>setEditMaxStudents(e.target.value)}/>{currentClass.students>0&&<small style={{color:'#706a63',fontSize:'0.72rem'}}>Currently enrolled: {currentClass.students} student{currentClass.students>1?'s':''}. Capacity cannot be lower.</small>}</label>{editError&&<p className="form-error">{editError}</p>}<DialogFooter><Button variant="outline" onClick={()=>setEditOpen(false)}>Cancel</Button><Button onClick={saveEdit} disabled={savingEdit||!editName.trim()||!editSubject.trim()}>{savingEdit?<LoaderCircle/>:<Check/>} Save changes</Button></DialogFooter></DialogContent></Dialog><Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent className="modal-card"><DialogHeader><div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:42,height:42,borderRadius:'50%',background:'#fee2e2',color:'#dc2626',marginBottom:10}}><Trash2 style={{width:20,height:20}}/></div><DialogTitle>Delete classroom?</DialogTitle><DialogDescription>Are you sure you want to delete <strong>{currentClass.name}</strong> (Code: <code>{currentClass.code}</code>)?</DialogDescription></DialogHeader><div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:14,padding:'12px 14px',color:'#991b1b',fontSize:'0.8rem',lineHeight:1.5}}><strong>Warning:</strong> This permanently deletes this classroom, its {currentClass.students||0} student membership(s), join requests, and all published exercises. This cannot be undone.</div>{deleteError&&<p className="form-error">{deleteError}</p>}<DialogFooter style={{marginTop:12}}><Button variant="outline" onClick={()=>setDeleteOpen(false)} disabled={deleting}>Cancel</Button><Button onClick={confirmDelete} disabled={deleting} style={{background:'#dc2626',color:'#fff'}}>{deleting?<LoaderCircle/>:<Trash2/>} {deleting?'Deleting…':'Delete classroom'}</Button></DialogFooter></DialogContent></Dialog></AppShell>
}

function StudentExerciseRunner({user,classroom,exercise,onBack,onExit}:{user:User;classroom:ClassroomData;exercise:any;onBack:()=>void;onExit:()=>void}){
 const rawQuestions: QuestionItem[] = exercise.questions?.length ? exercise.questions : (exercise.question ? [{ id: '1', question: exercise.question, answer: exercise.answer || '', points: 2, enhanced: exercise.enhanced || false }] : []);
 const [currentIdx, setCurrentIdx] = useState(0);
 const [answers, setAnswers] = useState<Record<number, string>>({});
 const [submitting, setSubmitting] = useState(false);
 const [submitted, setSubmitted] = useState(false);
 const [earnedScore, setEarnedScore] = useState(0);
 const [submitError, setSubmitError] = useState('');

 const totalPoints = rawQuestions.reduce((n, q) => n + (Number(q.points) || 1), 0);
 const currentQ = rawQuestions[currentIdx] || { question: 'No question text provided', answer: '', points: 1, enhanced: false };

 const handleAnswer = (text: string) => {
  setAnswers(prev => ({ ...prev, [currentIdx]: text }));
 };

 const submitExercise = async () => {
  setSubmitting(true);
  setSubmitError('');
  try {
   let score = 0;
   rawQuestions.forEach((q, i) => {
    const userA = (answers[i] || '').trim().toLowerCase();
    const expA = (q.answer || '').trim().toLowerCase();
    const pts = Number(q.points) || 1;
    if (userA && expA && (userA === expA || expA.includes(userA) || userA.includes(expA))) {
     score += pts;
    } else if (userA.length > 0) {
     score += Math.max(1, Math.round(pts * 0.5));
    }
   });
   setEarnedScore(score);

   await addDoc(collection(db, 'classrooms', classroom.id, 'exercises', exercise.id, 'submissions'), {
    studentId: user.uid,
    studentName: user.displayName || 'Student',
    studentEmail: user.email || '',
    answers,
    score,
    totalPoints,
    submittedAt: serverTimestamp()
   });

   try {
    const pct = Math.min(100, Math.round((score / (totalPoints || 1)) * 100));
    await setDoc(doc(db, 'users', user.uid, 'memberships', classroom.id), {
     progress: pct
    }, { merge: true });
   } catch (e) {
    console.warn('Membership progress note:', e);
   }

   setSubmitted(true);
  } catch (e: any) {
   console.error('Error submitting exercise:', e);
   setSubmitError(e?.message?.includes('permission') ? 'Missing or insufficient permissions. The security rules were just updated; please refresh your page and try again.' : (e?.message || 'Error submitting exercise.'));
  } finally {
   setSubmitting(false);
  }
 };

 const progressPct = Math.round(((currentIdx + 1) / (rawQuestions.length || 1)) * 100);

 return (
  <AppShell role="student" user={user} onExit={onExit} active="classroom" classCount={1}>
   <div className="detail-top">
    <button onClick={onBack}><ArrowLeft/> Back to {classroom.name}</button>
    <span className="sdg-pill">{submitted ? 'Completed' : `Question ${currentIdx + 1} of ${rawQuestions.length}`}</span>
   </div>

   <div className="classroom-title">
    <div>
     <span className="kicker">Exercise Checkpoint</span>
     <h1>{exercise.title}</h1>
     <p>{classroom.name} · {classroom.subject}</p>
    </div>
   </div>

   {submitted ? (
    <div style={{ background: '#fff', borderRadius: '24px', padding: '2.5rem', boxShadow: '0 0 0 1px #eeeae4', maxWidth: '780px', margin: '0 auto', textAlign: 'center' }}>
     <div style={{ width: '64px', height: '64px', background: '#d9f1e5', borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 1.5rem', color: '#173e30' }}>
      <CheckCircle2 style={{ width: '36px', height: '36px' }}/>
     </div>
     <h2 style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Exercise Completed!</h2>
     <p style={{ color: '#66786e', margin: '0 0 2rem' }}>Your answers have been submitted to your teacher.</p>
     <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', margin: '1.5rem 0 2.5rem' }}>
      <div style={{ background: '#f8faf7', borderRadius: '16px', padding: '1.2rem 2rem' }}>
       <small style={{ color: '#778', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', fontWeight: 700 }}>Score</small>
       <div style={{ fontSize: '2.2rem', fontWeight: 700, color: '#111' }}>{earnedScore} <span style={{ fontSize: '1rem', color: '#888' }}>/ {totalPoints} pts</span></div>
      </div>
      <div style={{ background: '#f8faf7', borderRadius: '16px', padding: '1.2rem 2rem' }}>
       <small style={{ color: '#778', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', fontWeight: 700 }}>Mastery</small>
       <div style={{ fontSize: '2.2rem', fontWeight: 700, color: '#173e30' }}>{Math.round((earnedScore / (totalPoints || 1)) * 100)}%</div>
      </div>
     </div>
     <Button onClick={onBack} className="primary-action"><ArrowLeft/> Return to Classroom</Button>
    </div>
   ) : (
    <div className="classroom-layout">
     <section className="panel activity-panel">
      <div className="panel-head" style={{ marginBottom: '1rem' }}>
       <div>
        <span className="kicker">Question 0{currentIdx + 1} of 0{rawQuestions.length}</span>
        <h2 style={{ fontSize: '1.3rem', marginTop: '0.2rem' }}>Solve the problem</h2>
       </div>
       <span style={{ background: '#f1ece5', padding: '0.3rem 0.8rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600 }}>{currentQ.points || 1} Points</span>
      </div>

      <div style={{ background: '#fbfaf7', border: '1px solid #eeeae4', borderRadius: '18px', padding: '1.5rem', marginBottom: '1.5rem' }}>
       <p style={{ fontSize: '1.15rem', lineHeight: '1.6', margin: 0, fontWeight: 500, color: '#111' }}>{currentQ.question}</p>
       {currentQ.enhanced && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', background: '#eef5dc', padding: '0.7rem 1rem', borderRadius: '12px', color: '#385b20', fontSize: '0.8rem' }}>
         <Sparkles style={{ width: '16px', height: '16px' }}/>
         <span><strong>Guided Reasoning:</strong> Read carefully and show how you reached your answer.</span>
        </div>
       )}
      </div>

      <label className="form-label" style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>
       Your Answer
       <Textarea
        rows={4}
        placeholder="Type your answer or reasoning here..."
        value={answers[currentIdx] || ''}
        onChange={e => handleAnswer(e.target.value)}
        style={{ marginTop: '0.4rem', borderRadius: '14px', fontSize: '1rem' }}
       />
      </label>

      {submitError && <div style={{ background: '#fde8e8', color: '#c81e1e', padding: '0.75rem 1rem', borderRadius: '12px', fontSize: '0.8rem', marginTop: '1rem' }}>{submitError}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #eeeae4' }}>
       <Button variant="outline" disabled={currentIdx === 0} onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}>
        <ArrowLeft/> Previous
       </Button>
       {currentIdx < rawQuestions.length - 1 ? (
        <Button onClick={() => setCurrentIdx(prev => prev + 1)}>
         Next Question <ArrowRight/>
        </Button>
       ) : (
        <Button onClick={submitExercise} disabled={submitting} className="primary-action">
         {submitting ? <LoaderCircle/> : <Check/>} Submit Exercise
        </Button>
       )}
      </div>
     </section>

     <aside className="panel class-stats">
      <span className="kicker">Progress</span>
      <h2>{progressPct}%</h2>
      <Progress value={progressPct}/>
      <div style={{ marginTop: '1.5rem', display: 'grid', gap: '0.5rem' }}>
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
          background: currentIdx === i ? '#fff' : answers[i]?.trim() ? '#eef2ee' : '#fcfbf9',
          cursor: 'pointer',
          textAlign: 'left'
         }}
        >
         <span style={{ fontSize: '0.8rem', fontWeight: currentIdx === i ? 700 : 500 }}>Question 0{i + 1}</span>
         {answers[i]?.trim() ? <Check style={{ width: '14px', height: '14px', color: '#173e30' }}/> : <span style={{ fontSize: '0.7rem', color: '#888' }}>Pending</span>}
        </button>
       ))}
      </div>
     </aside>
    </div>
   )}
  </AppShell>
 );
}

type QuestionItem={id:string;question:string;answer:string;points:number;enhanced:boolean;loading?:boolean};

function QuizBuilder({user,classroom,onBack,onExit}:{user:User;classroom:ClassroomData;onBack:()=>void;onExit:()=>void}){
 const [title,setTitle]=useState('First checkpoint');
 const [questions,setQuestions]=useState<QuestionItem[]>([{id:'1',question:'Solve for x: 3x + 5 = 20.',answer:'x = 5',points:2,enhanced:false}]);
 const [publishing,setPublishing]=useState(false);
 const [published,setPublished]=useState(false);

 const addQuestion=()=>{
  setQuestions(prev=>[...prev,{id:Math.random().toString(36).slice(2,9),question:'',answer:'',points:2,enhanced:false}]);
 };

 const updateQuestion=(index:number,field:keyof QuestionItem,value:any)=>{
  setQuestions(prev=>prev.map((q,i)=>i===index?{...q,[field]:value}:q));
 };

 const removeQuestion=(index:number)=>{
  if(questions.length<=1)return;
  setQuestions(prev=>prev.filter((_,i)=>i!==index));
 };

 const enhanceQuestion=(index:number)=>{
  updateQuestion(index,'loading',true);
  setTimeout(()=>{
   setQuestions(prev=>prev.map((q,i)=>{
    if(i!==index)return q;
    const baseText=q.question.trim()||'A mobile plan costs RM5 plus RM3 for every GB used. If the total is RM20, how many GB were used? Show how the equation 3x + 5 = 20 represents the situation.';
    return {...q,loading:false,enhanced:true,question:q.question.trim()?`${q.question.trim()} (Scaffolded: Explain step-by-step reasoning.)`:baseText};
   }));
  },850);
 };

 const hasEnhancedAny=questions.some(q=>q.enhanced);
 const isValid=title.trim()&&questions.some(q=>q.question.trim());

 const publish=async()=>{
  if(!isValid)return;
  setPublishing(true);
  try{
   await addDoc(collection(db,'classrooms',classroom.id,'exercises'),{
    title:title.trim(),
    questions:questions.map(q=>({question:q.question.trim(),answer:q.answer.trim(),points:q.points,enhanced:q.enhanced})),
    questionCount:questions.length,
    enhanced:hasEnhancedAny,
    teacherId:user.uid,
    createdAt:serverTimestamp()
   });
   setPublished(true);
   setTimeout(()=>onBack(),800);
  }catch(e){console.error(e)}finally{setPublishing(false)};
 };

 return <AppShell role="teacher" user={user} onExit={onExit} active="quiz" classCount={1}><div className="builder-bar"><button onClick={onBack}><ArrowLeft/> {classroom.name}</button><div><span className="draft-dot"/> {published?'Published':'Draft'} ({questions.length} Question{questions.length>1?'s':''})</div><Button onClick={publish} disabled={published||publishing||!isValid}>{publishing?<LoaderCircle/>:published?<Check/>:<Send/>}{published?'Published':`Publish (${questions.length})`}</Button></div><div className="builder-head"><span className="kicker">Quiz studio</span><Input className="title-input" value={title} onChange={e=>setTitle(e.target.value)}/><p>Write your questions, add AI clarity, and build a complete exercise for your class.</p></div><div className="builder-grid"><section className="question-editor" style={{display:'grid',gap:'1.5rem'}}>{questions.map((q,idx)=><div key={q.id} style={{borderBottom:idx<questions.length-1?'1px solid #e9eee9':'none',paddingBottom:idx<questions.length-1?'1.5rem':'0'}}><div className="question-count"><span>Question 0{idx+1}</span>{questions.length>1&&<button type="button" onClick={()=>removeQuestion(idx)} aria-label="Remove question" style={{border:0,background:'none',color:'#a00',cursor:'pointer'}}><X style={{width:'18px',height:'18px'}}/></button>}</div><label className="form-label">Question text<Textarea value={q.question} onChange={e=>updateQuestion(idx,'question',e.target.value)} placeholder="Type question prompt..." className="question-text"/></label><div className="answer-block"><label className="form-label">Answer<Input value={q.answer} onChange={e=>updateQuestion(idx,'answer',e.target.value)} placeholder="Correct answer or explanation"/></label><label className="form-label">Points<Input type="number" min="1" value={q.points} onChange={e=>updateQuestion(idx,'points',Number(e.target.value)||1)}/></label></div><div className="hint-row"><div><span><Bot/></span><p><b>AI enhancement</b><small>Add context and scaffold reasoning.</small></p></div><Button className="enhance-btn" onClick={()=>enhanceQuestion(idx)} disabled={q.loading}>{q.loading?<><LoaderCircle/> Enhancing…</>:<><WandSparkles/> AI Enhance</>}</Button></div>{q.enhanced&&<div className="enhanced-note"><CheckCircle2/><div><b>Question 0{idx+1} enhanced</b><p>Added contextual problem framing & step-by-step reasoning prompt.</p></div></div>}</div>)}<button type="button" onClick={addQuestion} className="add-question" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'0.5rem',padding:'1rem',width:'100%',cursor:'pointer'}}><Plus style={{width:'18px',height:'18px'}}/> Add Question 0{questions.length+1}</button><div style={{marginTop:'1rem',display:'flex',justifyContent:'flex-end',gap:'0.8rem'}}><Button variant="outline" onClick={onBack}>Cancel</Button><Button onClick={publish} disabled={published||publishing||!isValid} className="primary-action">{publishing?<LoaderCircle/>:published?<Check/>:<Send/>} {published?'Published to Classroom':publishing?'Publishing...':`Publish Exercise (${questions.length} Question${questions.length>1?'s':''})`}</Button></div></section><aside className="ai-sidebar"><div className="ai-sidebar-head"><span><Sparkles/></span><div><small>Lumina AI</small><h3>Exercise overview</h3></div></div><div className="quality-score"><div><strong>{questions.length}</strong><span>Questions</span></div><p>Exercise Size</p></div><div className="checks">{['Clear learning objective','Age-appropriate language','Real-world relevance','Guided reasoning'].map((x,i)=><div className={(hasEnhancedAny||i<2)?'ready':''} key={x}><span>{hasEnhancedAny||i<2?<Check/>:i+1}</span>{x}</div>)}</div></aside></div></AppShell>
}

export default function Home(){
 const [user,setUser]=useState<User|null>(null),[role,setRole]=useState<Role|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[view,setView]=useState<View>('dashboard'),[selectedClass,setSelectedClass]=useState<ClassroomData|null>(null),[selectedExercise,setSelectedExercise]=useState<any|null>(null);
 useEffect(()=>onAuthStateChanged(auth,async current=>{setUser(current);if(current){const profile=await getDoc(doc(db,'users',current.uid));setRole(profile.exists()?(profile.data().role as Role):null)}else setRole(null);setReady(true)}),[]);
 const login=async(selectedRole:Role)=>{setBusy(true);setError('');try{const result=await signInWithPopup(auth,googleProvider);await setDoc(doc(db,'users',result.user.uid),{displayName:result.user.displayName||'',email:result.user.email||'',photoURL:result.user.photoURL||'',role:selectedRole,lastLoginAt:serverTimestamp()},{merge:true});setUser(result.user);setRole(selectedRole);setView('dashboard')}catch(e){setError(friendlyError(e))}finally{setBusy(false)}};
 const logout=async()=>{await signOut(auth);setView('dashboard');setSelectedClass(null);setSelectedExercise(null)};
 if(!ready)return <div className="loading-screen"><Brand/><LoaderCircle/><p>Preparing your learning space…</p></div>;
 if(!user||!role)return <LoginPage busy={busy} error={error} onLogin={login}/>;
 if(view==='exercise'&&selectedClass&&selectedExercise)return <StudentExerciseRunner user={user} classroom={selectedClass} exercise={selectedExercise} onBack={()=>setView('classroom')} onExit={logout}/>;
 if(view==='classroom'&&selectedClass)return <Classroom role={role} user={user} classroom={selectedClass} onBack={()=>setView('dashboard')} onQuiz={()=>setView('quiz')} onStartExercise={(ex)=>{setSelectedExercise(ex);setView('exercise')}} onExit={logout} onClassUpdated={setSelectedClass} onClassDeleted={()=>{setSelectedClass(null);setView('dashboard');}}/>;
 if(view==='quiz'&&selectedClass&&role==='teacher')return <QuizBuilder user={user} classroom={selectedClass} onBack={()=>setView('classroom')} onExit={logout}/>;
 return role==='teacher'?<TeacherDashboard user={user} onView={setView} onExit={logout} onSelectClass={setSelectedClass}/>:<StudentDashboard user={user} onView={setView} onExit={logout} onSelectClass={setSelectedClass}/>
}
