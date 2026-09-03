import type { GoldStandardPartition } from "../domain/gold-standard.js";
import type { ValuationSelections } from "../domain/methodology.js";

export const SYNTHETIC_DEMO_MARKER = "SYNTHETIC_DEMO_V1";
export const SYNTHETIC_DEMO_CONFIRMATION = "SYNTHETIC_STAGING_DATA";

export type SyntheticDemoTargetStatus =
  | "DRAFT_INCOMPLETE"
  | "DRAFT_COMPLETE"
  | "IN_REVIEW"
  | "RETURNED"
  | "APPROVED";

export interface SyntheticDemoGoldStandard {
  caseCode: string;
  anonymizedLabel: string;
  partition: GoldStandardPartition;
  isAnchor: boolean;
}

export interface SyntheticDemoJob {
  code: string;
  name: string;
  department: string;
  area: string;
  jobFamily: string;
  description: string;
  selections: ValuationSelections;
  targetStatus: SyntheticDemoTargetStatus;
  goldStandard?: SyntheticDemoGoldStandard;
}

const all = (
  domain: string,
  breadth: string,
  complexity: string,
  autonomy: string,
  impact: string,
  people: string,
): ValuationSelections => ({
  DOMAIN_KNOWLEDGE: domain,
  KNOWLEDGE_BREADTH: breadth,
  PROBLEM_COMPLEXITY: complexity,
  AUTONOMY: autonomy,
  IMPACT_SCOPE: impact,
  PEOPLE_SCOPE: people,
});

export const syntheticDemoJobs: SyntheticDemoJob[] = [
  {
    code: "SYN-DEMO-HR-ASST",
    name: "Asistente de Operaciones de Personas — DEMO",
    department: "Recursos Humanos",
    area: "Operaciones de Personas",
    jobFamily: "Operaciones HR",
    description:
      "Caso sintético. Ejecuta altas, bajas y actualizaciones documentarias siguiendo procedimientos definidos. Escala excepciones y mantiene registros operativos del equipo.",
    selections: {
      DOMAIN_KNOWLEDGE: "K1",
      KNOWLEDGE_BREADTH: "B1",
      PROBLEM_COMPLEXITY: "C1",
    },
    targetStatus: "DRAFT_INCOMPLETE",
  },
  {
    code: "SYN-DEMO-COMP-AN",
    name: "Analista de Compensaciones — DEMO",
    department: "Recursos Humanos",
    area: "Compensaciones",
    jobFamily: "Compensaciones",
    description:
      "Caso sintético. Analiza bandas salariales, consolida información de mercado y prepara propuestas dentro de políticas aprobadas. Coordina con HRBP y Finanzas y documenta supuestos.",
    selections: all("K2", "B2", "C2", "A2", "S2", "P0"),
    targetStatus: "DRAFT_COMPLETE",
  },
  {
    code: "SYN-DEMO-PA-SR",
    name: "Senior People Analytics Analyst — DEMO",
    department: "Recursos Humanos",
    area: "People Analytics",
    jobFamily: "People Analytics",
    description:
      "Caso sintético. Diseña análisis de workforce, integra datos de varias fuentes y resuelve preguntas ambiguas de negocio. Trabaja con autonomía dentro del marco analítico y su impacto alcanza procesos transversales.",
    selections: all("K3", "B2", "C3", "A2", "S2", "P0"),
    targetStatus: "IN_REVIEW",
  },
  {
    code: "SYN-DEMO-HRBP",
    name: "HR Business Partner — DEMO",
    department: "Recursos Humanos",
    area: "HR Business Partnering",
    jobFamily: "HRBP",
    description:
      "Caso sintético. Asesora a una unidad de negocio en talento, desempeño y estructura organizacional. Integra varias disciplinas, aborda problemas ambiguos y propone soluciones con impacto en un área de negocio.",
    selections: all("K3", "B3", "C3", "A2", "S3", "P0"),
    targetStatus: "RETURNED",
  },
  {
    code: "SYN-DEMO-HROPS-MGR",
    name: "Gerente de Operaciones de Personas — DEMO",
    department: "Recursos Humanos",
    area: "Operaciones de Personas",
    jobFamily: "Operaciones HR",
    description:
      "Caso sintético. Lidera un equipo de operaciones de personas, define enfoques de servicio y resuelve incidencias complejas. Su responsabilidad cubre procesos de un área y coordina con líderes de otras funciones.",
    selections: all("K3", "B3", "C3", "A3", "S3", "P1"),
    targetStatus: "APPROVED",
    goldStandard: {
      caseCode: "SYN-GS-HROPS-MGR",
      anonymizedLabel: "Referencia sintética A — liderazgo operativo",
      partition: "CALIBRATION",
      isAnchor: true,
    },
  },
  {
    code: "SYN-DEMO-COMP-MGR",
    name: "Gerente de Compensaciones — DEMO",
    department: "Recursos Humanos",
    area: "Compensaciones",
    jobFamily: "Compensaciones",
    description:
      "Caso sintético. Define criterios de compensación, lidera análisis complejos y gobierna decisiones dentro de una política corporativa. Lidera un equipo y su impacto alcanza un área completa de negocio.",
    selections: all("K3", "B3", "C3", "A3", "S3", "P1"),
    targetStatus: "APPROVED",
    goldStandard: {
      caseCode: "SYN-GS-COMP-MGR",
      anonymizedLabel: "Referencia sintética B — compensaciones",
      partition: "CALIBRATION",
      isAnchor: false,
    },
  },
  {
    code: "SYN-DEMO-HR-HEAD",
    name: "Head of Human Resources — DEMO",
    department: "Recursos Humanos",
    area: "Dirección de Personas",
    jobFamily: "Liderazgo HR",
    description:
      "Caso sintético. Define la estrategia integral de personas, establece enfoques ante problemas nuevos y dirige a través de otros líderes. Sus decisiones afectan al área de negocio y a múltiples equipos.",
    selections: all("K3", "B3", "C3", "A3", "S3", "P2"),
    targetStatus: "APPROVED",
    goldStandard: {
      caseCode: "SYN-GS-HR-HEAD",
      anonymizedLabel: "Referencia sintética C — liderazgo funcional",
      partition: "HOLDOUT",
      isAnchor: false,
    },
  },
];

export function syntheticJustification(job: SyntheticDemoJob, dimensionCode: string): string {
  return `[${SYNTHETIC_DEMO_MARKER}] Justificación ficticia para ${dimensionCode} en ${job.name}. Se usa únicamente para demostración y QA.`;
}
