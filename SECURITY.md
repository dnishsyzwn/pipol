# Lumina security model

## Scope

Lumina is a teacher/student quiz system. The public web surface is a static Firebase Hosting application. Privileged quiz generation, document processing, image generation, draft editing, publication, scoring, exports, and analytics run through Firebase Functions in `functions/`.

## Protected assets

- Vertex AI credentials and provider billing authority.
- Teacher-uploaded documents and generated quiz assets.
- Teacher identity, role, classroom ownership, and reviewer permissions.
- Private quiz drafts and unpublished questions.
- Published quiz integrity and student answers.
- Shared teacher quotas and generation job state.

## Trust boundaries

1. Browser to callable function: the browser is untrusted. Functions verify Firebase Auth and never trust client-provided role, score, quota, provider, model, endpoint, or secret.
2. Teacher to classroom: a teacher must own the classroom before creating material, generating content, editing drafts, viewing analytics, or publishing.
3. Uploaded document to AI prompt: document text is untrusted reference data and is delimited so embedded instructions cannot become system instructions.
4. AI provider to application: model output is untrusted. Zod validation, duplicate checks, answer checks, safety flags, and teacher review occur before publication.
5. Draft to published quiz: publication is an explicit teacher action and is rejected when questions are flagged or visuals are pending.
6. Student to scoring: the server calculates correctness from the published quiz; client-supplied scores are ignored.

## Security invariants

- Provider credentials are Firebase secrets and are never accepted from requests or sent to the browser.
- Vertex AI is the only active provider. The backend pins `gemini-2.5-flash-lite`, falls back only to `gemini-2.5-flash`, and uses `gemini-2.5-flash-image` for visuals.
- Direct client writes to privileged Firestore collections are denied by rules.
- Quota reservations are transactionally bounded per teacher and quota period.
- Failed generation jobs refund reserved quota.
- Teacher-uploaded material is private and stored under a user-specific path.
- AI-generated and uploaded visuals remain unpublished until the teacher accepts the draft.
- Published quiz data cannot be edited in place through the client.
- Sensitive educational topics may be factual and neutral, but sexualized, exploitative, pornographic, and graphic requests are rejected or require safe review.

## Residual deployment requirements

Before public production traffic:

- Configure Vertex AI secrets using Firebase Secret Manager.
- Register the web app with Firebase App Check and confirm the callable functions accept valid App Check tokens; the backend is configured to reject missing tokens.
- Enable Firebase Authentication providers and create server-managed user profiles.
- Confirm Cloud Functions billing, Vertex AI quotas, and budget alerts.
- Run Firestore and Storage rules tests in the Firebase Emulator Suite.
- Add abuse monitoring and alerting for repeated failed generation jobs.
- Do not enable `AI_DRY_RUN` in production.

The frontend dependency audit still reports five advisories in the Vinext/Vite/RSC build chain. The Firebase production target serves the static `dist/client` output, so these packages are build-time/runtime-tooling exposure rather than AI endpoint credentials. Do not use `npm audit fix --force` during the hackathon without testing the Sites/Vinext upgrade; schedule that upgrade before running the SSR/Cloudflare server target publicly.
