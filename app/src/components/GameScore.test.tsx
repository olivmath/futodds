import { render, screen } from "@testing-library/react";
import { GameScore } from "./GameScore";

test("renders home and away scores", () => {
  render(<GameScore homeScore={2} awayScore={1} streamStatus="active" />);
  expect(screen.getByText("2")).toBeInTheDocument();
  expect(screen.getByText("1")).toBeInTheDocument();
});

test("shows ACTIVE indicator when stream is active", () => {
  render(<GameScore homeScore={0} awayScore={0} streamStatus="active" />);
  expect(screen.getByText("ACTIVE")).toBeInTheDocument();
});

test("shows PAUSED indicator when stream is paused", () => {
  render(<GameScore homeScore={0} awayScore={0} streamStatus="paused" />);
  expect(screen.getByText("PAUSED")).toBeInTheDocument();
});
