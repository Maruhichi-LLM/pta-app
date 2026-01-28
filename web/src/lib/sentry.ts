import * as Sentry from "@sentry/nextjs";

type ScopeLike = ReturnType<typeof Sentry.getCurrentScope>;

export type ApiSentryContext = {
  module: string;
  action: string;
  route?: string;
  method?: string;
  groupId?: number | null;
  memberId?: number | null;
  entity?: Record<string, number | string | null | undefined>;
};

function applyContext(scope: ScopeLike, context: ApiSentryContext) {
  scope.setTag("module", context.module);
  scope.setTag("action", context.action);
  if (context.route) {
    scope.setTag("route", context.route);
  }
  if (context.method) {
    scope.setTag("method", context.method);
  }

  const knotContext: Record<string, number> = {};
  if (typeof context.groupId === "number") {
    knotContext.groupId = context.groupId;
  }
  if (typeof context.memberId === "number") {
    knotContext.memberId = context.memberId;
  }
  if (Object.keys(knotContext).length > 0) {
    scope.setContext("knot", knotContext);
  }

  if (context.entity) {
    scope.setContext("entity", context.entity);
  }
}

export function setApiSentryContext(context: ApiSentryContext) {
  const scope = Sentry.getCurrentScope();
  applyContext(scope, context);
}

export function captureApiException(
  error: unknown,
  context: ApiSentryContext,
  extra?: Record<string, unknown>
) {
  Sentry.withScope((scope) => {
    applyContext(scope, context);
    if (extra) {
      scope.setExtras(extra);
    }
    Sentry.captureException(error);
  });
}

export function addSentryBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  category = "knot"
) {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: "info",
  });
}
