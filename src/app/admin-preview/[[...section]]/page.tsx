import { notFound } from "next/navigation";
import { adminPreviewEnabled } from "@/admin-preview-policy";
import { PreviewPage } from "../preview-page";

export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  if (!adminPreviewEnabled(process.env)) notFound();
  const { section = [] } = await params;
  if (section.length > 1 || !["", "users", "issues", "quality", "skills", "changelog"].includes(section[0] ?? "")) notFound();
  return <PreviewPage section={section[0] ?? ""} />;
}
