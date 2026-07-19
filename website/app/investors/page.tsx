import type { Metadata } from "next";
import InvestorPanel from "@/components/investor/InvestorPanel";

export const metadata: Metadata = {
  title: "oddsdex — Investor panel",
  description:
    "Fund the per-match liquidity pools that back every trade. Deposit USDC, track your LP shares, withdraw and claim fees.",
};

export default function InvestorsPage() {
  return <InvestorPanel />;
}
