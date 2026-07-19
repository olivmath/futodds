const typeEmoji: Record<string, string> = {
  stream: "🌐",
  odds: "📈",
  bet: "🎲",
  pool: "💰",
  error: "❌",
  info: "ℹ️",
};

export function EventsLog({
  events,
}: {
  events: Array<{ timestamp: string; type: string; label: string; detail: string }>;
}) {
  return (
    <div style={{ flex: "0 0 100%", padding: "20px", backgroundColor: "#f9fafb", borderTop: "1px solid #ddd" }}>
      <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "bold" }}>Events Log</h3>
      <div
        style={{
          height: "200px",
          overflowY: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          backgroundColor: "white",
        }}
      >
        {events.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#999", fontSize: "14px" }}>No events yet</div>
        ) : (
          <div>
            {events.map((event, idx) => (
              <div
                key={idx}
                style={{
                  padding: "12px",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  display: "flex",
                  gap: "12px",
                }}
              >
                <span style={{ color: "#999", minWidth: "70px" }}>{event.timestamp}</span>
                <span style={{ minWidth: "20px" }}>{typeEmoji[event.type] || "•"}</span>
                <span style={{ fontWeight: "bold", color: "#333", flex: 1 }}>{event.label}</span>
                <span style={{ color: "#666", flex: 1 }}>{event.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
