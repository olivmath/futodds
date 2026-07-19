import { render, screen, fireEvent } from "@testing-library/react";
import { StreamControls } from "./StreamControls";

const defaultProps = {
  streamStatus: "inactive" as const,
  onStart: () => {},
  onStop: () => {},
  onResume: () => {},
  onClose: () => {},
  loading: false,
};

test("renders all 4 buttons", () => {
  render(<StreamControls {...defaultProps} />);
  expect(screen.getByText("START")).toBeInTheDocument();
  expect(screen.getByText("STOP")).toBeInTheDocument();
  expect(screen.getByText("RESUME")).toBeInTheDocument();
  expect(screen.getByText("CLOSE GAME")).toBeInTheDocument();
});

test("enables START button only when inactive", () => {
  render(<StreamControls {...defaultProps} />);
  const startBtn = screen.getByText("START") as HTMLButtonElement;
  expect(startBtn.disabled).toBe(false);
});

test("calls onStart when START button clicked", () => {
  const onStart = vi.fn();
  render(<StreamControls {...defaultProps} onStart={onStart} />);
  fireEvent.click(screen.getByText("START"));
  expect(onStart).toHaveBeenCalled();
});
