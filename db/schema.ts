import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  status: text("status").notNull().default("准备材料"),
  deadline: text("deadline").notNull().default(""),
  deadlineType: text("deadline_type").notNull().default("unknown"),
  deadlineSource: text("deadline_source").notNull().default("unknown"),
  plannedApplicationDate: text("planned_application_date").notNull().default(""),
  discoveredDate: text("discovered_date").notNull().default(""),
  appliedDate: text("applied_date").notNull().default(""),
  followUpDate: text("follow_up_date").notNull().default(""),
  nextAction: text("next_action").notNull().default("准备申请材料"),
  resumeVersion: text("resume_version").notNull().default(""),
  workAuthorization: text("work_authorization").notNull().default(""),
  interviewNotes: text("interview_notes").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const applicationStatusEvents = sqliteTable("application_status_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").notNull(),
  status: text("status").notNull(),
  occurredAt: text("occurred_at").notNull(),
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
  description: text("description").notNull().default(""),
  skills: text("skills").notNull().default("[]"),
  jobUrl: text("job_url").notNull().unique(),
  canonicalUrl: text("canonical_url").notNull().default(""),
  applicationId: text("application_id").notNull().default(""),
  source: text("source").notNull().default("公司官网"),
  status: text("status").notNull().default("开放"),
  deadline: text("deadline").notNull().default(""),
  deadlineType: text("deadline_type").notNull().default("unknown"),
  lastSeenAt: text("last_seen_at").notNull().default(""),
  missedScanCount: integer("missed_scan_count").notNull().default(0),
  expirationReason: text("expiration_reason").notNull().default(""),
  discoveredAt: text("discovered_at").notNull(),
  checkedAt: text("checked_at").notNull(),
});

export const applicationTasks = sqliteTable("application_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").notNull(),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull().default(""),
  reminderDate: text("reminder_date").notNull().default(""),
  status: text("status").notNull().default("pending"),
  source: text("source").notNull().default("manual"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const interviews = sqliteTable("interviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").notNull(),
  round: text("round").notNull().default("一面"),
  scheduledAt: text("scheduled_at").notNull().default(""),
  format: text("format").notNull().default("Video"),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  notes: text("notes").notNull().default(""),
  outcome: text("outcome").notNull().default("待进行"),
  thankYouStatus: text("thank_you_status").notNull().default("未发送"),
  thankYouDueAt: text("thank_you_due_at").notNull().default(""),
  followUpAt: text("follow_up_at").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const companyResearch = sqliteTable("company_research", {
  company: text("company").primaryKey(),
  website: text("website").notNull().default(""),
  careersUrl: text("careers_url").notNull().default(""),
  businessSummary: text("business_summary").notNull().default(""),
  recentNotes: text("recent_notes").notNull().default(""),
  personalNotes: text("personal_notes").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
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

export const savedJobs = sqliteTable("saved_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const cvPrebuildJobs = sqliteTable("cv_prebuild_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  applicationRowId: integer("application_row_id"),
  prebuildId: text("prebuild_id").notNull().default(""),
  generationKey: text("generation_key"),
  status: text("status").notNull().default("queued"),
  language: text("language").notNull().default(""),
  track: text("track").notNull().default(""),
  templateFile: text("template_file").notNull().default(""),
  jdSha256: text("jd_sha256").notNull().default(""),
  factMasterSha: text("fact_master_sha").notNull().default(""),
  promptVersion: text("prompt_version").notNull().default(""),
  agentTriggerRunId: text("agent_trigger_run_id").notNull().default(""),
  conversationUrl: text("conversation_url").notNull().default(""),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at").notNull().default(""),
}, (table) => [
  index("cv_prebuild_jobs_job_id_updated_at_idx").on(table.jobId, table.updatedAt),
  index("cv_prebuild_jobs_status_updated_at_idx").on(table.status, table.updatedAt),
  uniqueIndex("cv_prebuild_jobs_generation_key_unique").on(table.generationKey),
  uniqueIndex("cv_prebuild_jobs_pending_job_unique")
    .on(table.jobId)
    .where(sql`${table.generationKey} IS NULL`),
]);

export const dataQualityChecks = sqliteTable("data_quality_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().unique(),
  status: text("status").notNull().default("queued"),
  issueKeys: text("issue_keys").notNull().default("[]"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error").notNull().default(""),
  lastAttemptAt: text("last_attempt_at").notNull().default(""),
  nextRetryAt: text("next_retry_at").notNull().default(""),
  resolvedAt: text("resolved_at").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const dataQualityRuns = sqliteTable("data_quality_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
  processed: integer("processed").notNull().default(0),
  merged: integer("merged").notNull().default(0),
  resolved: integer("resolved").notNull().default(0),
  retrying: integer("retrying").notNull().default(0),
  needsReview: integer("needs_review").notNull().default(0),
  failureReasons: text("failure_reasons").notNull().default("[]"),
});

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  company: text("company").notNull().default(""),
  role: text("role").notNull().default(""),
  contactType: text("contact_type").notNull().default("Recruiter"),
  email: text("email").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  applicationId: integer("application_id"),
  status: text("status").notNull().default("未联系"),
  lastContactAt: text("last_contact_at").notNull().default(""),
  nextFollowUpAt: text("next_follow_up_at").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const interviewPrep = sqliteTable("interview_prep", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  interviewId: integer("interview_id").notNull().unique(),
  checklist: text("checklist").notNull().default("[]"),
  practiceNotes: text("practice_notes").notNull().default(""),
  questionsToAsk: text("questions_to_ask").notNull().default(""),
  sourceIds: text("source_ids").notNull().default("[]"),
  readiness: integer("readiness").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const scanStatus = sqliteTable("scan_status", {
  id: integer("id").primaryKey(),
  state: text("state").notNull().default("idle"),
  atsScanned: integer("ats_scanned").notNull().default(0),
  atsMatched: integer("ats_matched").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  totalJobs: integer("total_jobs").notNull().default(0),
  startedAt: text("started_at").notNull().default(""),
  completedAt: text("completed_at").notNull().default(""),
  message: text("message").notNull().default(""),
  phase: text("phase").notNull().default(""),
  currentSource: text("current_source").notNull().default(""),
  stepsCompleted: integer("steps_completed").notNull().default(0),
  stepsTotal: integer("steps_total").notNull().default(0),
  scanned: integer("scanned").notNull().default(0),
  uniqueJobs: integer("unique_jobs").notNull().default(0),
  filtered: integer("filtered").notNull().default(0),
  verified: integer("verified").notNull().default(0),
  eligible: integer("eligible").notNull().default(0),
  progressUpdatedAt: text("progress_updated_at").notNull().default(""),
});

export const chinaScanStatus = sqliteTable("china_scan_status", {
  id: integer("id").primaryKey(),
  status: text("status").notNull().default("idle"),
  sourcesCompleted: integer("sources_completed").notNull().default(0),
  sourcesFailed: integer("sources_failed").notNull().default(0),
  jobsDiscovered: integer("jobs_discovered").notNull().default(0),
  jobsEligible: integer("jobs_eligible").notNull().default(0),
  jobsCreated: integer("jobs_created").notNull().default(0),
  jobsUpdatedOrDuplicate: integer("jobs_updated_or_duplicate").notNull().default(0),
  results: text("results").notNull().default("[]"),
  finishedAt: text("finished_at").notNull().default(""),
  receivedAt: text("received_at").notNull().default(""),
});

export const chinaScanControl = sqliteTable("china_scan_control", {
  id: integer("id").primaryKey(),
  requestId: text("request_id").notNull().default(""),
  state: text("state").notNull().default("idle"),
  requestedAt: text("requested_at").notNull().default(""),
  claimedAt: text("claimed_at").notNull().default(""),
  completedAt: text("completed_at").notNull().default(""),
  message: text("message").notNull().default(""),
});

export const userProfiles = sqliteTable("user_profiles", {
  userEmail: text("user_email").primaryKey(),
  fullName: text("full_name").notNull().default(""),
  location: text("location").notNull().default(""),
  workAuthorization: text("work_authorization").notNull().default(""),
  sponsorshipNeed: text("sponsorship_need").notNull().default(""),
  education: text("education").notNull().default(""),
  targetRoles: text("target_roles").notNull().default(""),
  targetIndustries: text("target_industries").notNull().default(""),
  professionalSummary: text("professional_summary").notNull().default(""),
  skills: text("skills").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const profileResumes = sqliteTable("profile_resumes", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  label: text("label").notNull(),
  filename: text("filename").notNull(),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
