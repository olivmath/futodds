# AWS Deployment And Data Plan

## Recommended Stack

| Layer | AWS service | Reason |
|---|---|---|
| Frontend | Amplify Hosting | Git-based deploy for the Vite/React SPA, custom domains, CDN, previews. |
| Backend | ECS Fargate / ECS Express Mode | Fits a long-running Express service with Solana RPC calls and an odds poller. |
| Database | DynamoDB | Firebase-like document/key-value persistence with low setup overhead. |
| Secrets | AWS Secrets Manager or SSM Parameter Store | Stores Solana key material, TxLINE tokens, RPC URLs, and API config outside git. |
| Logs | CloudWatch Logs | Centralized backend logs, poller errors, and transaction traces. |
| CI/CD | GitHub Actions | Run tests, build containers, push to ECR, deploy ECS service. |

Avoid starting new work on AWS App Runner for this project. AWS has announced App Runner is closed to new customers from April 30, 2026, and recommends ECS Express Mode for similar managed-container simplicity.

## Why This Shape

The backend is not a simple request/response API only. It runs a poller that periodically:

- syncs open matches from Solana;
- decides whether each match uses `random` or `txline` odds;
- fetches TxLINE snapshots when needed;
- submits `update_odds` transactions to the oracle contract;
- records transaction/error history.

That workload fits a persistent container better than Lambda.

## Minimal DynamoDB Model

```ts
type MatchConfig = {
  matchId: string; // partition key
  oddsSource: "random" | "txline";
  createdAt: string;
  updatedAt: string;
};

type BackendTx = {
  id: string; // partition key
  matchId: string;
  type: "update_odds" | "settle_bet";
  signature: string;
  at: string;
};

type BackendError = {
  id: string; // partition key
  message: string;
  context?: Record<string, unknown>;
  at: string;
};
```

## Deployment Checklist

- Add a backend `Dockerfile`.
- Move `.env.local` values into AWS secrets:
  - `SOLANA_RPC_URL`
  - `ORACLE_KEYPAIR`
  - `ORACLE_PROGRAM_ID`
  - `BETTING_PROGRAM_ID`
  - `TEST_USDC_MINT`
  - `TXLINE_API_ORIGIN`
  - `TXLINE_GUEST_JWT`
  - `TXLINE_API_TOKEN`
- Replace in-memory store with a DynamoDB-backed repository.
- Ensure only one poller instance is active, or add a distributed lock in DynamoDB.
- Push backend image to ECR.
- Deploy backend to ECS Fargate / ECS Express Mode.
- Deploy frontend to Amplify Hosting with `VITE_BACKEND_URL` pointing to the backend HTTPS URL.
- Add CloudWatch alarms for backend errors and failed poller runs.

## Firebase-Like AWS Options

| Need | Firebase product | AWS option |
|---|---|---|
| Static/web hosting | Firebase Hosting | Amplify Hosting or S3 + CloudFront |
| Document database | Firestore | DynamoDB |
| Realtime GraphQL/sync | Firestore realtime | AppSync + DynamoDB |
| Auth | Firebase Auth | Cognito |
| File storage | Firebase Storage | S3 |
| Serverless functions | Cloud Functions | Lambda + API Gateway |

For this project, use DynamoDB directly from the backend first. Add AppSync later only if the frontend needs realtime subscriptions or direct client-side data sync.
