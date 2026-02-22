"use client";

export default function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 99999,
        background: "#ffffff",
        border: "1px solid #e8e8e4",
        borderRadius: 5,
        padding: "8px 14px",
        pointerEvents: "none",
      }}
    >
      <p
        style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 11,
          color: "#0a0a0a",
          margin: 0,
        }}
      >
        {message}
      </p>
    </div>
  );
}