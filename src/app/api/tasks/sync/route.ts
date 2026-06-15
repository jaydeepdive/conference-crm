import { NextResponse } from "next/server";

// Placeholder webhook for future PM platform integration.
// When the PM platform is ready, replace this with the actual sync logic.
export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "PM integration not yet wired up. This endpoint will receive task sync events from the PM platform.",
  }, { status: 501 });
}

export async function GET() {
  return NextResponse.json({
    ok: false,
    error: "PM integration not yet wired up.",
  }, { status: 501 });
}
