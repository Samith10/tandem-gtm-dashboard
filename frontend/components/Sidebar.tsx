"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Providers",  href: "/providers" },
  { label: "Pipeline",   href: "/pipeline" },
  { label: "Workflows",  href: "/workflows" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: 216,
      minWidth: 216,
      height: "100vh",
      backgroundColor: "#111111",
      borderRight: "1px solid #1f1f1f",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Logo */}
      <div style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        borderBottom: "1px solid #1f1f1f",
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "Geist, -apple-system, sans-serif",
          fontWeight: 600,
          fontSize: 14,
          color: "#ffffff",
          letterSpacing: "-0.02em",
        }}>
          Tandem
        </span>
        <span style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 10,
          color: "#8a8a8a",
          marginTop: 1,
        }}>
          Technologies
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 0" }}>
        {NAV.map(({ label, href }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 20px",
                fontFamily: "Geist, -apple-system, sans-serif",
                fontSize: 13,
                color: active ? "#ffffff" : "#8a8a8a",
                textDecoration: "none",
                transition: "color 0.15s",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: "12px 20px",
        borderTop: "1px solid #1f1f1f",
        flexShrink: 0,
      }}>
        <p style={{ fontFamily: "Geist Mono, monospace", fontSize: 10, color: "#8a8a8a", margin: 0 }}>
          Provider Network Intelligence
        </p>
        <p style={{ fontFamily: "Geist Mono, monospace", fontSize: 10, color: "#8a8a8a", opacity: 0.5, margin: "2px 0 0" }}>
          v3.3.0
        </p>
      </div>
    </aside>
  );
}