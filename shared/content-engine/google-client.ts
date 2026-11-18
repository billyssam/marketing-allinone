import { GoogleGenAI, type GenerateContentConfig } from '@google/genai';

export const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_SHORT_FORM_MODEL = 'gemini-2.5-flash-lite';

/** Small text/JSON adapter for our content engine. Provider, API key/project and
 * model names remain explicit; switching SDKs never creates a billing project.
 * SDK retries are disabled because the engine owns its finite retry budget.
 */
export class GoogleContentClient {
  private readonly client: GoogleGenAI;
  constructor(apiKey: string, private readonly deadline = Date.now() + 45000) {
    // These text/JSON requests use systemInstruction, which requires v1beta for our models.
    this.client = new GoogleGenAI({ apiKey, apiVersion: 'v1beta', httpOptions: { timeout: 20000, retryOptions: { attempts: 1 } } });
  }
  async unavailableModels(modelNames: string[]): Promise<string[]> {
    const missing = new Set(modelNames.map(name => name.replace(/^models\//, '')));
    const models = await this.client.models.list({
      config: { pageSize: 100, abortSignal: AbortSignal.timeout(15000) },
    });
    for await (const model of models) {
      if (model.name && model.supportedActions?.includes('generateContent')) {
        missing.delete(model.name.replace(/^models\//, ''));
      }
    }
    return [...missing];
  }
  getGenerativeModel(options: { model: string; systemInstruction?: string; generationConfig?: GenerateContentConfig }) {
    const client = this.client;
    const deadline = this.deadline;
    return {
      async generateContent(prompt: string, _requestOptions?: { timeout?: number }) {
        const remaining = deadline - Date.now();
        if (remaining < 1000) throw new Error('생성 시간이 초과됐어요. 잠시 후 다시 확인해주세요.');
        const result = await client.models.generateContent({
          model: options.model, contents: prompt,
          config: { ...options.generationConfig, systemInstruction: options.systemInstruction,
            httpOptions: { timeout: Math.min(20000, remaining), retryOptions: { attempts: 1 } } },
        });
        if (!result.text?.trim()) throw new Error('모델 응답이 비어 있어요.');
        return { response: { text: () => result.text!, candidates: result.candidates } };
      },
    };
  }
}
