import { render, screen } from "@testing-library/react";
import { PoolInfo } from "./PoolInfo";

test("renders TVL label and value", () => {
  render(<PoolInfo tvl={1000000000} feeRate={200} decimals={6} />);
  expect(screen.getByText("TVL")).toBeInTheDocument();
  expect(screen.getByText("1,000")).toBeInTheDocument();
});

test("renders fee rate as percentage", () => {
  render(<PoolInfo tvl={0} feeRate={200} decimals={6} />);
  expect(screen.getByText("Fee: 2.0%")).toBeInTheDocument();
});

test("formats TVL with decimals", () => {
  render(<PoolInfo tvl={5500000} feeRate={150} decimals={6} />);
  expect(screen.getByText("5.5")).toBeInTheDocument();
});
