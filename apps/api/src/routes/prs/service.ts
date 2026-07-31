import type { PrDiffResponse, PrStatus as PrStatusType } from "@unified/types";
import { OrgRole, PR_MUTATOR_ROLES, PrReviewDecision, PrStatus } from "@unified/types";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { toPullRequestDetail, toPullRequestSummary } from "./mappers.js";

const PR_INCLUDE = {
  reviewers: true,
  versions: { orderBy: { versionNumber: "asc" as const } },
  reviews: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.PullRequestInclude;

const ALLOWED_TRANSITIONS: Record<PrStatusType, PrStatusType[]> = {
  [PrStatus.DRAFT]: [PrStatus.IN_REVIEW],
  [PrStatus.IN_REVIEW]: [PrStatus.REJECTED],
  [PrStatus.APPROVED]: [PrStatus.MERGED, PrStatus.REJECTED],
  [PrStatus.REJECTED]: [PrStatus.IN_REVIEW],
  [PrStatus.MERGED]: [],
};

export async function getOrgPrOrThrow(id: string, orgId: string) {
  const pr = await prisma.pullRequest.findFirst({
    where: { id, orgId },
    include: PR_INCLUDE,
  });
  if (!pr) {
    throw notFound("Pull request not found");
  }
  return pr;
}

async function validateReviewerIds(orgId: string, reviewerIds: string[]): Promise<void> {
  if (reviewerIds.length === 0) {
    return;
  }

  const memberships = await prisma.orgMembership.findMany({
    where: {
      orgId,
      userId: { in: reviewerIds },
      acceptedAt: { not: null },
      role: { in: [...PR_MUTATOR_ROLES] },
    },
    select: { userId: true },
  });

  const validIds = new Set(memberships.map((m) => m.userId));
  const invalid = reviewerIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw badRequest(
      "One or more reviewer IDs are not valid org reviewers (ORG_ADMIN or REVIEWER required)",
    );
  }
}

export async function listOrgPullRequests(orgId: string) {
  const prs = await prisma.pullRequest.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
  });
  return prs.map(toPullRequestSummary);
}

export async function createPullRequest(
  orgId: string,
  authorId: string,
  input: {
    title: string;
    description?: string;
    requiresApprovals?: number;
    reviewerIds?: string[];
  },
) {
  const description = input.description ?? "";
  const requiresApprovals = input.requiresApprovals ?? 1;
  const reviewerIds = input.reviewerIds ?? [];

  await validateReviewerIds(orgId, reviewerIds);

  const pr = await prisma.$transaction(async (tx) => {
    const created = await tx.pullRequest.create({
      data: {
        orgId,
        authorId,
        title: input.title,
        description,
        requiresApprovals,
        reviewers:
          reviewerIds.length > 0
            ? { create: reviewerIds.map((userId) => ({ userId })) }
            : undefined,
        versions: {
          create: {
            versionNumber: 1,
            title: input.title,
            description,
            createdById: authorId,
          },
        },
      },
      include: PR_INCLUDE,
    });
    return created;
  });

  return toPullRequestDetail(pr);
}

export async function updatePullRequest(
  id: string,
  orgId: string,
  userId: string,
  input: {
    title?: string;
    description?: string;
    requiresApprovals?: number;
    reviewerIds?: string[];
  },
) {
  const pr = await getOrgPrOrThrow(id, orgId);

  if (pr.status === PrStatus.MERGED) {
    throw badRequest("Merged pull requests cannot be modified");
  }

  if (input.reviewerIds) {
    await validateReviewerIds(orgId, input.reviewerIds);
  }

  const newTitle = input.title ?? pr.title;
  const newDescription = input.description ?? pr.description;
  const contentChanged = newTitle !== pr.title || newDescription !== pr.description;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.reviewerIds) {
      await tx.prReviewer.deleteMany({ where: { pullRequestId: id } });
      if (input.reviewerIds.length > 0) {
        await tx.prReviewer.createMany({
          data: input.reviewerIds.map((reviewerUserId) => ({
            pullRequestId: id,
            userId: reviewerUserId,
          })),
        });
      }
    }

    if (pr.status === PrStatus.DRAFT) {
      if (contentChanged) {
        await tx.prVersion.updateMany({
          where: { pullRequestId: id, versionNumber: 1 },
          data: { title: newTitle, description: newDescription },
        });
      }

      return tx.pullRequest.update({
        where: { id },
        data: {
          title: newTitle,
          description: newDescription,
          ...(input.requiresApprovals !== undefined
            ? { requiresApprovals: input.requiresApprovals }
            : {}),
        },
        include: PR_INCLUDE,
      });
    }

    if (contentChanged) {
      const next = pr.currentVersion + 1;
      await tx.prVersion.create({
        data: {
          pullRequestId: id,
          versionNumber: next,
          title: newTitle,
          description: newDescription,
          createdById: userId,
        },
      });

      return tx.pullRequest.update({
        where: { id },
        data: {
          title: newTitle,
          description: newDescription,
          currentVersion: next,
          status: pr.status === PrStatus.APPROVED ? PrStatus.IN_REVIEW : pr.status,
          ...(input.requiresApprovals !== undefined
            ? { requiresApprovals: input.requiresApprovals }
            : {}),
        },
        include: PR_INCLUDE,
      });
    }

    return tx.pullRequest.update({
      where: { id },
      data: {
        ...(input.requiresApprovals !== undefined
          ? { requiresApprovals: input.requiresApprovals }
          : {}),
      },
      include: PR_INCLUDE,
    });
  });

  return toPullRequestDetail(updated);
}

export async function transitionPullRequest(id: string, orgId: string, to: PrStatusType) {
  if (to === PrStatus.APPROVED) {
    throw badRequest("Invalid transition", "invalid_transition");
  }

  const pr = await getOrgPrOrThrow(id, orgId);
  const allowed = ALLOWED_TRANSITIONS[pr.status];

  if (!allowed.includes(to)) {
    throw badRequest("Invalid transition", "invalid_transition");
  }

  const updated = await prisma.pullRequest.update({
    where: { id },
    data: { status: to },
    include: PR_INCLUDE,
  });

  return toPullRequestDetail(updated);
}

export async function submitReview(
  id: string,
  orgId: string,
  userId: string,
  role: OrgRole | null,
  input: { decision: (typeof PrReviewDecision)[keyof typeof PrReviewDecision]; comment?: string },
) {
  const comment = input.comment ?? "";

  await prisma.$transaction(async (tx) => {
    const pr = await tx.pullRequest.findFirst({ where: { id, orgId } });
    if (!pr) {
      throw notFound("Pull request not found");
    }
    if (pr.status !== PrStatus.IN_REVIEW) {
      throw conflict("Reviews are only allowed while pull request is in review");
    }

    const assigned = await tx.prReviewer.findUnique({
      where: { pullRequestId_userId: { pullRequestId: id, userId } },
    });
    if (!assigned && role !== OrgRole.ORG_ADMIN) {
      throw forbidden("Only assigned reviewers can submit reviews");
    }

    const version = await tx.prVersion.findUniqueOrThrow({
      where: {
        pullRequestId_versionNumber: {
          pullRequestId: id,
          versionNumber: pr.currentVersion,
        },
      },
    });

    await tx.prReview.create({
      data: {
        pullRequestId: id,
        versionId: version.id,
        reviewerId: userId,
        decision: input.decision,
        comment,
      },
    });

    if (input.decision === PrReviewDecision.APPROVE) {
      const reviews = await tx.prReview.findMany({
        where: { pullRequestId: id, versionId: version.id },
        orderBy: { createdAt: "desc" },
      });
      const latest = new Map<string, string>();
      for (const r of reviews) {
        if (!latest.has(r.reviewerId)) {
          latest.set(r.reviewerId, r.decision);
        }
      }
      let approveCount = 0;
      for (const d of latest.values()) {
        if (d === PrReviewDecision.APPROVE) {
          approveCount++;
        }
      }

      if (approveCount >= pr.requiresApprovals) {
        await tx.pullRequest.update({
          where: { id },
          data: { status: PrStatus.APPROVED },
        });
      }
    }
  });

  return toPullRequestDetail(await getOrgPrOrThrow(id, orgId));
}

export async function listVersions(id: string, orgId: string) {
  await getOrgPrOrThrow(id, orgId);

  const versions = await prisma.prVersion.findMany({
    where: { pullRequestId: id },
    orderBy: { versionNumber: "asc" },
  });

  return versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    title: v.title,
    description: v.description,
    createdById: v.createdById,
    createdAt: v.createdAt.toISOString(),
  }));
}

export async function getVersionDiff(
  id: string,
  orgId: string,
  versionNumber: number,
): Promise<PrDiffResponse> {
  await getOrgPrOrThrow(id, orgId);

  const version = await prisma.prVersion.findUnique({
    where: {
      pullRequestId_versionNumber: { pullRequestId: id, versionNumber },
    },
  });
  if (!version) {
    throw notFound("Version not found");
  }

  if (versionNumber === 1) {
    return { fromVersion: 0, toVersion: 1, changes: [] };
  }

  const previous = await prisma.prVersion.findUnique({
    where: {
      pullRequestId_versionNumber: {
        pullRequestId: id,
        versionNumber: versionNumber - 1,
      },
    },
  });
  if (!previous) {
    throw notFound("Previous version not found");
  }

  const changes: PrDiffResponse["changes"] = [];
  if (version.title !== previous.title) {
    changes.push({
      field: "title",
      before: previous.title,
      after: version.title,
    });
  }
  if (version.description !== previous.description) {
    changes.push({
      field: "description",
      before: previous.description,
      after: version.description,
    });
  }

  return {
    fromVersion: previous.versionNumber,
    toVersion: version.versionNumber,
    changes,
  };
}

export async function listOrgMembers(orgId: string) {
  const memberships = await prisma.orgMembership.findMany({
    where: {
      orgId,
      acceptedAt: { not: null },
      role: { in: [...PR_MUTATOR_ROLES] },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
  }));
}
