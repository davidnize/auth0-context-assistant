const express = require("express");
const { auth } = require("express-oauth2-jwt-bearer");
const settingsStore = require("../lib/settings-store");

function createApiRouter({
  issuerBaseURL,
  audience,
  store = settingsStore,
} = {}) {
  const router = express.Router();
  const checkJwt = auth({
    issuerBaseURL: issuerBaseURL || process.env.AUTH0_ISSUER_BASE_URL,
    audience: audience || process.env.AUTH0_AUDIENCE,
  });

  router.use(checkJwt);

  function subFrom(req) {
    const sub = req.auth?.payload?.sub;
    if (!sub) {
      const error = new Error("The access token is missing a sub claim");
      error.status = 401;
      throw error;
    }
    return sub;
  }

  router.get("/settings", (req, res, next) => {
    try {
      const settings = store.getOrCreate(subFrom(req));
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });

  router.put("/settings", (req, res, next) => {
    try {
      const settings = store.update(subFrom(req), req.body || {});
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createApiRouter };
