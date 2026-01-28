import * as Sentry from "@sentry/nextjs";
import { getSentryBaseConfig } from "./sentry.utils";

Sentry.init({
  ...getSentryBaseConfig(),
});
