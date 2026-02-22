"use client";

import { useEffect, useRef, useState } from "react";
import { getOutreachStreamUrl, saveOutreachCopy, getProvider } from "@/lib/api";
import type { Provider } from "@/lib/types";

function providerName(p: Provider): string {
  if (p.organization_name) return p.organization_name;
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : `NPI ${p.npi}`;
}

export default function OutreachModal({
  provider,
  onClose,
  onSaved,
}: {
  provider: Provider;
  onClose: () => void;
  onSaved: (updated: Provider) => void;
}) {
  const [copy, setCopy] = useState(provider.outreach_copy ?? "");
  const [streaming, setStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [copy]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    return () => esRef.current?.close();
  }, []);

  function handleGenerate() {
    if (streaming) {
      esRef.current?.close();
      setStreaming(false);
      return;
    }
    setCopy("");
    setError(null);
    setStreaming(true);

    const url = getOutreachStreamUrl(provider.id);
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      if (e.data === "[DONE]") {
        es.close();
        setStreaming(false);
        return;
      }
      setCopy((prev) => prev + e.data);
    };

    es.onerror = () => {
      es.close();
      setStreaming(false);
      setError("Generation failed. Is ANTHROPIC_API_KEY set?");
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveOutreachCopy(provider.id, copy);
      const updated = await getProvider(provider.id);
      onSaved(updated);
    } catch (err) {
      void err;
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: "relative",
          zIndex: 10000,
          background: "#ffffff",
          border: "1px solid #e8e8e4",
          borderRadius: 7,
          width: "100%",
          maxWidth: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e8e8e4", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p className="font-sans font-semibold text-md text-text-primary">
                AI Outreach
              </p>
              <p className="mono text-xs text-text-muted" style={{ marginTop: 2 }}>
                {providerName(provider)}
                <span style={{ margin: "0 6px", color: "#e8e8e4" }}>|</span>
                {provider.taxonomy_description ?? "Unknown specialty"}
                <span style={{ margin: "0 6px", color: "#e8e8e4" }}>|</span>
                Score {provider.icp_score}
              </p>
            </div>
            <button
              onClick={onClose}
              className="mono text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              ESC
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <textarea
            ref={textareaRef}
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            placeholder="Click Generate to create AI-personalized outreach copy..."
            className="font-sans text-sm text-text-primary"
            style={{
              width: "100%",
              minHeight: 180,
              background: "#f7f7f5",
              border: "1px solid #e8e8e4",
              borderRadius: 5,
              padding: 12,
              resize: "none",
              outline: "none",
              lineHeight: 1.6,
              fontFamily: "inherit",
            }}
          />

          {/* Context chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {[
              provider.city && provider.state ? `${provider.city}, ${provider.state}` : null,
              provider.provider_count_at_address <= 1
                ? "Solo practice"
                : `${provider.provider_count_at_address} providers`,
              provider.npi_type === 1 ? "Individual NPI" : "Org NPI",
            ]
              .filter(Boolean)
              .map((chip) => (
                <span
                  key={chip}
                  className="mono text-2xs text-text-muted"
                  style={{
                    background: "#f7f7f5",
                    border: "1px solid #e8e8e4",
                    borderRadius: 3,
                    padding: "2px 8px",
                  }}
                >
                  {chip}
                </span>
              ))}
          </div>

          {error && (
            <p className="mono text-xs text-red" style={{ marginTop: 12 }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderTop: "1px solid #e8e8e4",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {streaming && (
              <>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#2563eb",
                    display: "inline-block",
                    animation: "pulse 1s infinite",
                  }}
                />
                <span className="mono text-2xs text-accent">Generating...</span>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleGenerate}
              className="mono text-xs text-white bg-accent rounded hover:opacity-90 transition-opacity"
              style={{ padding: "6px 12px" }}
            >
              {streaming ? "Stop" : "Generate"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !copy.trim()}
              className="mono text-xs text-text-primary border border-border rounded hover:border-text-muted transition-colors disabled:opacity-40"
              style={{ padding: "6px 12px" }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}