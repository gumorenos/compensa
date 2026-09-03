import { SYNTHETIC_DEMO_CONFIRMATION } from "../fixtures/synthetic-demo-data.js";

export function assertSyntheticDemoSeedConfirmation(value: string | undefined): void {
  if (value?.trim() !== SYNTHETIC_DEMO_CONFIRMATION) {
    throw new Error(`COMPENSA_DEMO_SEED_CONFIRM must equal ${SYNTHETIC_DEMO_CONFIRMATION}.`);
  }
}

export function assertSyntheticDemoOrganizationSlug(organizationSlug: string): void {
  const normalized = organizationSlug.trim().toLocaleLowerCase("en-US");
  if (!/(^|[-_])(staging|demo|test|qa)([-_]|$)/.test(normalized)) {
    throw new Error(
      "Synthetic demo seed is restricted to organization slugs explicitly marked staging, demo, test, or qa.",
    );
  }
}
