// MCP Tool: task_files — download a file from worker experiment directory
import { z } from "zod";
import type { WorkerRegistry } from "../worker_registry.js";
import type { TaskTracker } from "../task_tracker.js";
import type { ITransport } from "../http_transport.js";

export const taskFilesSchema = z.object({
  taskId: z.string().describe("Task ID"),
  path: z.string().describe("File path relative to experiment directory"),
});

export type TaskFilesInput = z.infer<typeof taskFilesSchema>;

export async function taskFiles(
  input: TaskFilesInput,
  registry: WorkerRegistry,
  tracker: TaskTracker,
  transport: ITransport,
): Promise<string> {
  const tracked = tracker.get(input.taskId);
  if (!tracked) {
    return JSON.stringify({ ok: false, error: `Task not found: ${input.taskId}` });
  }

  const worker = registry.get(tracked.workerId);
  if (!worker) {
    return JSON.stringify({ ok: false, error: `Worker not found: ${tracked.workerId}` });
  }

  try {
    const file = await transport.files(worker.url, input.taskId, input.path);
    return JSON.stringify({ ok: true, file });
  } catch (err: any) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}
