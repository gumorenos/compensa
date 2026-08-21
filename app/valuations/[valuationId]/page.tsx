import Link from "next/link";
import { notFound } from "next/navigation";
import { saveDecisionAction } from "../../../src/web/actions.js";
import { getValuationPageData } from "../../../src/web/runtime.js";

export const dynamic = "force-dynamic";

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
  const dimensions = data.methodology.definition.factors.flatMap((factor) => factor.dimensions);
  const requiredCount = dimensions.filter((dimension) => dimension.required).length;
  const completedRequired = dimensions.filter(
    (dimension) => dimension.required && selected.has(dimension.code),
  ).length;
  const progress = requiredCount === 0 ? 100 : Math.round((completedRequired / requiredCount) * 100);

  return (
    <>
      <div className="valuation-head">
        <div>
          <span className="eyebrow">Valoración · versión {data.valuationVersion}</span>
          <h1>{data.job.name}</h1>
          <p className="muted">
            {data.methodology.name} v{data.methodology.version} · {completedRequired}/{requiredCount} decisiones obligatorias
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

      <div className="detail-grid">
        <div className="stack">
          {data.methodology.definition.factors.map((factor) => (
            <section className="card factor" key={factor.code}>
              <div className="factor-title">
                <span className="eyebrow">Factor</span>
                <h2>{factor.name}</h2>
                {factor.description !== undefined && <p className="muted">{factor.description}</p>}
              </div>

              {factor.dimensions.map((dimension) => (
                <div className="dimension" key={dimension.code}>
                  <div className="dimension-head">
                    <div>
                      <h3>{dimension.name}</h3>
                      {dimension.description !== undefined && (
                        <div className="muted">{dimension.description}</div>
                      )}
                    </div>
                    {selected.has(dimension.code) ? (
                      <span className="badge badge-success">Respondida</span>
                    ) : dimension.required ? (
                      <span className="badge badge-warning">Pendiente</span>
                    ) : (
                      <span className="badge">Opcional</span>
                    )}
                  </div>

                  <div className="levels">
                    {dimension.levels.map((level) => {
                      const isSelected = selected.get(dimension.code) === level.code;
                      return (
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
                      );
                    })}
                  </div>
                </div>
              ))}
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
              <li><strong>Puntos:</strong> {data.totalPoints ?? "Pendiente"}</li>
              <li><strong>Metodología:</strong> {data.methodology.version}</li>
            </ul>
            <div className="form-actions">
              <Link href={`/jobs/${data.job.id}`} className="button button-secondary">Ver puesto</Link>
            </div>
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
