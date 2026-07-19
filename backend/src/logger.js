const CRITICAL_EVENTS = new Set([
  "game.created",
  "admin.match.create",
  "admin.match.source",
  "stream.started",
  "stream.stopped",
  "stream.resumed",
  "stream.error",
  "oracle.updated",
  "settlement.executed",
  "error.fatal",
  "app.started",
  "poller.tick",
  "poller.started",
]);

export function createLogger({ sink = console } = {}) {
  function write(level, event, details = {}) {
    if (!CRITICAL_EVENTS.has(event)) return;

    const payload = {
      at: new Date().toISOString(),
      level,
      event,
      ...details,
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
      sink.error(line);
      return;
    }
    sink.log(line);
  }

  return {
    info: (event, details) => write("info", event, details),
    error: (event, details) => write("error", event, details),
  };
}

export const logger = createLogger();
