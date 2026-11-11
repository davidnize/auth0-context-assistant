const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  97: "Heavy thunderstorm",
  99: "Thunderstorm with heavy hail",
};

function describeWeather(code) {
  return WEATHER_CODES[code] || "Unknown conditions";
}

async function geocodeCity(city) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding failed with status ${response.status}`);
  }

  const data = await response.json();
  const place = data.results?.[0];
  if (!place) {
    const error = new Error(`I couldn't find a location named "${city}".`);
    error.status = 404;
    throw error;
  }

  return {
    name: place.name,
    country: place.country || "",
    admin1: place.admin1 || "",
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone || "auto",
  };
}

async function getForecast({ latitude, longitude, units, timezone }) {
  const imperial = units === "imperial";
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"
  );
  url.searchParams.set("temperature_unit", imperial ? "fahrenheit" : "celsius");
  url.searchParams.set("wind_speed_unit", imperial ? "mph" : "kmh");
  url.searchParams.set("timezone", timezone || "auto");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Forecast failed with status ${response.status}`);
  }

  const data = await response.json();
  const current = data.current || {};
  return {
    temperature: current.temperature_2m,
    temperatureUnit: imperial ? "°F" : "°C",
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    windUnit: imperial ? "mph" : "km/h",
    weatherCode: current.weather_code,
    description: describeWeather(current.weather_code),
    time: current.time,
  };
}

async function getWeather({ city, units = "metric" }) {
  const place = await geocodeCity(city);
  const forecast = await getForecast({
    latitude: place.latitude,
    longitude: place.longitude,
    units,
    timezone: place.timezone,
  });

  const location = [place.name, place.admin1, place.country]
    .filter(Boolean)
    .join(", ");

  return {
    city: place.name,
    location,
    latitude: place.latitude,
    longitude: place.longitude,
    units,
    ...forecast,
  };
}

function formatWeather(weather) {
  const temp =
    weather.temperature == null
      ? "an unknown temperature"
      : `${weather.temperature}${weather.temperatureUnit}`;
  const wind =
    weather.windSpeed == null
      ? ""
      : `, wind ${weather.windSpeed} ${weather.windUnit}`;
  const humidity =
    weather.humidity == null ? "" : `, humidity ${weather.humidity}%`;
  return `${weather.description}, ${temp}${wind}${humidity}`;
}

module.exports = {
  WEATHER_CODES,
  describeWeather,
  geocodeCity,
  getForecast,
  getWeather,
  formatWeather,
};
