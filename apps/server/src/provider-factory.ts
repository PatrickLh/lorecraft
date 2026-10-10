import { ClaudeProvider, DeepSeekProvider, MockProvider, type LlmProvider } from '@lorecraft/llm'
import type { AppConfig } from './config.js'
import { HttpError } from './errors.js'

export function createProvider(config: AppConfig): LlmProvider {
  switch (config.provider) {
    case 'deepseek':
      if (!config.deepseek.apiKey) {
        throw new HttpError(500, 'provider_config_missing', 'DEEPSEEK_API_KEY 未配置')
      }
      return new DeepSeekProvider(config.deepseek)
    case 'claude':
      if (!config.claude.apiKey) {
        throw new HttpError(500, 'provider_config_missing', 'ANTHROPIC_API_KEY 未配置')
      }
      return new ClaudeProvider(config.claude)
    case 'mock':
    default:
      return new MockProvider()
  }
}
