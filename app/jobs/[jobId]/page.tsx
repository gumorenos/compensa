import Link from "next/link";
import { notFound } from "next/navigation";
import {
  saveJobDescriptionAction,
  startValuationAction,
} from "../../../src/web/actions.js";
import { getDemoJob } from "../../../src/web/runtime.js";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const data = await getDemoJob(jobId);
  if (data === null) notFound();

  const { context, job, latestDescription } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Puesto</span>
          <h1>{job.name}</h1>
          <p className="muted">
            Mantén un descriptivo versionado y crea valoraciones reproducibles sobre una versión concreta.
          </p>
        </div>
        <Link href="/" className="button button-secondary">Volver a puestos</Link>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <section className="card card-pad">
            <h2>Datos del puesto</h2>
            <dl className="metadata">
              <div><dt>Código</dt><dd>{job.code ?? "Sin código"}</dd></div>
              <div><dt>Estado</dt><dd>{job.status}</dd></div>
              <div><dt>Departamento</dt><dd>{job.department ?? "—"}</dd></div>
              <div><dt>Área</dt><dd>{job.area ?? "—"}</dd></div>
              <div><dt>Familia</dt><dd>{job.jobFamily ?? "—"}</dd></div>
              <div><dt>Organización</dt><dd>{context.organization.name}</dd></div>
            </dl>
          </section>

          <section className="card card-pad">
            <div className="section-head">
              <div>
                <span className="eyebrow">Descriptivo</span>
                <h2 style={{ marginTop: 6 }}>
                  {latestDescription === null
                    ? "Todavía no hay descriptivo"
                    : `Versión ${latestDescription.version}`}
                </h2>
              </div>
              {latestDescription !== null && (
                <span className="badge badge-success">Versión vigente</span>
              )}
            </div>

            {latestDescription !== null && (
              <>
                <p className="muted">
                  {latestDescription.sourceLabel ?? "Sin etiqueta de origen"} · guardado como versión inmutable.
                </p>
                <div className="description-preview">{latestDescription.content}</div>
              </>
            )}

            <details className="details-block" open={latestDescription === null}>
              <summary>
                {latestDescription === null ? "Crear descriptivo" : "Guardar una nueva versión"}
              </summary>
              <form action={saveJobDescriptionAction} className="stack compact-stack">
                <input type="hidden" name="jobId" value={job.id} />
                <div className="field">
                  <label htmlFor="sourceLabel">Origen / referencia</label>
                  <input
                    id="sourceLabel"
                    name="sourceLabel"
                    type="text"
                    defaultValue={latestDescription?.sourceLabel ?? ""}
                    placeholder="Ej. Descriptivo validado por Gerencia 2026"
                  />
                </div>
                <div className="field">
                  <label htmlFor="content">Contenido del descriptivo *</label>
                  <textarea
                    id="content"
                    name="content"
                    required
                    rows={14}
                    defaultValue={latestDescription?.content ?? ""}
                    placeholder="Propósito del puesto, principales responsabilidades, alcance, relaciones, autoridad, requisitos..."
                  />
                </div>
                <div>
                  <button className="button" type="submit">
                    {latestDescription === null ? "Guardar descriptivo" : "Crear nueva versión"}
                  </button>
                </div>
              </form>
            </details>
          </section>
        </div>

        <aside className="card card-pad summary-card">
          <span className="eyebrow">Nueva valoración</span>
          <h2 style={{ marginTop: 6 }}>{context.methodology.name}</h2>
          <p className="muted">
            Fixture ficticio v{context.methodology.version}. Sirve para validar el flujo; no representa una metodología propietaria.
          </p>
          <div className="callout">
            {latestDescription === null ? (
              <>
                <strong>Sin descriptivo asociado</strong>
                <span>La valoración puede iniciarse, pero no tendrá evidencia textual anclada.</span>
              </>
            ) : (
              <>
                <strong>Usará descriptivo v{latestDescription.version}</strong>
                <span>La valoración conservará esa versión aunque luego el puesto cambie.</span>
              </>
            )}
          </div>
          <form action={startValuationAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="methodologyVersionId" value={context.methodology.id} />
            <button className="button" type="submit">Iniciar valoración</button>
          </form>
        </aside>
      </div>
    </>
  );
}
