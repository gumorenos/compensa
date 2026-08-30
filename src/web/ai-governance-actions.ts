"use server";

import { revalidatePath } from "next/cache";
import { AIGovernanceService } from "../application/ai-governance-service.js";
import { getAppContext } from "./runtime.js";

export async function updateAIGovernanceAction(formData: FormData): Promise<void> {
  const context = await getAppContext("MANAGE_AI_ASSISTANCE");
  const assistanceEnabled = formData.get("assistanceEnabled") === "yes";
  // Disabling assistance also revokes external-processing consent. This keeps the
  // governance state internally consistent even without client-side JavaScript.
  const externalProcessingAllowed =
    assistanceEnabled && formData.get("externalProcessingAllowed") === "yes";

  const service = new AIGovernanceService(context.pool);
  await service.updateSettings(context.organization.id, context.access.user.id, {
    assistanceEnabled,
    externalProcessingAllowed,
  });

  revalidatePath("/ai-assistance");
}
