import Link from "next/link";
import type { ApprovedValuationSummary } from "../../../src/application/comparables-service.js";
import type { SideBySideComparisonErrorCode } from "../../../src/application/side-by-side-comparison.js";
import { getSideBySideComparisonPageData } from "../../../src/web/side-by-side-runtime.js";

export const dynamic = "force-dynamic";

interface SideBySideComparisonPageProps {
  searchParams: Promise<{ valuationId?: string | string[] }>;
}

function requestedIds(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function errorMessage(code: SideBySideComparisonErrorCode): string {
  switch (code) {
    case "INVALID_SELECTION_COUNT":
      return "Selecciona entre 2 y 5 valoraciones aprobadas de una misma versión metodológica.";
    case "VALUATION_NOT_AVAILABLE":
      return "Una o más valoraciones seleccionadas no están disponibles para comparar en esta organización.";
    case "METHODOLOGY_VERSION_MISMATCH":
      return "Las valoraciones deben usar exactamente la misma versión metodológica.";
  }
}

function groupByMethodology(valuations: readonly ApprovedValuationSummary[]) {
  const groups = new Map<string, ApprovedValuationSummary[]>();
  for (const valuation of valuations) {
    const current = groups.get(valuation.methodologyVersionId) ?? [];
    current.push(valuation);
    groups.set(valuation.methodologyVersionId, current);
  }
  return [...groups.values()].sort((left, right) => {
    const firstLeft = left[0]!;
    const firstRight = right[0]!;
    return (
      firstLeft.methodologyName.localeCompare(firstRight.methodologyName, "es") ||
      firstLeft.methodologyVersion.localeCompare(firstRight.methodologyVersion, "es")
    );
  });
}

function metadataLabel(value: string | null): string {
  return value === null || value.trim() === "" ? "—" : value;
}

export default async function SideBySideComparisonPage({ searchParams }: SideBySideComparisonPageProps) {
  const params = await searchParams;
  const data = await getSideBySideComparisonPageData(requestedIds(params.valuationId));
  const selected = new Set(data.selectedValuationIds);
  const groups = groupByMethodology(data.valuations);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Consistencia interna</span>
          <h1>Comparar 2–5 valoraciones</h1>
          <p className="muted">
            Revisa lado a lado resultados y decisiones de valoraciones <b>APPROVED</b> que utilizan exactamente la misma versión metodológica.
          </p>
        </div>
        <Link className="button button-secondary" href="/comparables">Volver a comparables</Link>
      </div>

      <div className="notice" style={{ marginBottom: 24 }}>
        <strong>Comparación descriptiva.</strong>
        <span>
          Compensa muestra diferencias observables. No convierte una diferencia en error, equivalencia, PASS/FAIL, outlier ni recomendación automática de grado.
        </span>
      </div>

      {data.errorCode !== null && (
        <div className="notice" style={{ marginBottom: 24 }}>
          <strong>No se pudo formar la comparación.</strong>
          <span>{errorMessage(data.errorCode)}</span>
        </div>
      )}

      {groups.length === 0 ? (
        <section className="card empty">
          <h2>No hay valoraciones aprobadas</h2>
          <p>Necesitas al menos dos valoraciones APPROVED de la misma versión metodológica.</p>
        </section>
      ) : (
        <section className="card" style={{ marginBottom: 28 }}>
          <div className="card-pad">
            <span className="eyebrow">Selección</span>
            <h2 style={{ marginTop: 6 }}>Elige una versión metodológica</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Cada bloque crea una comparación independiente para evitar mezclar escalas o reglas incompatibles.
            </p>
          </div>
          <div className="stack card-pad" style={{ borderTop: "1px solid var(--border)" }}>
            {groups.map((valuations) => {
              const methodology = valuations[0]!;
              return (
                <form
                  action="/comparables/compare"
                  method="get"
                  className="card card-pad"
                  key={methodology.methodologyVersionId}
                >
                  <div className="section-head">
                    <div>
                      <strong>{methodology.methodologyName} v{methodology.methodologyVersion}</strong>
                      <div className="muted"><code>{methodology.methodologyCode}</code> · {valuations.length} aprobadas</div>
                    </div>
                    <button className="button button-small" type="submit">Comparar seleccionadas</button>
                  </div>
                  <div className="stack" style={{ marginTop: 14 }}>
                    {valuations.map((valuation) => (
                      <label className="card card-pad" key={valuation.valuationId} style={{ cursor: "pointer" }}>
                        <span style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <input
                            type="checkbox"
                            name="valuationId"
                            value={valuation.valuationId}
                            defaultChecked={selected.has(valuation.valuationId)}
                          />
                          <span>
                            <strong>{valuation.jobName} · v{valuation.valuationVersion}</strong>
                            <span className="muted" style={{ display: "block" }}>
                              {valuation.jobCode ?? "Sin código"} · {valuation.totalPoints} pts · {valuation.gradeCode}
                              {valuation.jobFamily ? ` · ${valuation.jobFamily}` : ""}
                            </span>
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
                    Selecciona entre 2 y 5. El backend valida nuevamente la cantidad, organización, estado y versión metodológica.
                  </p>
                </form>
              );
            })}
          </div>
        </section>
      )}

      {data.report !== null && (
        <>
          <section className="card card-pad" style={{ marginBottom: 28 }}>
            <span className="eyebrow">Comparación activa</span>
            <h2 style={{ marginTop: 6 }}>
              {data.report.methodologyName} v{data.report.methodologyVersion}
            </h2>
            <dl className="metadata" style={{ marginBottom: 0 }}>
              <div><dt>Valoraciones</dt><dd>{data.report.valuations.length}</dd></div>
              <div><dt>Puntos mínimo</dt><dd>{data.report.pointMin}</dd></div>
              <div><dt>Puntos máximo</dt><dd>{data.report.pointMax}</dd></div>
              <div><dt>Spread observado</dt><dd>{data.report.pointSpread}</dd></div>
              <div><dt>Grados observados</dt><dd>{data.report.gradeCodes.join(", ")}</dd></div>
              <div><dt>Versión</dt><dd><code>{data.report.methodologyCode}</code></dd></div>
            </dl>
          </section>

          <section className="card" style={{ marginBottom: 28 }}>
            <div className="card-pad">
              <span className="eyebrow">Resumen</span>
              <h2 style={{ marginTop: 6 }}>Resultados y contexto</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dato</th>
                    {data.report.valuations.map((valuation) => (
                      <th key={valuation.valuationId}>
                        {valuation.jobName}<div className="muted">v{valuation.valuationVersion}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr><th>Puntos</th>{data.report.valuations.map((valuation) => <td key={valuation.valuationId}>{valuation.totalPoints}</td>)}</tr>
                  <tr><th>Grado</th>{data.report.valuations.map((valuation) => <td key={valuation.valuationId}><b>{valuation.gradeCode}</b></td>)}</tr>
                  <tr><th>Familia</th>{data.report.valuations.map((valuation) => <td key={valuation.valuationId}>{metadataLabel(valuation.jobFamily)}</td>)}</tr>
                  <tr><th>Departamento</th>{data.report.valuations.map((valuation) => <td key={valuation.valuationId}>{metadataLabel(valuation.department)}</td>)}</tr>
                  <tr><th>Área</th>{data.report.valuations.map((valuation) => <td key={valuation.valuationId}>{metadataLabel(valuation.area)}</td>)}</tr>
                  <tr>
                    <th>Fuente</th>
                    {data.report.valuations.map((valuation) => (
                      <td key={valuation.valuationId}>
                        <Link href={`/valuations/${valuation.valuationId}`}>Abrir valoración</Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-pad section-head">
              <div>
                <span className="eyebrow">Matriz metodológica</span>
                <h2 style={{ marginTop: 6 }}>Decisiones por dimensión</h2>
              </div>
              <span className="badge">{data.report.dimensions.filter((row) => !row.allEqual).length} con diferencias</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Factor / dimensión</th>
                    <th>Coincidencia</th>
                    {data.report.valuations.map((valuation) => (
                      <th key={valuation.valuationId}>{valuation.jobName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.report.dimensions.map((row) => (
                    <tr key={row.dimensionCode}>
                      <td>
                        <strong>{row.dimensionName}</strong>
                        <div className="muted">{row.factorName} · <code>{row.dimensionCode}</code>{row.required ? " · obligatoria" : ""}</div>
                      </td>
                      <td>{row.allEqual ? "Mismo nivel" : "Diferente"}</td>
                      {row.cells.map((cell) => (
                        <td key={cell.valuationId}>
                          {cell.levelCode === null ? (
                            <span className="muted">Sin decisión</span>
                          ) : (
                            <>{cell.levelLabel} <code>{cell.levelCode}</code></>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
