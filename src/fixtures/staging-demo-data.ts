import type { GoldStandardPartition } from "../domain/gold-standard.js";
import type { ValuationSelections } from "../domain/methodology.js";

export const STAGING_DEMO_SOURCE_LABEL = "SYNTHETIC_DEMO_V1";
export const STAGING_DEMO_NOTES =
  "SYNTHETIC / DEMO ONLY. Fictional reference generated for Compensa staging QA; it is not an expert or market benchmark.";

export type StagingDemoTargetStatus =
  | "DRAFT_PARTIAL"
  | "DRAFT_COMPLETE"
  | "IN_REVIEW"
  | "RETURNED"
  | "APPROVED";

export interface StagingDemoProfile {
  code: string;
  name: string;
  department: string;
  area: string;
  jobFamily: string;
  description: string;
  selections: ValuationSelections;
  targetStatus: StagingDemoTargetStatus;
  goldStandard?: {
    caseCode: string;
    label: string;
    partition: GoldStandardPartition;
    isAnchor: boolean;
  };
}

const lowSelections: ValuationSelections = {
  DOMAIN_KNOWLEDGE: "K1",
  KNOWLEDGE_BREADTH: "B1",
  PROBLEM_COMPLEXITY: "C1",
  AUTONOMY: "A1",
  IMPACT_SCOPE: "S1",
  PEOPLE_SCOPE: "P0",
};

const lowerMidSelections: ValuationSelections = {
  DOMAIN_KNOWLEDGE: "K2",
  KNOWLEDGE_BREADTH: "B1",
  PROBLEM_COMPLEXITY: "C1",
  AUTONOMY: "A2",
  IMPACT_SCOPE: "S1",
  PEOPLE_SCOPE: "P0",
};

const midSelections: ValuationSelections = {
  DOMAIN_KNOWLEDGE: "K2",
  KNOWLEDGE_BREADTH: "B2",
  PROBLEM_COMPLEXITY: "C2",
  AUTONOMY: "A2",
  IMPACT_SCOPE: "S2",
  PEOPLE_SCOPE: "P1",
};

const upperMidSelections: ValuationSelections = {
  DOMAIN_KNOWLEDGE: "K3",
  KNOWLEDGE_BREADTH: "B2",
  PROBLEM_COMPLEXITY: "C2",
  AUTONOMY: "A3",
  IMPACT_SCOPE: "S2",
  PEOPLE_SCOPE: "P1",
};

const highSelections: ValuationSelections = {
  DOMAIN_KNOWLEDGE: "K3",
  KNOWLEDGE_BREADTH: "B3",
  PROBLEM_COMPLEXITY: "C3",
  AUTONOMY: "A3",
  IMPACT_SCOPE: "S3",
  PEOPLE_SCOPE: "P2",
};

export const stagingDemoProfiles: readonly StagingDemoProfile[] = [
  {
    code: "SYN-DEMO-001",
    name: "Asistente administrativo (sintético)",
    department: "Administración",
    area: "Servicios internos",
    jobFamily: "Soporte",
    description:
      "Puesto sintético de demostración. Ejecuta tareas administrativas recurrentes, mantiene registros y coordina solicitudes simples siguiendo procedimientos definidos y supervisión cercana.",
    selections: {
      DOMAIN_KNOWLEDGE: "K1",
      KNOWLEDGE_BREADTH: "B1",
    },
    targetStatus: "DRAFT_PARTIAL",
  },
  {
    code: "SYN-DEMO-002",
    name: "Analista de compensaciones (sintético)",
    department: "Recursos Humanos",
    area: "Compensaciones",
    jobFamily: "People Analytics y Compensaciones",
    description:
      "Puesto sintético de demostración. Analiza información salarial, prepara reportes, aplica políticas internas y resuelve consultas dentro de lineamientos definidos, sin liderazgo formal de personas.",
    selections: lowerMidSelections,
    targetStatus: "DRAFT_COMPLETE",
  },
  {
    code: "SYN-DEMO-003",
    name: "Coordinador de operaciones (sintético)",
    department: "Operaciones",
    area: "Control operativo",
    jobFamily: "Operaciones",
    description:
      "Puesto sintético de demostración. Coordina un proceso operativo y un equipo pequeño, resuelve incidencias variables, aplica políticas y articula con varias áreas para cumplir objetivos de servicio.",
    selections: midSelections,
    targetStatus: "IN_REVIEW",
  },
  {
    code: "SYN-DEMO-004",
    name: "Jefe de planeamiento (sintético)",
    department: "Finanzas",
    area: "Planeamiento",
    jobFamily: "Finanzas",
    description:
      "Puesto sintético de demostración. Integra información de distintas disciplinas, define enfoques de análisis, lidera un equipo y formula recomendaciones para decisiones de una unidad de negocio.",
    selections: upperMidSelections,
    targetStatus: "RETURNED",
  },
  {
    code: "SYN-DEMO-005",
    name: "Auxiliar de servicios (sintético)",
    department: "Administración",
    area: "Servicios generales",
    jobFamily: "Soporte",
    description:
      "Puesto sintético de demostración. Realiza actividades operativas recurrentes con procedimientos claros, supervisión directa, alcance individual y sin responsabilidad formal sobre equipos.",
    selections: lowSelections,
    targetStatus: "APPROVED",
    goldStandard: {
      caseCode: "SYN-GS-001",
      label: "SYNTHETIC · referencia operativa básica",
      partition: "CALIBRATION",
      isAnchor: true,
    },
  },
  {
    code: "SYN-DEMO-006",
    name: "Supervisor de procesos (sintético)",
    department: "Operaciones",
    area: "Mejora de procesos",
    jobFamily: "Operaciones",
    description:
      "Puesto sintético de demostración. Gestiona procesos relacionados, lidera un equipo, resuelve problemas variables con autonomía dentro de políticas y tiene impacto sobre resultados de un proceso completo.",
    selections: midSelections,
    targetStatus: "APPROVED",
    goldStandard: {
      caseCode: "SYN-GS-002",
      label: "SYNTHETIC · referencia profesional intermedia",
      partition: "CALIBRATION",
      isAnchor: false,
    },
  },
  {
    code: "SYN-DEMO-007",
    name: "Director de transformación (sintético)",
    department: "Estrategia",
    area: "Transformación",
    jobFamily: "Dirección",
    description:
      "Puesto sintético de demostración. Integra múltiples disciplinas, define enfoques frente a problemas nuevos y ambiguos, lidera a través de otros líderes y tiene impacto sobre un área de negocio completa.",
    selections: highSelections,
    targetStatus: "APPROVED",
    goldStandard: {
      caseCode: "SYN-GS-003",
      label: "SYNTHETIC · referencia directiva alta",
      partition: "HOLDOUT",
      isAnchor: false,
    },
  },
] as const;
