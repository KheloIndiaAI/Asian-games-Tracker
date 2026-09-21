import { useEffect, useRef, type ReactNode } from "react";
import { Close } from "./icons";

export function Sheet({
  open,
  onClose,
  title,
  titleRight,
  height = 640,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleRight?: ReactNode;
  height?: number;
  closeLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const nodes = ref.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes.length) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="c4b-sheet-layer"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
      }}
    >
      <div
        className="c4b-sheet-backdrop"
        onClick={onClose}
        aria-hidden
        style={{ position: "absolute", inset: 0, background: "rgba(10,14,28,0.55)" }}
      />
      <div
        className="c4b-sheet-panel"
        ref={ref}
        role="dialog"
        aria-modal="true"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 430,
          height,
          maxHeight: "92vh",
          background: "var(--c-card)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          border: "1px solid var(--c-border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "grid", placeItems: "center", padding: "10px 0 2px" }}>
          <div style={{ width: 44, height: 5, borderRadius: 999, background: "var(--c-handle)" }} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 16px 12px",
            borderBottom: "1px solid var(--c-border)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>{title}</div>
          {titleRight}
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            style={{
              width: 44,
              height: 44,
              display: "grid",
              placeItems: "center",
              background: "none",
              border: 0,
              cursor: "pointer",
            }}
          >
            <Close />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
