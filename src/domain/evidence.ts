export function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
}

export function containsAnchoredEvidence(source: string, excerpt: string): boolean {
  const normalizedExcerpt = normalizeEvidenceText(excerpt);
  if (normalizedExcerpt === "") return false;
  return normalizeEvidenceText(source).includes(normalizedExcerpt);
}
