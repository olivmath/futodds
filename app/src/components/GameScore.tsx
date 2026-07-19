const statusColors = {
  active: "#22c55e",
  paused: "#f97316",
  inactive: "#6b7280",
};

export function GameScore({
  homeScore,
  awayScore,
  streamStatus,
}: {
  homeScore: number;
  awayScore: number;
  streamStatus: "active" | "paused" | "inactive";
}) {
  const statusText = streamStatus.toUpperCase();
  const statusColor = statusColors[streamStatus];

  return (
    <div style={{ flex: "0 0 40%", padding: "20px", borderRight: "1px solid #ddd" }}>
      <div style={{ fontSize: "72px", fontWeight: "bold", textAlign: "center", marginBottom: "20px" }}>
        <span>{homeScore}</span>
        <span style={{ margin: "0 20px" }}>-</span>
        <span>{awayScore}</span>
      </div>
      <div
        style={{
          textAlign: "center",
          padding: "12px",
          backgroundColor: statusColor,
          color: "white",
          borderRadius: "8px",
          fontWeight: "bold",
          fontSize: "14px",
        }}
      >
        {statusText}
      </div>
    </div>
  );
}
