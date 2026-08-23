import Link from "next/link";
import { MethodologyAdminService } from "../../src/application/methodology-admin-service.js";
import { roleHasPermission } from "../../src/auth/access.js";
import { getAppContext } from "../../src/web/runtime.js";

export const dynamic = "force-dynamic";

export default async function MethodologiesPage() {
  const context = await getAppContext("VIEW");
  const service = new MethodologyAdminService(context.pool);
  const methodologies = await service.listAvailable(context.organization.id);
  const canManage = roleHasPermission(context.access.role, "MANAGE_METHODOLOGIES");

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Configuración</span>
          <h1>Metodologías</h1>
          <p className="muted">
            Versiones determinísticas disponibles para {context.organization.name}. Las definiciones activas se conservan como referencias inmutables para que una valoración histórica siempre pueda reproducirse.
          </p>
        </div>
        {canManage && (
          <Link className="button" href="/methodologies/import">Importar metodología</Link>
        )}
      </div>

      <section className="card">
        <div className="card-pad section-head">
          <div>
            <span className="eyebrow">Catálogo</span>
            <h2 style={{ marginTop: 6 }}>Versiones disponibles</h2>
          </div>
          <span className="badge">{methodologies.length} versiones</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Metodología</th>
                <th>Versión</th>
                <th>Alcance</th>
                <th>Estado</th>
                <th>Factores</th>
                <th>Dimensiones</th>
                <th>Grados</th>
                <th>Propietario / fuente</th>
              </tr>
            </thead>
            <tbody>
              {methodologies.map((methodology) => {
                const dimensionCount = methodology.definition.factors.reduce(
                  (total, factor) => total + factor.dimensions.length,
                  0,
                );
                return (
                  <tr key={methodology.id}>
                    <td>
                      <strong>{methodology.name}</strong>
                      <div className="muted"><code>{methodology.code}</code></div>
                    </td>
                    <td>{methodology.version}</td>
                    <td>
                      <span className="badge">
                        {methodology.organizationId === null ? "Global demo" : "Organización"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${methodology.status === "ACTIVE" ? "badge-success" : "badge-warning"}`}>
                        {methodology.status}
                      </span>
                    </td>
                    <td>{methodology.definition.factors.length}</td>
                    <td>{dimensionCount}</td>
                    <td>{methodology.definition.grades.length}</td>
                    <td>{methodology.contentOwner}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-pad" style={{ marginTop: 24 }}>
        <span className="eyebrow">Regla de versionado</span>
        <h2 style={{ marginTop: 6 }}>Nunca se reescribe una versión publicada</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Si cambia una tabla de puntos, un nivel, una fórmula o un grado, crea otra versión. Compensa no incluye contenido oficial de metodologías propietarias ni afirma certificación de terceros; cada organización es responsable de contar con autorización para el contenido que cargue.
        </p>
      </section>
    </>
  );
}
