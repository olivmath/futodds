import { render, screen } from "@testing-library/react";
import { GameAdminTab } from "./GameAdminTab";

vi.mock("@solana/web3.js", () => ({
  Connection: vi.fn().mockImplementation(() => ({
    onLogs: vi.fn().mockReturnValue(1),
    removeOnLogsListener: vi.fn(),
  })),
}));

test("renders dashboard title when match found", () => {
  const mockMatch = {
    pda: "match-pda",
    account: { matchId: "test-match", oddsHome: 6500, oddsAway: 3000, oddsDraw: 500, status: 0, oddsSource: 0 },
  };
  const mockConnection = {
    onLogs: vi.fn().mockReturnValue(1),
    removeOnLogsListener: vi.fn(),
  };

  render(
    <GameAdminTab
      matchId="test-match"
      chainMatches={[mockMatch as any]}
      bets={[]}
      backendStatus={null}
      connection={mockConnection as any}
      backendUrl="http://localhost:8787"
    />,
  );

  expect(screen.getByText("Game Admin Dashboard")).toBeInTheDocument();
});

test("shows no match message when match not found", () => {
  const mockConnection = {
    onLogs: vi.fn().mockReturnValue(1),
    removeOnLogsListener: vi.fn(),
  };

  render(
    <GameAdminTab
      matchId="nonexistent"
      chainMatches={[]}
      bets={[]}
      backendStatus={null}
      connection={mockConnection as any}
      backendUrl="http://localhost:8787"
    />,
  );

  expect(screen.getByText("No match selected")).toBeInTheDocument();
});
