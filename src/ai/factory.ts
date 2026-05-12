import { AIProvider } from "./provider";
import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import { OpenAIProvider } from "./providers/openai";

type ProviderName = "gemini" | "claude" | "openai";

export function createAiProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER ?? "gemini") as ProviderName;

  switch (provider) {
    case "gemini":
      return new GeminiProvider();
    case "openai":
      return new OpenAIProvider();
    case "claude":
      return new ClaudeProvider();
    default:
      throw new Error(`Unknown AI provider: "${provider}". Use gemini, claude, or openai.`);
  }
}
