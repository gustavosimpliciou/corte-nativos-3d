import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { operationsTable } from "./operations";
import { projectsTable } from "./projects";

export const exportsTable = pgTable("exports", {
  id: serial("id").primaryKey(),
  operationId: integer("operation_id")
    .notNull()
    .references(() => operationsTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  format: text("format").notNull(),
  filename: text("filename").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExportSchema = createInsertSchema(exportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertExport = z.infer<typeof insertExportSchema>;
export type Export = typeof exportsTable.$inferSelect;
