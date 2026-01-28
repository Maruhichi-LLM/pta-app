import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const error = new Error("Sentry debug error (dev only)");
  const eventId = Sentry.captureException(error);
  const flushed = await Sentry.flush(2000);
  return NextResponse.json(
    {
      error: "Sentry debug error (dev only)",
      eventId,
      flushed,
    },
    { status: 500 }
  );
}
