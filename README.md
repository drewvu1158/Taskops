# TaskOps Frontend

TaskOps turns a natural-language goal into an actionable workflow. The local dashboard and Chrome extension call an AWS backend:

```text
Dashboard or extension → API Gateway → Lambda → Amazon Bedrock Converse
                            │            ├─ Cognito user pool (JWT required)
                            ▼            ├─ DynamoDB per-user workspace
                  Cognito JWT verify     └─ Jira Cloud (push only, after the secret is set)
```

The deployed model is Amazon Nova 2 Lite (`us.amazon.nova-2-lite-v1:0`) in `us-east-1`.

## Prerequisites

- Node.js 22 or newer
- Google Chrome, if using the browser extension
- AWS CLI v2 and an authenticated AWS account for deployment
- AWS permissions for CloudFormation, IAM, Lambda, API Gateway, S3, Bedrock, DynamoDB, CloudWatch, Secrets Manager, and SNS

## First-time setup and deployment

Open PowerShell at this folder:

```powershell
cd "C:\path\to\Taskops"
```

Authenticate to AWS and verify the account:

```powershell
aws login --region us-east-1
aws sts get-caller-identity
```

Deploy the backend from the `backend` directory:

```powershell
cd backend
./deploy.ps1
cd ..
```

The deployment creates or updates the `taskops-bedrock` CloudFormation stack and writes two local configuration files:

- `taskops-config.js`
- `taskops-extension/config.js`

These files contain the API Gateway client key and are git-ignored. Never commit or share them.

To deploy with a hosted dashboard origin or a lower daily quota:

```powershell
cd backend
./deploy.ps1 -AllowedOrigin 'https://taskops.example.com' -DailyQuota 50
cd ..
```

The deploy also creates an Amazon Cognito user pool. The dashboard and the extension require sign-in: anyone using TaskOps now creates an account with an email and password, and every workspace (tasks, profile, daily generation quota) stays scoped to that account. New accounts get a verification code by email before the first sign-in.

### AWS CloudShell alternative

If AWS CLI is not available on Windows, upload `taskops-backend.zip` to AWS CloudShell in `us-east-1` and run:

```bash
unzip -qo taskops-backend.zip
cd backend
bash deploy-cloudshell.sh
```

Download `backend/deployment-output.json` to the local `backend` directory. Use its endpoint and key to create the two local config files from their examples, then delete `deployment-output.json`. Do not commit any of these secret-bearing files.

Detailed backend deployment, security, limits, tests, and cost notes are in [`backend/README.md`](backend/README.md).

## Run the dashboard

Open `taskops_dashboard.html` in Chrome. If it was already open, close and reopen it after deployment so it loads the generated `taskops-config.js` file.

1. Sign in or create an account on the TaskOps sign-in screen. New accounts must confirm an emailed code before signing in.
2. Click **Create workflow** or **Start with a goal**.
3. Enter a goal, such as `Plan a three-day trip to Seattle with an $800 budget.`
4. Submit the goal.
5. Confirm that TaskOps displays generated workflow steps, tools, and resources.

Prefer the **Board** tab for a drag-and-drop Kanban view (Not started / In progress / Completed — dropping a card updates its step checkboxes), or open a task and use **Adjust plan with AI** to reshape the plan with an instruction like “make it doable in under 2 hours.”

The request is sent to the deployed API with your Cognito ID token; the browser never receives AWS credentials. Saved tasks and profile sync through `GET/PUT /state`, one workspace per account. This browser keeps a per-user local copy if the API is unreachable. Open a task and choose **Send to Jira** after the Jira secret is configured.

## Load and run the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

   ```text
   C:\path\to\Taskops\taskops-extension
   ```

5. Open the extension's **Details** and enable **Allow access to file URLs**.
6. Reopen or refresh `taskops_dashboard.html` or another normal webpage.
7. Click the TaskOps extension icon.

After changing extension files, use the circular-arrow **Reload** control on the extension card. The top-left **Update** button on `chrome://extensions` is not the reload control. The extension cannot inject an overlay into restricted pages such as `chrome://extensions`, the Chrome Web Store, or a new-tab page.

The extension asks you to sign in with the same Cognito account as the dashboard the first time it syncs. Its saved workflows are cached per account in `chrome.storage.local`, separate from the dashboard's browser cache.

## Verify the backend locally

From `backend`:

```powershell
npm ci
npm test
npm run check
```

For an end-to-end check, generate a workflow from the dashboard or extension and confirm that the steps match the submitted goal. API Gateway enforces the client key, request validation, and throttling before Lambda calls Bedrock. Lambda enforces the daily generation cap. GitHub Actions runs the same `npm ci`, `npm test`, and `npm run check` commands on push and pull request.

CloudWatch alarms for Lambda errors and throttles, the manual AWS Budgets alert, and Jira setup are documented in [`backend/README.md`](backend/README.md).

## Security notes

- `taskops-config.js`, `taskops-extension/config.js`, and `backend/deployment-output.json` contain client credentials and are excluded from Git.
- The API key is visible to this local browser client by design; it is not an AWS access key, and it no longer grants workspace access on its own.
- Every API route requires a Cognito sign-in. Cognito stores and hashes passwords; TaskOps never sees them. ID tokens expire after 60 minutes and are refreshed automatically for 30 days.
- Workspaces are partitioned by the Cognito `sub` claim in DynamoDB and cached per user in the browser. A user cannot read or write another user's workspace.
- Rotate the API Gateway key if local configuration files are shared. Workspaces stored before Cognito was added remain under the old partition value and are invisible to signed-in users.
