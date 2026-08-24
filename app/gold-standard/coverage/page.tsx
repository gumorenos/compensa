import Link from "next/link";
import { getGoldStandardCoveragePageData } from "../../../src/web/gold-standard-coverage-runtime.js";

export const dynamic = "force-dynamic";

function ratio(count: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((count / total) * 100).toFixed(1)}%`;
}

export default async function GoldStandardCoveragePage() {
  const { report } = await getGoldStandardCoveragePageData();
  const { totals } = report;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Gold Standard</span>
          <h1>Cobertura del dataset</h1>
          <p className="muted">
            Describe qué cubren hoy las referencias expertas y dónde existen ceros o metadatos faltantes. No aplica un puntaje de calidad ni un umbral automático de “dataset suficiente”.
          </p>
        </div>
        <Link className="button button-secondary" href="/gold-standard">Volver al Gold Standard</Link>
      </div>

      <dl className="metadata card card-pad" style={{ marginBottom: 24 }}>
        <div><dt>Referencias totales</dt><dd>{totals.totalCases}</dd></div>
        <div><dt>Validadas</dt><dd>{totals.validatedCases}</dd></div>
        <div><dt>Draft</dt><dd>{totals.draftCases}</dd></div>
        <div><dt>Archivadas</dt><dd>{totals.archivedCases}</dd></div>
        <div><dt>CALIBRATION</dt><dd>{totals.calibrationCases}</dd></div>
        <div><dt>HOLDOUT</dt><dd>{totals.holdoutCases}</dd></div>
        <div><dt>Sin asignar</dt><dd>{totals.unassignedCases}</dd></div>
        <div><dt>Anclas</dt><dd>{totals.anchorCases}</dd></div>
      </dl>

      {report.gaps.length > 0 && (
        <section className="card card-pad" style={{ marginBottom: 28 }}>
          <span className="eyebrow">Hechos a revisar</span>
          <h2 style={{ marginTop: 6 }}>Huecos observables</h2>
          <p className="muted">
            Son ceros o faltantes verificables. No significan por sí solos que el dataset sea inválido ni asignan severidad.
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
            {report.gaps.map((item, index) => (
              <li key={`${item.code}-${item.methodologyVersionId ?? "global"}-${index}`}>
                {item.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.methodologies.length === 0 ? (
        <section className="card empty">
          <h2>Aún no hay dataset para analizar</h2>
          <p>Incorpora referencias expertas al Gold Standard y vuelve a esta vista para ver su distribución.</p>
          <Link className="button" href="/gold-standard">Ir al Gold Standard</Link>
        </section>
      ) : (
        <div className="stack">
          {report.methodologies.map((methodology) => (
            <section className="card" key={methodology.methodologyVersionId}>
              <div className="card-pad section-head">
                <div>
                  <span className="eyebrow"><code>{methodology.methodologyCode}</code></span>
                  <h2 style={{ marginTop: 6 }}>{methodology.methodologyName} v{methodology.methodologyVersion}</h2>
                  <p className="muted" style={{ marginBottom: 0 }}>
                    {methodology.validatedCases} referencias validadas de {methodology.totalCases} registradas para esta versión.
                  </p>
                </div>
                <span className="badge">{methodology.validatedCases} casos</span>
              </div>

              <dl className="metadata card-pad" style={{ margin: 0, borderTop: "1px solid var(--border)" }}>
                <div><dt>CALIBRATION</dt><dd>{methodology.partitions.CALIBRATION}</dd></div>
                <div><dt>HOLDOUT</dt><dd>{methodology.partitions.HOLDOUT}</dd></div>
                <div><dt>Sin asignar</dt><dd>{methodology.partitions.UNASSIGNED}</dd></div>
                <div><dt>Anclas</dt><dd>{methodology.anchorCases}</dd></div>
                <div><dt>Con descriptivo</dt><dd>{methodology.casesWithDescription} · {ratio(methodology.casesWithDescription, methodology.validatedCases)}</dd></div>
                <div><dt>Con evidencia</dt><dd>{methodology.casesWithEvidence} · {ratio(methodology.casesWithEvidence, methodology.validatedCases)}</dd></div>
                <div><dt>Decisiones obligatorias completas</dt><dd>{methodology.casesWithCompleteRequiredDecisions} · {ratio(methodology.casesWithCompleteRequiredDecisions, methodology.validatedCases)}</dd></div>
                <div><dt>Justificaciones completas</dt><dd>{methodology.casesWithCompleteJustifications} · {ratio(methodology.casesWithCompleteJustifications, methodology.validatedCases)}</dd></div>
              </dl>

              <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="section-head" style={{ alignItems: "flex-start" }}>
                  <div>
                    <span className="eyebrow">Distribución</span>
                    <h3 style={{ marginTop: 6 }}>Grados definidos vs. observados</h3>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Grado</th><th>Nombre</th><th>Casos</th><th>Participación</th></tr></thead>
                    <tbody>
                      {methodology.grades.map((grade) => (
                        <tr key={grade.code}>
                          <td><code>{grade.code}</code></td>
                          <td>{grade.label}</td>
                          <td>{grade.count}</td>
                          <td>{ratio(grade.count, methodology.validatedCases)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="section-head" style={{ alignItems: "flex-start" }}>
                  <div>
                    <span className="eyebrow">Representación</span>
                    <h3 style={{ marginTop: 6 }}>Familias de puesto</h3>
                  </div>
                  <span className="badge">{methodology.jobFamilies.length} categorías observadas</span>
                </div>
                {methodology.jobFamilies.length === 0 ? (
                  <p className="muted">No hay familias observadas en referencias validadas.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Familia</th><th>Casos</th><th>Participación</th></tr></thead>
                      <tbody>
                        {methodology.jobFamilies.map((family) => (
                          <tr key={family.code}>
                            <td>{family.label}</td>
                            <td>{family.count}</td>
                            <td>{ratio(family.count, methodology.validatedCases)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="section-head" style={{ alignItems: "flex-start" }}>
                  <div>
                    <span className="eyebrow">Procedencia</span>
                    <h3 style={{ marginTop: 6 }}>Origen de las referencias</h3>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Origen</th><th>Casos</th><th>Participación</th></tr></thead>
                    <tbody>
                      {methodology.sourceTypes.map((source) => (
                        <tr key={source.code}>
                          <td>{source.label}</td>
                          <td>{source.count}</td>
                          <td>{ratio(source.count, methodology.validatedCases)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="eyebrow">Observaciones de esta metodología</span>
                {methodology.gaps.length === 0 ? (
                  <p style={{ marginBottom: 0 }}>No se detectaron ceros ni faltantes dentro de las comprobaciones actuales.</p>
                ) : (
                  <ul style={{ marginBottom: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
                    {methodology.gaps.map((item, index) => (
                      <li key={`${item.code}-${index}`}>{item.label}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
