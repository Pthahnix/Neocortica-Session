// MCP Tool: worker_register — register a new worker
import { z } from "zod";
import type { WorkerRegistry } from "../worker_registry.js";
import type { ITransport } from "../http_transport.js";

export const workerRegisterSchema = z.object({
  url: z.string().url().describe("Worker HTTP server URL"),
  name: z.string().optional().describe("Human-readable worker name"),
});

export type WorkerRegisterInput = z.infer<typeof workerRegisterSchema>;

export async function workerRegister(
  input: WorkerRegisterInput,
  registry: WorkerRegistry,
  transport: ITransport,
): Promise<string> {
  // Health check before registering
  try {
    const health = await transport.health(input.url);
    const entry = await registry.register(input.url, input.name);
    await registry.updateHealth(entry.workerId, health);
    return JSON.stringify({ ok: true, worker: entry });
  } catch (err: any) {
    if (err.message?.includes("already registered")) {
      return JSON.stringify({ ok: false, error: err.message });
    }
    return JSON.stringify({ ok: false, error: `Health check failed: ${err.message}` });
  }
}
