import { Router, type Request, type Response } from 'express';
import { requireAuth, requireOrganization } from '../auth/index.js';
import { getDb, issues, users, organizations, issueTags, tags } from '@agent-in-sync/db-client';
import { eq, and, isNull, desc, sql, count } from 'drizzle-orm';
import { logger } from '../observability/index.js';

const router = Router();

router.get(
  '/stats',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Organization required' });
      return;
    }
    try {
      const db = getDb();
      const orgId = req.organizationId;

      const whereClause = and(
        eq(issues.organizationId, orgId),
        isNull(issues.deletedAt),
        eq(issues.status, 'approved')
      );

      const [[countRow], recentRows] = await Promise.all([
        db.select({ total: count() }).from(issues).where(whereClause),
        db
          .select({
            issueId: issues.id,
            title: issues.title,
            description: issues.description,
            createdAt: issues.createdAt,
            acceptedSolutionId: issues.acceptedSolutionId,
            project: issues.project,
            techStack: issues.techStack,
            errorType: issues.errorType,
            severity: issues.severity,
            complexity: issues.complexity,
            authorName: users.name,
            organizationName: organizations.name,
            tags: sql<
              string[]
            >`coalesce(array_agg(${tags.name}) filter (where ${tags.name} is not null), '{}')`,
          })
          .from(issues)
          .leftJoin(users, eq(users.id, issues.authorId))
          .leftJoin(organizations, eq(organizations.id, issues.organizationId))
          .leftJoin(issueTags, eq(issueTags.issueId, issues.id))
          .leftJoin(tags, eq(tags.id, issueTags.tagId))
          .where(whereClause)
          .groupBy(issues.id, users.name, organizations.name)
          .orderBy(desc(issues.createdAt))
          .limit(5),
      ]);

      const recentIssues = recentRows.map(row => ({
        solution_id: row.issueId,
        issue_id: row.issueId,
        title: row.title,
        summary: buildIssueSummary(row.description),
        votes: 0,
        timestamp: row.createdAt.toISOString(),
        tags: row.tags ?? [],
        author_name: row.authorName ?? null,
        author_agent_slug: null,
        author_agent_name: null,
        organization_name: row.organizationName ?? null,
        is_accepted: row.acceptedSolutionId != null,
        author_trust_level: 'standard',
        metadata: {
          project: row.project ?? null,
          techStack: row.techStack ?? null,
          errorType: row.errorType ?? null,
          severity: row.severity ?? null,
          complexity: row.complexity ?? null,
        },
      }));

      res.json({ totalIssues: countRow?.total ?? 0, recentIssues });
    } catch (err) {
      logger.logError('Dashboard stats fetch failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

function buildIssueSummary(description: string): string {
  const plainText = description
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plainText.length <= 200) return plainText;
  return plainText.slice(0, 200).trimEnd() + '...';
}

export const dashboardRouter: Router = router;
