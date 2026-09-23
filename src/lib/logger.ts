/**
 * Structured JSON logger. Each call emits one JSON line: `{ level, msg, ...base, ...fields }`.
 *
 * Guardrail (per `.claude/rules/backend.md` §6 / §5): log per-call metadata — token counts,
 * latency, model, persona, prompt version — never full prompt/response bodies at `info`. `fields`
 * is typed as scalar-ish values on purpose; if you need to pass a body through, that's a signal
 * to log a length/hash instead, not the payload itself.
 */

type LogFieldValue = string | number | boolean | null | undefined;
type LogFields = Record<string, LogFieldValue>;

interface LoggerBase {
  requestId?: string;
  userId?: string;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

function emit(level: string, base: LoggerBase, msg: string, fields?: LogFields) {
  const line = JSON.stringify({ level, msg, ...base, ...fields });
  // eslint-disable-next-line no-console -- this wrapper IS the logging sink; no other exists yet
  console.log(line);
}

export function createLogger(base: LoggerBase = {}): Logger {
  return {
    debug: (msg, fields) => {
      emit("debug", base, msg, fields);
    },
    info: (msg, fields) => {
      emit("info", base, msg, fields);
    },
    warn: (msg, fields) => {
      emit("warn", base, msg, fields);
    },
    error: (msg, fields) => {
      emit("error", base, msg, fields);
    },
  };
}
