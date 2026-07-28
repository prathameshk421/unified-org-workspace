# Requirements — Tiered Build Plan

This doc breaks the assignment into three tiers. **Each tier assumes the previous tier is fully built and tested before work starts on it.** Tier 1 is the foundation every other feature depends on (auth, org scoping, audit, RBAC) — nothing in Tier 2 can be correctly implemented or tested without it.

---

## Tier 1 — Foundation (non-negotiable)

These are called out explicitly in the brief as required and tested. No Tier 2 work begins until these pass.

### Features
- Email + password authentication
- Central Identity/Org service as single source of truth for users & orgs (both dashboards read from it, neither owns the data)
- Session sync mechanism across both dashboards under one parent domain
- Org switcher for users belonging to multiple organizations
- Logout-everywhere (both dashboards)
- Query-layer org scoping (BOLA prevention) — `orgId` always derived from verified session/JWT, never from client-supplied params
- Append-only audit log, enforced at the **database permission level** (not just application logic)
- RBAC: Org Admin, Support Agent, Reviewer/Approver, Cross-Org Guest, Platform Super Admin

### Required automated tests
- **BOLA / isolation test:** authenticated request from Org A attempting to access an Org B resource by ID (direct API call with manipulated ID) → must return 403/404
- **Session sync test:** login on one dashboard is recognized as authenticated on the other
- **Token lifecycle / revocation test:** logout-everywhere invalidates tokens issued before the logout across both dashboards
- **Audit append-only test:** an `UPDATE` or `DELETE` attempt against the audit log table fails at the DB permission level, not just application logic

---

## Tier 2 — Core Product (requires Tier 1 complete)

### Support Hub
- Ticket CRUD, comments, attachments, status management
- Per-tenant feature flags
- Ticket sharing with users from another org (shared users see only the shared ticket, nothing else from the sharing org)
- Reviewer/Approver role access to Support Hub tickets

### Review & Audit Console
- PR entity: title, description, status (draft → in-review → approved/rejected → merged), linked org, author, reviewers
- Approval workflow: multiple reviewers, configurable "requires N approvals," request-changes action
- Versioning: edits after review starts create a new version with a diff view against the previous version
- Unified audit viewer: searchable/filterable by org, user, date range, action type; exportable as CSV
- Reviewer/Approver access to both the PR workflow and the unified audit viewer

### Cross-Org Collaboration
- Org-to-org connections: request, approve, revoke (either side)
- Item-level sharing only (one ticket/PR at a time — never full workspace access)
- External users: view + comment only, no editing/deleting/access to unshared content

### AI Progress Tracker
- Personalized digest scoped to the user (their assigned/overdue items, pending reviews)
- Delivered via a **background job** on a configurable schedule — not computed on page load
- In-app notification bell (minimum channel)
- Digest scope limited to the user's own org plus anything explicitly shared with them

### GitHub Webhook Integration *(promoted to required)*
- Webhook endpoint with signature verification
- Maps GitHub PR events to internal PR status (opened → draft/in-review, synchronize → new version, closed+merged → merged)

### Email / Push Delivery *(promoted to required)*
- Second notification channel alongside in-app bell, using the same digest/notification pipeline

### Required automated tests
- Ticket/PR CRUD tests scoped per org (isolation extended to cover the cross-org share path)
- Cross-org share test: external/shared user can access only the shared item, confirmed to be blocked from all other org data
- **AI leak test:** digest generation for a user must never include data from an org they don't belong to or that wasn't explicitly shared with them
- Approval workflow test: PR only transitions to "approved" once the configured N-approval threshold is met
- Webhook signature verification test (rejects unsigned/invalid payloads)

---

## Tier 3 — Deferred (only if Tier 1 + 2 are fully done with time to spare)

- Advanced audit analytics / anomaly detection
- Custom org onboarding flows or admin console

No dedicated tests planned for these unless they're actually built — treat as stretch scope, not committed deliverables.
