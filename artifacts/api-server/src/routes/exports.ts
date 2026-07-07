import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, exportsTable } from "@workspace/db";
import {
  CreateExportBody,
  ListExportsQueryParams,
  ListExportsResponse,
  CreateExportResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/exports", async (req, res): Promise<void> => {
  const query = ListExportsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.operationId != null) {
    conditions.push(eq(exportsTable.operationId, query.data.operationId));
  }
  if (query.data.projectId != null) {
    conditions.push(eq(exportsTable.projectId, query.data.projectId));
  }

  const rows = await db
    .select()
    .from(exportsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(exportsTable.createdAt);

  res.json(ListExportsResponse.parse(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }))));
});

router.post("/exports", async (req, res): Promise<void> => {
  const parsed = CreateExportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [exp] = await db
    .insert(exportsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(CreateExportResponse.parse({
    ...exp,
    createdAt: exp.createdAt.toISOString(),
  }));
});

export default router;
