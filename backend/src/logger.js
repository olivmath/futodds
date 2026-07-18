export function createLogger({ sink = console } = {}) {
  function write(level, event, details = {}) {
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
