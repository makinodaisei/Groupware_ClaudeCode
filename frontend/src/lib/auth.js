export const CONFIG = {
  // Replace with actual values after SAM deploy
  apiEndpoint: localStorage.getItem('gw_api_endpoint') || 'https://hxt79uqjs5.execute-api.ap-northeast-1.amazonaws.com/dev',
  userPoolId: localStorage.getItem('gw_user_pool_id') || 'ap-northeast-1_zG18KzEzk',
  clientId: localStorage.getItem('gw_client_id') || '4medqun87s7o4f6qsfjr699s70',
};

export async function cognitoLogin(email, password) {
  // returns { user: { email, name, role }, token: string }
  // throws string error message on failure

  if (!CONFIG.apiEndpoint) {
    // Demo mode: return without real auth
    return { user: { email, name: email.split('@')[0], role: 'user' }, token: 'demo-token' };
  }

  const resp = await fetch(`https://cognito-idp.ap-northeast-1.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CONFIG.clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  });

  const data = await resp.json();

  if (data.AuthenticationResult) {
    const token = data.AuthenticationResult.IdToken;
    const payload = JSON.parse(atob(token.split('.')[1]));
    const user = { email, name: payload.name || email, role: (payload['cognito:groups'] || ['user'])[0] };
    return { user, token };
  } else {
    throw data.message || 'ログインに失敗しました';
  }
}
