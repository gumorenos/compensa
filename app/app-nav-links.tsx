import {
  AccessError,
  requireRequestAccess,
  roleHasPermission,
} from "../src/auth/access.js";
import { ActiveNavLink } from "./active-nav-link.js";

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
      <ActiveNavLink href="/overview">Inicio</ActiveNavLink>
      <ActiveNavLink href="/">Puestos</ActiveNavLink>
      <ActiveNavLink href="/valuations">Valoraciones</ActiveNavLink>
      <ActiveNavLink href="/comparables">Comparar</ActiveNavLink>
      <ActiveNavLink href="/methodologies">Metodologías</ActiveNavLink>
      {roleHasPermission(access.role, "MANAGE_GOLD_STANDARD") && (
        <ActiveNavLink href="/gold-standard">Gold Standard</ActiveNavLink>
      )}
      <ActiveNavLink href="/calibration">Calibración</ActiveNavLink>
      {roleHasPermission(access.role, "MANAGE_AI_ASSISTANCE") && (
        <ActiveNavLink href="/ai-assistance">IA</ActiveNavLink>
      )}
    </>
  );
}
