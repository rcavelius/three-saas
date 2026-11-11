/**
 * Structured JSON logging with secret redaction. Hosting platforms (Fly, Render, Vercel) collect stdout,
 * so JSON lines are the cheapest log pipeline that stays searchable.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const SECRET_KEY_PATTERN = /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|signature|card)/i;
const SECRET_VALUE_PATTERNS = [/sk_(live|test)_[A-Za-z0-9]+/g, /whsec_[A-Za-z0-9]+/g, /Bearer\s+[A-Za-z0-9._-]+/gi];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERNS.reduce((s, re) => s.replace(re, "[redacted]"), value);
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message), stack: value.stack };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export function createLogger(
  base: Record<string, unknown> = {},
  sink: (line: string) => void = (l) => process.stdout.write(l + "\n"),
): Logger {
  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
    sink(JSON.stringify({ t: new Date().toISOString(), level, msg, ...(redact({ ...base, ...fields }) as object) }));
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (f) => createLogger({ ...base, ...f }, sink),
  };
}
