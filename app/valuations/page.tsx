import Link from "next/link";
import {
  valuationStatuses,
  type ValuationQueueStatus,
} from "../../src/application/valuation-queue-service.js";
import { getValuationQueuePageData } from "../../src/web/valuation-queue-runtime.js";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

interface ValuationQueuePageProps {
  searchParams: Promise<SearchParams>;
}

const statusLabels: Record<ValuationQueueStatus, string> = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  RETURNED: "Devuelta",
  APPROVED: "Aprobada",
  SUPERSEDED: "Reemplazada",
  CANCELLED: "Cancelada",
};

function statusBadge(status: ValuationQueueStatus) {
  if (status === "APPROVED") return "badge badge-success";
  if (status === "DRAFT" || status === "IN_REVIEW" || status === "RETURNED") {
    return "badge badge-warning";
  }
  return "badge";
}

function dateTime(value: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(value);
}

export default async function ValuationQueuePage({ searchParams }: ValuationQueuePageProps) {
  const data = await getValuationQueuePageData(await searchParams);
  const { filters, queue } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">{data.context.organization.name} · flujo operativo</span>
          <h1>Valoraciones</h1>
          <p className="muted">
            Localiza procesos por estado, puesto, estructura, metodología, iniciador y fecha. La bandeja es de consulta; cada valoración conserva su workflow y permisos propios.
          </p>
        </div>
      </div>

      {data.invalidFilter !== null && (
        <div className="notice" style={{ marginBottom: 24 }}>
          <strong>Filtro inválido.</strong>
          <span>
            Se ignoraron los filtros manipulados o malformados. Campo: <code>{data.invalidFilter}</code>.
          </span>
        </div>
      )}

      <section className="grid grid-3" style={{ marginBottom: 28 }}>
        {valuationStatuses.map((status) => (
          <Link
            key={status}
            href={`/valuations?status=${encodeURIComponent(status)}`}
            className="card card-pad"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <span className={statusBadge(status)}>{statusLabels[status]}</span>
            <div style={{ fontSize: "2rem", fontWeight: 750, marginTop: 12 }}>
              {queue.statusCounts[status]}
            </div>
          </Link>
        ))}
      </section>

      <section className="card card-pad" style={{ marginBottom: 28 }}>
        <div className="section-head" style={{ marginBottom: 18 }}>
          <div>
            <span className="eyebrow">Filtros</span>
            <h2 style={{ marginTop: 6 }}>Bandeja operativa</h2>
          </div>
          <Link className="button button-secondary button-small" href="/valuations">Limpiar</Link>
        </div>

        <form method="get" action="/valuations" className="stack">
          <div className="grid grid-3">
            <label>
              <span>Buscar puesto / código</span>
              <input name="q" defaultValue={filters.query ?? ""} maxLength={200} placeholder="Ej. Planeamiento" />
            </label>
            <label>
              <span>Estado</span>
              <select name="status" defaultValue={filters.status ?? ""}>
                <option value="">Todos</option>
                {valuationStatuses.map((status) => (
                  <option key={status} value={status}>{statusLabels[status]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Grado</span>
              <select name="gradeCode" defaultValue={filters.gradeCode ?? ""}>
                <option value="">Todos</option>
                {queue.options.gradeCodes.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-3">
            <label>
              <span>Área</span>
              <select name="area" defaultValue={filters.area ?? ""}>
                <option value="">Todas</option>
                {queue.options.areas.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
            </label>
            <label>
              <span>Familia</span>
              <select name="jobFamily" defaultValue={filters.jobFamily ?? ""}>
                <option value="">Todas</option>
                {queue.options.jobFamilies.map((family) => <option key={family} value={family}>{family}</option>)}
              </select>
            </label>
            <label>
              <span>Metodología / versión</span>
              <select name="methodologyVersionId" defaultValue={filters.methodologyVersionId ?? ""}>
                <option value="">Todas</option>
                {queue.options.methodologies.map((methodology) => (
                  <option key={methodology.id} value={methodology.id}>
                    {methodology.name} v{methodology.version} · {methodology.code}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-3">
            <label>
              <span>Iniciada por</span>
              <select name="actorUserId" defaultValue={filters.actorUserId ?? ""}>
                <option value="">Cualquier usuario</option>
                {queue.options.actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>{actor.name} · {actor.email}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Actualizada desde (UTC)</span>
              <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} />
            </label>
            <label>
              <span>Actualizada hasta (UTC)</span>
              <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} />
            </label>
          </div>

          <div>
            <button className="button" type="submit">Aplicar filtros</button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-pad section-head">
          <div>
            <span className="eyebrow">Resultados</span>
            <h2 style={{ marginTop: 6 }}>{queue.totalMatching} valoración{queue.totalMatching === 1 ? "" : "es"}</h2>
          </div>
          {queue.truncated && <span className="badge badge-warning">Mostrando primeras 200</span>}
        </div>

        {queue.items.length === 0 ? (
          <div className="empty">
            <h2>No hay valoraciones con estos filtros</h2>
            <p>Prueba limpiando uno o más criterios.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Puesto</th>
                  <th>Estado</th>
                  <th>Resultado</th>
                  <th>Metodología</th>
                  <th>Iniciada por</th>
                  <th>Actualizada UTC</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {queue.items.map((item) => (
                  <tr key={item.valuationId}>
                    <td>
                      <strong>{item.jobName}</strong>
                      <div className="muted">
                        {item.jobCode ?? "Sin código"} · valoración v{item.valuationVersion}
                      </div>
                      <div className="muted">
                        {[item.area ?? item.department, item.jobFamily].filter(Boolean).join(" · ") || "Sin clasificación estructural"}
                      </div>
                    </td>
                    <td><span className={statusBadge(item.status)}>{statusLabels[item.status]}</span></td>
                    <td>
                      {item.totalPoints === null ? "—" : `${item.totalPoints} pts`}
                      <div className="muted">{item.gradeCode ?? "Sin grado"}</div>
                    </td>
                    <td>
                      {item.methodologyName} v{item.methodologyVersion}
                      <div className="muted"><code>{item.methodologyCode}</code></div>
                    </td>
                    <td>
                      {item.startedBy === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <>
                          {item.startedBy.name}
                          <div className="muted">{item.startedBy.email}</div>
                        </>
                      )}
                    </td>
                    <td>{dateTime(item.updatedAt)}</td>
                    <td>
                      <Link className="button button-small button-secondary" href={`/valuations/${item.valuationId}`}>
                        Abrir
                      </Link>
                    </td>
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
