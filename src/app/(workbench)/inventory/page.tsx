import { notFound } from "next/navigation";

import InventoryPage from "workbench-inventory-route";

export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.APP_CLIENT_SKLAND_ENABLED !== "1") notFound();
  return <InventoryPage />;
}
