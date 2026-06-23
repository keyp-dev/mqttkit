/**
 * Pluggable logger interface. Default implementation writes to `console`;
 * applications can inject a structured logger (pino, bunyan, OpenTelemetry,
 * Sentry, …) via `app.logger()` so internal warnings/errors stay inside the
 * project's logging pipeline.
 *
 * All methods receive a free-form `message` plus an optional `meta` bag. Keep
 * meta JSON-serializable when possible — popular logger adapters serialize it.
 */
export type MqttLogger = {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

/** Default logger that mirrors mqttkit's historical `console.*` behaviour. */
export const consoleLogger: MqttLogger = {
  debug(message, meta) {
    if (meta) console.debug(`[mqttkit] ${message}`, meta)
    else console.debug(`[mqttkit] ${message}`)
  },
  info(message, meta) {
    if (meta) console.info(`[mqttkit] ${message}`, meta)
    else console.info(`[mqttkit] ${message}`)
  },
  warn(message, meta) {
    if (meta) console.warn(`[mqttkit] ${message}`, meta)
    else console.warn(`[mqttkit] ${message}`)
  },
  error(message, meta) {
    if (meta) console.error(`[mqttkit] ${message}`, meta)
    else console.error(`[mqttkit] ${message}`)
  },
}

/** Silent logger — useful in tests or when the host owns all logging. */
export const noopLogger: MqttLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}
