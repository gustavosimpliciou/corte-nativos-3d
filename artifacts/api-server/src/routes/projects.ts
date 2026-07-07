import { Router, type IRouter } from "express";
import { eq, sql, count } from "drizzle-orm";
import { db, projectsTable, modelsTable, operationsTable } from "@workspace/db";
import {
  CreateProjectBody,
  GetProjectParams,
  GetProjectResponse,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
  ListProjectsResponse,
  CreateProjectResponse,
  UpdateProjectResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      description: projectsTable.description,
      thumbnail: projectsTable.thumbnail,
      createdAt: projectsTable.createdAt,
      updatedAt: projectsTable.updatedAt,
      modelCount: sql<number>`(select count(*) from models where models.project_id = ${projectsTable.id})::int`,
      operationCount: sql<number>`(select count(*) from operations where operations.project_id = ${projectsTable.id})::int`,
    })
    .from(projectsTable)
    .orderBy(projectsTable.updatedAt);

  res.json(ListProjectsResponse.parse(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .insert(projectsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(CreateProjectResponse.parse({
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    modelCount: 0,
    operationCount: 0,
  }));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const models = await db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.projectId, project.id));

  const operations = await db
    .select()
    .from(operationsTable)
    .where(eq(operationsTable.projectId, project.id))
    .orderBy(operationsTable.createdAt);

  res.json(GetProjectResponse.parse({
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    models: models.map(m => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
    operations: operations.map(o => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt ? o.completedAt.toISOString() : null,
    })),
  }));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .update(projectsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [{ modelCount }] = await db
    .select({ modelCount: count() })
    .from(modelsTable)
    .where(eq(modelsTable.projectId, project.id));

  const [{ operationCount }] = await db
    .select({ operationCount: count() })
    .from(operationsTable)
    .where(eq(operationsTable.projectId, project.id));

  res.json(UpdateProjectResponse.parse({
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    modelCount: modelCount ?? 0,
    operationCount: operationCount ?? 0,
  }));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
