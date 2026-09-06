import type { ApiResponse } from "@/types";

export async function requestAdminData<T>(url: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  let body: ApiResponse<T>;
  try { body = await response.json() as ApiResponse<T>; } catch { throw new Error(fallback); }
  if (!response.ok || !body.success) throw new Error(body.success ? fallback : body.error.message || fallback);
  return body.data;
}
