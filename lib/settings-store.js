const fs = require("fs");
const path = require("path");

const DEFAULT_FILE = path.join(__dirname, "..", "data", "settings.json");

const DEFAULTS = {
  city: "Lusaka",
  units: "metric",
  name: "",
};

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function loadAll(filePath = DEFAULT_FILE) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function saveAll(all, filePath = DEFAULT_FILE) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(all, null, 2) + "\n", "utf8");
}

function normalize(record, sub) {
  const units = record?.units === "imperial" ? "imperial" : "metric";
  const city =
    typeof record?.city === "string" && record.city.trim()
      ? record.city.trim()
      : DEFAULTS.city;
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  return { sub, city, units, name };
}

function getOrCreate(sub, filePath = DEFAULT_FILE) {
  if (!sub) {
    throw new Error("A user sub is required");
  }
  const all = loadAll(filePath);
  if (!all[sub]) {
    all[sub] = { ...DEFAULTS };
    saveAll(all, filePath);
  }
  return normalize(all[sub], sub);
}

function update(sub, patch = {}, filePath = DEFAULT_FILE) {
  const current = getOrCreate(sub, filePath);
  const next = { ...current };

  if (Object.prototype.hasOwnProperty.call(patch, "city")) {
    const city = typeof patch.city === "string" ? patch.city.trim() : "";
    if (!city) {
      const error = new Error("City must be a non-empty string");
      error.status = 400;
      throw error;
    }
    next.city = city;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "units")) {
    if (patch.units !== "metric" && patch.units !== "imperial") {
      const error = new Error("Units must be 'metric' or 'imperial'");
      error.status = 400;
      throw error;
    }
    next.units = patch.units;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    if (typeof patch.name !== "string") {
      const error = new Error("Name must be a string");
      error.status = 400;
      throw error;
    }
    next.name = patch.name.trim();
  }

  const all = loadAll(filePath);
  all[sub] = { city: next.city, units: next.units, name: next.name };
  saveAll(all, filePath);
  return normalize(all[sub], sub);
}

module.exports = {
  DEFAULTS,
  DEFAULT_FILE,
  getOrCreate,
  update,
};
