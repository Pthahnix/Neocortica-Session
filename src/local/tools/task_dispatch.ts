// MCP Tool: task_dispatch — dispatch a task to a worker
import { z } from "zod";
import type { WorkerRegistry } from "../worker_registry.js";
import type { TaskTracker } from "../task_tracker.js";
import type { ITransport } from "../http_transport.js";
import { validateTaskPayload, type TaskPayload, ALLOWED_TOOLS_WHITELIST } from "../../shared/types.js";

export const taskDispatchSchema = z.object({
  workerId: z.string().describe("Target worker ID"),
  experimentPlan: z.string().min(1).describe("Experiment plan (markdown)"),
  checkpoints: z.array(z.string()).min(1).describe("Checkpoint phase names"),
  apiKey: z.string().min(1).describe("Model API key"),
  baseUrl: z.string().optional().describe("Model base URL"),
  model: z.string().optional().describe("Model name"),
  allowedTools: z.array(z.string()).optional().describe("Allowed CC tools"),
  envConfig: z.record(z.string()).optional().describe("Environment variables"),
  stallTimeoutMs: z.number().optional().describe("Stall timeout in ms"),
});

export type TaskDispatchInput = z.infer<typeof taskDispatchSchema>;

export async function taskDispatch(
  input: TaskDispatchInput,
  registry: WorkerRegistry,
  tracker: TaskTracker,
  transport: ITransport,
): Promise<string> {
  const worker = registry.get(input.workerId);
  if (!worker) {
    return JSON.stringify({ ok: false, error: `Worker not found: ${input.workerId}` });
  }

  // Check if worker already has an active task
  const active = tracker.activeForWorker(input.workerId);
  if (active) {
    return JSON.stringify({ ok: false, error: `Worker ${input.workerId} already has active task: ${active.taskId}` });
  }

  const payload: TaskPayload = {
    experimentPlan: input.experimentPlan,
    checkpoints: input.checkpoints,
    modelConfig: {
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
    },
    allowedTools: (input.allowedTools as any) ?? [...ALLOWED_TOOLS_WHITELIST],
    envConfig: input.envConfig,
    stallTimeoutMs: input.stallTimeoutMs,
  };

  const validationError = validateTaskPayload(payload);
  if (validationError) {
    return JSON.stringify({ ok: false, error: validationError });
  }

  try {
    const taskInfo = await transport.dispatch(worker.url, payload);
    const tracked = await tracker.track(taskInfo, input.workerId);
    return JSON.stringify({ ok: true, task: tracked });
  } catch (err: any) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}
