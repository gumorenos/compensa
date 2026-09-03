import { SYNTHETIC_DEMO_CONFIRMATION } from "../fixtures/synthetic-demo-data.js";

export function assertSyntheticDemoSeedConfirmation(value: string | undefined): void {
  if (value?.trim() !== SYNTHETIC_DEMO_CONFIRMATION) {
    throw new Error(`COMPENSA_DEMO_SEED_CONFIRM must equal ${SYNTHETIC_DEMO_CONFIRMATION}.`);
  }
}
