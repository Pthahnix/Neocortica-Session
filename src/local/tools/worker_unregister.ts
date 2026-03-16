// MCP Tool: worker_unregister — remove a worker
import { z } from "zod";
import type { WorkerRegistry } from "../worker_registry.js";

export const workerUnregisterSchema = z.object({
  workerId: z.string().describe("Worker ID to unregister"),
});

export type WorkerUnregisterInput = z.infer<typeof workerUnregisterSchema>;

export async function workerUnregister(
  input: WorkerUnregisterInput,
  registry: WorkerRegistry,
): Promise<string> {
  try {
    await registry.unregister(input.workerId);
    return JSON.stringify({ ok: true });
  } catch (err: any) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}
