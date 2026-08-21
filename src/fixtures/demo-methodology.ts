import { lookupKey, type MethodologyDefinition } from "../domain/methodology.js";

/**
 * Entirely fictional methodology used only to exercise Compensa's engine.
 * It does not reproduce any proprietary job-evaluation framework.
 */
export const demoMethodology: MethodologyDefinition = {
  code: "DEMO_POINT_FACTOR",
  name: "Demo Point Factor",
  version: "1.0.0",
  factors: [
    {
      code: "KNOWLEDGE",
      name: "Knowledge",
      dimensions: [
        {
          code: "DOMAIN_KNOWLEDGE",
          name: "Domain knowledge",
          required: true,
          levels: [
            { code: "K1", label: "Foundational" },
            { code: "K2", label: "Professional" },
            { code: "K3", label: "Advanced multidisciplinary" },
          ],
        },
        {
          code: "KNOWLEDGE_BREADTH",
          name: "Knowledge breadth",
          required: true,
          levels: [
            { code: "B1", label: "Single activity" },
            { code: "B2", label: "Several related activities" },
            { code: "B3", label: "Multiple disciplines" },
          ],
        },
      ],
    },
    {
      code: "PROBLEM_SOLVING",
      name: "Problem solving",
      dimensions: [
        {
          code: "PROBLEM_COMPLEXITY",
          name: "Problem complexity",
          required: true,
          levels: [
            { code: "C1", label: "Recurring" },
            { code: "C2", label: "Variable" },
            { code: "C3", label: "Novel and ambiguous" },
          ],
        },
        {
          code: "AUTONOMY",
          name: "Decision autonomy",
          required: true,
          levels: [
            { code: "A1", label: "Guided" },
            { code: "A2", label: "Independent within policy" },
            { code: "A3", label: "Defines approaches" },
          ],
        },
      ],
    },
    {
      code: "IMPACT",
      name: "Organizational impact",
      dimensions: [
        {
          code: "IMPACT_SCOPE",
          name: "Impact scope",
          required: true,
          levels: [
            { code: "S1", label: "Own activity" },
            { code: "S2", label: "Team or process" },
            { code: "S3", label: "Business area" },
          ],
        },
        {
          code: "PEOPLE_SCOPE",
          name: "People scope",
          required: true,
          levels: [
            { code: "P0", label: "No formal leadership" },
            { code: "P1", label: "Leads a team" },
            { code: "P2", label: "Leads through other leaders" },
          ],
        },
      ],
    },
  ],
  scoring: {
    steps: [
      {
        code: "KNOWLEDGE_SCORE",
        label: "Knowledge factor score",
        type: "lookup",
        inputs: [
          { kind: "selection", dimension: "DOMAIN_KNOWLEDGE" },
          { kind: "selection", dimension: "KNOWLEDGE_BREADTH" },
        ],
        table: {
          [lookupKey("K1", "B1")]: 40,
          [lookupKey("K1", "B2")]: 55,
          [lookupKey("K1", "B3")]: 70,
          [lookupKey("K2", "B1")]: 65,
          [lookupKey("K2", "B2")]: 85,
          [lookupKey("K2", "B3")]: 105,
          [lookupKey("K3", "B1")]: 90,
          [lookupKey("K3", "B2")]: 120,
          [lookupKey("K3", "B3")]: 150,
        },
      },
      {
        code: "PROBLEM_SCORE",
        label: "Problem-solving factor score",
        type: "lookup",
        inputs: [
          { kind: "selection", dimension: "PROBLEM_COMPLEXITY" },
          { kind: "selection", dimension: "AUTONOMY" },
        ],
        table: {
          [lookupKey("C1", "A1")]: 30,
          [lookupKey("C1", "A2")]: 45,
          [lookupKey("C1", "A3")]: 60,
          [lookupKey("C2", "A1")]: 50,
          [lookupKey("C2", "A2")]: 70,
          [lookupKey("C2", "A3")]: 90,
          [lookupKey("C3", "A1")]: 75,
          [lookupKey("C3", "A2")]: 100,
          [lookupKey("C3", "A3")]: 130,
        },
      },
      {
        code: "IMPACT_SCORE",
        label: "Impact factor score",
        type: "lookup",
        inputs: [
          { kind: "selection", dimension: "IMPACT_SCOPE" },
          { kind: "selection", dimension: "PEOPLE_SCOPE" },
        ],
        table: {
          [lookupKey("S1", "P0")]: 25,
          [lookupKey("S1", "P1")]: 35,
          [lookupKey("S1", "P2")]: 45,
          [lookupKey("S2", "P0")]: 50,
          [lookupKey("S2", "P1")]: 65,
          [lookupKey("S2", "P2")]: 80,
          [lookupKey("S3", "P0")]: 75,
          [lookupKey("S3", "P1")]: 95,
          [lookupKey("S3", "P2")]: 120,
        },
      },
      {
        code: "RAW_TOTAL",
        label: "Raw factor total",
        type: "sum",
        operands: [
          { kind: "step", step: "KNOWLEDGE_SCORE" },
          { kind: "step", step: "PROBLEM_SCORE" },
          { kind: "step", step: "IMPACT_SCORE" },
        ],
      },
      {
        code: "BASE_INDEX",
        label: "Convert total to base-100 units",
        type: "divide",
        numerator: { kind: "step", step: "RAW_TOTAL" },
        denominator: { kind: "constant", value: 100 },
      },
      {
        code: "CALIBRATED_TOTAL",
        label: "Apply fictional calibration index",
        type: "multiply",
        operands: [
          { kind: "step", step: "BASE_INDEX" },
          { kind: "constant", value: 105 },
        ],
      },
      {
        code: "FINAL_TOTAL",
        label: "Rounded final points",
        type: "round",
        value: { kind: "step", step: "CALIBRATED_TOTAL" },
        precision: 0,
      },
    ],
    totalStep: "FINAL_TOTAL",
  },
  grades: [
    { code: "G1", name: "Grade 1", minPoints: 0, maxPoints: 120 },
    { code: "G2", name: "Grade 2", minPoints: 121, maxPoints: 200 },
    { code: "G3", name: "Grade 3", minPoints: 201, maxPoints: 280 },
    { code: "G4", name: "Grade 4", minPoints: 281, maxPoints: 360 },
    { code: "G5", name: "Grade 5", minPoints: 361, maxPoints: 500 },
  ],
};

export const demoMidLevelSelections = {
  DOMAIN_KNOWLEDGE: "K2",
  KNOWLEDGE_BREADTH: "B2",
  PROBLEM_COMPLEXITY: "C2",
  AUTONOMY: "A2",
  IMPACT_SCOPE: "S2",
  PEOPLE_SCOPE: "P1",
} as const;
