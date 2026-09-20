import { handleMakeWebhook } from "@/lib/pipeline/webhook-handler.js";
import { AGENTS } from "@/lib/agents/types.js";

export async function POST(request) {
  return handleMakeWebhook(request, AGENTS.CREATIVE, "creative");
}
