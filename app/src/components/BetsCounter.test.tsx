import { render, screen } from "@testing-library/react";
import { BetsCounter } from "./BetsCounter";

test("renders bet counts for all directions", () => {
  render(<BetsCounter homeCount={5} awayCount={3} drawCount={2} />);
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("renders direction labels", () => {
  render(<BetsCounter homeCount={0} awayCount={0} drawCount={0} />);
  expect(screen.getByText("Home")).toBeInTheDocument();
  expect(screen.getByText("Away")).toBeInTheDocument();
  expect(screen.getByText("Draw")).toBeInTheDocument();
});

test("renders total count", () => {
  render(<BetsCounter homeCount={5} awayCount={3} drawCount={2} />);
  expect(screen.getByText("Total: 10")).toBeInTheDocument();
});
