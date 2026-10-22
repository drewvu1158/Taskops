#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-taskops-bedrock}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"
DAILY_QUOTA="${DAILY_QUOTA:-100}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="taskops-deploy-${ACCOUNT_ID}-${REGION}"

if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration \
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
fi

npm ci --omit=dev
aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket "$BUCKET" \
  --output-template-file packaged.yaml \
  --region "$REGION" >/dev/null
aws cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "AllowedOrigin=$ALLOWED_ORIGIN" "DailyQuota=$DAILY_QUOTA"

ENDPOINT="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)"
API_KEY_ID="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='ApiKeyId'].OutputValue" --output text)"
API_KEY="$(aws apigateway get-api-key --api-key "$API_KEY_ID" --include-value --region "$REGION" --query value --output text)"

umask 077
printf '{"endpoint":"%s","apiKey":"%s","stack":"%s","bucket":"%s"}\n' \
  "$ENDPOINT" "$API_KEY" "$STACK_NAME" "$BUCKET" >deployment-output.json
printf 'Endpoint: %s\nStack: %s\nDeployment bucket: %s\nSensitive local client config: deployment-output.json\n' \
  "$ENDPOINT" "$STACK_NAME" "$BUCKET"
