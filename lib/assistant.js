const { formatWeather } = require("./weather");

const HELP_TEXT =
  "I can look up your saved settings, change your city or units, and fetch the weather for your saved city. Try “What's the weather?”, “What are my settings?”, or “Set my city to Nairobi”.";

function displayName(settings, profileName) {
  return settings?.name || profileName || "there";
}

function parseIntent(message) {
  const text = String(message || "").trim();
  if (!text) {
    return { type: "help" };
  }

  const cityMatch = text.match(
    /^(?:set|change|update)\s+(?:my\s+)?city\s+(?:to\s+)?(.+)$/i
  );
  if (cityMatch) {
    const city = cityMatch[1].trim().replace(/[.!?]+$/, "");
    if (city) return { type: "set_city", city };
  }

  const inCityMatch = text.match(/^i(?:['’]?m| am)\s+(?:in|from)\s+(.+)$/i);
  if (inCityMatch) {
    const city = inCityMatch[1].trim().replace(/[.!?]+$/, "");
    if (city) return { type: "set_city", city };
  }

  const unitsMatch = text.match(
    /(?:set|change|update|use|switch(?:\s+to)?)\s+(?:my\s+)?(?:units?\s+(?:to\s+)?)?(metric|imperial|celsius|fahrenheit|centigrade)(?:\s+units?)?$/i
  );
  if (unitsMatch) {
    const value = unitsMatch[1].toLowerCase();
    const units =
      value === "imperial" || value === "fahrenheit" ? "imperial" : "metric";
    return { type: "set_units", units };
  }

  if (
    /\b(settings|saved city|my city|my units|my name)\b/i.test(text) &&
    !/\bweather|forecast|temperature\b/i.test(text)
  ) {
    return { type: "get_settings" };
  }

  if (/\b(weather|forecast|temperature|how(?:['’]?s| is) it outside)\b/i.test(text)) {
    return { type: "weather" };
  }

  if (/^(help|hi|hello|hey)\b/i.test(text)) {
    return { type: "help" };
  }

  return { type: "help" };
}

function traceLine({ api, detail }) {
  return { api, detail };
}

async function maybePersistName(settings, profileName, updateSettings, traces) {
  if (settings.name || !profileName) {
    return settings;
  }
  const updated = await updateSettings({ name: profileName });
  traces.push(
    traceLine({
      api: "first-party",
      detail: `PUT /api/settings for sub ${updated.sub} (saved name from login profile)`,
    })
  );
  return updated;
}

async function handleMessage(message, deps) {
  const {
    getSettings,
    updateSettings,
    getWeather,
    profileName = "",
  } = deps;

  const traces = [];
  const intent = parseIntent(message);

  try {
    if (intent.type === "help") {
      return { reply: HELP_TEXT, trace: traces, intent: intent.type };
    }

    let settings = await getSettings();
    traces.push(
      traceLine({
        api: "first-party",
        detail: `GET /api/settings for sub ${settings.sub}`,
      })
    );
    settings = await maybePersistName(
      settings,
      profileName,
      updateSettings,
      traces
    );

    if (intent.type === "get_settings") {
      const name = displayName(settings, profileName);
      const reply = `${name}, your saved settings are city ${settings.city} and ${settings.units} units.`;
      return { reply, trace: traces, intent: intent.type, settings };
    }

    if (intent.type === "set_city") {
      const updated = await updateSettings({ city: intent.city });
      traces.push(
        traceLine({
          api: "first-party",
          detail: `PUT /api/settings for sub ${updated.sub} (city → ${updated.city})`,
        })
      );
      const name = displayName(updated, profileName);
      const reply = `Done, ${name}. I saved your city as ${updated.city}. Ask me about the weather whenever you like.`;
      return { reply, trace: traces, intent: intent.type, settings: updated };
    }

    if (intent.type === "set_units") {
      const updated = await updateSettings({ units: intent.units });
      traces.push(
        traceLine({
          api: "first-party",
          detail: `PUT /api/settings for sub ${updated.sub} (units → ${updated.units})`,
        })
      );
      const name = displayName(updated, profileName);
      const unitLabel =
        updated.units === "imperial" ? "imperial (°F, mph)" : "metric (°C, km/h)";
      const reply = `Done, ${name}. I’ll use ${unitLabel} from now on.`;
      return { reply, trace: traces, intent: intent.type, settings: updated };
    }

    if (intent.type === "weather") {
      const weather = await getWeather({
        city: settings.city,
        units: settings.units,
      });
      traces.push(
        traceLine({
          api: "third-party",
          detail: `Open-Meteo geocoding + forecast for ${weather.location || weather.city}`,
        })
      );
      const name = displayName(settings, profileName);
      const summary = formatWeather(weather);
      const reply = `Hi ${name}, your saved city is ${settings.city}, so here's the weather there: ${summary}.`;
      return {
        reply,
        trace: traces,
        intent: intent.type,
        settings,
        weather,
      };
    }

    return { reply: HELP_TEXT, trace: traces, intent: "help" };
  } catch (err) {
    traces.push(
      traceLine({
        api: "error",
        detail: err.message || "Something went wrong",
      })
    );
    return {
      reply:
        err.status === 404
          ? err.message
          : `I couldn't complete that request: ${err.message}`,
      trace: traces,
      intent: intent.type,
      error: true,
    };
  }
}

module.exports = {
  HELP_TEXT,
  parseIntent,
  handleMessage,
  displayName,
};
