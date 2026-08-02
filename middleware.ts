import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.method === "POST" && request.nextUrl.pathname === "/api/jobs/import") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/jobs/import-learned";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/jobs/import"],
};
