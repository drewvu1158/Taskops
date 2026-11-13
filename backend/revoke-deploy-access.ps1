param(
  [string]$UserName = 'taskops-deploy-partner',
  [string]$Relation = 'taskops-deploy-access',
  [switch]$Restore
)

# Cuts a teammate's deploy access immediately, or restores it with -Restore.
# Access keys are deactivated first (instant and reversible); -Restore re-enables them.
# Run -Purge to delete the keys permanently instead of deactivating them.

$ErrorActionPreference = 'Continue'
$AwsCommand = Get-Command aws -ErrorAction SilentlyContinue
$Aws = if ($AwsCommand) { $AwsCommand.Source } else { 'C:\Program Files\Amazon\AWSCLIV2\aws.exe' }
if (-not (Test-Path $Aws)) { throw 'AWS CLI v2 is required.' }

$AccountId = & $Aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0) { throw 'AWS authentication failed. Sign in, then rerun this script.' }

$KeyIds = & $Aws iam list-access-keys --user-name $UserName --query "AccessKeyMetadata[].AccessKeyId" --output text
if ($LASTEXITCODE -ne 0) { throw "IAM user $UserName was not found." }

$Status = if ($Restore) { 'Active' } else { 'Inactive' }
if ($KeyIds) {
  foreach ($KeyId in ($KeyIds -split '\s+')) {
    if (-not $KeyId) { continue }
    & $Aws iam update-access-key --user-name $UserName --access-key-id $KeyId --status $Status 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Host "$KeyId -> $Status" } else { Write-Warning "Could not update $KeyId" }
  }
} else {
  Write-Warning "$UserName has no access keys."
}

if ($Restore) {
  & $Aws iam attach-user-policy --user-name $UserName --policy-arn "arn:aws:iam::${AccountId}:policy/$Relation" 2>$null
  Write-Host "Policy reattached. Access restored for $UserName."
} else {
  & $Aws iam detach-user-policy --user-name $UserName --policy-arn "arn:aws:iam::${AccountId}:policy/$Relation" 2>$null
  Write-Host "Policy detached. $UserName can no longer deploy."
}

$Check = & $Aws iam get-user --user-name $UserName --query "User.UserName" --output text 2>$null
if ($Check) { Write-Host "IAM user $UserName still exists; only its access was changed." }
