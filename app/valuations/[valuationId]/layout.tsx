import Link from "next/link";

export default async function ValuationLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ valuationId: string }>;
}>) {
  const { valuationId } = await params;

  return (
    <div className="stack">
      <div className="valuation-context-nav">
        <nav className="valuation-tabs" aria-label="Secciones de la valoración">
          <Link href={`/valuations/${valuationId}`} className="valuation-tab">
            Evaluación
          </Link>
          <Link href={`/valuations/${valuationId}/ai-assistance`} className="valuation-tab">
            Asistencia IA
          </Link>
        </nav>
        <Link href="/valuations" className="valuation-back-link">← Volver a la bandeja</Link>
      </div>

      <div className="valuation-journey" aria-label="Flujo general de una valoración">
        <div className="journey-step">
          <span className="journey-index">1</span>
          <span className="journey-copy">
            <strong>Evaluar</strong>
            <small>Seleccionar niveles requeridos.</small>
          </span>
        </div>
        <div className="journey-step">
          <span className="journey-index">2</span>
          <span className="journey-copy">
            <strong>Fundamentar</strong>
            <small>Registrar justificación y evidencia.</small>
          </span>
        </div>
        <div className="journey-step">
          <span className="journey-index">3</span>
          <span className="journey-copy">
            <strong>Revisar</strong>
            <small>Enviar a un revisor para decisión.</small>
          </span>
        </div>
        <div className="journey-step">
          <span className="journey-index">4</span>
          <span className="journey-copy">
            <strong>Aprobar</strong>
            <small>Cerrar una versión trazable e inmutable.</small>
          </span>
        </div>
      </div>

      {children}
    </div>
  );
}
