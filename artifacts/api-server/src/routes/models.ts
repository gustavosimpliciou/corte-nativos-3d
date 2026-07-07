import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, modelsTable, projectsTable } from "@workspace/db";
import {
  CreateModelBody,
  GetModelParams,
  GetModelResponse,
  DeleteModelParams,
  ListModelsQueryParams,
  ListModelsResponse,
  CreateModelResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/models", async (req, res): Promise<void> => {
  const query = ListModelsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.projectId != null) {
    conditions.push(eq(modelsTable.projectId, query.data.projectId));
  }

  const rows = await db
    .select()
    .from(modelsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(modelsTable.createdAt);

  res.json(ListModelsResponse.parse(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }))));
});

router.post("/models", async (req, res): Promise<void> => {
  const parsed = CreateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Update project updatedAt
  await db
    .update(projectsTable)
    .set({ updatedAt: new Date() })
    .where(eq(projectsTable.id, parsed.data.projectId));

  const [model] = await db
    .insert(modelsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(CreateModelResponse.parse({
    ...model,
    createdAt: model.createdAt.toISOString(),
  }));
});

router.get("/models/:id", async (req, res): Promise<void> => {
  const params = GetModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [model] = await db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.id, params.data.id));

  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  res.json(GetModelResponse.parse({
    ...model,
    createdAt: model.createdAt.toISOString(),
  }));
});

router.delete("/models/:id", async (req, res): Promise<void> => {
  const params = DeleteModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [model] = await db
    .delete(modelsTable)
    .where(eq(modelsTable.id, params.data.id))
    .returning();

  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
