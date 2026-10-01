/**
 * Production-safe logger
 * console.log calls are stripped in production builds via this wrapper
 */
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args); },
  warn: (...args: unknown[]) => { if (isDev) console.warn(...args); },
  error: (...args: unknown[]) => console.error(...args), // errors always logged
  info: (...args: unknown[]) => { if (isDev) console.info(...args); },
};
