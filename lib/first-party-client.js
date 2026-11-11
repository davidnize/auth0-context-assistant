async function callSettingsApi({
  baseURL,
  accessToken,
  tokenType = "Bearer",
  method = "GET",
  body,
}) {
  if (!accessToken) {
    const error = new Error(
      "No access token in the session. Check AUTH0_AUDIENCE and the authorization code flow."
    );
    error.status = 401;
    throw error;
  }

  const response = await fetch(`${baseURL}/api/settings`, {
    method,
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.message || `Settings API failed with status ${response.status}`
    );
    error.status = response.status;
    error.body = data;
    throw error;
  }

  return data;
}

async function getAccessTokenFromSession(req) {
  const token = req.oidc?.accessToken;
  if (!token?.access_token) {
    const error = new Error(
      "No access token in the session. Log out and log back in after AUTH0_AUDIENCE is set."
    );
    error.status = 401;
    throw error;
  }

  let { token_type, access_token, isExpired, refresh } = token;
  if (typeof isExpired === "function" && isExpired()) {
    const refreshed = await refresh();
    access_token = refreshed.access_token;
    token_type = refreshed.token_type || token_type;
  }

  return {
    tokenType: token_type || "Bearer",
    accessToken: access_token,
  };
}

module.exports = {
  callSettingsApi,
  getAccessTokenFromSession,
};
