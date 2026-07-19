export function StreamControls({
  streamStatus,
  onStart,
  onStop,
  onResume,
  onClose,
  loading,
}: {
  streamStatus: "active" | "paused" | "inactive";
  onStart: () => void;
  onStop: () => void;
  onResume: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const buttonStyle = {
    padding: "8px 12px",
    marginRight: "8px",
    marginBottom: "8px",
    fontSize: "12px",
    fontWeight: "bold" as const,
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "opacity 0.2s",
  };

  return (
    <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" as const }}>
      <button
        onClick={onStart}
        disabled={streamStatus !== "inactive" || loading}
        style={{ ...buttonStyle, backgroundColor: "#10b981", color: "white", opacity: streamStatus !== "inactive" || loading ? 0.5 : 1 }}
      >
        {loading ? "..." : "START"}
      </button>
      <button
        onClick={onStop}
        disabled={streamStatus !== "active" || loading}
        style={{ ...buttonStyle, backgroundColor: "#ef4444", color: "white", opacity: streamStatus !== "active" || loading ? 0.5 : 1 }}
      >
        {loading ? "..." : "STOP"}
      </button>
      <button
        onClick={onResume}
        disabled={streamStatus !== "paused" || loading}
        style={{ ...buttonStyle, backgroundColor: "#f59e0b", color: "white", opacity: streamStatus !== "paused" || loading ? 0.5 : 1 }}
      >
        {loading ? "..." : "RESUME"}
      </button>
      <button
        onClick={onClose}
        disabled={loading}
        style={{ ...buttonStyle, backgroundColor: "#6b7280", color: "white", opacity: loading ? 0.5 : 1 }}
      >
        {loading ? "..." : "CLOSE GAME"}
      </button>
    </div>
  );
}
