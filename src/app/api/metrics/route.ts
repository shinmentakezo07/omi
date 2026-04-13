import { NextResponse } from "next/server";
import { metricsRegistry } from "@/lib/metrics";

export async function GET() {
  const body = await metricsRegistry.metrics();
  return new NextResponse(body, {
    headers: {
      "Content-Type": metricsRegistry.contentType,
      "Cache-Control": "no-store",
    },
  });
}
