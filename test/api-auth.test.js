const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const express = require("express");
const { createApiRouter } = require("../routes/api");

describe("GET /api/settings authentication", () => {
  let server;
  let baseURL;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      createApiRouter({
        issuerBaseURL: "https://example.auth0.com",
        audience: "https://context-assistant-api",
      })
    );
    app.use((err, req, res, next) => {
      const status = err.status || err.statusCode || 500;
      res.status(status).json({
        error: status === 401 ? "unauthorized" : "server_error",
        message: status === 401 ? "Authentication required" : err.message,
      });
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseURL = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("rejects requests without a token with 401", async () => {
    const response = await fetch(`${baseURL}/api/settings`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, "unauthorized");
  });

  it("rejects requests with a malformed token with 401", async () => {
    const response = await fetch(`${baseURL}/api/settings`, {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    assert.equal(response.status, 401);
  });
});
