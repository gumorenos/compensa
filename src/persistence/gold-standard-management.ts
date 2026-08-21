import type { Queryable } from "./database.js";
import { PersistenceError } from "./database.js";

export async function updateGoldStandardAnchor(
  organizationId: string,
  caseId: string,
  isAnchor: boolean,
  db: Queryable,
): Promise<void> {
  const result = await db.query(
    `UPDATE gold_standard_cases
     SET is_anchor = $3, updated_at = now()
     WHERE id = $1
       AND organization_id = $2
       AND status = 'VALIDATED'`,
    [caseId, organizationId, isAnchor],
  );

  if (result.rowCount !== 1) {
    throw new PersistenceError(
      "GOLD_CASE_NOT_VALIDATED",
      "Only validated Gold Standard cases can change anchor status.",
    );
  }
}
