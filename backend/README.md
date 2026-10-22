# TaskOps Bedrock backend

A minimal serverless backend: API Gateway REST API → Lambda → Amazon Bedrock Converse using `us.amazon.nova-2-lite-v1:0` in `us-east-1`.

## Security and limits

- Lambda receives Bedrock access through its IAM execution role; no AWS credentials are sent to either frontend.
- `POST /workflow` requires an API Gateway key. The key identifies this local client and enforces quota; it is not end-user identity authentication. Use Cognito/OIDC before serving TaskOps to untrusted users.
- The usage plan allows 1 request/second, burst 2, and 100 requests/day by default.
- Lambda reserved concurrency is 2. API Gateway and Lambda both validate the request. Goals are 3-600 characters.
- Bedrock output is capped at 1,200 tokens and then validated into 5-9 steps before it reaches the browser.
- CORS defaults to `*` because the dashboard currently runs as a local file and the extension has a `chrome-extension://` origin. Set a concrete origin after hosting the dashboard.
- Generated resource URLs are not accepted from the model. The frontend only shows known tool names and links to real search pages; it does not label fabricated links as search results.

The API key is necessarily visible to a browser client. It is written only to git-ignored local config files. Rotate it if the local files are shared.

## Deploy

Requires Node.js 22+, AWS CLI v2, and an authenticated AWS account with CloudFormation, IAM, Lambda, API Gateway, S3, and Bedrock permissions.

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
./deploy.ps1 -AllowedOrigin 'https://taskops.example.com' -DailyQuota 50
```

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

No resource has a fixed hourly charge. At the default 100 requests/day cap, assume about 700 input and 700 output tokens per generated workflow:

| Component | Unit price | Approx. monthly cost at 3,000 workflows |
|---|---:|---:|
| Nova 2 Lite US cross-Region input | $0.33 / 1M tokens | $0.69 |
| Nova 2 Lite US cross-Region output | $2.75 / 1M tokens | $5.78 |
| API Gateway REST API | about $3.50 / 1M calls in the first tier | $0.02 |
| Lambda requests and 256 MB compute | usage-based; free tier often covers this volume | less than $0.01 outside free tier |
| CloudWatch Logs and deployment S3 | usage-based | pennies at this volume |
| **Estimated total** | | **about $6.50/month maximum under these assumptions** |

Actual Bedrock cost depends on token use. A more typical 300 input / 500 output-token workflow is about $0.0015, or about $4.42 for 3,000 generations. The $100 credit therefore covers tens of thousands of ordinary generations, but quota and billing alerts should remain enabled.

Pricing references:

- [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)
- [Amazon API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
