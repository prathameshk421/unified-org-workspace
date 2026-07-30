import type { PrComment } from "@prisma/client";
import type { PrCommentResponse } from "@unified/types";
import { assertCommentsEnabled } from "../org-settings/service.js";
import { prisma } from "../../lib/prisma.js";

export function toPrCommentResponse(comment: PrComment): PrCommentResponse {
  return {
    id: comment.id,
    pullRequestId: comment.pullRequestId,
    orgId: comment.orgId,
    authorOrgId: comment.authorOrgId,
    authorId: comment.authorId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

export async function listPrComments(
  pullRequestId: string,
  orgId: string,
): Promise<PrCommentResponse[]> {
  const comments = await prisma.prComment.findMany({
    where: { pullRequestId, orgId },
    orderBy: { createdAt: "asc" },
  });

  return comments.map(toPrCommentResponse);
}

export async function createPrComment(input: {
  pullRequestId: string;
  orgId: string;
  authorId: string;
  authorOrgId: string;
  body: string;
}): Promise<PrCommentResponse> {
  // Child tenancy + feature flags use the resource owner org.
  await assertCommentsEnabled(input.orgId);

  const comment = await prisma.prComment.create({
    data: {
      pullRequestId: input.pullRequestId,
      orgId: input.orgId,
      authorId: input.authorId,
      authorOrgId: input.authorOrgId,
      body: input.body,
    },
  });

  return toPrCommentResponse(comment);
}
