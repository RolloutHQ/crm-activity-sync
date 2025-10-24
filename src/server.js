const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const {
  port,
  SESSION_SECRET,
  SESSION_MAX_AGE_MS,
  allowedOrigins,
} = require("./config");

const app = express();

// Respect reverse proxy (Render/Heroku) for secure cookies
app.set("trust proxy", 1);

app.use(
  cors(
    allowedOrigins.length > 0
      ? {
          origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) callback(null, true);
            else callback(new Error("Not allowed by CORS"));
          },
          credentials: true,
        }
      : undefined
  )
);

app.use(
  session({
    name: "rollout.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: SESSION_MAX_AGE_MS,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

app.use(express.json());
app.use((req, _res, next) => {
  console.log(`[Server] ${req.method} ${req.originalUrl}`);
  next();
});

// Routes
app.use(require("./routes/session"));
app.use(require("./routes/credentials"));
app.use(require("./routes/people"));
app.use(require("./routes/personInsights"));
app.use(require("./routes/appointments"));

// Static client
const clientDistPath = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDistPath));
app.get("*", (_req, res, next) => {
  const indexPath = path.join(clientDistPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    next();
    return;
  }
  res.sendFile(indexPath);
});

function start() {
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

module.exports = { app, start };

