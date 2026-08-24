import Link from "next/link";
import { getComparablesPageData } from "../../src/web/comparables-runtime.js";

export const dynamic = "force-dynamic";

interface ComparablesPageProps {
  searchParams: Promise<{ valuationId?: string }>;
}

function signed(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : String(value);
}

function formatDate(value: Date | null): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ComparablesPage({ searchParams }: ComparablesPageProps) {
  const params = await searchParams;
  const data = await getComparablesPageData(params.valuationId);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Consistencia interna</span>
          <h1>Comparables internos</h1>
          <p className="muted">
            Compara valoraciones <b>APPROVED</b> de la misma versión metodológica para revisar consistencia horizontal y vertical. Esta vista no consulta Gold Standard ni HOLDOUT.
          </p>
        </div>
      </div>

      <div className="notice" style={{ marginBottom: 24 }}>
        <strong>Orden transparente.</strong>
        <span>
          Los comparables se ordenan por |Δ grado| → |Δ puntos| → suma de saltos de nivel. No existe un score de similitud ni una etiqueta automática de outlier.
        </span>
      </div>

      {data.valuations.length === 0 ? (
        <section className="card empty">
          <h2>Aún no hay valoraciones aprobadas</h2>
          <p>Aprueba al menos una valoración para usarla como base de comparación.</p>
          <Link className="button" href="/">Volver a puestos</Link>
        </section>
      ) : (
        <>
          <section className="card" style={{ marginBottom: 28 }}>
            <div className="card-pad section-head">
              <div>
                <span className="eyebrow">Base de comparación</span>
                <h2 style={{ marginTop: 6 }}>Valoraciones aprobadas</h2>
              </div>
              <span className="badge">{data.valuations.length}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Puesto</th>
                    <th>Metodología</th>
                    <th>Resultado</th>
                    <th>Aprobada</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {data.valuations.map((valuation) => (
                    <tr key={valuation.valuationId}>
                      <td>
                        <strong>{valuation.jobName}</strong>
                        <div className="muted">
                          {valuation.jobCode ?? "Sin código"} · v{valuation.valuationVersion}
                        </div>
                      </td>
                      <td>
                        {valuation.methodologyName} v{valuation.methodologyVersion}
                        <div className="muted"><code>{valuation.methodologyCode}</code></div>
                      </td>
                      <td>{valuation.totalPoints} pts · <b>{valuation.gradeCode}</b></td>
                      <td>{formatDate(valuation.approvedAt)}</td>
                      <td>
                        <Link
                          className={`button button-small ${data.selectedValuationId === valuation.valuationId ? "button-secondary" : ""}`}
                          href={`/comparables?valuationId=${encodeURIComponent(valuation.valuationId)}`}
                        >
                          {data.selectedValuationId === valuation.valuationId ? "Seleccionada" : "Comparar"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.selectedValuationId !== null && data.report === null && (
            <section className="notice" style={{ marginBottom: 28 }}>
              <strong>Base no disponible.</strong>
              <span>La valoración indicada no existe, no pertenece a esta organización o no está APPROVED.</span>
            </section>
          )}

          {data.report !== null && (
            <>
              <section className="card card-pad" style={{ marginBottom: 28 }}>
                <span className="eyebrow">Base seleccionada</span>
                <h2 style={{ marginTop: 6 }}>{data.report.base.jobName} · v{data.report.base.valuationVersion}</h2>
                <dl className="metadata" style={{ marginBottom: 0 }}>
                  <div><dt>Puntos</dt><dd>{data.report.base.totalPoints}</dd></div>
                  <div><dt>Grado</dt><dd>{data.report.base.gradeCode}</dd></div>
                  <div><dt>Familia</dt><dd>{data.report.base.jobFamily ?? "—"}</dd></div>
                  <div><dt>Departamento</dt><dd>{data.report.base.department ?? "—"}</dd></div>
                  <div><dt>Metodología</dt><dd>{data.report.base.methodologyName} v{data.report.base.methodologyVersion}</dd></div>
                  <div><dt>Comparables</dt><dd>{data.report.comparableCount}</dd></div>
                </dl>
              </section>

              {data.report.candidates.length === 0 ? (
                <section className="card empty">
                  <h2>No hay comparables compatibles</h2>
                  <p>No existen otras valoraciones APPROVED con exactamente la misma versión metodológica.</p>
                </section>
              ) : (
                <div className="stack">
                  {data.report.candidates.map((candidate, index) => (
                    <section className="card" key={candidate.valuationId}>
                      <div className="card-pad section-head">
                        <div>
                          <span className="eyebrow">#{index + 1} por cercanía observable</span>
                          <h2 style={{ marginTop: 6 }}>{candidate.jobName} · v{candidate.valuationVersion}</h2>
                          <p className="muted" style={{ marginBottom: 0 }}>
                            {candidate.jobCode ?? "Sin código"}
                            {candidate.sameJob ? " · historial del mismo puesto" : ""}
                          </p>
                        </div>
                        <Link className="button button-small button-secondary" href={`/valuations/${candidate.valuationId}`}>
                          Ver valoración
                        </Link>
                      </div>

                      <dl className="metadata card-pad" style={{ margin: 0, borderTop: "1px solid var(--border)" }}>
                        <div><dt>Puntos</dt><dd>{candidate.totalPoints}</dd></div>
                        <div><dt>Δ puntos</dt><dd>{signed(candidate.pointDifference)}</dd></div>
                        <div><dt>Grado</dt><dd>{candidate.gradeCode}</dd></div>
                        <div><dt>Δ grado</dt><dd>{signed(candidate.gradeDistance)}</dd></div>
                        <div><dt>Dimensiones exactas</dt><dd>{candidate.exactDimensionMatches}/{candidate.comparedDimensions}</dd></div>
                        <div><dt>Suma saltos de nivel</dt><dd>{candidate.totalLevelDistance}</dd></div>
                        <div><dt>Misma familia</dt><dd>{candidate.sameJobFamily ? "Sí" : "No"}</dd></div>
                        <div><dt>Mismo departamento</dt><dd>{candidate.sameDepartment ? "Sí" : "No"}</dd></div>
                      </dl>

                      <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
                        {candidate.dimensionDifferences.length === 0 ? (
                          <p style={{ margin: 0 }}>Las dimensiones comparables tienen exactamente los mismos niveles seleccionados.</p>
                        ) : (
                          <details>
                            <summary>
                              Ver {candidate.dimensionDifferences.length} diferencia{candidate.dimensionDifferences.length === 1 ? "" : "s"} por dimensión
                            </summary>
                            <div className="table-wrap" style={{ marginTop: 14 }}>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Factor / dimensión</th>
                                    <th>Base</th>
                                    <th>Comparable</th>
                                    <th>Distancia</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {candidate.dimensionDifferences.map((difference) => (
                                    <tr key={difference.dimensionCode}>
                                      <td>
                                        {difference.dimensionName}
                                        <div className="muted">{difference.factorName} · <code>{difference.dimensionCode}</code></div>
                                      </td>
                                      <td>{difference.baseLevelLabel} <code>{difference.baseLevelCode}</code></td>
                                      <td>{difference.candidateLevelLabel} <code>{difference.candidateLevelCode}</code></td>
                                      <td>{difference.levelDistance ?? "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
