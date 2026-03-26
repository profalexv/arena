const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

function initSentry(app) {
  const dsn = process.env.SENTRY_DSN || "https://726526131c9da61c5fcb632b1c9da61c@o4508985177440256.ingest.us.sentry.io/4508985186222080";

  Sentry.init({
    dsn: dsn,
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });

  // The request handler must be the first middleware on the app
  app.use(Sentry.Handlers.requestHandler());
  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());
}

function setupSentryErrorHandler(app) {
  // The error handler must be before any other error middleware and after all controllers
  app.use(Sentry.Handlers.errorHandler());
}

module.exports = {
  initSentry,
  setupSentryErrorHandler
};
