const dotenv = require("dotenv");
dotenv.config();

const port = process.env.PORT || 5174;
const DEFAULT_ROLLOUT_CLIENT_ID = (process.env.ROLLOUT_CLIENT_ID || "").trim();
const DEFAULT_ROLLOUT_CLIENT_SECRET = (process.env.ROLLOUT_CLIENT_SECRET || "").trim();
const DEFAULT_CONSUMER_KEY = process.env.ROLLOUT_CONSUMER_KEY || "demo-consumer";
const TOKEN_TTL_SECS = Number(process.env.ROLLOUT_TOKEN_TTL_SECS) || 60 * 60;
const SESSION_SECRET = process.env.SESSION_SECRET || "rollout-demo-secret";
const SESSION_MAX_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 1000 * 60 * 60 * 12;
const ROLLOUT_API_BASE = process.env.ROLLOUT_API_BASE || "https://universal.rollout.com/api";
const ROLLOUT_CRM_API_BASE = process.env.ROLLOUT_CRM_API_BASE || "https://crm.universal.rollout.com/api";
const PERSON_RECORDS_LIMIT = Number(process.env.PERSON_RECORDS_LIMIT || process.env.PERSON_EVENTS_LIMIT) || 25;
const MAX_PAGINATED_REQUESTS = Number(process.env.MAX_PAGINATED_REQUESTS) || 5;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  port,
  DEFAULT_ROLLOUT_CLIENT_ID,
  DEFAULT_ROLLOUT_CLIENT_SECRET,
  DEFAULT_CONSUMER_KEY,
  TOKEN_TTL_SECS,
  SESSION_SECRET,
  SESSION_MAX_AGE_MS,
  ROLLOUT_API_BASE,
  ROLLOUT_CRM_API_BASE,
  PERSON_RECORDS_LIMIT,
  MAX_PAGINATED_REQUESTS,
  allowedOrigins,
};

