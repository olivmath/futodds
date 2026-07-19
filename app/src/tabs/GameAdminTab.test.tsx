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
    account: { id: "test-match", home_odds: 6500, away_odds: 3000, draw_odds: 500, status: 0 },
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
    />,
  );

  expect(screen.getByText("No match selected")).toBeInTheDocument();
});
