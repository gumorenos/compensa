import Link from "next/link";
import { listDemoJobs } from "../src/web/runtime.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const jobs = await listDemoJobs();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Compensa Demo</span>
          <h1>Puestos</h1>
          <p className="muted">
            Crea puestos y ejecuta valoraciones manuales sobre un motor determinístico y trazable.
          </p>
        </div>
        <Link href="/jobs/new" className="button">Nuevo puesto</Link>
      </div>

      <section className="card">
        {jobs.length === 0 ? (
          <div className="empty">
            <h2>Todavía no hay puestos</h2>
            <p>
              Registra el primer puesto para probar el flujo manual de valoración antes de incorporar IA.
            </p>
            <Link href="/jobs/new" className="button">Crear primer puesto</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Puesto</th>
                  <th>Área</th>
                  <th>Familia</th>
                  <th>Valoración</th>
                  <th>Puntos</th>
                  <th>Grado</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link className="job-link" href={`/jobs/${job.id}`}>{job.name}</Link>
                      {job.code !== null && <div className="muted">{job.code}</div>}
                    </td>
                    <td>{job.area ?? job.department ?? "—"}</td>
                    <td>{job.jobFamily ?? "—"}</td>
                    <td>
                      {job.valuationStatus === null ? (
                        <span className="badge">Sin valorar</span>
                      ) : job.valuationStatus === "APPROVED" ? (
                        <span className="badge badge-success">Aprobada</span>
                      ) : (
                        <span className="badge badge-warning">{job.valuationStatus}</span>
                      )}
                    </td>
                    <td>{job.totalPoints ?? "—"}</td>
                    <td>{job.gradeCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
