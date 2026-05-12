import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIProvider } from "./../provider";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor() {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  }

  async analyze(prompt: string, systemPrompt?: string): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: this.model,
      ...(systemPrompt && { systemInstruction: systemPrompt }),
    });

    const result = await model.generateContent(prompt);
    return result.response.text();
  }
}
