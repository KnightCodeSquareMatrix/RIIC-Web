import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { featureAccessMode, type RestrictedFeature } from "@/feature-access";
import { requireFeatureSession } from "./feature-access";

export async function requireFeaturePage(feature: RestrictedFeature) {
  // Public pages keep their sign-in prompt; APIs still require a valid account.
  if (featureAccessMode(feature) === "public") return;
  const requestHeaders = await headers();
  try {
    await requireFeatureSession(requestHeaders, feature);
  } catch {
    notFound();
  }
}
