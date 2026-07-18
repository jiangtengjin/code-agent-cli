import type { LLMResponse } from "../../types/provider.js";
import type { ChatParams, LLMProvider } from "../provider.js";

interface OpenAICompatConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai-compatible";

  constructor(private config: OpenAICompatConfig) {}

  async chat(params: ChatParams): Promise<LLMResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          ...(params.systemPrompt
            ? [{ role: "system" as const, content: params.systemPrompt }]
            : []),
          ...params.messages.map((m) => {
            const msg: Record<string, unknown> = {
              role: m.role,
              content: m.content,
            };
            // tool 消息需要 tool_call_id
            if (m.role === "tool" && m.toolCallId) {
              msg.tool_call_id = m.toolCallId;
            }
            // assistant 消息可能携带 tool_calls
            if (m.role === "assistant" && m.toolCalls) {
              msg.tool_calls = m.toolCalls;
            }
            return msg;
          }),
        ],
        tools: params.tools?.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        max_tokens: params.maxTokens,
        temperature: params.temperature,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`API 请求失败 (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.parseResponse(data);
  }

  private parseResponse(data: Record<string, unknown>): LLMResponse {
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;

    return {
      content: (message?.content as string) ?? "",
      toolCalls: (message?.tool_calls as Array<Record<string, unknown>> | undefined)?.map((tc) => ({
        id: tc.id as string,
        name: (tc.function as Record<string, unknown>).name as string,
        args: JSON.parse((tc.function as Record<string, unknown>).arguments as string),
      })),
      usage: data.usage
        ? {
            promptTokens: (data.usage as Record<string, number>).prompt_tokens,
            completionTokens: (data.usage as Record<string, number>).completion_tokens,
            totalTokens: (data.usage as Record<string, number>).total_tokens,
          }
        : undefined,
      model: (data.model as string) ?? this.config.model,
    };
  }
}
