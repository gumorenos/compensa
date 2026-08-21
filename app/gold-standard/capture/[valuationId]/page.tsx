import Link from "next/link";
import { notFound } from "next/navigation";
import { captureGoldStandardAction } from "../../../../src/web/gold-standard-actions.js";
import { getGoldStandardCapturePageData } from "../../../../src/web/gold-standard-runtime.js";

export const dynamic = "force-dynamic";

export default async function GoldStandardCapturePage({
  params,
}: {
  params: Promise<{ valuationId: string }>;
}) {
  const { valuationId } = await params;
  const data = await getGoldStandardCapturePageData(valuationId);
  if (data === null) notFound();

  if (data.existingCase !== null) {
    return (
      <div className="card card-pad form-card">
        <span className="eyebrow">Gold Standard</span>
        <h1>Referencia ya capturada</h1>
        <p className="muted">
          Esta valoración aprobada ya está representada por el caso {data.existingCase.caseCode}.
        </p>
        <div className="form-actions">
          <Link className="button" href={`/gold-standard/${data.existingCase.id}`}>
            Ver referencia
          </Link>
          <Link className="button button-secondary" href="/gold-standard">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Nueva referencia experta</span>
          <h1>Capturar valoración aprobada</h1>
          <p className="muted">
            Se congelarán el puesto, descriptivo, metodología, decisiones, justificaciones, evidencias y resultado de esta valoración.
          </p>
        </div>
      </div>

      <div className="detail-grid">
        <section className="card card-pad form-card">
          <form action={captureGoldStandardAction} className="stack">
            <input type="hidden" name="valuationId" value={data.valuation.id} />

            <div className="form-grid">
              <div className="field">
                <label htmlFor="caseCode">Código del caso *</label>
                <input
                  id="caseCode"
                  name="caseCode"
                  type="text"
                  required
                  placeholder="Ej. GS-FIN-001"
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label htmlFor="partition">Partición inicial *</label>
                <select id="partition" name="partition" defaultValue="UNASSIGNED" required>
                  <option value="UNASSIGNED">UNASSIGNED — decidir después</option>
                  <option value="CALIBRATION">CALIBRATION — ajuste/calibración</option>
                  <option value="HOLDOUT">HOLDOUT — evaluación independiente</option>
                </select>
              </div>

              <div className="field field-full">
                <label htmlFor="anonymizedLabel">Etiqueta anonimizada *</label>
                <input
                  id="anonymizedLabel"
                  name="anonymizedLabel"
                  type="text"
                  required
                  placeholder="Ej. Jefatura financiera — referencia 01"
                  autoComplete="off"
                />
                <small className="muted">Evita nombres de personas, unidades identificables o información sensible.</small>
              </div>

              <div className="field field-full">
                <label htmlFor="notes">Notas internas</label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  placeholder="Contexto de calibración, comité o criterio de selección del caso. No incluyas datos personales innecesarios."
                />
              </div>
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input type="checkbox" name="isAnchor" />
              <span>
                <strong>Marcar como puesto ancla</strong>
                <small className="muted" style={{ display: "block", marginTop: 3 }}>
                  Úsalo solo si es una referencia interna especialmente confiable para contrastar consistencia vertical u horizontal.
                </small>
              </span>
            </label>

            <div className="notice notice-warning" style={{ margin: 0 }}>
              <strong>La verdad experta se vuelve inmutable.</strong>
              <span>Después de capturar podrás administrar la partición y el estado de ancla, pero el score, la metodología, el descriptivo, las decisiones y las evidencias expertas permanecerán congelados.</span>
            </div>

            <div className="form-actions">
              <button className="button" type="submit">Crear referencia Gold Standard</button>
              <Link className="button button-secondary" href="/gold-standard">Cancelar</Link>
            </div>
          </form>
        </section>

        <aside className="stack">
          <section className="card card-pad summary-card">
            <span className="eyebrow">Fuente aprobada</span>
            <h2 style={{ marginTop: 6 }}>{data.job.name}</h2>
            <ul>
              <li><strong>Valoración:</strong> v{data.valuation.version}</li>
              <li><strong>Estado:</strong> {data.valuation.status}</li>
              <li><strong>Puntos:</strong> {data.valuation.totalPoints}</li>
              <li><strong>Grado:</strong> {data.valuation.gradeCode}</li>
              <li><strong>Metodología:</strong> {data.methodology.name} v{data.methodology.version}</li>
              <li><strong>Área:</strong> {data.job.area ?? data.job.department ?? "—"}</li>
            </ul>
            <div className="form-actions">
              <Link className="button button-secondary" href={`/valuations/${data.valuation.id}`}>
                Revisar valoración
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
