import { pageMetadata } from "@/i18n/metadata";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { isSklandFeatureEnabled } from "@/deployment";
import { DEFAULT_LEGAL_OPERATOR_NAME, legalIdentity } from "@/legal";
import { PRIVACY_EFFECTIVE_DATE } from "@/legal-policy";

export default async function PrivacyPage() {
  const t = await getTranslations("app_privacy_page");
  const meta = await getTranslations("Metadata");
  const identity = legalIdentity();
  const englishOperatorName = identity.operatorName === DEFAULT_LEGAL_OPERATOR_NAME ? "Closure Infrastructure Terminal maintainers" : identity.operatorName;
  const sklandEnabled = isSklandFeatureEnabled();

  return (
    <LegalDocument eyebrow={meta("siteTitle")} title={meta("privacy")} effectiveDate={PRIVACY_EFFECTIVE_DATE}>{t.rich("content", { element1: (chunks) => (<section>{chunks}</section>), element2: (chunks) => (<h2>{chunks}</h2>), element3: (chunks) => (<ul>{chunks}</ul>), element4: (chunks) => (<li>{chunks}</li>), element5: (chunks) => (<span className="font-number">{chunks}</span>), element6: (chunks) => (<h2 className="font-number">{chunks}</h2>), element7: (chunks) => (<p>{chunks}</p>), value8: () => (englishOperatorName), element9: (chunks) => (<a href={identity.contactUrl}>{chunks}</a>), element10: (chunks) => (<a href={`mailto:${identity.contactEmail}`}>{chunks}</a>), value11: () => (identity.contactEmail), element12: (chunks) => (<h3>{chunks}</h3>), element13: (chunks) => (<a href="https://assets.skland.com/protocols/agreement.html">{chunks}</a>), element14: (chunks) => (<a href="https://assets.skland.com/protocols/privacy.html">{chunks}</a>), value15: () => (identity.operatorName), choice1: (sklandEnabled) ? "yes" : "no", choice2: (identity.contactEmail) ? "yes" : "no" })}</LegalDocument>
  );
}

export function generateMetadata() { return pageMetadata("privacy"); }
