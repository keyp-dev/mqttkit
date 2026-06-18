import type { MqttAppState, MqttPlugin } from '@mqttkit/core'
import { AedesBrokerAdapter } from './aedes-adapter.js'
import type { AedesAdapterOptions } from './types.js'

export function aedes<TState extends MqttAppState = MqttAppState>(
  options: AedesAdapterOptions<TState['principal']> = {},
): MqttPlugin<TState> {
  return {
    name: '@mqttkit/aedes',
    setup(app) {
      const adapter = new AedesBrokerAdapter<TState['principal']>(options)
      app.broker(adapter)
    },
  }
}

export { AedesBrokerAdapter }
export type {
  AedesAdapterOptions,
  AedesAdapterTcpOptions,
  AedesAdapterWsOptions,
  AedesAuthenticateInput,
} from './types.js'
