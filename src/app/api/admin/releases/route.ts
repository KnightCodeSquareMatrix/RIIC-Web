import { handleAdminReleases } from "@/server/release-notes-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleAdminReleases;
export const POST = handleAdminReleases;
