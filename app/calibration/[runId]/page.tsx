import Link from "next/link";
import { notFound } from "next/navigation";
import {
  completeCalibrationRunAction,
  saveCalibrationCaseAction,
} from "../../../src/web/calibration-actions.js";
import { getCalibrationRunPageData } from "../../../src/web/calibration-runtime.js";

export const dynamic = "force-dynamic";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

export default async function CalibrationRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const data = await getCalibrationRunPageData(runId);
  if (data === null) notFound();
  const { view, canManage } = data;
  const { run } = view;
  const completed = run.status === "COMPLETED";
  const holdoutBlind = run.partition === "HOLDOUT" && !completed;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="status-line">
            <span className="eyebrow">Calibración · {run.partition}</span>
            <span className={`badge ${completed ? "badge-success" : "badge-warning"}`}>{run.status}</span>
          </div>
          <h1>{run.name}</h1>
          <p className="muted">
            {run.candidateLabel ?? "Valoración manual"} · {view.evaluatedCount}/{view.cases.length} casos evaluados
          </p>
        </div>
        <Link className="button button-secondary" href="/calibration">Volver</Link>
      </div>

      {holdoutBlind ? (
        <div className="notice">
          <strong>Holdout ciego activo.</strong>
          <span>Las decisiones expertas, puntos, grado y métricas permanecen ocultos hasta completar todos los casos. Esto reduce el riesgo de ajustar el candidato usando el conjunto de evaluación.</span>
        </div>
      ) : (
        <div className="notice notice-success">
          <strong>{completed ? "Corrida congelada." : "Feedback de calibración activo."}</strong>
          <span>{completed ? "Las selecciones candidatas y el resumen ya no pueden modificarse." : "Después de guardar un caso podrás comparar sus decisiones con la referencia experta."}</span>
        </div>
      )}

      {view.liveSummary !== null && (
        <section className="card card-pad" style={{ marginTop: 24, marginBottom: 24 }}>
          <span className="eyebrow">Resumen {completed ? "final" : "parcial"}</span>
          <h2 style={{ marginTop: 6 }}>Métricas agregadas</h2>
          <p className="muted">No se aplica ningún umbral automático de “bueno/malo”. Estas métricas describen el comportamiento observado.</p>
          <dl className="metadata" style={{ margin: 0 }}>
            <div><dt>Casos</dt><dd>{view.liveSummary.caseCount}</dd></div>
            <div><dt>Dimensión exacta</dt><dd>{pct(view.liveSummary.exactDimensionAgreementRate)}</dd></div>
            <div><dt>Dimensión ±1 nivel</dt><dd>{pct(view.liveSummary.withinOneLevelRate)}</dd></div>
            <div><dt>Grado exacto</dt><dd>{pct(view.liveSummary.gradeMatchRate)}</dd></div>
            <div><dt>Grado ±1</dt><dd>{pct(view.liveSummary.gradeWithinOneRate)}</dd></div>
            <div><dt>Distancia grado media</dt><dd>{num(view.liveSummary.meanGradeDistance)}</dd></div>
            <div><dt>MAE puntos</dt><dd>{num(view.liveSummary.meanAbsolutePointDifference)}</dd></div>
            <div><dt>MAPE puntos</dt><dd>{view.liveSummary.meanAbsolutePointDifferencePercent === null ? "—" : `${view.liveSummary.meanAbsolutePointDifferencePercent.toFixed(2)}%`}</dd></div>
            <div><dt>Sesgo medio puntos</dt><dd>{num(view.liveSummary.meanSignedPointDelta)}</dd></div>
            <div><dt>Distancia nivel media</dt><dd>{num(view.liveSummary.meanAbsoluteLevelDistance)}</dd></div>
            <div><dt>Distancia nivel máxima</dt><dd>{num(view.liveSummary.maxLevelDistance, 0)}</dd></div>
            <div><dt>Mayor diferencia puntos</dt><dd>{num(view.liveSummary.largestAbsolutePointDifference)}</dd></div>
          </dl>
        </section>
      )}

      <section className="stack" style={{ marginTop: 24 }}>
        {view.cases.map((item, index) => {
          const revealFeedback = completed || (run.partition === "CALIBRATION" && item.comparison !== null);
          const comparisonByDimension = new Map(
            item.comparison?.dimensions.map((dimension) => [dimension.dimensionCode, dimension]) ?? [],
          );
          return (
            <details className="card details-block" key={item.caseId} open={index === 0 && !completed}>
              <summary>
                {item.caseCodeSnapshot} · {item.anonymizedLabelSnapshot} · {item.comparison === null ? "Pendiente" : "Evaluado"}
              </summary>
              <div className="card-pad">
                <div className="section-head" style={{ alignItems: "flex-start" }}>
                  <div>
                    <span className="eyebrow">Puesto</span>
                    <h3 style={{ marginTop: 6 }}>{item.jobSnapshot.name}</h3>
                    <p className="muted">
                      {[item.jobSnapshot.department, item.jobSnapshot.area, item.jobSnapshot.jobFamily].filter(Boolean).join(" · ") || "Sin clasificación adicional"}
                    </p>
                  </div>
                  <span className={`badge ${item.comparison === null ? "badge-warning" : "badge-success"}`}>
                    {item.comparison === null ? "Pendiente" : "Guardado"}
                  </span>
                </div>

                {item.descriptionSnapshot !== null && (
                  <details style={{ marginBottom: 18 }}>
                    <summary>Ver descriptivo congelado</summary>
                    <div className="description-text" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{item.descriptionSnapshot}</div>
                  </details>
                )}

                <form action={saveCalibrationCaseAction} className="stack">
                  <input type="hidden" name="runId" value={run.id} />
                  <input type="hidden" name="caseId" value={item.caseId} />
                  {item.methodologySnapshot.factors.map((factor) => (
                    <div key={factor.code}>
                      <h3>{factor.name}</h3>
                      <div className="stack">
                        {factor.dimensions.map((dimension) => {
                          const candidateLevel = item.candidateSelections?.[dimension.code] ?? "";
                          const comparison = comparisonByDimension.get(dimension.code);
                          return (
                            <div className="field" key={dimension.code}>
                              <label htmlFor={`${item.caseId}-${dimension.code}`}>
                                {dimension.name} <code>{dimension.code}</code>{dimension.required ? " *" : ""}
                              </label>
                              {canManage && !completed ? (
                                <select
                                  id={`${item.caseId}-${dimension.code}`}
                                  name={`selection__${dimension.code}`}
                                  defaultValue={candidateLevel}
                                  required={dimension.required}
                                >
                                  <option value="">Seleccionar…</option>
                                  {dimension.levels.map((level) => (
                                    <option key={level.code} value={level.code}>{level.code} · {level.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <div>{candidateLevel === "" ? "—" : candidateLevel}</div>
                              )}
                              {revealFeedback && comparison !== undefined && (
                                <small className={comparison.exactMatch ? "muted" : ""}>
                                  Referencia: <strong>{comparison.referenceLevelCode}</strong> · Candidato: <strong>{comparison.candidateLevelCode ?? "—"}</strong> · Distancia: {comparison.levelDistance ?? "—"}
                                  {comparison.exactMatch ? " · exacto" : comparison.withinOneLevel ? " · dentro de ±1 nivel" : ""}
                                </small>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {canManage && !completed && (
                    <div className="form-actions"><button className="button" type="submit">Guardar candidato</button></div>
                  )}
                </form>

                {revealFeedback && item.comparison !== null && (
                  <div className="card" style={{ marginTop: 20 }}>
                    <dl className="metadata card-pad" style={{ margin: 0 }}>
                      <div><dt>Puntos experto</dt><dd>{item.comparison.metrics.referencePoints}</dd></div>
                      <div><dt>Puntos candidato</dt><dd>{item.comparison.metrics.candidatePoints}</dd></div>
                      <div><dt>Diferencia</dt><dd>{item.comparison.metrics.pointDelta > 0 ? "+" : ""}{item.comparison.metrics.pointDelta}</dd></div>
                      <div><dt>Grado experto</dt><dd>{item.comparison.metrics.referenceGradeCode}</dd></div>
                      <div><dt>Grado candidato</dt><dd>{item.comparison.metrics.candidateGradeCode}</dd></div>
                      <div><dt>Distancia grado</dt><dd>{item.comparison.metrics.gradeDistance}</dd></div>
                      <div><dt>Grado exacto</dt><dd>{item.comparison.metrics.gradeMatch ? "Sí" : "No"}</dd></div>
                      <div><dt>Grado ±1</dt><dd>{item.comparison.metrics.gradeWithinOne ? "Sí" : "No"}</dd></div>
                    </dl>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </section>

      {canManage && !completed && (
        <section className="card card-pad" style={{ marginTop: 28 }}>
          <span className="eyebrow">Cierre</span>
          <h2 style={{ marginTop: 6 }}>Completar corrida</h2>
          <p className="muted">
            {view.pendingCount === 0
              ? "Todos los casos tienen candidato. Al completar, la corrida y sus resultados quedan inmutables."
              : `Faltan ${view.pendingCount} caso${view.pendingCount === 1 ? "" : "s"}. El cierre permanece bloqueado hasta evaluarlos todos.`}
          </p>
          <form action={completeCalibrationRunAction}>
            <input type="hidden" name="runId" value={run.id} />
            <button className="button" type="submit" disabled={view.pendingCount > 0}>
              Completar y congelar corrida
            </button>
          </form>
        </section>
      )}

      {completed && view.deviations.length > 0 && (
        <section className="card" style={{ marginTop: 28 }}>
          <div className="card-pad">
            <span className="eyebrow">Revisión</span>
            <h2 style={{ marginTop: 6 }}>Mayores desviaciones observadas</h2>
            <p className="muted" style={{ marginBottom: 0 }}>Ordenadas primero por discrepancia/distancia de grado y luego por diferencia absoluta de puntos. No se etiqueta ningún caso como outlier sin un criterio acordado.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Caso</th><th>Diferencia puntos</th><th>Grado experto</th><th>Grado candidato</th><th>Distancia grado</th><th>Distancia máxima nivel</th></tr></thead>
              <tbody>
                {view.deviations.map((item) => (
                  <tr key={item.caseId}>
                    <td>{item.caseCodeSnapshot} · {item.anonymizedLabelSnapshot}</td>
                    <td>{item.comparison?.metrics.absolutePointDifference ?? "—"}</td>
                    <td>{item.referenceGradeCode}</td>
                    <td>{item.candidateGradeCode ?? "—"}</td>
                    <td>{item.comparison?.metrics.gradeDistance ?? "—"}</td>
                    <td>{item.comparison?.metrics.maxLevelDistance ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
