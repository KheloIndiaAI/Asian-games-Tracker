// Client-side error reporting. Logs to the console; server-side errors are
// captured separately via CloudWatch Logs (stdout/stderr of the systemd
// services). No external error-reporting bridge is wired up here.

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  console.error("[error-boundary]", message, { route: window.location.pathname, ...context, error });
}
