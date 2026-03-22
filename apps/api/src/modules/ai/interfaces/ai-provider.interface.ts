import {
  AiHealthCheckResult,
  AiProviderName,
  AiProviderResult,
  GenerateJsonInput,
} from './ai.types';

export interface AiProvider {
  readonly name: AiProviderName;

  generateJson<T>(input: GenerateJsonInput): Promise<AiProviderResult<T>>;

  healthCheck(): Promise<AiHealthCheckResult>;
}
