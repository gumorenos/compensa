"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ValuationTabs({ valuationId }: { valuationId: string }) {
  const pathname = usePathname();
  const aiActive = pathname.endsWith("/ai-assistance");

  return (
    <nav className="valuation-tabs" aria-label="Secciones de la valoración">
      <Link
        href={`/valuations/${valuationId}`}
        className={`valuation-tab${aiActive ? "" : " active"}`}
        aria-current={aiActive ? undefined : "page"}
      >
        Evaluación
      </Link>
      <Link
        href={`/valuations/${valuationId}/ai-assistance`}
        className={`valuation-tab${aiActive ? " active" : ""}`}
        aria-current={aiActive ? "page" : undefined}
      >
        Asistencia IA
      </Link>
    </nav>
  );
}
