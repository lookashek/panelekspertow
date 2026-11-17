import type { APIContext } from "astro";

import { AppError, ErrorCode, UnauthorizedError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";
import { SessionRepository } from "@/lib/repositories/session.repository";
import { SessionService } from "@/lib/services/session.service";
import { createClient } from "@/lib/supabase";

export async function DELETE({ params, request, cookies, locals }: APIContext): Promise<Response> {
  if (!locals.user) {
    return errorResponse(new UnauthorizedError("Sign in required"));
  }

  if (!params.id) {
    return errorResponse(new AppError("Missing session id", ErrorCode.VALIDATION_ERROR, 400));
  }

  const client = createClient(request.headers, cookies);
  if (!client) {
    return errorResponse(new AppError("Service not configured", ErrorCode.NOT_CONFIGURED, 503));
  }

  const service = new SessionService({ repository: new SessionRepository(client) });
  const result = await service.deleteSession(params.id, locals.user.id);
  if (!result.ok) {
    return errorResponse(result.error);
  }

  return json({ success: true }, { status: 200 });
}
