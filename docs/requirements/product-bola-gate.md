# Requirements — Product BOLA Gate (Branch 11)

Core Product Security Gate. Policy overview: [bola-tests.md](./bola-tests.md). Cross-org AC#10 attachments carve-out: [cross-org-collaboration.md](./cross-org-collaboration.md).

## Run

```bash
# Postgres migrated; uses same env as integration tests
pnpm test:bola
# alias
pnpm test:product-security
```

CI (`api-integration`): `pnpm test:bola` then full `test:integration`.

Allowlist: `apps/api/vitest.bola.config.ts` (domain suites + `product-bola/**` — vanity product-bola-only allowlist is forbidden).

Newman is complementary smoke only — not required to merge this gate.

## Path-locked PR versions / diff

Handlers remounted on `prShareCapableRead` and call `resolvePrAccess` then `ownerOrgId` (`resolved.pr.orgId`).

| Cell | Required path |
|------|---------------|
| `pr.versions.share.holder` | `GET /prs/:id/versions` only |
| `pr.diff.share.holder` | `GET /prs/:id/versions/:n/diff` only |
| `pr.versions.share.sibling` | `GET /prs/:siblingId/versions` → 404 |
| `pr.versions.foreign.admin` | `GET /prs/:id/versions` → 404 |
| `pr.diff.foreign.admin` | `GET /prs/:id/versions/:n/diff` → 404 |

Proving share view via `GET /prs/:id` body.versions is **forbidden**.

## Attachments carve-out (AC#10)

- Owner `commentsEnabled=false` → shared comments blocked
- Owner `attachmentsEnabled=false` → shared **uploads** blocked (**404** via strict owner-org pre-multer); list/meta/download still allowed when access resolves (**200**)

## Registry

- Source: `apps/api/tests/support/product-bola-matrix.ts`
- `EXPECTED_CELL_COUNT = 72` (literal; must match array length)
- Anti-cheat: `apps/api/tests/integration/product-bola/matrix-completeness.test.ts`

## Full cell table (`EXPECTED_CELL_COUNT = 72`)

| id | Method | Path | Actor | Status | Post | Suite |
|----|--------|------|-------|--------|------|-------|
| `ticket.get.foreign.admin` | GET | `/tickets/:id` | foreign_org_admin | **404** | none | `product-bola/mutation-postconditions.test.ts` |
| `ticket.patch.foreign.admin` | PATCH | `/tickets/:id` | foreign_org_admin | **404** | ownerDb_unchanged | `product-bola/mutation-postconditions.test.ts` |
| `ticket.status.foreign.admin` | PATCH | `/tickets/:id/status` | foreign_org_admin | **404** | ownerDb_unchanged | `product-bola/mutation-postconditions.test.ts` |
| `ticket.delete.foreign.admin` | DELETE | `/tickets/:id` | foreign_org_admin | **404** | row_absent_forbidden | `product-bola/mutation-postconditions.test.ts` |
| `ticket.create.bodyOrgId.ignored` | POST | `/tickets` | multi_org | **201** | none | `product-bola/mutation-postconditions.test.ts` |
| `ticket.patch.assigneeId.foreignUser` | PATCH | `/tickets/:id` | owner_mutator | **400** | ownerDb_unchanged | `product-bola/assignee-mass-assignment.test.ts` |
| `ticket.mutate.foreign.admin.noAudit` | PATCH | `/tickets/:id` | foreign_org_admin | **404** | no_success_audit | `product-bola/mutation-postconditions.test.ts` |
| `ticket.comment.list.foreign.parent` | GET | `/tickets/:ticketId/comments` | foreign_org_admin | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.comment.create.foreign.parent` | POST | `/tickets/:ticketId/comments` | foreign_org_admin | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.comment.patch.child.crossOrg` | PATCH | `/tickets/:ticketId/comments/:commentId` | foreign_org_admin | **404** | ownerDb_unchanged | `product-bola/nested-id-confusion.test.ts` |
| `ticket.comment.delete.child.crossOrg` | DELETE | `/tickets/:ticketId/comments/:commentId` | foreign_org_admin | **404** | row_absent_forbidden | `product-bola/nested-id-confusion.test.ts` |
| `ticket.comment.patch.sameOrg.siblingParent` | PATCH | `/tickets/:ticketId/comments/:commentId` | same_org_admin | **404** | ownerDb_unchanged | `product-bola/nested-id-confusion.test.ts` |
| `ticket.comment.delete.sameOrg.siblingParent` | DELETE | `/tickets/:ticketId/comments/:commentId` | same_org_admin | **404** | row_absent_forbidden | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.list.foreign` | GET | `/tickets/:ticketId/attachments` | foreign_org_admin | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.upload.foreign` | POST | `/tickets/:ticketId/attachments` | foreign_org_admin | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.meta.foreign` | GET | `/tickets/:ticketId/attachments/:attachmentId` | foreign_org_admin | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.download.foreign` | GET | `/tickets/:ticketId/attachments/:attachmentId/download` | foreign_org_admin | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.delete.foreign` | DELETE | `/tickets/:ticketId/attachments/:attachmentId` | foreign_org_admin | **404** | row_absent_forbidden | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.meta.sameOrg.siblingParent` | GET | `/tickets/:ticketId/attachments/:attachmentId` | same_org_admin | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.download.sameOrg.siblingParent` | GET | `/tickets/:ticketId/attachments/:attachmentId/download` | same_org_admin | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.delete.sameOrg.siblingParent` | DELETE | `/tickets/:ticketId/attachments/:attachmentId` | same_org_admin | **404** | row_absent_forbidden | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.meta.share.sibling` | GET | `/tickets/:ticketId/attachments/:attachmentId` | share_holder | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.download.share.sibling` | GET | `/tickets/:ticketId/attachments/:attachmentId/download` | share_holder | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.flag.sharedDownloadAllowed` | GET | `/tickets/:ticketId/attachments/:attachmentId/download` | share_holder | **200** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.flag.sharedUploadBlocked` | POST | `/tickets/:ticketId/attachments` | share_holder | **404** | none | `product-bola/nested-id-confusion.test.ts` |
| `ticket.attach.afterMembershipDrop` | GET | `/tickets/:ticketId/attachments` | share_holder_after_drop | **404** | none | `product-bola/membership-drop-nested.test.ts` |
| `pr.get.foreign.admin` | GET | `/prs/:id` | foreign_org_admin | **404** | none | `product-bola/pr-nested-bola.test.ts` |
| `pr.patch.foreign.admin` | PATCH | `/prs/:id` | foreign_org_admin | **404** | ownerDb_unchanged | `product-bola/pr-nested-bola.test.ts` |
| `pr.review.foreign.admin` | POST | `/prs/:id/reviews` | foreign_org_admin | **404** | ownerDb_unchanged | `product-bola/pr-nested-bola.test.ts` |
| `pr.transition.foreign.admin` | POST | `/prs/:id/transition` | foreign_org_admin | **404** | ownerDb_unchanged | `product-bola/pr-nested-bola.test.ts` |
| `pr.versions.foreign.admin` | GET | `/prs/:id/versions` | foreign_org_admin | **404** | none | `product-bola/pr-nested-bola.test.ts` |
| `pr.diff.foreign.admin` | GET | `/prs/:id/versions/:n/diff` | foreign_org_admin | **404** | none | `product-bola/pr-nested-bola.test.ts` |
| `pr.versions.share.holder` | GET | `/prs/:id/versions` | share_holder | **200** | none | `product-bola/pr-nested-bola.test.ts` |
| `pr.diff.share.holder` | GET | `/prs/:id/versions/:n/diff` | share_holder | **200** | none | `product-bola/pr-nested-bola.test.ts` |
| `pr.versions.share.sibling` | GET | `/prs/:siblingId/versions` | share_holder | **404** | none | `product-bola/pr-nested-bola.test.ts` |
| `pr.mutator.eve.transition` | POST | `/prs/:id/transition` | share_holder_support_agent | **403** | ownerDb_unchanged | `product-bola/pr-nested-bola.test.ts` |
| `pr.mutator.eve.review` | POST | `/prs/:id/reviews` | share_holder_support_agent | **403** | ownerDb_unchanged | `product-bola/pr-nested-bola.test.ts` |
| `pr.mutator.eve.patch` | PATCH | `/prs/:id` | share_holder_support_agent | **403** | ownerDb_unchanged | `product-bola/pr-nested-bola.test.ts` |
| `pr.delete.absent` | DELETE | `/prs/:id` | org_admin | **404** | row_absent_forbidden | `product-bola/http-method-absence.test.ts` |
| `pr.create.bodyOrgId.ignored` | POST | `/prs` | org_admin | **201** | none | `product-bola/pr-share-bola-matrix.test.ts` |
| `pr.list.eve.noOwnerOrgWiden` | GET | `/prs` | share_holder_support_agent | **403** | none | `product-bola/pr-share-bola-matrix.test.ts` |
| `pr.comment.list.foreign.noShare` | GET | `/prs/:id/comments` | foreign_org_admin | **404** | none | `product-bola/pr-share-bola-matrix.test.ts` |
| `pr.comment.create.foreign.noShare` | POST | `/prs/:id/comments` | foreign_org_admin | **404** | none | `product-bola/pr-share-bola-matrix.test.ts` |
| `pr.comment.share.sibling` | GET | `/prs/:siblingId/comments` | share_holder | **404** | none | `product-bola/pr-share-bola-matrix.test.ts` |
| `pr.comment.afterMembershipDrop` | GET | `/prs/:id/comments` | share_holder_after_drop | **404** | none | `product-bola/membership-drop-nested.test.ts` |
| `share.create.foreign.ticket` | POST | `/tickets/:ticketId/shares` | foreign_org_admin | **404** | none | `product-bola/share-revoke-access.test.ts` |
| `share.create.foreign.pr` | POST | `/prs/:prId/shares` | foreign_org_admin | **404** | none | `product-bola/share-revoke-access.test.ts` |
| `share.delete.outsider` | DELETE | `/shares/:shareId` | unrelated_user | **404** | ownerDb_unchanged | `product-bola/share-revoke-access.test.ts` |
| `share.delete.grantee.self` | DELETE | `/shares/:shareId` | grantee_self | **200** | none | `product-bola/share-revoke-access.test.ts` |
| `share.delete.granteeAdmin` | DELETE | `/shares/:shareId` | grantee_org_admin | **200** | none | `product-bola/share-revoke-access.test.ts` |
| `share.revoke.then.get` | GET | `/tickets/:id` | share_holder_after_revoke | **404** | none | `product-bola/share-revoke-access.test.ts` |
| `share.inbound.afterRevoke` | GET | `/shares/inbound` | share_holder_after_revoke | **200** | none | `product-bola/share-revoke-access.test.ts` |
| `share.sharedInbox.afterRevoke` | GET | `/shared/tickets` | share_holder_after_revoke | **200** | none | `product-bola/share-revoke-access.test.ts` |
| `connection.revoke.then.get` | GET | `/tickets/:id` | share_holder_after_connection_revoke | **404** | none | `product-bola/share-revoke-access.test.ts` |
| `connection.revoked.grantStillActive` | GET | `/tickets/:id` | share_holder | **404** | ownerDb_unchanged | `product-bola/share-revoke-access.test.ts` |
| `platform.forceRevoke.then.get` | GET | `/tickets/:id` | share_holder_after_force_revoke | **404** | none | `product-bola/share-revoke-access.test.ts` |
| `connection.recipients.foreignConnectionId` | GET | `/connections/:id/recipients` | foreign_org_admin | **404** | none | `product-bola/share-revoke-access.test.ts` |
| `share.pr.revoke.reshare` | POST | `/prs/:prId/shares` | owner_admin | **201** | none | `product-bola/pr-share-bola-matrix.test.ts` |
| `share.pr.sameOrg.400` | POST | `/prs/:prId/shares` | owner_admin | **400** | none | `product-bola/pr-share-bola-matrix.test.ts` |
| `share.pr.membershipDrop` | GET | `/prs/:id` | share_holder_after_drop | **404** | none | `product-bola/membership-drop-nested.test.ts` |
| `audit.list.scoped` | GET | `/audit` | org_admin | **200** | none | `product-bola/http-method-absence.test.ts` |
| `audit.orgIdFilter.forbidden` | GET | `/audit` | org_admin | **403** | none | `product-bola/http-method-absence.test.ts` |
| `audit.export.scoped` | GET | `/audit/export` | org_admin | **200** | none | `product-bola/http-method-absence.test.ts` |
| `audit.http.put.absent` | PUT | `/audit` | org_admin | **404** | none | `product-bola/http-method-absence.test.ts` |
| `audit.http.patch.absent` | PATCH | `/audit/:id` | org_admin | **404** | ownerDb_unchanged | `product-bola/http-method-absence.test.ts` |
| `audit.http.delete.absent` | DELETE | `/audit/:id` | org_admin | **404** | ownerDb_unchanged | `product-bola/http-method-absence.test.ts` |
| `settings.patch.sessionOnly` | PATCH | `/org/settings` | org_admin | **200** | ownerDb_unchanged | `product-bola/http-method-absence.test.ts` |
| `settings.http.delete.absent` | DELETE | `/org/settings` | org_admin | **404** | ownerDb_unchanged | `product-bola/http-method-absence.test.ts` |
| `auth.switchOrg.foreign` | POST | `/auth/switch-org` | org_admin | **403** | none | `product-bola/http-method-absence.test.ts` |
| `auth.queryOrgId.ignored` | GET | `/rbac/org` | org_admin | **200** | none | `product-bola/http-method-absence.test.ts` |
| `auth.bearerForged.cookieSessionWins` | GET | `/rbac/org` | org_admin | **200** | none | `product-bola/http-method-absence.test.ts` |
| `platformAdmin.noActiveOrg.ticketGet` | GET | `/tickets/:id` | platform_admin_no_membership | **403** | none | `product-bola/http-method-absence.test.ts` |

## Completion checklist

- [x] `PRODUCT_BOLA_CELLS.length === EXPECTED_CELL_COUNT` (literal 72)
- [x] Completeness meta-tests (title↔file, soft-assert ban, helper imports)
- [x] Zero soft `403|404` under `tests/integration/`
- [x] Path-locked versions/diff share 200 + foreign 404
- [x] `ownerDb_*` / `no_success_audit` cells use helpers
- [x] `pnpm test:bola` wired in CI with full allowlist
- [x] AC#10 docs match attachments carve-out
- [x] No frontend diffs
- [x] Newman not required for merge
