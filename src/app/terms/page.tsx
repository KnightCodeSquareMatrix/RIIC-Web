import { pageMetadata } from "@/i18n/metadata";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { isSklandFeatureEnabled } from "@/deployment";
import { DEFAULT_LEGAL_OPERATOR_NAME, legalIdentity } from "@/legal";
import { LEGAL_EFFECTIVE_DATE } from "@/legal-policy";

export default async function TermsPage() {
  const t = await getTranslations("app_terms_page");
  const meta = await getTranslations("Metadata");
  const identity = legalIdentity();
  const englishOperatorName = identity.operatorName === DEFAULT_LEGAL_OPERATOR_NAME ? "Closure Infrastructure Terminal maintainers" : identity.operatorName;
  const sklandEnabled = isSklandFeatureEnabled();

  return (
    <LegalDocument eyebrow={meta("siteTitle")} title={meta("terms")} effectiveDate={LEGAL_EFFECTIVE_DATE}>{t.rich("content", { element1: (chunks) => (<section>{chunks}</section>), element2: (chunks) => (<h2>{chunks}</h2>), element3: (chunks) => (<ul>{chunks}</ul>), element4: (chunks) => (<li>{chunks}</li>), element5: (chunks) => (<h2 className="font-number">{chunks}</h2>), element6: (chunks) => (<p>{chunks}</p>), value7: () => (englishOperatorName), element8: (chunks) => (<a href="https://assets.skland.com/protocols/agreement.html">{chunks}</a>), element9: (chunks) => (<a href="https://assets.skland.com/protocols/privacy.html">{chunks}</a>), element10: (chunks) => (<a href={identity.contactUrl}>{chunks}</a>), element11: (chunks) => (<a href={`mailto:${identity.contactEmail}`}>{chunks}</a>), value12: () => (identity.contactEmail), value13: () => (identity.operatorName), choice1: (sklandEnabled) ? "yes" : "no", choice2: (identity.contactEmail) ? "yes" : "no" })}</LegalDocument>
  );
}

export function generateMetadata() { return pageMetadata("terms"); }
