export function PoolInfo({
  tvl,
  feeRate,
  decimals,
}: {
  tvl: number;
  feeRate: number;
  decimals: number;
}) {
  const tvlFormatted = (tvl / Math.pow(10, decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const feePercent = (feeRate / 100).toFixed(1);

  return (
    <div style={{ flex: "0 0 30%", padding: "20px", borderBottom: "1px solid #ddd" }}>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>TVL</div>
        <div style={{ fontSize: "18px", fontWeight: "bold" }}>{tvlFormatted}</div>
      </div>
      <div>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Fee Rate</div>
        <div style={{ fontSize: "18px", fontWeight: "bold" }}>Fee: {feePercent}%</div>
      </div>
    </div>
  );
}
