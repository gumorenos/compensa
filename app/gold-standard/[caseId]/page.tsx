import Link from "next/link";
import { notFound } from "next/navigation";
import {
  assignGoldStandardPartitionAction,
  setGoldStandardAnchorAction,
} from "../../../src/web/gold-standard-actions.js";
import { getGoldStandardCasePageData } from "../../../src/web/gold-standard-runtime.js";

export const dynamic = "force-dynamic";

const evidenceLabels = {
  JOB_DESCRIPTION: "Descriptivo del puesto",
  INTERVIEW: "Entrevista / comité",
  OTHER: "Otra fuente",
} as const;

export default async function GoldStandardCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const data = await getGoldStandardCasePageData(caseId);
  if (data === null) notFound();

  const { bundle } = data;
  const goldCase = bundle.case;
  const decisionByDimension = new Map(
    bundle.decisions.map((decision) => [decision.dimensionCode, decision]),
  );
  const evidenceByDecision = new Map<string, typeof bundle.evidence>();
  for (const item of bundle.evidence) {
    const current = evidenceByDecision.get(item.decisionId) ?? [];
    current.push(item);
    evidenceByDecision.set(item.decisionId, current);
  }

  return (
    <>
      <div className="valuation-head">
        <div>
          <div className="status-line">
            <span className="eyebrow">Gold Standard · {goldCase.caseCode}</span>
            <span className={`badge ${goldCase.status === "VALIDATED" ? "badge-success" : "badge-warning"}`}>
              {goldCase.status}
            </span>
          </div>
          <h1>{goldCase.anonymizedLabel}</h1>
          <p className="muted">
            {goldCase.methodologySnapshot.name} v{goldCase.methodologySnapshot.version} · {goldCase.partition}
            {goldCase.isAnchor ? " · puesto ancla" : ""}
          </p>
        </div>
        <div className="score-box">
          <small>Resultado experto</small>
          <strong>{goldCase.expectedTotalPoints ?? "—"}</strong>
          <span>{goldCase.expectedGradeCode === null ? "Sin grado" : `Grado ${goldCase.expectedGradeCode}`}</span>
        </div>
      </div>

      <div className="notice notice-success">
        <strong>Referencia congelada.</strong>
        <span>El descriptivo, metodología, decisiones, evidencias y resultado experto se conservan como snapshot histórico.</span>
      </div>

      <div className="detail-grid valuation-layout">
        <div className="stack">
          {goldCase.methodologySnapshot.factors.map((factor) => (
            <section className="card factor" key={factor.code}>
              <div className="factor-title">
                <span className="eyebrow">Factor</span>
                <h2>{factor.name}</h2>
                {factor.description !== undefined && <p className="muted">{factor.description}</p>}
              </div>

              {factor.dimensions.map((dimension) => {
                const decision = decisionByDimension.get(dimension.code);
                const level = decision === undefined
                  ? null
                  : dimension.levels.find((candidate) => candidate.code === decision.selectedLevelCode) ?? null;
                const evidence = decision === undefined
                  ? []
                  : evidenceByDecision.get(decision.id) ?? [];

                return (
                  <div className="dimension" key={dimension.code}>
                    <div className="dimension-head">
                      <div>
                        <h3>{dimension.name}</h3>
                        {dimension.description !== undefined && <div className="muted">{dimension.description}</div>}
                      </div>
                      {decision === undefined ? (
                        <span className="badge badge-warning">Sin decisión</span>
                      ) : (
                        <span className="badge badge-success">{decision.selectedLevelCode}</span>
                      )}
                    </div>

                    {decision !== undefined && (
                      <div className="support-block">
                        <div className="support-head">
                          <div>
                            <span className="eyebrow">Nivel experto</span>
                            <h3>{level === null ? decision.selectedLevelCode : `${level.code} · ${level.label}`}</h3>
                          </div>
                          <span className="badge">{evidence.length} evidencia{evidence.length === 1 ? "" : "s"}</span>
                        </div>

                        {decision.justification === null ? (
                          <p className="muted">Sin justificación textual almacenada.</p>
                        ) : (
                          <p className="justification-text">{decision.justification}</p>
                        )}

                        {evidence.length > 0 && (
                          <div className="evidence-list">
                            {evidence.map((item) => (
                              <div className="evidence-item" key={item.id}>
                                <div>
                                  <strong>{evidenceLabels[item.sourceType]}</strong>
                                  {item.sourceSection !== null && <span> · {item.sourceSection}</span>}
                                </div>
                                <blockquote>{item.excerpt}</blockquote>
                              </div>
                            ))}
                          </div>
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
            <span className="eyebrow">Referencia</span>
            <h2 style={{ marginTop: 6 }}>{goldCase.caseCode}</h2>
            <ul>
              <li><strong>Partición:</strong> {goldCase.partition}</li>
              <li><strong>Ancla:</strong> {goldCase.isAnchor ? "Sí" : "No"}</li>
              <li><strong>Puntos:</strong> {goldCase.expectedTotalPoints ?? "—"}</li>
              <li><strong>Grado:</strong> {goldCase.expectedGradeCode ?? "—"}</li>
              <li><strong>Fuente:</strong> {goldCase.sourceType}</li>
              <li><strong>Metodología:</strong> {goldCase.methodologySnapshot.version}</li>
            </ul>
            <div className="form-actions">
              <Link className="button button-secondary" href="/gold-standard">Volver</Link>
              {goldCase.sourceValuationId !== null && (
                <Link className="button button-secondary" href={`/valuations/${goldCase.sourceValuationId}`}>
                  Valoración fuente
                </Link>
              )}
            </div>
          </section>

          {data.canManage && goldCase.status === "VALIDATED" && (
            <section className="card card-pad">
              <span className="eyebrow">Administración</span>
              <h2 style={{ marginTop: 6 }}>Uso del benchmark</h2>
              <p className="muted">Estos cambios no alteran la verdad experta ni el score histórico.</p>

              <form action={assignGoldStandardPartitionAction} className="stack compact-stack">
                <input type="hidden" name="caseId" value={goldCase.id} />
                <div className="field">
                  <label htmlFor="partition">Partición</label>
                  <select id="partition" name="partition" defaultValue={goldCase.partition}>
                    <option value="UNASSIGNED">UNASSIGNED</option>
                    <option value="CALIBRATION">CALIBRATION</option>
                    <option value="HOLDOUT">HOLDOUT</option>
                  </select>
                </div>
                <button className="button button-small" type="submit">Guardar partición</button>
              </form>

              <form action={setGoldStandardAnchorAction} className="stack compact-stack review-form">
                <input type="hidden" name="caseId" value={goldCase.id} />
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="checkbox" name="isAnchor" defaultChecked={goldCase.isAnchor} />
                  <span>Usar como puesto ancla</span>
                </label>
                <button className="button button-small" type="submit">Guardar ancla</button>
              </form>
            </section>
          )}

          <section className="card card-pad">
            <span className="eyebrow">Snapshot del puesto</span>
            <h2 style={{ marginTop: 6 }}>{goldCase.jobSnapshot.name}</h2>
            <dl className="metadata" style={{ marginTop: 18 }}>
              <div><dt>Código</dt><dd>{goldCase.jobSnapshot.code ?? "—"}</dd></div>
              <div><dt>Área</dt><dd>{goldCase.jobSnapshot.area ?? "—"}</dd></div>
              <div><dt>Departamento</dt><dd>{goldCase.jobSnapshot.department ?? "—"}</dd></div>
              <div><dt>Familia</dt><dd>{goldCase.jobSnapshot.jobFamily ?? "—"}</dd></div>
            </dl>
          </section>

          <section className="card card-pad">
            <span className="eyebrow">Descriptivo congelado</span>
            <h2 style={{ marginTop: 6 }}>{goldCase.descriptionSnapshot === null ? "Sin descriptivo" : "Contenido histórico"}</h2>
            {goldCase.descriptionSnapshot === null ? (
              <p className="muted">La valoración fuente no tenía una versión de descriptivo asociada.</p>
            ) : (
              <details className="details-block">
                <summary>Ver descriptivo</summary>
                <div className="description-preview compact">{goldCase.descriptionSnapshot}</div>
              </details>
            )}
          </section>

          {goldCase.notes !== null && (
            <section className="card card-pad">
              <span className="eyebrow">Notas</span>
              <p>{goldCase.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
