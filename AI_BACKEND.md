# Lumina quiz AI backend

The web app remains a static Firebase Hosting build. AI work is isolated in `functions/` so the UI can be developed independently.

## Provider policy

Production routing is Vertex AI only:

- Primary text model: `gemini-2.5-flash-lite`
- Text fallback: `gemini-2.5-flash`
- Image model: `gemini-2.5-flash-image`

The backend does not accept a provider, model, endpoint, or API key from the client request. OpenRouter and XPLABS key slots are documented but inactive.

## Main callable contracts

### `registerMaterial`

Registers an allowed PDF, PPTX, ODP, DOCX, ODT, Markdown, TXT, or RTF file and returns a Storage path. The teacher uploads only to that path.

### `createQuizGenerationJob`

```ts
{
  classroomId: string;
  title?: string;
  prompt: string;
  materialIds: string[];
  questionCount: number; // 1-30, charged against the teacher's shared quota
  subject?: string;
  level: string;
  language: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionTypes: string[];
  learningObjectives: string[];
  imageMode: 'none' | 'upload' | 'generate';
}
```

Returns a queued job ID. A Firestore trigger processes the job and writes a `quizDrafts/{draftId}` document. The job never publishes automatically.

### `createManualQuizDraft`

Creates an empty private draft. Manual questions do not consume AI question quota.

### `updateQuizDraft`

Allows the owner or an explicitly added teacher reviewer to edit title, instructions, questions, and draft status. Published quizzes cannot be edited in place.

### `generateQuestionVisual`

Generates one Vertex AI classroom visual for a specific draft question. It consumes one image credit, stores the result in Firebase Storage, and marks the visual ready for teacher review.

### `publishQuizDraft`

Checks ownership, classroom ownership, question validity, flagged content, and pending visuals before copying the draft into `quizzes/{quizId}` with `published` status.

### `recordQuizAttempt`

Accepts student answers but calculates correctness on the server from the published quiz. The client cannot submit its own score.

### `getQuizInsights`

Teacher-only aggregate analytics for attempts, average score, and per-question incorrect counts.

### `exportQuiz`

Returns JSON, CSV, or Markdown for teacher-owned drafts and classroom-visible published quizzes.

### `saveQuestionToBank`

Stores an approved question for the teacher's reusable question bank.

### `transformQuizQuestion`

Supports teacher-requested simplify, translate, and alt-text transformations. Results are automatically marked for teacher review and consume one question credit.

## Security boundaries

- Authentication is required for every callable.
- Teacher-only operations require a server-checked teacher profile.
- Classroom ownership is checked in the Admin SDK before generation, editing, image creation, analytics, or publication.
- Firebase rules deny direct client writes to jobs, drafts, published quizzes, attempts, usage, question-bank records, and assets.
- Question attempts are scored on the server.
- Quotas are reserved transactionally before generation and refunded on failed jobs.
- Production Vertex authentication uses the Cloud Functions service identity and short-lived OAuth tokens; API-key slots are not injected into deployed functions.
- Uploaded material is stored in a user-specific path and is not public.
- Source material is delimited as untrusted data in the AI prompt; document instructions cannot override the system instruction.
- Generated visuals are blocked for obvious sexualized, exploitative, pornographic, and graphic requests and still require teacher review.
- Published quizzes cannot be silently modified; create a new draft for changes.

## Quota defaults

The default shared teacher quota is per month:

- 15 AI-generated questions
- 5 AI-generated images

Set `QUOTA_PERIOD=daily` only if the product team intentionally wants daily limits. Manual questions and teacher-uploaded images are not charged.
