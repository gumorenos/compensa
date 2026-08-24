import Link from "next/link";
import { notFound } from "next/navigation";
import { CalibrationService } from "../../../../src/application/calibration-service.js";
import { CalibrationCandidateImportForm } from "../../../../src/web/calibration-candidate-import-form.js";
import { getAppContext } from "../../../../src/web/runtime.js";

export const dynamic = "force-dynamic";

export default async function CalibrationCandidateImportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const context = await getAppContext("MANAGE_CALIBRATION");
  const view = await new CalibrationService(context.pool).getRunView(context.organization.id, runId);
  if (view === null) notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Calibración · {view.run.partition}</span>
          <h1>Importar candidatos</h1>
          <p className="muted">
            {view.run.name} · {view.cases.length} casos congelados · {view.evaluatedCount} ya evaluados.
          </p>
        </div>
        <Link className="button button-secondary" href={`/calibration/${runId}`}>Volver a la corrida</Link>
      </div>

      {view.run.status === "COMPLETED" ? (
        <section className="card card-pad">
          <span className="eyebrow">Corrida cerrada</span>
          <h2 style={{ marginTop: 6 }}>No admite nuevas cargas</h2>
          <p className="muted">Las corridas completadas son inmutables. Crea una nueva corrida si necesitas evaluar otro candidato.</p>
          <Link className="button" href="/calibration">Ver corridas</Link>
        </section>
      ) : (
        <CalibrationCandidateImportForm runId={runId} partition={view.run.partition} />
      )}
    </>
  );
}
