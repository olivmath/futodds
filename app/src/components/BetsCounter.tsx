export function BetsCounter({
  homeCount,
  awayCount,
  drawCount,
}: {
  homeCount: number;
  awayCount: number;
  drawCount: number;
}) {
  const total = homeCount + awayCount + drawCount;

  return (
    <div style={{ flex: "0 0 30%", padding: "20px" }}>
      <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px", fontWeight: "bold" }}>Open Bets</div>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Home</div>
        <div style={{ fontSize: "20px", fontWeight: "bold" }}>{homeCount}</div>
      </div>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Away</div>
        <div style={{ fontSize: "20px", fontWeight: "bold" }}>{awayCount}</div>
      </div>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Draw</div>
        <div style={{ fontSize: "20px", fontWeight: "bold" }}>{drawCount}</div>
      </div>
      <div style={{ fontSize: "12px", color: "#999", paddingTop: "12px", borderTop: "1px solid #ddd" }}>
        Total: {total}
      </div>
    </div>
  );
}
