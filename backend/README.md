# TaskOps Bedrock backend

A serverless backend: API Gateway REST API → Lambda → Amazon Bedrock Converse using `us.amazon.nova-2-lite-v1:0` in `us-east-1`. The same Lambda stores the shared dashboard/extension workspace in DynamoDB and can push a workflow to Jira.

```text
Dashboard or extension → API Gateway → Lambda → Bedrock
                                         ├─ DynamoDB workspace
                                         └─ Secrets Manager → Jira Cloud (push only)
```

## Security and limits

- Lambda receives Bedrock, DynamoDB, and Secrets Manager access through its IAM execution role; no AWS credentials are sent to either frontend.
- `POST /workflow`, `GET/PUT /state`, and `POST /workflow/jira` require an API Gateway key. The key identifies this local client and is the workspace partition key. It is not end-user identity authentication. Use Cognito/OIDC before serving TaskOps to untrusted users.
- The usage plan allows 5 requests/second, burst 10, and 10,000 API calls/day by default so workspace sync is not blocked by the generation cap.
- Bedrock generation is capped separately at 100 workflows per API key per UTC day. That counter lives in DynamoDB and does not include state sync.
- Lambda reserved concurrency is 2. API Gateway and Lambda both validate workflow requests. Goals are 3-600 characters.
- Bedrock output is capped at 1,200 tokens and then validated into 5-9 steps before it reaches the browser.
- CORS defaults to `*` because the dashboard currently runs as a local file and the extension has a `chrome-extension://` origin. Set a concrete origin after hosting the dashboard.
- Generated resource URLs are not accepted from the model. The frontend only shows known tool names and links to real search pages; it does not label fabricated links as search results.

The API key is necessarily visible to a browser client. It is written only to git-ignored local config files. Rotate it if the local files are shared.

## Deploy

Requires Node.js 22+, AWS CLI v2, and an authenticated AWS account with CloudFormation, IAM, Lambda, API Gateway, S3, Bedrock, DynamoDB, CloudWatch, Secrets Manager, and SNS permissions.

```powershell
aws login --region us-east-1
./deploy.ps1
```

For access-key or federated shell credentials, use the corresponding AWS CLI authentication flow and verify it first:

```powershell
aws sts get-caller-identity
```

The script installs production dependencies, uploads the Lambda bundle to a private deployment bucket, deploys the `taskops-bedrock` CloudFormation stack, and writes these git-ignored browser configs:

- `../taskops-config.js`
- `../taskops-extension/config.js`

If local Windows Installer is unavailable, upload `taskops-backend.zip` to AWS CloudShell in `us-east-1`, then run:

```bash
unzip taskops-backend.zip
cd backend
bash deploy-cloudshell.sh
```

Download the generated `deployment-output.json`, use its values in copies of `taskops-config.example.js` and `taskops-extension/config.example.js`, then delete the downloaded JSON. It contains the client API key.

Deploy with a hosted dashboard origin and a lower daily quota when needed:

```powershell
./deploy.ps1 -AllowedOrigin 'https://taskops.example.com' -DailyQuota 50 -ApiDailyQuota 10000 -AlarmEmail 'you@example.com'
```

`AlarmEmail` subscribes that address to the CloudWatch alarms. AWS sends a confirmation message that must be accepted before notifications arrive. Leave it empty to create the alarms without email.

## Workspace sync

`GET /state` and `PUT /state` store one workspace per API key:

```json
{ "tasks": [], "profile": { "name": "TaskOps User" }, "revision": 1 }
```

The dashboard and extension treat this item as the source of truth and keep `localStorage` or `chrome.storage.local` as a cache when the API is unreachable. A missing remote workspace is filled from the local cache on the next successful load.

## Jira export

Direction: **push-only**. TaskOps creates a Jira epic and one child task per step. Jira does not write status back.

Bidirectional sync is not implemented. A webhook would need a public callback, a shared secret, and a stable map from Jira issue keys to local step ids. Without that, an inbound transition could overwrite checkbox state the dashboard still owns. Push-only keeps TaskOps as the source of truth and avoids an unauthenticated status writer.

After deploy, replace the generated secret (see the `JiraSecretArn` stack output) with:

```json
{
  "baseUrl": "https://your-domain.atlassian.net",
  "email": "you@example.com",
  "apiToken": "jira-api-token",
  "projectKey": "TASK"
}
```

```powershell
aws secretsmanager put-secret-value --secret-id taskops-bedrock/jira --secret-string file://jira.json --region us-east-1
```

Do not commit `jira.json`. The project should be a Jira Cloud team-managed project, or a company-managed project that accepts `parent` on Task issues under an Epic. `POST /workflow/jira` then creates the epic and steps. The dashboard **Send to Jira** button calls that route.

CloudFormation does not overwrite `GenerateSecretString` on later deploys, so replacing the secret value survives `./deploy.ps1`.

## Alarms

The stack creates two CloudWatch alarms on the workflow Lambda:

- `Errors` sum ≥ 1 in 5 minutes
- `Throttles` sum ≥ 1 in 5 minutes

Missing metric data does not alarm. Pass `-AlarmEmail` to notify; otherwise the alarms are visible in the CloudWatch console only.

## AWS Budgets alert

An AWS Budget is **not** in `template.yaml`. Budgets are account-scoped, often fail or collide on an existing account, and a stack delete would remove an account-level budget. Cost-allocation tag filters also stay at $0 until someone activates the tag in Billing, which CloudFormation cannot do.

Create the alert in Billing and Cost Management → Budgets → Create budget:

1. Choose a monthly cost budget.
2. Set the amount you want to protect, such as `$10`.
3. Add email alerts at 80% forecasted and 100% actual.
4. Optionally filter by the tag `Project = TaskOps` after activating that user-defined tag under Billing → Cost allocation tags. Deploy scripts tag the stack with `Project=TaskOps`.

The same alert can be created with the CLI. Replace the account id and email first:

```powershell
$account = aws sts get-caller-identity --query Account --output text
@'
{
  "BudgetName": "TaskOps-monthly",
  "BudgetLimit": { "Amount": "10", "Unit": "USD" },
  "BudgetType": "COST",
  "TimeUnit": "MONTHLY"
}
'@ | Set-Content -Encoding utf8 budget.json
@'
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "you@example.com" }]
  }
]
'@ | Set-Content -Encoding utf8 budget-notifications.json
aws budgets create-budget --account-id $account --budget file://budget.json --notifications-with-subscribers file://budget-notifications.json
Remove-Item budget.json, budget-notifications.json
```

Confirm the budget email before relying on it. This alert is account-wide unless you add a tag filter after the `Project` tag is active in Billing.

## Test

```powershell
npm test
npm run check
```

Smoke the deployed API without printing the key:

```powershell
$config = Get-Content ../taskops-config.js -Raw
# Submit through the dashboard for the end-to-end check; direct API calls require the x-api-key value.
```

## Load the local browser extension

The extension content script supports ordinary `http(s)` pages and the local dashboard file. In Chrome:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select `CPSC 490/Frontend/taskops-extension`.
3. Open the extension's **Details** and enable **Allow access to file URLs**.
4. Click **Reload** after changing extension files.
5. Reopen or refresh `taskops_dashboard.html` before clicking the extension icon.

The extension action cannot open an overlay on restricted Chrome pages such as `chrome://extensions`, the Chrome Web Store, or a new-tab page.

## Cost estimate

DynamoDB on-demand and CloudWatch alarms have no hourly charge at this volume. Secrets Manager bills about $0.40 per secret per month, which is the one fixed charge. At the default 100 generations/day cap, assume about 700 input and 700 output tokens per generated workflow:

| Component | Unit price | Approx. monthly cost at 3,000 workflows |
|---|---:|---:|
| Nova 2 Lite US cross-Region input | $0.33 / 1M tokens | $0.69 |
| Nova 2 Lite US cross-Region output | $2.75 / 1M tokens | $5.78 |
| API Gateway REST API | about $3.50 / 1M calls in the first tier | $0.02 |
| Lambda requests and 256 MB compute | usage-based; free tier often covers this volume | less than $0.01 outside free tier |
| CloudWatch Logs, alarms, and deployment S3 | usage-based | pennies at this volume |
| DynamoDB on-demand workspace and quota counter | usage-based | pennies at this volume |
| Secrets Manager | $0.40 / secret-month | $0.40 |
| **Estimated total** | | **about $7/month maximum under these assumptions** |

Actual Bedrock cost depends on token use. A more typical 300 input / 500 output-token workflow is about $0.0015, or about $4.42 for 3,000 generations. The $100 credit therefore covers tens of thousands of ordinary generations, but quota and billing alerts should remain enabled.

Pricing references:

- [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)
- [Amazon API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/)
