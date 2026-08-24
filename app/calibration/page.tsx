import Link from "next/link";
import { createCalibrationRunAction } from "../../src/web/calibration-actions.js";
import { getCalibrationListPageData } from "../../src/web/calibration-runtime.js";

export const dynamic = "force-dynamic";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function CalibrationPage() {
  const data = await getCalibrationListPageData();
  const calibrationScopes = data.scopes.filter((scope) => scope.partition === "CALIBRATION");
  const holdoutScopes = data.scopes.filter((scope) => scope.partition === "HOLDOUT");

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Gold Standard</span>
          <h1>Calibración</h1>
          <p className="muted">
            Compara valoraciones candidatas contra referencias expertas congeladas. Compensa reporta acuerdo por dimensión, distancia de nivel, diferencia de puntos y coincidencia de grado sin inventar umbrales de aprobación.
          </p>
        </div>
        <Link className="button button-secondary" href="/gold-standard">Ver Gold Standard</Link>
      </div>

      <div className="notice">
        <strong>Dos usos distintos.</strong>
        <span><b>CALIBRATION</b> permite ver feedback mientras ajustas un proceso. <b>HOLDOUT</b> oculta resultados de referencia hasta completar toda la corrida para evitar contaminar la evaluación final.</span>
      </div>

      <section className="card" style={{ marginTop: 24, marginBottom: 28 }}>
        <div className="card-pad section-head">
          <div>
            <span className="eyebrow">Historial</span>
            <h2 style={{ marginTop: 6 }}>Corridas</h2>
          </div>
          <span className="badge">{data.runs.length}</span>
        </div>
        {data.runs.length === 0 ? (
          <div className="empty">
            <h2>Aún no hay corridas</h2>
            <p>Asigna referencias validadas a CALIBRATION o HOLDOUT y crea una corrida para comenzar.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Corrida</th>
                  <th>Partición</th>
                  <th>Origen candidato</th>
                  <th>Estado</th>
                  <th>Casos</th>
                  <th>Grado exacto</th>
                  <th>Creada</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <Link className="job-link" href={`/calibration/${run.id}`}>{run.name}</Link>
                      <div className="muted">{run.candidateLabel ?? "Valoración manual"}</div>
                    </td>
                    <td><span className="badge">{run.partition}</span></td>
                    <td>{run.candidateSource}</td>
                    <td>
                      <span className={`badge ${run.status === "COMPLETED" ? "badge-success" : "badge-warning"}`}>
                        {run.status}
                      </span>
                    </td>
                    <td>{run.summary?.caseCount ?? "—"}</td>
                    <td>{run.summary === null ? "—" : `${(run.summary.gradeMatchRate * 100).toFixed(1)}%`}</td>
                    <td>{formatDate(run.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.canManage && (
        <section className="card card-pad">
          <span className="eyebrow">Nueva corrida</span>
          <h2 style={{ marginTop: 6 }}>Congelar un conjunto para comparar</h2>
          <p className="muted">
            La membresía de casos se congela al crear la corrida. Cambios posteriores de partición en el Gold Standard no alteran este historial.
          </p>

          {data.scopes.length === 0 ? (
            <div className="empty" style={{ paddingInline: 0 }}>
              <h3>No hay conjuntos disponibles</h3>
              <p>Necesitas referencias VALIDATED asignadas a CALIBRATION o HOLDOUT.</p>
              <Link className="button" href="/gold-standard">Administrar Gold Standard</Link>
            </div>
          ) : (
            <form action={createCalibrationRunAction} className="form-grid">
              <div className="field">
                <label htmlFor="calibration-name">Nombre *</label>
                <input id="calibration-name" name="name" required placeholder="Ej. Calibración manual agosto 2026" />
              </div>
              <div className="field">
                <label htmlFor="calibration-methodology">Metodología *</label>
                <select id="calibration-methodology" name="methodologyVersionId" required>
                  <option value="">Seleccionar…</option>
                  {Array.from(new Map(data.scopes.map((scope) => [scope.methodologyVersionId, scope])).values()).map((scope) => (
                    <option key={scope.methodologyVersionId} value={scope.methodologyVersionId}>
                      {scope.methodologyName} v{scope.methodologyVersion}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="calibration-partition">Partición *</label>
                <select id="calibration-partition" name="partition" required>
                  {calibrationScopes.length > 0 && <option value="CALIBRATION">CALIBRATION</option>}
                  {holdoutScopes.length > 0 && <option value="HOLDOUT">HOLDOUT</option>}
                </select>
              </div>
              <div className="field">
                <label htmlFor="calibration-label">Etiqueta del candidato</label>
                <input id="calibration-label" name="candidateLabel" placeholder="Ej. Revaloración ciega comité 2" />
              </div>
              <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
                <button className="button" type="submit">Crear corrida manual</button>
              </div>
            </form>
          )}

          {data.scopes.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 22 }}>
              <table>
                <thead><tr><th>Metodología</th><th>Partición</th><th>Casos disponibles</th></tr></thead>
                <tbody>
                  {data.scopes.map((scope) => (
                    <tr key={`${scope.methodologyVersionId}-${scope.partition}`}>
                      <td>{scope.methodologyName} v{scope.methodologyVersion}<div className="muted"><code>{scope.methodologyCode}</code></div></td>
                      <td><span className="badge">{scope.partition}</span></td>
                      <td>{scope.caseCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
