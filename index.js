require("dotenv").config();

const express = require("express");
const path = require("path");
const { auth, requiresAuth } = require("express-openid-connect");
const { createApiRouter } = require("./routes/api");
const {
  callSettingsApi,
  getAccessTokenFromSession,
} = require("./lib/first-party-client");
const { getWeather } = require("./lib/weather");
const { handleMessage } = require("./lib/assistant");

const app = express();
const port = process.env.PORT || 3000;
const baseURL = process.env.AUTH0_BASE_URL || `http://localhost:${port}`;

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET,
  baseURL,
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  authorizationParams: {
    response_type: "code",
    audience: process.env.AUTH0_AUDIENCE,
    scope: "openid profile email read:settings",
  },
};

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(auth(config));
app.use(
  "/api",
  createApiRouter({
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
    audience: process.env.AUTH0_AUDIENCE,
  })
);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout({ title, body }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="page">
      <header class="brand">
        <a class="logo" href="/">
          <span class="mark" aria-hidden="true"></span>
          Context Assistant
        </a>
        <span class="eyebrow">MLH x Auth0</span>
      </header>
      ${body}
    </main>
  </body>
</html>`;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  const isAuthenticated = req.oidc.isAuthenticated();
  const name = escapeHtml(
    req.oidc.user?.name || req.oidc.user?.nickname || "there"
  );

  const body = isAuthenticated
    ? `
      <section class="card">
        <p class="eyebrow">Welcome back</p>
        <h1>You are signed in, ${name}.</h1>
        <div class="status in">Logged in</div>
        <p>Your Auth0 session holds an access token for the first-party settings API. Open the assistant to ask about the weather in your saved city.</p>
        <div class="actions">
          <a class="btn btn-primary" href="/chat">Open assistant</a>
          <a class="btn btn-ghost" href="/logout">Log out</a>
        </div>
      </section>
      <p class="foot">Login uses Auth0 Universal Login. The assistant then calls a first-party API and Open-Meteo.</p>
    `
    : `
      <section class="card">
        <p class="eyebrow">Getting started</p>
        <h1>A context-preserving assistant.</h1>
        <div class="status out">Logged out</div>
        <p>Sign in with Auth0 Universal Login. The assistant will read your saved city from a protected first-party API, then fetch the weather from Open-Meteo.</p>
        <div class="actions">
          <a class="btn btn-primary" href="/login">Log in</a>
        </div>
      </section>
      <p class="foot">A small demo for the MLH x Auth0 challenge.</p>
    `;

  res.send(layout({ title: "Context-Preserving Assistant", body }));
});

app.get("/chat", requiresAuth(), (req, res) => {
  const name = escapeHtml(
    req.oidc.user?.name || req.oidc.user?.nickname || "there"
  );

  const body = `
    <section class="card chat-card">
      <p class="eyebrow">Protected assistant</p>
      <h1>Hi, ${name}.</h1>
      <p>Ask me about the weather. I’ll use your saved city from the first-party API, then call Open-Meteo.</p>
      <div id="transcript" class="transcript" aria-live="polite"></div>
      <form id="chat-form" class="chat-form" autocomplete="off">
        <label class="sr-only" for="message">Message</label>
        <input id="message" name="message" type="text" maxlength="400" placeholder="What's the weather?" required />
        <button class="btn btn-primary" type="submit">Send</button>
      </form>
      <div class="suggestions">
        <button type="button" class="chip" data-prompt="What's the weather?">What's the weather?</button>
        <button type="button" class="chip" data-prompt="What are my settings?">What are my settings?</button>
        <button type="button" class="chip" data-prompt="Set my city to Nairobi">Set my city to Nairobi</button>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/">Back home</a>
        <a class="btn btn-ghost" href="/logout">Log out</a>
      </div>
    </section>
    <script src="/chat.js" defer></script>
  `;

  res.send(layout({ title: "Chat · Context-Preserving Assistant", body }));
});

app.post("/assistant", requiresAuth(), async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "A message is required" });
    }

    const { accessToken, tokenType } = await getAccessTokenFromSession(req);
    const profileName = req.oidc.user?.name || req.oidc.user?.nickname || "";

    const result = await handleMessage(message, {
      profileName,
      getSettings: () =>
        callSettingsApi({
          baseURL,
          accessToken,
          tokenType,
          method: "GET",
        }),
      updateSettings: (body) =>
        callSettingsApi({
          baseURL,
          accessToken,
          tokenType,
          method: "PUT",
          body,
        }),
      getWeather,
    });

    res.json(result);
  } catch (err) {
    if (err.status === 401) {
      return res.status(401).json({
        error: "unauthorized",
        message: err.message,
      });
    }
    next(err);
  }
});

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const wantsJson =
    req.path.startsWith("/api") ||
    req.path.startsWith("/assistant") ||
    req.accepts("json") === "json" && req.accepts("html") !== "html";

  if (wantsJson || req.path.startsWith("/api") || req.path.startsWith("/assistant")) {
    return res.status(status).json({
      error: status === 401 ? "unauthorized" : err.code || "server_error",
      message:
        status === 401 ? "Authentication required" : err.message || "Internal Server Error",
    });
  }

  res.status(status).send(
    layout({
      title: "Error",
      body: `<section class="card"><h1>Something went wrong</h1><p>${escapeHtml(
        err.message || "Internal Server Error"
      )}</p><a class="btn btn-ghost" href="/">Back home</a></section>`,
    })
  );
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running at ${baseURL}`);
  });
}

module.exports = { app, baseURL };
