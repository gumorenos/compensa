import Link from "next/link";
import { GoldStandardImportForm } from "../../../src/web/gold-standard-import-form.js";
import { getAppContext } from "../../../src/web/runtime.js";

export const dynamic = "force-dynamic";

export default async function GoldStandardImportPage() {
  const context = await getAppContext("MANAGE_GOLD_STANDARD");
  const dimensions = context.methodology.definition.factors.flatMap((factor) =>
    factor.dimensions.map((dimension) => ({
      factorName: factor.name,
      code: dimension.code,
      name: dimension.name,
      required: dimension.required,
      levels: dimension.levels,
    })),
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
        <Link className="button button-secondary" href="/gold-standard">
          Volver al Gold Standard
        </Link>
      </div>

      <section className="card card-pad" style={{ marginBottom: 24 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow">Metodología activa</span>
            <h2 style={{ marginTop: 6 }}>{context.methodology.definition.name}</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Usa este identificador en <code>methodologyVersionId</code> para referencias evaluadas con esta versión.
            </p>
          </div>
          <span className="badge">v{context.methodology.definition.version}</span>
        </div>
        <div className="import-methodology-id">
          <code>{context.methodology.id}</code>
        </div>
      </section>

      <GoldStandardImportForm />

      <section className="card" style={{ marginTop: 24 }}>
        <div className="card-pad">
          <span className="eyebrow">Referencia del contrato</span>
          <h2 style={{ marginTop: 6 }}>Dimensiones y niveles disponibles</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Cada caso histórico debe incluir una decisión para todas las dimensiones requeridas. Los códigos de nivel deben coincidir exactamente con esta versión de metodología.
          </p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Factor</th>
                <th>Dimensión</th>
                <th>Código</th>
                <th>Requerida</th>
                <th>Niveles</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((dimension) => (
                <tr key={dimension.code}>
                  <td>{dimension.factorName}</td>
                  <td>{dimension.name}</td>
                  <td><code>{dimension.code}</code></td>
                  <td>{dimension.required ? "Sí" : "No"}</td>
                  <td>
                    <div className="import-level-codes">
                      {dimension.levels.map((level) => (
                        <span className="badge" key={level.code} title={level.description ?? level.label}>
                          {level.code} · {level.label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
