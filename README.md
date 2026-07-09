# Ashish's AI Clone

A chat-first personal site — *"Chat with Ashish's AI Clone"* — where recruiters and
engineers talk to a bot that answers accurately about Ashish's work, gated behind
email + SMS verification, with an admin dashboard tracking leads / conversations /
messages. Inspired by satishgandham.ai, built on Ashish's own stack (AWS serverless)
so the site itself is a portfolio proof-point.

## Stack
- **Frontend**: static (S3 + CloudFront) — minimal, neutral, function-first.
- **Backend**: API Gateway → Lambda (Python). Lambdas: `/chat` (persona + an LLM
  proxy), `/lead` (create + send codes), `/verify` (check code, 5-min expiry),
  `/admin/stats` (auth).
- **Data**: DynamoDB single-table (leads · conversations · messages).
- **Messaging**: SES (email codes now) · Twilio (SMS codes, behind A2P clearance).
- **Secrets**: Secrets Manager (an LLM key, Twilio creds).
- **Infra**: CDK (TypeScript).
- **AWS account**: personal — profile `personal` (921888034384). Never `crewtron-beta`.

## Build phases
1. ✅ Persona + grounded knowledge  (`content/`)
2. ⬜ Backend (CDK): table, 4 Lambdas, API Gateway, SES/Twilio/Secrets, rate limiting
3. ⬜ Frontend: chat UI + verification flow
4. ⬜ Admin dashboard
5. ⬜ Deploy (temp CloudFront URL first; wire ashishkosana.com later)

## Prerequisites (launch blockers)
- **an LLM credits** — personal key currently $0. Chat is dead without credits.
- **SMS** — US A2P 10DLC / toll-free carrier review (days). Ship **email codes first**,
  flip SMS on when Twilio clears.
- **Domain** — `ashishkosana.com` (wire later; temp URL for now).
