/// <reference lib="webworker" />
import { handleRequest, type WorkerEnvelope, type WorkerReply } from "./protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerEnvelope>) => {
  const { id, request } = event.data;
  let reply: WorkerReply;
  try {
    reply = { id, ok: true, value: handleRequest(request) };
  } catch (e) {
    reply = { id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  ctx.postMessage(reply);
};
