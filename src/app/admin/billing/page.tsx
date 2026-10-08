import { adminPageClass, AdminPageHeader } from "../admin-page";
import { BillingCodes } from "./billing-codes";

export const dynamic = "force-dynamic";

export default function AdminBillingPage() {
  return <main id="admin-content" className={adminPageClass}>
    <AdminPageHeader title="billing" description="billingHint" />
    <BillingCodes />
  </main>;
}
