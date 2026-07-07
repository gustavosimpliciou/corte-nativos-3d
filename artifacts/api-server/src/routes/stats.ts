import { Router, type IRouter } from "express";
import { sql, desc, count, sum } from "drizzle-orm";
import { db, projectsTable, modelsTable, operationsTable, exportsTable } from "@workspace/db";
import {
  GetDashboardStatsResponse,
  GetRecentActivityResponse,
  GetRecentActivityQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats/dashboard", async (_req, res): Promise<void> => {
  const [
    totalProjectsRows,
    totalModelsRows,
    totalOperationsRows,
    totalExportsRows,
  ] = await Promise.all([
    db.select({ val: count() }).from(projectsTable),
    db.select({ val: count() }).from(modelsTable),
    db.select({ val: count() }).from(operationsTable),
    db.select({ val: count() }).from(exportsTable),
  ]);

  const [facesCutRow] = await db
    .select({ val: sql<number>`coalesce(sum(${operationsTable.faceCount}), 0)::int` })
    .from(operationsTable)
    .where(sql`${operationsTable.type} = 'cut' AND ${operationsTable.status} = 'completed'`);

  const [recentRow] = await db
    .select({ val: count() })
    .from(projectsTable)
    .where(sql`${projectsTable.createdAt} > now() - interval '7 days'`);

  const statusRows = await db
    .select({
      status: operationsTable.status,
      cnt: count(),
    })
    .from(operationsTable)
    .groupBy(operationsTable.status);

  const formatRows = await db
    .select({
      format: exportsTable.format,
      cnt: count(),
    })
    .from(exportsTable)
    .groupBy(exportsTable.format);

  const operationsByStatus: Record<string, number> = {};
  for (const row of statusRows) {
    operationsByStatus[row.status] = Number(row.cnt);
  }

  const exportsByFormat: Record<string, number> = {};
  for (const row of formatRows) {
    exportsByFormat[row.format] = Number(row.cnt);
  }

  res.json(GetDashboardStatsResponse.parse({
    totalProjects: Number(totalProjectsRows[0]?.val ?? 0),
    totalModels: Number(totalModelsRows[0]?.val ?? 0),
    totalOperations: Number(totalOperationsRows[0]?.val ?? 0),
    totalExports: Number(totalExportsRows[0]?.val ?? 0),
    totalFacesCut: facesCutRow?.val ?? 0,
    recentProjectCount: Number(recentRow?.val ?? 0),
    operationsByStatus,
    exportsByFormat,
  }));
});

router.get("/stats/recent-activity", async (req, res): Promise<void> => {
  const query = GetRecentActivityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const limit = query.data.limit ?? 10;

  const [projectActivity, modelActivity, cutActivity, exportActivity] = await Promise.all([
    db
      .select({
        id: sql<string>`'project_' || ${projectsTable.id}::text`,
        type: sql<string>`'project_created'`,
        description: sql<string>`'Project "' || ${projectsTable.name} || '" created'`,
        projectId: projectsTable.id,
        projectName: projectsTable.name,
        createdAt: projectsTable.createdAt,
      })
      .from(projectsTable)
      .orderBy(desc(projectsTable.createdAt))
      .limit(limit),

    db
      .select({
        id: sql<string>`'model_' || ${modelsTable.id}::text`,
        type: sql<string>`'model_imported'`,
        description: sql<string>`'Model "' || ${modelsTable.filename} || '" imported'`,
        projectId: modelsTable.projectId,
        projectName: sql<string>`(SELECT name FROM projects WHERE id = ${modelsTable.projectId})`,
        createdAt: modelsTable.createdAt,
      })
      .from(modelsTable)
      .orderBy(desc(modelsTable.createdAt))
      .limit(limit),

    db
      .select({
        id: sql<string>`'op_' || ${operationsTable.id}::text`,
        type: sql<string>`'cut_completed'`,
        description: sql<string>`'Cut operation completed (' || coalesce(${operationsTable.faceCount}::text, '?') || ' faces)'`,
        projectId: operationsTable.projectId,
        projectName: sql<string>`(SELECT name FROM projects WHERE id = ${operationsTable.projectId})`,
        createdAt: operationsTable.createdAt,
      })
      .from(operationsTable)
      .where(sql`${operationsTable.type} = 'cut' AND ${operationsTable.status} = 'completed'`)
      .orderBy(desc(operationsTable.createdAt))
      .limit(limit),

    db
      .select({
        id: sql<string>`'export_' || ${exportsTable.id}::text`,
        type: sql<string>`'export_completed'`,
        description: sql<string>`'Exported "' || ${exportsTable.filename} || '" as ' || ${exportsTable.format}`,
        projectId: exportsTable.projectId,
        projectName: sql<string>`(SELECT name FROM projects WHERE id = ${exportsTable.projectId})`,
        createdAt: exportsTable.createdAt,
      })
      .from(exportsTable)
      .orderBy(desc(exportsTable.createdAt))
      .limit(limit),
  ]);

  const all = [
    ...projectActivity,
    ...modelActivity,
    ...cutActivity,
    ...exportActivity,
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  res.json(GetRecentActivityResponse.parse(
    all.map(a => ({
      ...a,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    }))
  ));
});

export default router;
