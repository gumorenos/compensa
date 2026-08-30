import type {
  AIAssistanceProvider,
  AIAssistanceProviderInput,
} from "./contracts.js";

/**
 * Deterministic, in-process provider used only to exercise the assistance workflow.
 * It performs no network I/O and its output must never be presented as a real AI
 * recommendation.
 */
export class LocalFixtureAIAssistanceProvider implements AIAssistanceProvider {
  readonly providerId = "LOCAL_FIXTURE";
  readonly modelId = "workflow-fixture-v1";

  async analyze(input: AIAssistanceProviderInput): Promise<unknown> {
    const dimensions = input.methodology.factors.flatMap((factor) => factor.dimensions);
    const first = dimensions[0];
    if (first === undefined || first.levels.length === 0) {
      return {
        suggestions: [],
        clarifications: [
          {
            dimensionCode: null,
            question: "¿La metodología contiene dimensiones y niveles evaluables?",
            reason: "El fixture local no encontró una dimensión utilizable.",
          },
        ],
      };
    }

    const firstLevel = first.levels[Math.floor((first.levels.length - 1) / 2)]!;
    const evidenceExcerpt = deterministicExcerpt(input.jobDescription.content);
    const suggestions: Array<Record<string, unknown>> = [
      {
        dimensionCode: first.code,
        suggestedLevelCode: firstLevel.code,
        confidence: null,
        rationale:
          "Salida determinística del fixture local para probar el flujo de revisión humana. No es una recomendación real de IA.",
        evidence: evidenceExcerpt === null
          ? []
          : [{ excerpt: evidenceExcerpt, sourceSection: null }],
      },
    ];

    const second = dimensions[1];
    const clarifications: Array<Record<string, unknown>> = [];
    if (second !== undefined) {
      suggestions.push({
        dimensionCode: second.code,
        suggestedLevelCode: null,
        confidence: null,
        rationale:
          "El fixture local se abstiene deliberadamente en esta dimensión para probar el tratamiento de abstenciones.",
        evidence: [],
      });
      clarifications.push({
        dimensionCode: second.code,
        question: `¿Qué evidencia adicional permitiría decidir el nivel de ${second.name}?`,
        reason:
          "Pregunta determinística del fixture local para probar el flujo de aclaraciones; no proviene de un modelo externo.",
      });
    }

    return { suggestions, clarifications };
  }
}

function deterministicExcerpt(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed === "") return null;
  const maxLength = 240;
  if (trimmed.length <= maxLength) return trimmed;

  const candidate = trimmed.slice(0, maxLength);
  const lastWhitespace = candidate.lastIndexOf(" ");
  return (lastWhitespace >= 80 ? candidate.slice(0, lastWhitespace) : candidate).trim();
}
