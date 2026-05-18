export const aiProviderCatalog = [
  {
    id: "openai",
    name: "OpenAI",
    shortName: "GPT",
    description: "Fast general answers and structured guide generation.",
    defaultModel: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai-compatible"
  },
  {
    id: "anthropic",
    name: "Anthropic",
    shortName: "Claude",
    description: "Strong reasoning for complex workflow instructions.",
    defaultModel: "claude-sonnet-4-20250514",
    baseUrl: "https://api.anthropic.com/v1",
    protocol: "anthropic"
  },
  {
    id: "gemini",
    name: "Google Gemini",
    shortName: "Gemini",
    description: "Low-latency answers with Google model support.",
    defaultModel: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    protocol: "gemini"
  },
  {
    id: "mistral",
    name: "Mistral AI",
    shortName: "Mistral",
    description: "European hosted models with compact latency.",
    defaultModel: "mistral-small-latest",
    baseUrl: "https://api.mistral.ai/v1",
    protocol: "openai-compatible"
  },
  {
    id: "groq",
    name: "Groq",
    shortName: "Groq",
    description: "Very fast inference for guided support flows.",
    defaultModel: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    protocol: "openai-compatible"
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    shortName: "DeepSeek",
    description: "Cost-efficient chat completions for product help.",
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    protocol: "openai-compatible"
  },
  {
    id: "xai",
    name: "xAI",
    shortName: "Grok",
    description: "Grok models through an OpenAI-compatible API.",
    defaultModel: "grok-3-mini",
    baseUrl: "https://api.x.ai/v1",
    protocol: "openai-compatible"
  },
  {
    id: "cohere",
    name: "Cohere",
    shortName: "Cohere",
    description: "Enterprise language models through the v2 Chat API.",
    defaultModel: "command-a-03-2025",
    baseUrl: "https://api.cohere.com/v2",
    protocol: "cohere"
  },
  {
    id: "perplexity",
    name: "Perplexity",
    shortName: "Sonar",
    description: "Web-grounded answers with Sonar chat completions.",
    defaultModel: "sonar",
    baseUrl: "https://api.perplexity.ai/v1/sonar",
    protocol: "perplexity"
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    shortName: "Router",
    description: "One token to route across many hosted models.",
    defaultModel: "openai/gpt-4o-mini",
    baseUrl: "https://openrouter.ai/api/v1",
    protocol: "openai-compatible"
  }
] as const;

export type AiProviderId = (typeof aiProviderCatalog)[number]["id"];
export type AiProviderProtocol = (typeof aiProviderCatalog)[number]["protocol"];

export const aiProviderIds = aiProviderCatalog.map((provider) => provider.id) as [
  AiProviderId,
  ...AiProviderId[]
];

export function isAiProviderId(value: string): value is AiProviderId {
  return aiProviderCatalog.some((provider) => provider.id === value);
}

export function getAiProviderDefinition(providerId: string) {
  return aiProviderCatalog.find((provider) => provider.id === providerId) ?? null;
}
