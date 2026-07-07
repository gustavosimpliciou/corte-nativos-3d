import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, operationsTable } from "@workspace/db";
import {
  CreateOperationBody,
  GetOperationParams,
  GetOperationResponse,
  UpdateOperationParams,
  UpdateOperationBody,
  DeleteOperationParams,
  ListOperationsQueryParams,
  ListOperationsResponse,
  CreateOperationResponse,
  UpdateOperationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/operations", async (req, res): Promise<void> => {
  const query = ListOperationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.modelId != null) {
    conditions.push(eq(operationsTable.modelId, query.data.modelId));
  }
  if (query.data.projectId != null) {
    conditions.push(eq(operationsTable.projectId, query.data.projectId));
  }

  const rows = await db
    .select()
    .from(operationsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(operationsTable.createdAt);

  res.json(ListOperationsResponse.parse(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }))));
});

router.post("/operations", async (req, res): Promise<void> => {
  const parsed = CreateOperationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [op] = await db
    .insert(operationsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(CreateOperationResponse.parse({
    ...op,
    createdAt: op.createdAt.toISOString(),
    completedAt: op.completedAt ? op.completedAt.toISOString() : null,
  }));
});

router.get("/operations/:id", async (req, res): Promise<void> => {
  const params = GetOperationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [op] = await db
    .select()
    .from(operationsTable)
    .where(eq(operationsTable.id, params.data.id));

  if (!op) {
    res.status(404).json({ error: "Operation not found" });
    return;
  }

  res.json(GetOperationResponse.parse({
    ...op,
    createdAt: op.createdAt.toISOString(),
    completedAt: op.completedAt ? op.completedAt.toISOString() : null,
  }));
});

router.patch("/operations/:id", async (req, res): Promise<void> => {
  const params = UpdateOperationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOperationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.completedAt) {
    updateData.completedAt = new Date(parsed.data.completedAt);
  }

  const [op] = await db
    .update(operationsTable)
    .set(updateData)
    .where(eq(operationsTable.id, params.data.id))
    .returning();

  if (!op) {
    res.status(404).json({ error: "Operation not found" });
    return;
  }

  res.json(UpdateOperationResponse.parse({
    ...op,
    createdAt: op.createdAt.toISOString(),
    completedAt: op.completedAt ? op.completedAt.toISOString() : null,
  }));
});

router.delete("/operations/:id", async (req, res): Promise<void> => {
  const params = DeleteOperationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [op] = await db
    .delete(operationsTable)
    .where(eq(operationsTable.id, params.data.id))
    .returning();

  if (!op) {
    res.status(404).json({ error: "Operation not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
