import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("account_user_id_idx").on(table.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const rateLimit = pgTable("rateLimit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const sklandBinding = pgTable("skland_binding", {
  bindingKey: text("binding_key").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastAuthorizedAt: timestamp("last_authorized_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("skland_binding_user_id_idx").on(table.userId)]);

export const appSchema = pgSchema("app");

export const planRun = appSchema.table("plan_run", {
  diagnosticId: text("diagnostic_id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  dataOwnerTag: text("data_owner_tag"),
  sourceType: text("source_type").notNull(),
  status: text("status").notNull(),
  layoutTemplate: text("layout_template").notNull(),
  roomCount: integer("room_count").notNull(),
  operatorCount: integer("operator_count").notNull(),
  rotation: text("rotation").notNull(),
  fiammettaEnable: boolean("fiammetta_enable").notNull(),
  durationMs: integer("duration_ms"),
  errorCode: text("error_code"),
  solverExecutableSha256: text("solver_executable_sha256"),
  protocolVersion: integer("protocol_version"),
  planSchemaVersion: integer("plan_schema_version"),
  artifactKey: text("artifact_key"),
  artifactBytes: bigint("artifact_bytes", { mode: "number" }),
  artifactSha256: text("artifact_sha256"),
  calculationContext: jsonb("calculation_context"),
  publicResultSha256: text("public_result_sha256"),
  operboxContentHmac: text("operbox_content_hmac"),
  operboxHmacKeyVersion: text("operbox_hmac_key_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("plan_run_created_at_idx").on(table.createdAt),
  index("plan_run_status_created_at_idx").on(table.status, table.createdAt),
  index("plan_run_error_code_created_at_idx").on(table.errorCode, table.createdAt),
  index("plan_run_solver_created_at_idx").on(table.solverExecutableSha256, table.createdAt),
  index("plan_run_user_created_at_idx").on(table.userId, table.createdAt),
]);

export const feedback = appSchema.table("feedback", {
  id: text("id").primaryKey(),
  diagnosticId: text("diagnostic_id").notNull(),
  planRunDiagnosticId: text("plan_run_diagnostic_id").references(() => planRun.diagnosticId, { onDelete: "set null" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  room: jsonb("room"),
  note: text("note").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  status: text("status").default("pending").notNull(),
  adminNote: text("admin_note"),
  artifactKey: text("artifact_key"),
  artifactBytes: bigint("artifact_bytes", { mode: "number" }),
  artifactSha256: text("artifact_sha256"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("feedback_created_at_idx").on(table.createdAt),
  index("feedback_status_created_at_idx").on(table.status, table.createdAt),
  index("feedback_diagnostic_id_idx").on(table.diagnosticId),
  index("feedback_user_created_at_idx").on(table.userId, table.createdAt),
]);

export const feedbackEvent = appSchema.table("feedback_event", {
  id: text("id").primaryKey(),
  feedbackId: text("feedback_id").notNull().references(() => feedback.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("feedback_event_feedback_created_at_idx").on(table.feedbackId, table.createdAt)]);

export const policyConsent = appSchema.table("policy_consent", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  termsVersion: text("terms_version").notNull(),
  privacyVersion: text("privacy_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("policy_consent_user_versions_uidx").on(table.userId, table.termsVersion, table.privacyVersion),
  index("policy_consent_user_accepted_at_idx").on(table.userId, table.acceptedAt),
]);

export const operboxSnapshot = appSchema.table("operbox_snapshot", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  contentHmac: text("content_hmac").notNull(),
  encryptedPayload: text("encrypted_payload").notNull(),
  payloadIv: text("payload_iv").notNull(),
  wrappedDataKey: text("wrapped_data_key").notNull(),
  wrappedKeyIv: text("wrapped_key_iv").notNull(),
  keyVersion: text("key_version").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("operbox_snapshot_user_created_at_idx").on(table.userId, table.createdAt),
  index("operbox_snapshot_expires_at_idx").on(table.expiresAt),
  uniqueIndex("operbox_snapshot_user_content_hmac_uidx").on(table.userId, table.contentHmac),
]);

export const savedPlan = appSchema.table("saved_plan", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  diagnosticId: text("diagnostic_id").notNull(),
  title: text("title").notNull(),
  publicResult: jsonb("public_result").notNull(),
  calculationContext: jsonb("calculation_context"),
  operboxContentHmac: text("operbox_content_hmac"),
  operboxHmacKeyVersion: text("operbox_hmac_key_version"),
  pinned: boolean("pinned").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => [
  index("saved_plan_user_created_at_idx").on(table.userId, table.createdAt),
  index("saved_plan_user_pinned_created_at_idx").on(table.userId, table.pinned, table.createdAt),
  uniqueIndex("saved_plan_user_diagnostic_id_uidx").on(table.userId, table.diagnosticId),
]);

export const userWorkspace = appSchema.table("user_workspace", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  currentRevision: bigint("current_revision", { mode: "number" }).default(1).notNull(),
  state: jsonb("state").notNull(),
  operboxSnapshotId: text("operbox_snapshot_id").references(() => operboxSnapshot.id, { onDelete: "set null" }),
  currentSavedPlanId: text("current_saved_plan_id").references(() => savedPlan.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("user_workspace_updated_at_idx").on(table.updatedAt)]);

export const workspaceRevision = appSchema.table("workspace_revision", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  revision: bigint("revision", { mode: "number" }).notNull(),
  state: jsonb("state").notNull(),
  operboxSnapshotId: text("operbox_snapshot_id").references(() => operboxSnapshot.id, { onDelete: "set null" }),
  savedPlanId: text("saved_plan_id").references(() => savedPlan.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("workspace_revision_user_revision_uidx").on(table.userId, table.revision),
  index("workspace_revision_user_created_at_idx").on(table.userId, table.createdAt),
  index("workspace_revision_expires_at_idx").on(table.expiresAt),
]);

export const planCache = appSchema.table("plan_cache", {
  keyHmac: text("key_hmac").primaryKey(),
  solverExecutableSha256: text("solver_executable_sha256").notNull(),
  protocolVersion: integer("protocol_version").notNull(),
  planSchemaVersion: integer("plan_schema_version").notNull(),
  publicResult: jsonb("public_result"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  hitCount: bigint("hit_count", { mode: "number" }).default(0).notNull(),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
}, (table) => [
  index("plan_cache_expires_at_idx").on(table.expiresAt),
  index("plan_cache_lease_expires_at_idx").on(table.leaseExpiresAt),
]);

export const planCacheReference = appSchema.table("plan_cache_reference", {
  id: text("id").primaryKey(),
  cacheKeyHmac: text("cache_key_hmac").notNull().references(() => planCache.keyHmac, { onDelete: "cascade" }),
  diagnosticId: text("diagnostic_id").notNull().references(() => planRun.diagnosticId, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("plan_cache_reference_cache_run_uidx").on(table.cacheKeyHmac, table.diagnosticId),
  index("plan_cache_reference_user_idx").on(table.userId),
  index("plan_cache_reference_diagnostic_idx").on(table.diagnosticId),
]);

/** 前端埋点事件（性能/行为/错误），30 天 TTL 明细落库；字段与事件名白名单在路由层校验。 */
export const telemetryEvent = appSchema.table("telemetry_event", {
  id: text("id").primaryKey(),
  /** 浏览器会话标识（前端生成，游客也有）。 */
  sessionId: text("session_id").notNull(),
  /** 登录网站用户；游客为 null。 */
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  /** 森空岛来源账号的 HMAC（服务端从会话取，可空）。 */
  dataOwnerTag: text("data_owner_tag"),
  /** performance | interaction | navigation | error */
  type: text("type").notNull(),
  /** 事件名（白名单枚举）。 */
  name: text("name").notNull(),
  durationMs: integer("duration_ms"),
  value: integer("value"),
  /** 当前页面路由。 */
  page: text("page"),
  /** 附加字段（白名单键）。 */
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("telemetry_event_created_at_idx").on(table.createdAt),
  index("telemetry_event_expires_at_idx").on(table.expiresAt),
  index("telemetry_event_type_created_at_idx").on(table.type, table.createdAt),
  index("telemetry_event_name_created_at_idx").on(table.name, table.createdAt),
  index("telemetry_event_user_created_at_idx").on(table.userId, table.createdAt),
  index("telemetry_event_owner_created_at_idx").on(table.dataOwnerTag, table.createdAt),
]);
