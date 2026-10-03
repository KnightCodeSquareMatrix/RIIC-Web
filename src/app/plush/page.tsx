import type { Metadata } from "next";
import { PlushGallery } from "./PlushGallery";

export const metadata: Metadata = {
  title: "毛绒小伙伴 · RIIC",
  description: "可露希尔、银灰、能天使、琴柳与山的毛绒展示间。拖动看看，轻轻按一下。",
};

export default async function PlushPage({ searchParams }: { searchParams: Promise<{ debug?: string | string[] }> }) {
  const params = await searchParams;
  return <PlushGallery debug={params.debug === "1"} />;
}
