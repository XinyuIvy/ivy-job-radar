import { NextResponse } from "next/server";

// Ingestion applies approved rules after authentication in its shared service.
export function middleware() {
  return NextResponse.next();
}

export const config = { matcher: ["/api/jobs/import"] };
