# Lumina AI provider secrets

All provider secrets are server-side Firebase secrets. Never put them in the frontend, `.env.local` used by the web app, Git URLs, Firestore, or quiz documents.

## Active production routing

Lumina currently uses Vertex AI only:

| Purpose | Vertex model |
| --- | --- |
| Primary quiz text | `gemini-2.5-flash-lite` |
| Text fallback | `gemini-2.5-flash` |
| Supporting visuals | `gemini-2.5-flash-image` |

Required deployment configuration:

```text
VERTEX_AI_PROJECT=hackathon-mmu-2026
VERTEX_AI_LOCATION=global
```

Cloud Functions uses its Google service identity and short-lived OAuth tokens for production Vertex calls. Grant the deployed runtime service account the Vertex AI User role. `VERTEX_AI_API_KEY` remains an optional local/testing slot, but it is not injected into production deployments.

Set secrets with the Firebase CLI after authenticating:

```text
firebase functions:secrets:set VERTEX_AI_API_KEY
```

Only configure one Vertex credential method for a deployment. Do not paste the value into this file.

## Reserved, inactive provider slots

These slots are documented for future experimentation but are not called by the current production router:

```text
OPENROUTER_API_KEY
XPLABS_AI_API_KEY
XPLABS_AI_BASE_URL
XPLABS_AI_MODEL
```

The backend pins text and image routing to Vertex AI. Adding one of these secrets does not activate that provider.

## Local development

Copy `.env.example` to a local-only environment file if needed. `functions/.env*` is ignored by Git. Use `AI_DRY_RUN=true` to exercise the job and validation path without contacting a provider; dry-run output is deliberately marked as requiring teacher review and must not be used as production content.

## Operational rules

- Rotate a key immediately if it is exposed.
- Do not log request prompts, uploaded document text, provider responses, or secret values.
- Keep provider models and endpoints in backend configuration, never in request payloads.
- Register the web app with Firebase App Check before enabling public production traffic; callable functions reject missing App Check tokens.
- Set provider-side quotas and billing alerts in Google Cloud.
