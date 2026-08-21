import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveValuationAction,
  deleteEvidenceAction,
  returnForChangesAction,
  saveDecisionAction,
  saveDecisionSupportAction,
  submitForReviewAction,
} from "../../../src/web/actions.js";
import { getValuationPageData } from "../../../src/web/runtime.js";

export const dynamic = "force-dynamic";

const evidenceLabels = {
  JOB_DESCRIPTION: "Descriptivo del puesto",
  INTERVIEW: "Entrevista / comité",
  OTHER: "Otra fuente",
} as const;

export default async function ValuationPage({
  params,
}: {
  params: Promise<{ valuationId: string }>;
}) {
  const { valuationId } = await params;
  const data = await getValuationPageData(valuationId);
  if (data === null) notFound();

  const selected = new Map(
    data.decisions.map((decision) => [decision.dimensionCode, decision.selectedLevelCode]),
  );
  const decisionByDimension = new Map(
    data.decisions.map((decision) => [decision.dimensionCode, decision]),
  );
  const evidenceByDecision = new Map<string, typeof data.evidence>();
  for (const item of data.evidence) {
    const current = evidenceByDecision.get(item.decisionId) ?? [];
    current.push(item);
    evidenceByDecision.set(item.decisionId, current);
  }

  const dimensions = data.methodology.definition.factors.flatMap((factor) => factor.dimensions);
  const requiredCount = dimensions.filter((dimension) => dimension.required).length;
  const completedRequired = dimensions.filter(
    (dimension) => dimension.required && selected.has(dimension.code),
  ).length;
  const justifiedRequired = dimensions.filter((dimension) => {
    if (!dimension.required) return false;
    const justification = decisionByDimension.get(dimension.code)?.justification;
    return justification !== null && justification !== undefined && justification.trim() !== "";
  }).length;
  const progress = requiredCount === 0 ? 100 : Math.round((completedRequired / requiredCount) * 100);
  const statusEditable = data.valuationStatus === "DRAFT" || data.valuationStatus === "RETURNED";
  const editable = statusEditable && data.capabilities.canEvaluate;
  const canSubmit = statusEditable && data.capabilities.canSubmitReview;
  const inReview = data.valuationStatus === "IN_REVIEW";
  const canReview = inReview && data.capabilities.canReview;
  const approved = data.valuationStatus === "APPROVED";
  const readyForReview =
    data.totalPoints !== null &&
    data.gradeCode !== null &&
    justifiedRequired === requiredCount;
  const lastReturn = [...data.reviewActions]
    .reverse()
    .find((item) => item.action === "RETURNED");

  return (
    <>
      <div className="valuation-head">
        <div>
          <div className="status-line">
            <span className="eyebrow">Valoración · versión {data.valuationVersion}</span>
            <span className={`badge ${approved ? "badge-success" : inReview ? "badge-review" : "badge-warning"}`}>
              {data.valuationStatus}
            </span>
          </div>
          <h1>{data.job.name}</h1>
          <p className="muted">
            {data.methodology.name} v{data.methodology.version} · {completedRequired}/{requiredCount} decisiones · {justifiedRequired}/{requiredCount} justificadas
          </p>
          <div className="progress" aria-label={`Progreso ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="score-box">
          <small>{data.totalPoints === null ? "Resultado pendiente" : "Puntaje calculado"}</small>
          <strong>{data.totalPoints ?? "—"}</strong>
          <span>{data.gradeCode === null ? `${progress}% completo` : `Grado ${data.gradeCode}`}</span>
        </div>
      </div>

      {data.valuationStatus === "RETURNED" && lastReturn?.comment !== null && lastReturn?.comment !== undefined && (
        <div className="notice notice-warning">
          <strong>Devuelta para cambios.</strong>
          <span>{lastReturn.comment}</span>
        </div>
      )}

      {statusEditable && !data.capabilities.canEvaluate && (
        <div className="notice">
          <strong>Modo lectura.</strong>
          <span>Tu rol puede consultar esta valoración, pero no editar sus decisiones.</span>
        </div>
      )}

      {approved && (
        <div className="notice notice-success">
          <strong>Valoración aprobada e inmutable.</strong>
          <span>Los niveles, fundamentos y evidencias ya no pueden modificarse.</span>
        </div>
      )}

      <div className="detail-grid valuation-layout">
        <div className="stack">
          {data.methodology.definition.factors.map((factor) => (
            <section className="card factor" key={factor.code}>
              <div className="factor-title">
                <span className="eyebrow">Factor</span>
                <h2>{factor.name}</h2>
                {factor.description !== undefined && <p className="muted">{factor.description}</p>}
              </div>

              {factor.dimensions.map((dimension) => {
                const decision = decisionByDimension.get(dimension.code);
                const decisionEvidence = decision === undefined
                  ? []
                  : evidenceByDecision.get(decision.id) ?? [];
                const hasJustification =
                  decision?.justification !== null &&
                  decision?.justification !== undefined &&
                  decision.justification.trim() !== "";

                return (
                  <div className="dimension" key={dimension.code}>
                    <div className="dimension-head">
                      <div>
                        <h3>{dimension.name}</h3>
                        {dimension.description !== undefined && (
                          <div className="muted">{dimension.description}</div>
                        )}
                      </div>
                      <div className="badge-row">
                        {selected.has(dimension.code) ? (
                          <span className="badge badge-success">Nivel elegido</span>
                        ) : dimension.required ? (
                          <span className="badge badge-warning">Nivel pendiente</span>
                        ) : (
                          <span className="badge">Opcional</span>
                        )}
                        {hasJustification && <span className="badge badge-evidence">Justificada</span>}
                      </div>
                    </div>

                    <div className="levels">
                      {dimension.levels.map((level) => {
                        const isSelected = selected.get(dimension.code) === level.code;
                        return editable ? (
                          <form action={saveDecisionAction} className="level-form" key={level.code}>
                            <input type="hidden" name="valuationId" value={data.valuationId} />
                            <input type="hidden" name="dimensionCode" value={dimension.code} />
                            <input type="hidden" name="selectedLevelCode" value={level.code} />
                            <button
                              type="submit"
                              className={`level-option${isSelected ? " selected" : ""}`}
                              aria-pressed={isSelected}
                            >
                              <span>
                                <strong>{level.code} · {level.label}</strong>
                                {level.description !== undefined && <small>{level.description}</small>}
                              </span>
                              <span>{isSelected ? "✓" : ""}</span>
                            </button>
                          </form>
                        ) : (
                          <div
                            className={`level-option readonly${isSelected ? " selected" : ""}`}
                            key={level.code}
                          >
                            <span>
                              <strong>{level.code} · {level.label}</strong>
                              {level.description !== undefined && <small>{level.description}</small>}
                            </span>
                            <span>{isSelected ? "✓" : ""}</span>
                          </div>
                        );
                      })}
                    </div>

                    {decision !== undefined && (
                      <div className="support-block">
                        <div className="support-head">
                          <div>
                            <span className="eyebrow">Fundamento</span>
                            <h3>{hasJustification ? "Justificación registrada" : "Falta justificar la decisión"}</h3>
                          </div>
                          <span className="badge">{decisionEvidence.length} evidencia{decisionEvidence.length === 1 ? "" : "s"}</span>
                        </div>

                        {decision.justification !== null && (
                          <p className="justification-text">{decision.justification}</p>
                        )}

                        {decisionEvidence.length > 0 && (
                          <div className="evidence-list">
                            {decisionEvidence.map((item) => (
                              <div className="evidence-item" key={item.id}>
                                <div>
                                  <strong>{evidenceLabels[item.sourceType]}</strong>
                                  {item.sourceSection !== null && <span> · {item.sourceSection}</span>}
                                </div>
                                <blockquote>{item.excerpt}</blockquote>
                                {editable && (
                                  <form action={deleteEvidenceAction}>
                                    <input type="hidden" name="valuationId" value={data.valuationId} />
                                    <input type="hidden" name="evidenceId" value={item.id} />
                                    <button type="submit" className="text-button">Eliminar evidencia</button>
                                  </form>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {editable && (
                          <details className="details-block support-editor" open={!hasJustification}>
                            <summary>{hasJustification ? "Editar fundamento / añadir evidencia" : "Agregar fundamento"}</summary>
                            <form action={saveDecisionSupportAction} className="stack compact-stack">
                              <input type="hidden" name="valuationId" value={data.valuationId} />
                              <input type="hidden" name="dimensionCode" value={dimension.code} />
                              <div className="field">
                                <label htmlFor={`justification-${dimension.code}`}>Justificación *</label>
                                <textarea
                                  id={`justification-${dimension.code}`}
                                  name="justification"
                                  rows={4}
                                  defaultValue={decision.justification ?? ""}
                                  placeholder="Explica por qué el nivel seleccionado representa el alcance real del puesto."
                                />
                              </div>
                              <div className="evidence-grid">
                                <div className="field">
                                  <label htmlFor={`source-${dimension.code}`}>Fuente de evidencia</label>
                                  <select
                                    id={`source-${dimension.code}`}
                                    name="evidenceSourceType"
                                    defaultValue={data.description === null ? "INTERVIEW" : "JOB_DESCRIPTION"}
                                  >
                                    {data.description !== null && (
                                      <option value="JOB_DESCRIPTION">Descriptivo del puesto</option>
                                    )}
                                    <option value="INTERVIEW">Entrevista / comité</option>
                                    <option value="OTHER">Otra fuente</option>
                                  </select>
                                </div>
                                <div className="field">
                                  <label htmlFor={`section-${dimension.code}`}>Sección / referencia</label>
                                  <input
                                    id={`section-${dimension.code}`}
                                    name="evidenceSection"
                                    type="text"
                                    placeholder="Ej. Responsabilidades"
                                  />
                                </div>
                              </div>
                              <div className="field">
                                <label htmlFor={`excerpt-${dimension.code}`}>Evidencia (opcional)</label>
                                <textarea
                                  id={`excerpt-${dimension.code}`}
                                  name="evidenceExcerpt"
                                  rows={3}
                                  placeholder={
                                    data.description === null
                                      ? "Ej. El gerente confirma que el puesto aprueba excepciones hasta cierto límite."
                                      : "Copia un pasaje exacto del descriptivo si eliges esa fuente."
                                  }
                                />
                              </div>
                              <div>
                                <button type="submit" className="button button-small">Guardar fundamento</button>
                              </div>
                            </form>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <aside className="stack">
          <section className="card card-pad summary-card">
            <span className="eyebrow">Resumen</span>
            <h2 style={{ marginTop: 6 }}>{data.gradeCode === null ? "Valoración en curso" : `Grado ${data.gradeCode}`}</h2>
            <ul>
              <li><strong>Estado:</strong> {data.valuationStatus}</li>
              <li><strong>Decisiones:</strong> {completedRequired}/{requiredCount}</li>
              <li><strong>Justificadas:</strong> {justifiedRequired}/{requiredCount}</li>
              <li><strong>Puntos:</strong> {data.totalPoints ?? "Pendiente"}</li>
              <li><strong>Metodología:</strong> {data.methodology.version}</li>
              <li><strong>Descriptivo:</strong> {data.description === null ? "Sin versión asociada" : `v${data.description.version}`}</li>
            </ul>
            <div className="form-actions">
              <Link href={`/jobs/${data.job.id}`} className="button button-secondary">Ver puesto</Link>
            </div>
          </section>

          <section className="card card-pad">
            <span className="eyebrow">Descriptivo evaluado</span>
            <h2 style={{ marginTop: 6 }}>
              {data.description === null ? "Sin descriptivo" : `Versión ${data.description.version}`}
            </h2>
            {data.description === null ? (
              <p className="muted">Esta valoración se inició sin un descriptivo anclado. La evidencia puede provenir de entrevista u otras fuentes.</p>
            ) : (
              <>
                <p className="muted">{data.description.sourceLabel ?? "Sin etiqueta de origen"}</p>
                <details className="details-block">
                  <summary>Ver contenido completo</summary>
                  <div className="description-preview compact">{data.description.content}</div>
                </details>
              </>
            )}
          </section>

          <section className="card card-pad">
            <span className="eyebrow">Workflow</span>
            <h2 style={{ marginTop: 6 }}>Revisión y aprobación</h2>

            {statusEditable && (
              <>
                <div className={`readiness ${readyForReview ? "ready" : ""}`}>
                  <strong>{readyForReview ? "Lista para revisión" : "Aún no está lista"}</strong>
                  <span>{completedRequired}/{requiredCount} niveles · {justifiedRequired}/{requiredCount} justificaciones</span>
                </div>
                {canSubmit ? (
                  <form action={submitForReviewAction} className="stack compact-stack">
                    <input type="hidden" name="valuationId" value={data.valuationId} />
                    <div className="field">
                      <label htmlFor="submit-comment">Comentario al revisor</label>
                      <textarea id="submit-comment" name="comment" rows={3} placeholder="Opcional" />
                    </div>
                    <button className="button" type="submit" disabled={!readyForReview}>Enviar a revisión</button>
                  </form>
                ) : (
                  <p className="muted">Tu rol no puede enviar valoraciones a revisión.</p>
                )}
              </>
            )}

            {inReview && (
              canReview ? (
                <>
                  <p className="muted">Como revisor puedes aprobar o devolver; las decisiones permanecen bloqueadas durante la revisión.</p>
                  <form action={approveValuationAction} className="stack compact-stack review-form">
                    <input type="hidden" name="valuationId" value={data.valuationId} />
                    <div className="field">
                      <label htmlFor="approve-comment">Comentario de aprobación</label>
                      <textarea id="approve-comment" name="comment" rows={3} placeholder="Opcional" />
                    </div>
                    <button className="button" type="submit">Aprobar valoración</button>
                  </form>
                  <form action={returnForChangesAction} className="stack compact-stack review-form">
                    <input type="hidden" name="valuationId" value={data.valuationId} />
                    <div className="field">
                      <label htmlFor="return-comment">Motivo de devolución *</label>
                      <textarea id="return-comment" name="comment" rows={3} required />
                    </div>
                    <button className="button button-secondary" type="submit">Devolver para cambios</button>
                  </form>
                </>
              ) : (
                <p className="muted">La valoración está en revisión. Tu rol no puede aprobarla ni devolverla.</p>
              )
            )}

            {approved && <p className="muted">La aprobación cerró la edición de esta versión.</p>}

            {data.reviewActions.length > 0 && (
              <div className="review-history">
                <h3>Historial</h3>
                {data.reviewActions.map((item) => (
                  <div className="review-event" key={item.id}>
                    <strong>{item.action}</strong>
                    <time>{item.createdAt.toLocaleString("es-PE")}</time>
                    {item.actor !== null && (
                      <div className="review-actor">{item.actor.name} · {item.actor.email}</div>
                    )}
                    {item.comment !== null && <p>{item.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {data.scoring !== null && (
            <section className="card card-pad">
              <span className="eyebrow">Trazabilidad</span>
              <h2 style={{ marginTop: 6 }}>Cómo se calculó</h2>
              <p className="muted">Cada valor viene del motor; la interfaz no calcula puntos.</p>
              <div className="trace">
                {data.scoring.trace.map((step) => (
                  <div className="trace-row" key={step.code}>
                    <span>{step.label ?? step.code}</span>
                    <strong>{step.output}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
