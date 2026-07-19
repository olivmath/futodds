import { render, screen } from "@testing-library/react";
import { OddsChart } from "./OddsChart";

test("renders chart title", () => {
  render(<OddsChart oddsSeries={[]} />);
  expect(screen.getByText("Odds Over Time")).toBeInTheDocument();
});

test("renders empty state when no data", () => {
  render(<OddsChart oddsSeries={[]} />);
  expect(screen.getByText("No data yet")).toBeInTheDocument();
});

test("renders chart with data points", () => {
  const data = [
    { timestamp: 1000, home: 1.85, away: 2.1, draw: 3.2 },
    { timestamp: 2000, home: 1.8, away: 2.15, draw: 3.25 },
  ];
  render(<OddsChart oddsSeries={data} />);
  expect(screen.queryByText("No data yet")).not.toBeInTheDocument();
});
