/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC_URL?: string;
  readonly VITE_TEST_USDC_MINT?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_ORACLE_PROGRAM_ID?: string;
  readonly VITE_BETTING_PROGRAM_ID?: string;
}
