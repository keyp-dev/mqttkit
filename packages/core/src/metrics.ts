import type { MqttErrorPhase } from './context.js'

export type MqttMetricEvent =
  | {
      type: 'dispatch'
      topic: string
      route?: { pattern: string; meta?: unknown }
      durationMs: number
      /**
       * - `ok`: handler ran to completion.
       * - `rejected`: no route matched, or a policy returned false.
       * - `error`: the pipeline threw (validation / policy / middleware / handler / timeout / overload).
       *   See `errorPhase` for the precise stage.
       */
      result: 'ok' | 'rejected' | 'error'
      errorPhase?: MqttErrorPhase
    }
  | {
      type: 'publish'
      topic: string
      durationMs: number
      result: 'ok' | 'error'
      errorPhase?: 'publish'
    }

export type MqttMetricHandler = (event: MqttMetricEvent) => void | Promise<void>
