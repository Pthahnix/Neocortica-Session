// Shared type definitions for neocortica-relay (local + worker)

// --- Task Status ---

export type TaskStatus =
  | "idle"
  | "initializing"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "aborted";

export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "completed",
  "failed",
  "aborted",
]);

// --- Task Payload ---

export const ALLOWED_TOOLS_WHITELIST = [
  "Bash",
  "Write",
  "Edit",
  "Read",
  "Glob",
  "Grep",
] as const;

export type AllowedTool = (typeof ALLOWED_TOOLS_WHITELIST)[number];

export const ENV_BLOCKLIST_PATTERNS = [
  /^RELAY_/,
  /^PATH$/,
  /^HOME$/,
  /^NODE_OPTIONS$/,
  /^NODE_PATH$/,
] as const;

export interface ModelConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface TaskPayload {
  experimentPlan: string;
  checkpoints: string[];
  allowedTools?: AllowedTool[];
  envConfig?: Record<string, string>;
  modelConfig: ModelConfig;
  stallTimeoutMs?: number;
}

// --- Task Info ---

export interface TaskInfo {
  taskId: string;
  status: TaskStatus;
  phase: string;
  progress?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

// --- Checkpoint Report ---

export interface Report {
  phase: string;
  summary: string;
  details: string;
  files: string[];
  metrics?: Record<string, unknown>;
}

// --- Feedback ---

export type FeedbackAction = "continue" | "revise" | "abort";

export interface Feedback {
  action: FeedbackAction;
  message?: string;
}

// --- Health ---

export interface HealthInfo {
  status: "ok" | "busy" | "error";
  uptime: number;
  currentTask?: { taskId: string; status: TaskStatus };
}

// --- Worker Entry (local-side only) ---

export interface WorkerEntry {
  workerId: string;
  url: string;
  name?: string;
  lastHealth?: HealthInfo;
  registeredAt: string;
}

// --- Persisted State (worker-side, state.json) ---

export interface PersistedState {
  task: TaskInfo | null;
  sessionId: string | null;
  feedbackCounter: number;
  history: TaskInfo[];
}

// --- Validation Helpers ---

export function isValidAllowedTools(tools: string[]): tools is AllowedTool[] {
  return tools.every((t) =>
    (ALLOWED_TOOLS_WHITELIST as readonly string[]).includes(t),
  );
}

export function isBlockedEnvKey(key: string): boolean {
  return ENV_BLOCKLIST_PATTERNS.some((pattern) => pattern.test(key));
}

export function validateEnvConfig(
  config: Record<string, string>,
): string | null {
  for (const key of Object.keys(config)) {
    if (isBlockedEnvKey(key)) {
      return `Blocked environment variable: ${key}`;
    }
  }
  return null;
}

export function validateTaskPayload(payload: TaskPayload): string | null {
  if (!payload.experimentPlan || payload.experimentPlan.trim() === "") {
    return "experimentPlan is required";
  }
  if (!payload.checkpoints || payload.checkpoints.length === 0) {
    return "At least one checkpoint is required";
  }
  if (!payload.modelConfig?.apiKey) {
    return "modelConfig.apiKey is required";
  }
  if (payload.allowedTools && !isValidAllowedTools(payload.allowedTools)) {
    return `allowedTools must be a subset of: ${ALLOWED_TOOLS_WHITELIST.join(", ")}`;
  }
  if (payload.envConfig) {
    const envError = validateEnvConfig(payload.envConfig);
    if (envError) return envError;
  }
  return null;
}
