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
      <nav className="form-actions" aria-label="Secciones de la valoración">
        <Link href={`/valuations/${valuationId}`} className="button button-secondary button-small">
          Valoración
        </Link>
        <Link
          href={`/valuations/${valuationId}/ai-assistance`}
          className="button button-secondary button-small"
        >
          Asistencia IA
        </Link>
      </nav>
      {children}
    </div>
  );
}
