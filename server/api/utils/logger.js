// server/api/utils/logger.js
// Structured JSON logger for production observability

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;

function log(level, event, data = {}) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };

  const output = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    console.error(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (event, data) => log('debug', event, data),
  info: (event, data) => log('info', event, data),
  warn: (event, data) => log('warn', event, data),
  error: (event, data) => log('error', event, data),
};
