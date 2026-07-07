import {
  pgTable,
  serial,
  integer,
  text,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const modelsTable = pgTable("models", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  format: text("format").notNull(),
  faceCount: integer("face_count").notNull().default(0),
  vertexCount: integer("vertex_count").notNull().default(0),
  fileSizeBytes: integer("file_size_bytes"),
  volumeMm3: real("volume_mm3"),
  boundingBoxMm: text("bounding_box_mm"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertModelSchema = createInsertSchema(modelsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertModel = z.infer<typeof insertModelSchema>;
export type Model = typeof modelsTable.$inferSelect;
