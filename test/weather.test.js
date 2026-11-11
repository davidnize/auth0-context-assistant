const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getWeather, formatWeather, describeWeather } = require("../lib/weather");

describe("Open-Meteo weather", () => {
  it("maps known weather codes", () => {
    assert.equal(describeWeather(0), "Clear sky");
    assert.equal(describeWeather(2), "Partly cloudy");
    assert.equal(describeWeather(999), "Unknown conditions");
  });

  it("formats a forecast summary", () => {
    const text = formatWeather({
      description: "Partly cloudy",
      temperature: 24,
      temperatureUnit: "°C",
      windSpeed: 10,
      windUnit: "km/h",
      humidity: 40,
    });
    assert.equal(text, "Partly cloudy, 24°C, wind 10 km/h, humidity 40%");
  });

  it("fetches a real forecast for Lusaka", async () => {
    const weather = await getWeather({ city: "Lusaka", units: "metric" });
    assert.match(weather.city, /Lusaka/i);
    assert.match(weather.location, /Lusaka/i);
    assert.equal(typeof weather.temperature, "number");
    assert.equal(weather.temperatureUnit, "°C");
    assert.equal(typeof weather.description, "string");
    assert.ok(weather.description.length > 0);
    assert.equal(typeof weather.latitude, "number");
    assert.equal(typeof weather.longitude, "number");
  });
});
