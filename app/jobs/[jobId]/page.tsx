import Link from "next/link";
import { notFound } from "next/navigation";
import { startValuationAction } from "../../../src/web/actions.js";
import { getDemoJob } from "../../../src/web/runtime.js";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const data = await getDemoJob(jobId);
  if (data === null) notFound();

  const { context, job } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Puesto</span>
          <h1>{job.name}</h1>
          <p className="muted">Revisa los datos del puesto e inicia una valoración manual.</p>
        </div>
        <Link href="/" className="button button-secondary">Volver a puestos</Link>
      </div>

      <div className="detail-grid">
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

        <aside className="card card-pad summary-card">
          <span className="eyebrow">Nueva valoración</span>
          <h2 style={{ marginTop: 6 }}>{context.methodology.name}</h2>
          <p className="muted">
            Fixture ficticio v{context.methodology.version}. Sirve para validar el flujo; no representa una metodología propietaria.
          </p>
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
