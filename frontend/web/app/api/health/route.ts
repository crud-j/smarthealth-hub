import { NextResponse } from "next/server";

// Frontend liveness check — used by Nginx uptime monitoring
export function GET() {
  return NextResponse.json({ status: "ok", service: "smarthealth-hub-web" });
}
