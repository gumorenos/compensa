import type { Metadata } from "next";
import Link from "next/link";
import { SessionNav } from "./session-nav.js";
import "./globals.css";
import "./workflow.css";
import "./auth.css";

export const metadata: Metadata = {
  title: "Compensa",
  description: "Valoración de puestos trazable y determinística",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <div className="shell topbar-inner">
            <Link href="/" className="brand" aria-label="Compensa, inicio">
              <span className="brand-mark">C</span>
              <span>
                <strong>Compensa</strong>
                <small>Valoración de puestos</small>
              </span>
            </Link>
            <nav className="nav" aria-label="Navegación principal">
              <Link href="/">Puestos</Link>
              <Link href="/gold-standard">Gold Standard</Link>
              <SessionNav />
            </nav>
          </div>
        </header>
        <main className="shell main-content">{children}</main>
      </body>
    </html>
  );
}
