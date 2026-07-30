import type {
  PrReviewDto,
  PrReviewerSummary,
  PrVersionDto,
  PullRequestDetail,
  PullRequestSummary,
} from "@unified/types";
import type { PrReview, PrReviewer, PrVersion, PullRequest } from "@prisma/client";

type PullRequestWithRelations = PullRequest & {
  reviewers: PrReviewer[];
  versions: PrVersion[];
  reviews: PrReview[];
};

export function toPullRequestSummary(pr: PullRequest): PullRequestSummary {
  return {
    id: pr.id,
    title: pr.title,
    description: pr.description,
    status: pr.status,
    authorId: pr.authorId,
    requiresApprovals: pr.requiresApprovals,
    currentVersion: pr.currentVersion,
    createdAt: pr.createdAt.toISOString(),
    updatedAt: pr.updatedAt.toISOString(),
  };
}

function toReviewerSummary(reviewer: PrReviewer): PrReviewerSummary {
  return { userId: reviewer.userId };
}

function toReviewDto(review: PrReview): PrReviewDto {
  return {
    id: review.id,
    reviewerId: review.reviewerId,
    versionId: review.versionId,
    decision: review.decision,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
  };
}

function toVersionDto(version: PrVersion): PrVersionDto {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    title: version.title,
    description: version.description,
    createdById: version.createdById,
    createdAt: version.createdAt.toISOString(),
  };
}

export function toPullRequestDetail(pr: PullRequestWithRelations): PullRequestDetail {
  return {
    ...toPullRequestSummary(pr),
    reviewers: pr.reviewers.map(toReviewerSummary),
    reviews: pr.reviews.map(toReviewDto),
    versions: pr.versions.map(toVersionDto),
  };
}
