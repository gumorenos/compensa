import Link from "next/link";
import type { ValuationQueueStatus } from "../../src/application/valuation-queue-service.js";
import { getOperationalOverviewPageData } from "../../src/web/operational-overview-runtime.js";

export const dynamic = "force-dynamic";

const statusLabels: Record<ValuationQueueStatus, string> = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  RETURNED: "Devuelta",
  APPROVED: "Aprobada",
  SUPERSEDED: "Reemplazada",
  CANCELLED: "Cancelada",
};

function statusBadge(status: ValuationQueueStatus): string {
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

export default async function OperationalOverviewPage() {
  const data = await getOperationalOverviewPageData();
  const { metrics, recentValuations } = data.overview;

  const cards = [
    {
      label: "Puestos activos",
      value: metrics.activeJobs,
      detail: "Base disponible para descriptivos y nuevas valoraciones.",
      href: "/",
    },
    {
      label: "Borradores",
      value: metrics.statusCounts.DRAFT,
      detail: "Trabajo editable todavía no enviado a revisión.",
      href: "/valuations?status=DRAFT",
    },
    {
      label: "En revisión",
      value: metrics.statusCounts.IN_REVIEW,
      detail: "Procesos esperando aprobación o devolución del revisor.",
      href: "/valuations?status=IN_REVIEW",
    },
    {
      label: "Devueltas",
      value: metrics.statusCounts.RETURNED,
      detail: "Valoraciones que requieren correcciones del evaluador.",
      href: "/valuations?status=RETURNED",
    },
    {
      label: "Aprobadas",
      value: metrics.statusCounts.APPROVED,
      detail: "Resultados cerrados e inmutables de la organización.",
      href: "/valuations?status=APPROVED",
    },
    {
      label: "Sin aprobación",
      value: metrics.jobsWithoutApprovedValuation,
      detail: "Puestos activos sin una valoración APPROVED vigente.",
      href: "/",
    },
  ] as const;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">{data.context.organization.name} · trabajo de valoración</span>
          <h1>Inicio</h1>
          <p className="muted">
            Revisa qué necesita atención y continúa el flujo desde la preparación del puesto hasta
            la aprobación. Los indicadores son conteos operativos del tenant, no un score de madurez.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="button button-secondary" href="/">Ver puestos</Link>
          <Link className="button" href="/valuations">Abrir bandeja de valoraciones</Link>
        </div>
      </div>

      <section aria-labelledby="workflow-title" style={{ marginBottom: 28 }}>
        <div className="section-head" style={{ marginBottom: 12 }}>
          <div>
            <span className="eyebrow">Flujo de trabajo</span>
            <h2 id="workflow-title" style={{ marginTop: 6 }}>Cómo avanza una valoración</h2>
          </div>
        </div>
        <div className="workflow-strip">
          <div className="workflow-step">
            <span className="workflow-step-number">1</span>
            <strong>Preparar puesto</strong>
            <span>Registra el puesto y fija el descriptivo que servirá como referencia.</span>
          </div>
          <div className="workflow-step">
            <span className="workflow-step-number">2</span>
            <strong>Valorar</strong>
            <span>Selecciona niveles y documenta el fundamento de cada decisión requerida.</span>
          </div>
          <div className="workflow-step">
            <span className="workflow-step-number">3</span>
            <strong>Revisar</strong>
            <span>El revisor valida la valoración completa y puede aprobarla o devolverla.</span>
          </div>
          <div className="workflow-step">
            <span className="workflow-step-number">4</span>
            <strong>Aprobar</strong>
            <span>La versión aprobada queda cerrada, trazable y disponible para comparación.</span>
          </div>
        </div>
      </section>

      <section className="grid grid-3" style={{ marginBottom: 28 }} aria-label="Resumen operativo">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="card card-pad status-card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <span className="eyebrow">{card.label}</span>
            <div className="status-card-count">
              <strong>{card.value}</strong>
              <span>{card.detail}</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="card card-pad" style={{ marginBottom: 28 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow">Atención operativa</span>
            <h2 style={{ marginTop: 6 }}>Valoraciones incompletas</h2>
          </div>
          <span className={metrics.incompleteEditableValuations > 0 ? "badge badge-warning" : "badge"}>
            {metrics.incompleteEditableValuations}
          </span>
        </div>
        <p className="muted" style={{ marginBottom: 14 }}>
          Borradores o devoluciones sin resultado calculado porque todavía faltan decisiones
          requeridas. No implica por sí solo que el descriptivo sea insuficiente.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="button button-small button-secondary" href="/valuations?status=DRAFT">Revisar borradores</Link>
          <Link className="button button-small button-secondary" href="/valuations?status=RETURNED">Revisar devueltas</Link>
        </div>
      </section>

      <section className="card">
        <div className="card-pad section-head">
          <div>
            <span className="eyebrow">Actividad reciente</span>
            <h2 style={{ marginTop: 6 }}>Valoraciones actualizadas recientemente</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Últimas 8 versiones por <code>updated_at</code>. No es un historial de auditoría.
            </p>
          </div>
          <Link className="button button-small button-secondary" href="/valuations">Ver toda la bandeja</Link>
        </div>

        {recentValuations.length === 0 ? (
          <div className="empty">
            <h2>Aún no hay valoraciones</h2>
            <p>Crea un puesto e inicia una valoración para comenzar el flujo.</p>
            <Link className="button" href="/jobs/new">Crear puesto</Link>
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
                  <th>Actualizada UTC</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {recentValuations.map((valuation) => (
                  <tr key={valuation.valuationId}>
                    <td>
                      <strong>{valuation.jobName}</strong>
                      <div className="muted">
                        {valuation.jobCode ?? "Sin código"} · valoración v{valuation.valuationVersion}
                      </div>
                      <div className="muted">
                        {[valuation.area, valuation.jobFamily].filter(Boolean).join(" · ") || "Sin clasificación estructural"}
                      </div>
                    </td>
                    <td><span className={statusBadge(valuation.status)}>{statusLabels[valuation.status]}</span></td>
                    <td>
                      {valuation.totalPoints === null ? "—" : `${valuation.totalPoints} pts`}
                      <div className="muted">{valuation.gradeCode ?? "Sin grado"}</div>
                    </td>
                    <td>
                      {valuation.methodologyName} v{valuation.methodologyVersion}
                      <div className="muted"><code>{valuation.methodologyCode}</code></div>
                    </td>
                    <td>{dateTime(valuation.updatedAt)}</td>
                    <td>
                      <Link className="button button-small button-secondary" href={`/valuations/${valuation.valuationId}`}>
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
