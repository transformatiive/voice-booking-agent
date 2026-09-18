import { config } from "../config.js";
import { LIVE_VOICE_MODEL } from "../telephony/gptLive.js";

/**
 * Rewrite owner draft into clearer gpt-live-1 phone instructions.
 * Does not change LIVE_VOICE_MODEL (stays gpt-live-1).
 */
export async function rewriteAgentScript(input: {
  draft: string;
  knowledge: string;
  locale: "pt" | "en";
}): Promise<{ script: string } | { error: string }> {
  const apiKey = config.voice.openaiApiKey;
  if (!apiKey) {
    return { error: "openai_not_configured" };
  }
  const draft = input.draft.trim();
  if (!draft) {
    return { error: "draft_required" };
  }
  const system =
    input.locale === "en"
      ? `Rewrite the owner's voice-agent instructions so ${LIVE_VOICE_MODEL} can follow them on a live phone call. Keep their intent. Short sentences. Output only the improved script.`
      : `Reescreve o guião do dono para o modelo ${LIVE_VOICE_MODEL} seguir ao telefone. Mantém a intenção. Frases curtas, português de Portugal. Devolve só o guião melhorado.`;
  const user = [
    `Guião:\n${draft}`,
    input.knowledge.trim() ? `Conhecimento:\n${input.knowledge.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.voice.openaiLiveBackendModel,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[assistant/rewrite]", res.status, text.slice(0, 400));
    return { error: "rewrite_failed" };
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const script = payload.choices?.[0]?.message?.content?.trim();
  if (!script) {
    return { error: "rewrite_empty" };
  }
  return { script };
}
