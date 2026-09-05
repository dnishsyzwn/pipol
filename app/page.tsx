'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, Bot, Check, CheckCircle2, ChevronRight, Clock3, FileQuestion, GraduationCap, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Search, Send, Sparkles, Users, WandSparkles, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Role = 'teacher' | 'student';
type View = 'dashboard' | 'classroom' | 'quiz';

const teacherClasses = [
  { name: 'Mathematics · Form 4', code: 'MATH-4K2', students: 32, color: 'lime', progress: 68 },
  { name: 'Computer Science', code: 'CS-26MMU', students: 24, color: 'blue', progress: 81 },
  { name: 'Science · Form 3', code: 'SCI-3A7', students: 29, color: 'violet', progress: 54 },
];

function Brand() {
  return <div className="brand-lockup"><span className="brand-mark"><span>4</span></span><div><strong>Lumina</strong><small>learning hub</small></div></div>;
}

function RoleGate({ onSelect }: { onSelect: (role: Role) => void }) {
  return <main className="gate-page">
    <nav className="gate-nav"><Brand /><span className="sdg-pill">SDG 4 · Quality Education</span></nav>
    <section className="gate-copy"><div className="eyebrow"><Sparkles /> Learn better, together</div><h1>One classroom.<br/><span>Every learner seen.</span></h1><p>Adaptive learning support that helps teachers teach smarter and gives every student a fair path forward.</p></section>
    <section className="role-panel"><div className="role-panel-head"><span>Welcome back</span><h2>How are you joining today?</h2></div>
      <button className="role-card teacher-role" onClick={() => onSelect('teacher')}><span className="role-icon"><GraduationCap /></span><span><b>I’m a teacher</b><small>Create classrooms, guide learners & build smarter quizzes</small></span><ArrowRight /></button>
      <button className="role-card student-role" onClick={() => onSelect('student')}><span className="role-icon"><BookOpen /></span><span><b>I’m a student</b><small>Join a classroom, learn at your pace & track progress</small></span><ArrowRight /></button>
      <p className="demo-note"><Zap /> Interactive hackathon prototype · no password needed</p>
    </section><div className="orb orb-one"/><div className="orb orb-two"/>
  </main>;
}

function AppShell({ role, onExit, children, active = 'dashboard' }: { role: Role; onExit: () => void; children: React.ReactNode; active?: View }) {
  return <div className="app-shell"><aside className="sidebar"><Brand /><nav>
    <a className={active === 'dashboard' ? 'active' : ''}><LayoutDashboard/> Overview</a><a className={active === 'classroom' ? 'active' : ''}><BookOpen/> Classrooms <span>3</span></a>{role === 'teacher' && <a className={active === 'quiz' ? 'active' : ''}><FileQuestion/> Quiz studio</a>}<a><BarChart3/> Progress</a>
  </nav><div className="sidebar-foot"><div className="mini-profile"><span>{role === 'teacher' ? 'AA' : 'NH'}</span><div><b>{role === 'teacher' ? 'Cikgu Aina' : 'Nur Huda'}</b><small>{role}</small></div></div><button onClick={onExit} aria-label="Log out"><LogOut/></button></div></aside><div className="mobile-bar"><Brand/><Menu/></div><section className="main-stage">{children}</section></div>;
}

function Topbar({ role, onSwitch }: { role: Role; onSwitch: (r: Role) => void }) {
  return <header className="topbar"><div><span className="today">Friday, 5 September</span><h1>{role === 'teacher' ? 'Good morning, Cikgu Aina.' : 'Ready to learn, Huda?'}</h1></div><div className="top-actions"><label><Search/><input placeholder="Search"/></label><div className="view-switch"><button className={role==='teacher'?'active':''} onClick={()=>onSwitch('teacher')}>Teacher</button><button className={role==='student'?'active':''} onClick={()=>onSwitch('student')}>Student</button></div></div></header>;
}

function TeacherDashboard({ onSwitch, onView, onExit }: { onSwitch: (r: Role)=>void; onView: (v: View)=>void; onExit:()=>void }) {
  const [requests, setRequests] = useState([{ initials: 'IM', name: 'Izz Mikail', className: 'Mathematics · Form 4', time: '8 min ago' },{ initials: 'SY', name: 'Sarah Yasmin', className: 'Computer Science', time: '21 min ago' }]);
  const [classes,setClasses]=useState(teacherClasses); const [createOpen,setCreateOpen]=useState(false); const [newName,setNewName]=useState('Bahasa Melayu · Form 4'); const [newSubject,setNewSubject]=useState('Bahasa Melayu');
  const approve=(n:string)=>setRequests(requests.filter(r=>r.name!==n));
  const createClass=()=>{const code=`${newSubject.slice(0,4).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;setClasses([...classes,{name:newName,code,students:0,color:'lime',progress:0}]);setCreateOpen(false)};
  return <AppShell role="teacher" onExit={onExit}><Topbar role="teacher" onSwitch={onSwitch}/>
    <div className="hero-strip"><div><span className="hero-kicker">This week</span><h2>Your students are on a roll.</h2><p>78% completed their learning goals — up 12% from last week.</p></div><div className="hero-score"><strong>78</strong><span>%</span><small>class momentum</small></div><div className="spark-chart">{[1,2,3,4,5,6,7].map(i=><i key={i}/>)}</div></div>
    <div className="section-head"><div><span className="kicker">Your spaces</span><h2>Classrooms</h2></div><Button onClick={()=>setCreateOpen(true)} className="primary-action"><Plus/> Create classroom</Button></div>
    <div className="class-grid">{classes.map((c,i)=><button key={c.code} className={`class-card ${c.color}`} onClick={()=>onView('classroom')}><div className="class-top"><span>0{i+1}</span><MoreHorizontal/></div><div><small>{c.code}</small><h3>{c.name}</h3></div><div className="class-bottom"><span><Users/> {c.students} learners</span><span>{c.progress}%</span></div><Progress value={c.progress}/></button>)}</div>
    <div className="dashboard-lower"><section className="panel requests"><div className="panel-head"><div><span className="kicker">Needs your attention</span><h2>Join requests <b>{requests.length}</b></h2></div><button>View all</button></div>{requests.length ? requests.map(r=><div className="request-row" key={r.name}><span className="avatar">{r.initials}</span><div><b>{r.name}</b><small>{r.className} · {r.time}</small></div><button className="decline" onClick={()=>approve(r.name)}><X/></button><button className="approve" onClick={()=>approve(r.name)}><Check/> Approve</button></div>) : <div className="empty-success"><CheckCircle2/> All caught up — no pending requests.</div>}</section>
      <section className="panel next-up"><div className="panel-head"><div><span className="kicker">Quick action</span><h2>Build with AI</h2></div><WandSparkles/></div><div className="ai-card"><span className="ai-glyph"><Bot/></span><h3>Turn one question into a richer lesson.</h3><p>Improve clarity, add hints and create differentiated practice in seconds.</p><Button onClick={()=>onView('quiz')}>Open quiz studio <ArrowRight/></Button></div></section></div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="modal-card"><DialogHeader><DialogTitle>Create a classroom</DialogTitle><DialogDescription>Give your new learning space a clear name.</DialogDescription></DialogHeader><label className="form-label">Classroom name<Input value={newName} onChange={e=>setNewName(e.target.value)}/></label><label className="form-label">Subject<Input value={newSubject} onChange={e=>setNewSubject(e.target.value)}/></label><DialogFooter><Button variant="outline" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button onClick={createClass} disabled={!newName.trim()}><Plus/> Create classroom</Button></DialogFooter></DialogContent></Dialog>
  </AppShell>;
}

function StudentDashboard({ onSwitch, onView, onExit }: { onSwitch: (r: Role)=>void; onView: (v: View)=>void; onExit:()=>void }) {
  const [joinOpen,setJoinOpen]=useState(false); const [pending,setPending]=useState(true); const [joinCode,setJoinCode]=useState(''); const [pendingCode,setPendingCode]=useState('SCI-3A7');
  const classes=[{name:'Mathematics · Form 4',teacher:'Cikgu Aina',tasks:2,progress:72,color:'lime'},{name:'Computer Science',teacher:'Mr. Daniel',tasks:1,progress:86,color:'blue'}];
  return <AppShell role="student" onExit={onExit}><Topbar role="student" onSwitch={onSwitch}/>
    <div className="student-hero"><div><span className="eyebrow"><Sparkles/> Today’s focus</span><h2>Small steps make<br/>big progress.</h2><p>Complete your Algebra checkpoint to keep your 6-day learning streak alive.</p><Button onClick={()=>onView('classroom')}>Continue learning <ArrowRight/></Button></div><div className="streak-ring"><strong>6</strong><span>day<br/>streak</span></div></div>
    {pending && <div className="pending-banner"><span><Clock3/></span><div><b>Join request pending</b><p>Your teacher is reviewing classroom code <strong>{pendingCode}</strong>.</p></div><button onClick={()=>setPending(false)}><X/></button></div>}
    <div className="section-head"><div><span className="kicker">Keep growing</span><h2>My classrooms</h2></div><Button onClick={()=>setJoinOpen(true)} className="primary-action"><Plus/> Join classroom</Button></div>
    <div className="student-grid">{classes.map((c,i)=><button className={`student-class ${c.color}`} key={c.name} onClick={()=>onView('classroom')}><div className="subject-number">0{i+1}</div><div className="student-class-info"><small>{c.teacher}</small><h3>{c.name}</h3><div className="task-line"><span>{c.tasks} task{c.tasks>1?'s':''} due</span><span>{c.progress}% mastered</span></div><Progress value={c.progress}/></div><ChevronRight/></button>)}</div>
    <div className="student-lower"><section className="panel"><div className="panel-head"><div><span className="kicker">Next checkpoint</span><h2>Linear equations</h2></div><span className="due-pill">Due today</span></div><div className="checkpoint"><div className="checkpoint-icon"><FileQuestion/></div><div><b>Algebra mastery quiz</b><small>8 questions · about 12 minutes</small></div><Button onClick={()=>onView('classroom')}>Start</Button></div></section><section className="insight-card"><span><Sparkles/></span><div><small>Personal insight</small><h3>You’re strongest at visual problems.</h3><p>We’ll show more diagrams in your next practice set.</p></div></section></div>
    <Dialog open={joinOpen} onOpenChange={setJoinOpen}><DialogContent className="modal-card"><DialogHeader><DialogTitle>Join a classroom</DialogTitle><DialogDescription>Enter the 8-character code shared by your teacher.</DialogDescription></DialogHeader><label className="form-label">Classroom code<Input className="code-input" placeholder="e.g. MATH-4K2" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())}/></label><div className="approval-note"><Clock3/> Your teacher must approve the request before you can enter.</div><DialogFooter><Button variant="outline" onClick={()=>setJoinOpen(false)}>Cancel</Button><Button disabled={!joinCode.trim()} onClick={()=>{setPendingCode(joinCode);setPending(true);setJoinOpen(false);setJoinCode('')}}><Send/> Request to join</Button></DialogFooter></DialogContent></Dialog>
  </AppShell>;
}

function Classroom({ role, onBack, onQuiz, onExit }: { role: Role; onBack:()=>void; onQuiz:()=>void; onExit:()=>void }) {
  return <AppShell role={role} onExit={onExit} active="classroom"><div className="detail-top"><button onClick={onBack}><ArrowLeft/> Back to overview</button><span className="sdg-pill">MATH-4K2</span></div><div className="classroom-title"><div><span className="kicker">Classroom</span><h1>Mathematics · Form 4</h1><p>{role==='teacher'?'32 learners · 3 active exercises':'Cikgu Aina · 2 tasks due this week'}</p></div>{role==='teacher'&&<Button onClick={onQuiz}><Plus/> Create exercise</Button>}</div><div className="classroom-layout"><section className="panel activity-panel"><div className="panel-head"><div><span className="kicker">Learning path</span><h2>Algebra foundations</h2></div><span className="unit-chip">Unit 04</span></div>{['Variables & expressions','Solving linear equations','Graphing relationships'].map((x,i)=><div className="lesson-row" key={x}><span className={i===0?'done':i===1?'current':''}>{i===0?<Check/>:i+1}</span><div><b>{x}</b><small>{i===0?'Completed':i===1?'Current lesson · 68% class mastery':'Unlocks next'}</small></div>{i===1&&<Button onClick={role==='teacher'?onQuiz:undefined}>{role==='teacher'?'Edit quiz':'Continue'}</Button>}</div>)}</section><aside className="panel class-stats"><span className="kicker">Class pulse</span><h2>{role==='teacher'?'68% mastery':'72% mastery'}</h2><Progress value={role==='teacher'?68:72}/><div className="stat-pair"><div><strong>{role==='teacher'?'26':'4'}</strong><small>{role==='teacher'?'on track':'lessons done'}</small></div><div><strong>{role==='teacher'?'6':'120'}</strong><small>{role==='teacher'?'need support':'XP earned'}</small></div></div><div className="tip"><Sparkles/><p>{role==='teacher'?'Most learners hesitate when variables appear on both sides. Try a scaffolded example.':'You learn faster after reviewing worked examples.'}</p></div></aside></div></AppShell>;
}

function QuizBuilder({ onBack, onExit }: { onBack:()=>void; onExit:()=>void }) {
  const [question,setQuestion]=useState('Solve for x: 3x + 5 = 20.'); const [enhanced,setEnhanced]=useState(false); const [loading,setLoading]=useState(false);
  const enhance=()=>{setLoading(true);setTimeout(()=>{setLoading(false);setEnhanced(true);setQuestion('A mobile plan costs RM5 plus RM3 for every GB used. If the total is RM20, how many GB were used? Show how the equation 3x + 5 = 20 represents the situation.');},850)};
  return <AppShell role="teacher" onExit={onExit} active="quiz"><div className="builder-bar"><button onClick={onBack}><ArrowLeft/> Mathematics · Form 4</button><div><span className="draft-dot"/> Draft saved</div><Button>Publish exercise</Button></div><div className="builder-head"><span className="kicker">Quiz studio</span><h1>Linear equations checkpoint</h1><p>Build clear, inclusive questions — then let AI add context and support.</p></div><div className="builder-grid"><section className="question-editor"><div className="question-count"><span>Question 01</span><button><MoreHorizontal/></button></div><label className="form-label">Question<Textarea value={question} onChange={e=>setQuestion(e.target.value)} className="question-text"/></label><div className="answer-block"><label className="form-label">Answer<Input defaultValue="x = 5"/></label><label className="form-label">Points<Input type="number" defaultValue="2"/></label></div><div className="hint-row"><div><span><Bot/></span><p><b>AI enhancement</b><small>Improve clarity, add real-world context and scaffold the difficulty.</small></p></div><Button className="enhance-btn" onClick={enhance} disabled={loading}>{loading?<><span className="spinner"/> Enhancing…</>:<><WandSparkles/> AI Enhance</>}</Button></div>{enhanced&&<div className="enhanced-note"><CheckCircle2/><div><b>Question enhanced</b><p>Added a Malaysian real-world scenario, a reasoning prompt and clearer learning intent.</p></div></div>}<button className="add-question"><Plus/> Add another question</button></section><aside className="ai-sidebar"><div className="ai-sidebar-head"><span><Sparkles/></span><div><small>Lumina AI</small><h3>Enhancement preview</h3></div></div><div className="quality-score"><div><strong>{enhanced?'92':'64'}</strong><span>/100</span></div><p>Question quality</p></div><div className="checks">{['Clear learning objective','Age-appropriate language','Real-world relevance','Guided reasoning'].map((x,i)=><div className={(enhanced||i<2)?'ready':''} key={x}><span>{enhanced||i<2?<Check/>:i+1}</span>{x}</div>)}</div><div className="ai-tip"><Bot/><p><b>Why it’s better</b><br/>{enhanced?'The scenario connects algebra to a familiar decision and asks students to explain, not just calculate.':'Enhance this question to add context and move beyond simple recall.'}</p></div></aside></div></AppShell>;
}

export default function Home() {
  const [role,setRole]=useState<Role|null>(null); const [view,setView]=useState<View>('dashboard'); const choose=(r:Role)=>{setRole(r);setView('dashboard')}; const exit=()=>setRole(null);
  useEffect(()=>{
    const lifecycle=new AbortController();
    const context=(document as unknown as {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    void Promise.resolve(context.registerTool({
      name:'open_learning_dashboard',title:'Open learning dashboard',description:'Open the Lumina dashboard for a teacher or student and reset to its overview.',
      inputSchema:{type:'object',properties:{role:{type:'string',enum:['teacher','student']}},required:['role'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input:unknown){const value=(input as {role?:unknown})?.role;if(value!=='teacher'&&value!=='student')throw new Error('role must be teacher or student');setRole(value);setView('dashboard');return{role:value,view:'dashboard'};}
    },{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[]);
  if(!role) return <RoleGate onSelect={choose}/>;
  if(view==='classroom') return <Classroom role={role} onBack={()=>setView('dashboard')} onQuiz={()=>setView('quiz')} onExit={exit}/>;
  if(view==='quiz') return <QuizBuilder onBack={()=>setView('classroom')} onExit={exit}/>;
  return role==='teacher'?<TeacherDashboard onSwitch={choose} onView={setView} onExit={exit}/>:<StudentDashboard onSwitch={choose} onView={setView} onExit={exit}/>;
}
