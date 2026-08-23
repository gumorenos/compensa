import Link from "next/link";
import { getGoldStandardListPageData } from "../../src/web/gold-standard-runtime.js";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function GoldStandardPage() {
  const data = await getGoldStandardListPageData();
  const calibrationCount = data.cases.filter((item) => item.partition === "CALIBRATION").length;
  const holdoutCount = data.cases.filter((item) => item.partition === "HOLDOUT").length;
  const anchorCount = data.cases.filter((item) => item.isAnchor).length;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Calibración</span>
          <h1>Gold Standard</h1>
          <p className="muted">
            Referencias expertas inmutables para calibrar y evaluar futuras propuestas automáticas sin mezclar el conjunto de ajuste con el holdout.
          </p>
        </div>
        {data.canManage && (
          <Link className="button" href="/gold-standard/import">
            Importar históricos
          </Link>
        )}
      </div>

      <dl className="metadata card card-pad" style={{ marginBottom: 24 }}>
        <div>
          <dt>Referencias</dt>
          <dd>{data.cases.length}</dd>
        </div>
        <div>
          <dt>Calibración</dt>
          <dd>{calibrationCount}</dd>
        </div>
        <div>
          <dt>Holdout</dt>
          <dd>{holdoutCount}</dd>
        </div>
        <div>
          <dt>Anclas</dt>
          <dd>{anchorCount}</dd>
        </div>
      </dl>

      <section className="card" style={{ marginBottom: 28 }}>
        <div className="card-pad section-head">
          <div>
            <span className="eyebrow">Dataset experto</span>
            <h2 style={{ marginTop: 6 }}>Referencias validadas</h2>
          </div>
          {!data.canManage && <span className="badge">Modo lectura</span>}
        </div>

        {data.cases.length === 0 ? (
          <div className="empty">
            <h2>Aún no hay referencias</h2>
            <p>
              Captura una valoración aprobada o, si eres ADMIN, importa referencias históricas anonimizadas. En ambos casos Compensa congela metodología, descriptivo, decisiones, evidencia y resultado reproducible.
            </p>
            {data.canManage && (
              <Link className="button" href="/gold-standard/import">
                Importar referencias históricas
              </Link>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Caso</th>
                  <th>Referencia</th>
                  <th>Partición</th>
                  <th>Ancla</th>
                  <th>Puntos</th>
                  <th>Grado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="job-link" href={`/gold-standard/${item.id}`}>
                        {item.caseCode}
                      </Link>
                    </td>
                    <td>{item.anonymizedLabel}</td>
                    <td><span className="badge">{item.partition}</span></td>
                    <td>{item.isAnchor ? <span className="badge badge-success">Sí</span> : "—"}</td>
                    <td>{item.expectedTotalPoints ?? "—"}</td>
                    <td>{item.expectedGradeCode ?? "—"}</td>
                    <td>
                      <span className={`badge ${item.status === "VALIDATED" ? "badge-success" : "badge-warning"}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.canManage && (
        <section className="card">
          <div className="card-pad section-head">
            <div>
              <span className="eyebrow">Administración</span>
              <h2 style={{ marginTop: 6 }}>Valoraciones aprobadas disponibles</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                Solo aparecen valoraciones aprobadas que aún no fueron convertidas en referencia experta.
              </p>
            </div>
            <span className="badge">{data.candidates.length} disponibles</span>
          </div>

          {data.candidates.length === 0 ? (
            <div className="empty">
              <h2>No hay nuevas candidatas</h2>
              <p>Aprueba una valoración completa para poder incorporarla al Gold Standard.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Puesto</th>
                    <th>Valoración</th>
                    <th>Metodología</th>
                    <th>Puntos</th>
                    <th>Grado</th>
                    <th>Aprobada</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.candidates.map((item) => (
                    <tr key={item.valuationId}>
                      <td>
                        <strong>{item.jobName}</strong>
                        <div className="muted">{item.jobCode ?? item.department ?? "Sin código"}</div>
                      </td>
                      <td>v{item.valuationVersion}</td>
                      <td>{item.methodologyName} v{item.methodologyVersion}</td>
                      <td>{item.totalPoints}</td>
                      <td>{item.gradeCode}</td>
                      <td>{formatDate(item.approvedAt)}</td>
                      <td>
                        <Link className="button button-small" href={`/gold-standard/capture/${item.valuationId}`}>
                          Capturar
                        </Link>
                      </td>
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
