export interface AIProvider {
  analyze(prompt: string, systemPrompt?: string): Promise<string>;
}
