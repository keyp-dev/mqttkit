import type { MqttApp } from './app.js'
import type { MqttAppState } from './context.js'

export type MqttPlugin<TState extends MqttAppState = MqttAppState> = {
  name?: string
  setup(app: MqttApp<TState>): void | Promise<void>
}
