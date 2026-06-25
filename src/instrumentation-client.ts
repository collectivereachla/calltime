import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://03d706eccb3a18d418c4219a329f5ee5@o4511628396003328.ingest.us.sentry.io/4511628410290176",
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
