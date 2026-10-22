param(
  [string]$Region = 'us-east-1',
  [string]$StackName = 'taskops-bedrock',
  [string]$AllowedOrigin = '*',
  [int]$DailyQuota = 100
)

$ErrorActionPreference = 'Stop'
$AwsCommand = Get-Command aws -ErrorAction SilentlyContinue
$Aws = if ($AwsCommand) { $AwsCommand.Source } else { 'C:\Program Files\Amazon\AWSCLIV2\aws.exe' }
if (-not (Test-Path $Aws)) { throw 'AWS CLI v2 is required.' }

$AccountId = & $Aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0) { throw 'AWS authentication failed. Sign in, then rerun this script.' }

$Bucket = "taskops-deploy-$AccountId-$Region"
& $Aws s3api head-bucket --bucket $Bucket 2>$null
if ($LASTEXITCODE -ne 0) {
  if ($Region -eq 'us-east-1') {
    & $Aws s3api create-bucket --bucket $Bucket --region $Region | Out-Null
  } else {
    & $Aws s3api create-bucket --bucket $Bucket --region $Region --create-bucket-configuration "LocationConstraint=$Region" | Out-Null
  }
  & $Aws s3api put-public-access-block --bucket $Bucket --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true' | Out-Null
}

Push-Location $PSScriptRoot
try {
  npm ci --omit=dev
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }

  & $Aws cloudformation package `
    --template-file template.yaml `
    --s3-bucket $Bucket `
    --output-template-file packaged.yaml `
    --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'CloudFormation packaging failed.' }

  & $Aws cloudformation deploy `
    --template-file packaged.yaml `
    --stack-name $StackName `
    --region $Region `
    --capabilities CAPABILITY_IAM `
    --no-fail-on-empty-changeset `
    --parameter-overrides "AllowedOrigin=$AllowedOrigin" "DailyQuota=$DailyQuota"
  if ($LASTEXITCODE -ne 0) { throw 'CloudFormation deployment failed.' }

  $Endpoint = & $Aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text
  $ApiKeyId = & $Aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='ApiKeyId'].OutputValue" --output text
  $ApiKey = & $Aws apigateway get-api-key --api-key $ApiKeyId --include-value --region $Region --query value --output text
  if ($LASTEXITCODE -ne 0) { throw 'Unable to retrieve the API key.' }

  $DashboardConfig = "window.TASKOPS_CONFIG = Object.freeze({ apiUrl: '$Endpoint', apiKey: '$ApiKey' });`n"
  $ExtensionConfig = "globalThis.TASKOPS_CONFIG = Object.freeze({ apiUrl: '$Endpoint', apiKey: '$ApiKey' });`n"
  Set-Content -Path (Join-Path $PSScriptRoot '..\taskops-config.js') -Value $DashboardConfig -Encoding utf8 -NoNewline
  Set-Content -Path (Join-Path $PSScriptRoot '..\taskops-extension\config.js') -Value $ExtensionConfig -Encoding utf8 -NoNewline

  Write-Host "Endpoint: $Endpoint"
  Write-Host "Stack: $StackName"
  Write-Host "Deployment bucket: $Bucket"
  Write-Host 'Local dashboard and extension configuration files were written (and are git-ignored).'
} finally {
  Pop-Location
}
