import {
  pgEnum,
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  integer,
  bigint,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ────────────────────────────────────────────────────────────────────
export const caseStatusEnum = pgEnum("case_status", [
  "intake",
  "review",
  "in_progress",
  "waiting",
  "completed",
]);

export const casePriorityEnum = pgEnum("case_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "contract",
  "invoice",
  "report",
  "identity",
  "other",
]);

export const conversationTypeEnum = pgEnum("conversation_type", ["dm", "group"]);

// ── Tables ───────────────────────────────────────────────────────────────────
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),
  caseNumber: varchar("case_number", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 300 }).notNull(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  status: caseStatusEnum("status").notNull().default("intake"),
  priority: casePriorityEnum("priority").notNull().default("medium"),
  description: text("description"),
  tags: text("tags").array().notNull().default([] as any),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("pending"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 300 }).notNull(),
  fileUrl: varchar("file_url", { length: 1000 }).notNull(),
  type: documentTypeEnum("type").notNull().default("other"),
  size: bigint("size", { mode: "number" }).notNull().default(0),
  tags: text("tags").array().notNull().default([] as any),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }),
  type: conversationTypeEnum("type").notNull().default("dm"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversationMembers = pgTable("conversation_members", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  memberName: varchar("member_name", { length: 200 }).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderName: varchar("sender_name", { length: 200 }).notNull(),
  content: text("content").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messageCaseTags = pgTable(
  "message_case_tags",
  {
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.caseId] }),
  }),
);

// ── Relations ────────────────────────────────────────────────────────────────
export const customersRelations = relations(customers, ({ many }) => ({
  cases: many(cases),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  customer: one(customers, {
    fields: [cases.customerId],
    references: [customers.id],
  }),
  tasks: many(tasks),
  documents: many(documents),
  messageCaseTags: many(messageCaseTags),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  case: one(cases, { fields: [tasks.caseId], references: [cases.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  case: one(cases, { fields: [documents.caseId], references: [cases.id] }),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  members: many(conversationMembers),
  messages: many(messages),
}));

export const conversationMembersRelations = relations(conversationMembers, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMembers.conversationId],
    references: [conversations.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  caseTags: many(messageCaseTags),
}));

export const messageCaseTagsRelations = relations(messageCaseTags, ({ one }) => ({
  message: one(messages, {
    fields: [messageCaseTags.messageId],
    references: [messages.id],
  }),
  case: one(cases, {
    fields: [messageCaseTags.caseId],
    references: [cases.id],
  }),
}));

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
