# Known Limitations and Future Improvements

Product and workflow gaps in the current build — not deployment topology or intentional security design choices.

## Known limitations

### Identity & onboarding

**Login-only UI** — Dashboards expose login, not signup. The API supports `POST /auth/register`, but there is no self-service registration, password reset, or email verification in the apps. Demo users come from the database seed.

**No org member management UI** — Org admins can change settings and manage partner connections, but cannot invite users, change roles, or remove members from the UI.

### Review Console

**No GitHub integration** — Pull requests are created and updated manually in Review Console. There is no webhook sync with a real GitHub repository.

### Notifications & AI digests

**Batched digests, not realtime** — Progress digests run on a scheduled background job every 3 hours UTC by default (`DIGEST_INTERVAL_HOURS`; `digest:once` locally; Cloud Scheduler in production), not when a ticket or PR changes. The in-app notification bell updates after each run.

**LLM summarization is per-run, not per-event** — When `GROQ_API_KEY` is set, Groq is called once per user per digest run to summarize scoped facts. It is not invoked on every comment or status change, to keep latency, cost, and API rate limits manageable — especially on Groq's free tier. Without a key or if the call fails, a template summary is used instead.

**Email digests are opt-in** — In-app digests work when `DIGEST_ENABLED=true`. Email delivery requires `DIGEST_EMAIL_ENABLED` plus SMTP configuration.

### Support Hub

**Attachment limits** — 5 MB per file, 10 per ticket, and a fixed MIME allowlist (images, PDF, plain text, CSV).

---

## Future improvements

### AI copilot (in-app)

- **Workspace chatbot** — Context-aware assistant in Support Hub and Review Console: summarize a ticket thread, draft replies, explain audit entries, suggest PR review focus areas, and answer “what’s blocking me?” from scoped org + share data only (same BOLA rules as digests).
- **PR & ticket co-pilot** — Inline “help me write this” for descriptions, comments, and status updates; diff-aware PR summaries when GitHub is connected.

### Agentic automation

- **Auto-triage tickets** — Classify incoming issues, suggest priority/assignee, and propose status transitions from title + body + attachments.
- **Ticket creation agents** — Turn Slack/email/support-form signals into draft tickets for human approve-or-send (no silent cross-org writes).
- **PR workflow agents** — Nudge stale reviewers, draft review comments from diff context, open follow-up tickets when a merge unblocks support work.
- **Event-driven runs** — Move beyond interval-based digests: agents act on triggers (new comment, idle PR, overdue assignee) with explicit guardrails and audit trail.

### Platform & integrations

- **GitHub webhooks** — Mirror real PR status, commits, and checks into Review Console instead of manual records.
- **Realtime notifications** — Push/SSE alongside digests so the bell updates when something actually changes.
- **Org admin & onboarding** — Invites, role management, self-service signup, password reset.
- **Audit intelligence** — Search across metadata, trend views, anomaly signals for compliance teams.
