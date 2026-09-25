import type { APIContext } from "astro";

import { createLlmProvider } from "@/lib/adapters/create-llm-provider";
import { AppError, ErrorCode, UnauthorizedError, ValidationError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";
import { SessionRepository } from "@/lib/repositories/session.repository";
import { PanelInputSchema } from "@/lib/schemas/panel";
import { SessionService } from "@/lib/services/session.service";
import { createClient } from "@/lib/supabase";

export async function POST({ request, cookies, locals }: APIContext): Promise<Response> {
  if (!locals.user) {
    return errorResponse(new UnauthorizedError("Sign in required"));
  }

  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return errorResponse(new ValidationError("Content-Type must be application/json"));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(new ValidationError("Body must be JSON"));
  }

  const parsed = PanelInputSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(new ValidationError("Invalid panel input", parsed.error));
  }

  const client = createClient(request.headers, cookies);
  const provider = createLlmProvider();
  if (!client || !provider) {
    return errorResponse(new AppError("Service not configured", ErrorCode.NOT_CONFIGURED, 503));
  }

  const service = new SessionService({ repository: new SessionRepository(client), provider });
  const result = await service.createSession(parsed.data);
  if (!result.ok) {
    return errorResponse(result.error);
  }

  return json({ id: result.value.id }, { status: 201 });
}
