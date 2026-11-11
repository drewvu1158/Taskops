window.TASKOPS_CONFIG = Object.freeze({
  apiUrl: 'https://example.execute-api.us-east-1.amazonaws.com/prod/workflow',
  apiKey: 'replace-with-the-local-client-key',
  // Copy userPoolId and clientId from the stack outputs after deploying.
  cognito: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_xxxxxxxxx',
    clientId: 'replace-with-the-cognito-client-id'
  }
});
// Workspace sync uses /state and Jira export uses /workflow/jira beside this workflow URL.
// Both require a Cognito sign-in: the app sends the ID token as a Bearer authorization header.
