import Link from "next/link";
import { MethodologyAdminService } from "../../../src/application/methodology-admin-service.js";
import { GoldStandardImportForm } from "../../../src/web/gold-standard-import-form.js";
import { GoldStandardSpreadsheetForm } from "../../../src/web/gold-standard-spreadsheet-form.js";
import { getAppContext } from "../../../src/web/runtime.js";

export const dynamic = "force-dynamic";

export default async function GoldStandardImportPage() {
  const context = await getAppContext("MANAGE_GOLD_STANDARD");
  const methodologies = await new MethodologyAdminService(context.pool).listAvailable(
    context.organization.id,
    { activeOnly: true },
  );

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Gold Standard · Administración</span>
          <h1>Importar referencias históricas</h1>
          <p className="muted">
            Incorpora valoraciones expertas anteriores a Compensa como snapshots anonimizados. Nada se escribe hasta que el lote pase un dry-run determinístico completo.
          </p>
        </div>
        <Link className="button button-secondary" href="/gold-standard">Volver al Gold Standard</Link>
      </div>

      <section className="card" style={{ marginBottom: 24 }}>
        <div className="card-pad section-head">
          <div>
            <span className="eyebrow">Metodologías activas</span>
            <h2 style={{ marginTop: 6 }}>Elige la versión que originó cada referencia</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Usa su identificador en la columna <code>id_metodologia</code> de la plantilla o en <code>methodologyVersionId</code> si usas JSON. El dry-run comprobará disponibilidad y reproducirá el resultado con su snapshot exacto.
            </p>
          </div>
          <Link className="button button-small button-secondary" href="/methodologies">Administrar metodologías</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Metodología</th><th>Versión</th><th>ID para importación</th><th>Dimensiones</th><th>Origen</th></tr></thead>
            <tbody>
              {methodologies.map((methodology) => (
                <tr key={methodology.id}>
                  <td><strong>{methodology.name}</strong><div className="muted"><code>{methodology.code}</code></div></td>
                  <td>{methodology.version}</td>
                  <td><code>{methodology.id}</code></td>
                  <td>{methodology.definition.factors.reduce((total, factor) => total + factor.dimensions.length, 0)}</td>
                  <td>{methodology.contentOwner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-pad" style={{ marginBottom: 24 }}>
        <span className="eyebrow">Recomendado</span>
        <h2 style={{ marginTop: 6 }}>Importa desde Excel o CSV</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Una fila representa una decisión y, si corresponde, una evidencia. Repite <code>codigo_caso</code> para agrupar dimensiones del mismo puesto. Compensa convierte la tabla al contrato canónico y luego ejecuta el dry-run habitual.
        </p>
      </section>

      <GoldStandardSpreadsheetForm />

      <details className="details-block card" style={{ marginTop: 24 }}>
        <summary>Vía avanzada: importar JSON directamente</summary>
        <div style={{ paddingTop: 18 }}>
          <GoldStandardImportForm />
        </div>
      </details>

      <section className="stack" style={{ marginTop: 24 }}>
        {methodologies.map((methodology) => {
          const dimensions = methodology.definition.factors.flatMap((factor) =>
            factor.dimensions.map((dimension) => ({
              factorName: factor.name,
              code: dimension.code,
              name: dimension.name,
              required: dimension.required,
              levels: dimension.levels,
            })),
          );
          return (
            <details className="card details-block" key={methodology.id}>
              <summary>{methodology.name} · v{methodology.version} · {dimensions.length} dimensiones</summary>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Factor</th><th>Dimensión</th><th>Código</th><th>Requerida</th><th>Niveles</th></tr></thead>
                  <tbody>
                    {dimensions.map((dimension) => (
                      <tr key={dimension.code}>
                        <td>{dimension.factorName}</td>
                        <td>{dimension.name}</td>
                        <td><code>{dimension.code}</code></td>
                        <td>{dimension.required ? "Sí" : "No"}</td>
                        <td>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {dimension.levels.map((level) => (
                              <span className="badge" key={level.code} title={level.description ?? level.label}>{level.code} · {level.label}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </section>

      <section className="card card-pad" style={{ marginTop: 24 }}>
        <span className="eyebrow">Antes de importar</span>
        <h2 style={{ marginTop: 6 }}>Qué debe contener cada referencia</h2>
        <p className="muted">
          Conserva solo la información necesaria para reproducir la valoración del puesto: etiqueta anonimizada, snapshot del puesto, descriptivo anonimizado, decisiones por dimensión, justificación y evidencia útil. Los puntos y grado históricos son opcionales; si los incluyes, Compensa exigirá que coincidan exactamente con el recálculo.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          No cargues nombres de trabajadores, desempeño individual, remuneraciones ni datos personales que no sean necesarios para calibrar la metodología.
        </p>
      </section>
    </>
  );
}
