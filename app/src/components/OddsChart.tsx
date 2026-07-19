import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export function OddsChart({
  oddsSeries,
}: {
  oddsSeries: Array<{ timestamp: number; home: number; away: number; draw: number }>;
}) {
  const formattedData = oddsSeries.map((item) => ({
    ...item,
    time: new Date(item.timestamp * 1000).toLocaleTimeString(),
  }));

  return (
    <div style={{ flex: "0 0 30%", padding: "20px", borderRight: "1px solid #ddd" }}>
      <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#666" }}>Odds Over Time</h3>
      {formattedData.length === 0 ? (
        <div role="img" aria-hidden="true" style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
          No data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis domain={[1, 4]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="home" stroke="#3b82f6" dot={false} strokeWidth={2} name="Home" />
            <Line type="monotone" dataKey="away" stroke="#ef4444" dot={false} strokeWidth={2} name="Away" />
            <Line type="monotone" dataKey="draw" stroke="#8b5cf6" dot={false} strokeWidth={2} name="Draw" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
