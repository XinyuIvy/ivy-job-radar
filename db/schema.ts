import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  region: text("region").notNull().default("美国"),
  location: text("location").notNull().default(""),
  track: text("track").notNull().default(""),
  jobUrl: text("job_url").notNull().default(""),
  applicationId: text("application_id").notNull().default(""),
  source: text("source").notNull().default("公司官网"),
  fit: integer("fit").notNull().default(3),
  interest: integer("interest").notNull().default(3),
  priority: text("priority").notNull().default("P2"),
  status: text("status").notNull().default("已收藏"),
  discoveredDate: text("discovered_date").notNull().default(""),
  appliedDate: text("applied_date").notNull().default(""),
  followUpDate: text("follow_up_date").notNull().default(""),
  nextAction: text("next_action").notNull().default("研究JD"),
  resumeVersion: text("resume_version").notNull().default(""),
  workAuthorization: text("work_authorization").notNull().default(""),
  interviewNotes: text("interview_notes").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobRequests = sqliteTable("job_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  jobUrl: text("job_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("待核验"),
  verificationNote: text("verification_note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  location: text("location").notNull().default(""),
  region: text("region").notNull(),
  track: text("track").notNull(),
  score: integer("score").notNull().default(0),
  visa: text("visa").notNull().default("需人工确认"),
  evidence: text("evidence").notNull().default(""),
  skills: text("skills").notNull().default("[]"),
  jobUrl: text("job_url").notNull().unique(),
  canonicalUrl: text("canonical_url").notNull().default(""),
  applicationId: text("application_id").notNull().default(""),
  source: text("source").notNull().default("公司官网"),
  status: text("status").notNull().default("开放"),
  discoveredAt: text("discovered_at").notNull(),
  checkedAt: text("checked_at").notNull(),
});

export const ignoredJobs = sqliteTable("ignored_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  jobUrl: text("job_url").notNull().default(""),
  fingerprint: text("fingerprint").notNull().unique(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
});
