import "server-only";

import { Resend } from "resend";
import { AUTH_EMAIL_BRAND, brandedAuthEmailFrom } from "@/auth-email-brand";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

type AuthEmailInput =
  | { to: string; code: string; kind: "verify-code" }
  | { to: string; url: string; kind: "reset" };

export async function sendAuthEmail(input: AuthEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const configuredFrom = process.env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !configuredFrom) throw new Error("RESEND_API_KEY and AUTH_EMAIL_FROM are required to send authentication email.");
  const from = brandedAuthEmailFrom(configuredFrom);
  if (input.kind === "verify-code") {
    const code = escapeHtml(input.code);
    const result = await new Resend(apiKey).emails.send({
      from,
      to: input.to,
      subject: `邮箱验证码｜${AUTH_EMAIL_BRAND}`,
      text: `${AUTH_EMAIL_BRAND}\n\n你的邮箱验证码是：${input.code}\n\n验证码将在 10 分钟后失效。请勿将验证码转发给他人；如果不是你发起的操作，请忽略此邮件。`,
      html: `<h1 style="font-size:18px">${AUTH_EMAIL_BRAND}</h1><p>你的邮箱验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:0.28em">${code}</p><p>验证码将在 10 分钟后失效。请勿将验证码转发给他人；如果不是你发起的操作，请忽略此邮件。</p>`,
    });
    if (result.error) throw new Error(`Resend rejected authentication email: ${result.error.message}`);
    return;
  }
  const action = "重置密码";
  const result = await new Resend(apiKey).emails.send({
    from,
    to: input.to,
    subject: `${action}｜${AUTH_EMAIL_BRAND}`,
    text: `${AUTH_EMAIL_BRAND}\n\n${action}：${input.url}\n\n链接将在 1 小时后失效。如果不是你发起的操作，请忽略此邮件。`,
    html: `<h1 style="font-size:18px">${AUTH_EMAIL_BRAND}</h1><p>请点击下方链接${action}：</p><p><a href="${escapeHtml(input.url)}">${action}</a></p><p>链接将在 1 小时后失效。如果不是你发起的操作，请忽略此邮件。</p>`,
  });
  if (result.error) throw new Error(`Resend rejected authentication email: ${result.error.message}`);
}
