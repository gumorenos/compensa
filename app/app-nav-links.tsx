import Link from "next/link";
import {
  AccessError,
  requireRequestAccess,
  roleHasPermission,
} from "../src/auth/access.js";

export async function AppNavLinks() {
  let access;
  try {
    access = await requireRequestAccess("VIEW");
  } catch (error) {
    if (error instanceof AccessError) return null;
    throw error;
  }

  return (
    <>
      <Link href="/overview">Inicio</Link>
      <Link href="/">Puestos</Link>
      <Link href="/valuations">Valoraciones</Link>
      <Link href="/comparables">Comparar</Link>
      <Link href="/methodologies">Metodologías</Link>
      {roleHasPermission(access.role, "MANAGE_GOLD_STANDARD") && (
        <Link href="/gold-standard">Gold Standard</Link>
      )}
      <Link href="/calibration">Calibración</Link>
      {roleHasPermission(access.role, "MANAGE_AI_ASSISTANCE") && (
        <Link href="/ai-assistance">IA</Link>
      )}
    </>
  );
}
