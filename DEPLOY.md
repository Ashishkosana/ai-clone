# Deploy — Ashish's AI Clone

All commands target your **personal** AWS account via `--profile personal`
(account 921888034384). Never `crewtron-beta`.

## 0. Prerequisites (these gate a working site)
- **LLM key** — defaults to **Google Gemini (free)**: get a key at aistudio.google.com
  and put it in the secret as `geminiApiKey`. To switch to Claude later: add
  `claudeApiKey` to the secret and set `llmProvider: "claude"` in `cdk.json`, redeploy.
- **SES out of sandbox** — by default SES only emails *verified* addresses. A public
  site must email arbitrary visitors, so request **SES production access** (Console →
  SES → Account dashboard → Request production access; ~24h). Until then, only
  verified test emails receive codes.
- **Verify the from-address/domain** in SES (`noreply@ashishkosana.com`, set in
  `cdk.json` → `sesFromEmail`). Verify the domain or that single address.
- **SMS (later)** — leave `smsEnabled=false` in `cdk.json` until Twilio A2P 10DLC /
  toll-free clears; then add Twilio creds to the secret and flip it to `true`.

## 1. One-time CDK bootstrap (first time only)
```bash
cd cdk && npm install
CDK_DEFAULT_ACCOUNT=921888034384 CDK_DEFAULT_REGION=us-east-1 \
  npx cdk bootstrap aws://921888034384/us-east-1 --profile personal
```

## 2. First deploy (creates API + hosting)
```bash
cd cdk
npm run prebuild          # syncs shared code + persona into the lambdas
npx cdk deploy --profile personal
```
Note the outputs: **ApiUrl**, **SiteUrl**, **SecretArn**.

## 3. Populate the secret
```bash
aws secretsmanager put-secret-value --profile personal \
  --secret-id ai-clone/secrets \
  --secret-string '{
    "geminiApiKey":  "<from aistudio.google.com>",
    "claudeApiKey":  "",
    "sessionSecret": "<run: openssl rand -hex 32>",
    "adminToken":    "<run: openssl rand -hex 16>",
    "twilioSid": "", "twilioAuthToken": "", "twilioFrom": ""
  }'
```

## 4. Wire the frontend to the API, then redeploy
Put the **ApiUrl** into `web/config.js` (`apiBase`, keep the trailing slash), then:
```bash
cd cdk && npx cdk deploy --profile personal   # re-uploads web/ to S3 + invalidates CDN
```

## 5. Use it
- Site: the **SiteUrl** output (CloudFront URL). Wire `ashishkosana.com` later.
- Admin: `<SiteUrl>/admin.html` — paste the `adminToken` from the secret.

## Updating the persona / knowledge
Edit `content/persona.md` or `content/knowledge.md`, then `npx cdk deploy` (prebuild
re-bundles them into the chat Lambda).

## Cost guardrails already in place
- Chat is **verified-only** (no token → no Claude call).
- API Gateway throttled (20 rps / 40 burst).
- Chat model defaults to `claude-sonnet-4-6` (cheaper); override with the
  `CLAUDE_MODEL` env on `ChatFn` if you want Opus.
