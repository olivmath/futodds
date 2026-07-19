import { render, screen } from "@testing-library/react";
import { EventsLog } from "./EventsLog";

test("renders events log header", () => {
  render(<EventsLog events={[]} />);
  expect(screen.getByText("Events Log")).toBeInTheDocument();
});

test("renders event timestamps and labels", () => {
  const events = [
    { timestamp: "10:45:23", type: "stream", label: "stream.started", detail: "fixtureId=12345" },
  ];
  render(<EventsLog events={events} />);
  expect(screen.getByText("10:45:23")).toBeInTheDocument();
  expect(screen.getByText("stream.started")).toBeInTheDocument();
});

test("shows empty state when no events", () => {
  render(<EventsLog events={[]} />);
  expect(screen.getByText("No events yet")).toBeInTheDocument();
});
