import { pageMetadata } from "@/i18n/metadata";
import { ResetPassword } from "./reset-client";
export default function ResetPasswordPage() { return <ResetPassword />; }

export function generateMetadata() { return pageMetadata("account_reset_password"); }
