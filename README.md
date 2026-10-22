# TaskOps Frontend

TaskOps turns a natural-language goal into an actionable workflow. The local dashboard and Chrome extension call an AWS backend:

```text
Dashboard or extension → API Gateway → Lambda → Amazon Bedrock Converse
```

The deployed model is Amazon Nova 2 Lite (`us.amazon.nova-2-lite-v1:0`) in `us-east-1`.

## Prerequisites

- Node.js 22 or newer
- Google Chrome, if using the browser extension
- AWS CLI v2 and an authenticated AWS account for deployment
- AWS permissions for CloudFormation, IAM, Lambda, API Gateway, S3, and Bedrock

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

1. Click **Create workflow** or **Start with a goal**.
2. Enter a goal, such as `Plan a three-day trip to Seattle with an $800 budget.`
3. Submit the goal.
4. Confirm that TaskOps displays generated workflow steps, tools, and resources.

The request is sent to the deployed API; the browser never receives AWS credentials.

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

## Verify the backend locally

From `backend`:

```powershell
npm ci
npm test
npm run check
```

For an end-to-end check, generate a workflow from the dashboard or extension and confirm that the steps match the submitted goal. API Gateway enforces the client key, request validation, throttling, and daily quota before Lambda calls Bedrock.

## Security notes

- `taskops-config.js`, `taskops-extension/config.js`, and `backend/deployment-output.json` contain client credentials and are excluded from Git.
- The API key is visible to this local browser client by design; it is not an AWS access key.
- Rotate the API Gateway key if local configuration files are shared.
- Add Cognito or another user-authentication layer before serving the app to untrusted users.
