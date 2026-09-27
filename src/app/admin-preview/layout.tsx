import { notFound } from "next/navigation";
import { adminPreviewEnabled } from "@/admin-preview-policy";
import { AdminPreview } from "./preview-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "RIIC Admin · Local preview", robots: { index: false, follow: false } };

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (!adminPreviewEnabled(process.env)) notFound();
  return <AdminPreview>{children}</AdminPreview>;
}
