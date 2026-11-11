const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { parseIntent, handleMessage, HELP_TEXT } = require("../lib/assistant");
const settingsStore = require("../lib/settings-store");

describe("parseIntent", () => {
  it("detects weather questions", () => {
    assert.equal(parseIntent("What's the weather?").type, "weather");
    assert.equal(parseIntent("how's the forecast in my city").type, "weather");
    assert.equal(parseIntent("How's it outside?").type, "weather");
  });

  it("detects setting a city", () => {
    assert.deepEqual(parseIntent("Set my city to Nairobi"), {
      type: "set_city",
      city: "Nairobi",
    });
    assert.deepEqual(parseIntent("I'm in Cape Town"), {
      type: "set_city",
      city: "Cape Town",
    });
  });

  it("detects setting units", () => {
    assert.deepEqual(parseIntent("Set my units to imperial"), {
      type: "set_units",
      units: "imperial",
    });
    assert.deepEqual(parseIntent("switch to celsius"), {
      type: "set_units",
      units: "metric",
    });
  });

  it("detects a settings question", () => {
    assert.equal(parseIntent("What are my settings?").type, "get_settings");
  });

  it("falls back to help", () => {
    assert.equal(parseIntent("tell me a joke").type, "help");
    assert.equal(parseIntent("").type, "help");
  });
});

describe("handleMessage", () => {
  function mockDeps(overrides = {}) {
    const settings = {
      sub: "auth0|user-1",
      city: "Lusaka",
      units: "metric",
      name: "David",
      ...overrides.settings,
    };
    const calls = { get: 0, put: [], weather: [] };
    return {
      calls,
      settings,
      deps: {
        profileName: overrides.profileName ?? "David",
        getSettings: async () => {
          calls.get += 1;
          return { ...settings };
        },
        updateSettings: async (patch) => {
          Object.assign(settings, patch);
          calls.put.push(patch);
          return { ...settings };
        },
        getWeather: async (query) => {
          calls.weather.push(query);
          return {
            city: query.city,
            location: `${query.city}, Zambia`,
            temperature: 24,
            temperatureUnit: query.units === "imperial" ? "°F" : "°C",
            humidity: 40,
            windSpeed: 10,
            windUnit: query.units === "imperial" ? "mph" : "km/h",
            description: "Partly cloudy",
          };
        },
      },
    };
  }

  it("answers weather using the first-party city and Open-Meteo", async () => {
    const { deps, calls } = mockDeps();
    const result = await handleMessage("What's the weather?", deps);

    assert.equal(result.intent, "weather");
    assert.match(result.reply, /Hi David/);
    assert.match(result.reply, /saved city is Lusaka/);
    assert.match(result.reply, /Partly cloudy, 24°C/);
    assert.equal(calls.get, 1);
    assert.deepEqual(calls.weather, [{ city: "Lusaka", units: "metric" }]);
    assert.equal(result.trace[0].api, "first-party");
    assert.match(result.trace[0].detail, /GET \/api\/settings for sub auth0\|user-1/);
    assert.equal(result.trace[1].api, "third-party");
    assert.match(result.trace[1].detail, /Open-Meteo/);
  });

  it("updates the city through the first-party API", async () => {
    const { deps, calls } = mockDeps();
    const result = await handleMessage("Set my city to Nairobi", deps);

    assert.equal(result.intent, "set_city");
    assert.match(result.reply, /saved your city as Nairobi/);
    assert.deepEqual(calls.put, [{ city: "Nairobi" }]);
    assert.equal(result.trace.at(-1).api, "first-party");
    assert.match(result.trace.at(-1).detail, /PUT \/api\/settings/);
  });

  it("lists saved settings", async () => {
    const { deps } = mockDeps();
    const result = await handleMessage("What are my settings?", deps);
    assert.equal(result.intent, "get_settings");
    assert.match(result.reply, /city Lusaka/);
    assert.match(result.reply, /metric units/);
    assert.equal(result.trace[0].api, "first-party");
  });

  it("returns help text when the message is not recognized", async () => {
    const { deps, calls } = mockDeps();
    const result = await handleMessage("play some music", deps);
    assert.equal(result.intent, "help");
    assert.equal(result.reply, HELP_TEXT);
    assert.equal(calls.get, 0);
    assert.deepEqual(result.trace, []);
  });

  it("persists the login profile name when settings have none", async () => {
    const { deps, calls } = mockDeps({
      settings: { name: "" },
      profileName: "David",
    });
    const result = await handleMessage("What are my settings?", deps);
    assert.deepEqual(calls.put, [{ name: "David" }]);
    assert.match(result.reply, /^David,/);
  });

  it("works with the JSON settings store", async () => {
    const filePath = path.join(os.tmpdir(), `settings-test-${Date.now()}.json`);
    const sub = "auth0|store-user";
    const result = await handleMessage("What are my settings?", {
      profileName: "David",
      getSettings: async () => settingsStore.getOrCreate(sub, filePath),
      updateSettings: async (patch) => settingsStore.update(sub, patch, filePath),
      getWeather: async () => ({}),
    });
    assert.match(result.reply, /city Lusaka/);
    const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assert.equal(saved[sub].city, "Lusaka");
    assert.equal(saved[sub].name, "David");
    fs.unlinkSync(filePath);
  });
});
