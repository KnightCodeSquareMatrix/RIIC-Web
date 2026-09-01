const COMMON_PASSWORD = /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456)/i;
const REPEATED_CHARACTER = /(.)\1{3,}/;
const SEQUENTIAL_CHARACTERS = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i;

const PASSWORD_RULES = [
  { id: "length", label: "至少 10 个字符", test: (value: string) => value.length >= 10 },
  { id: "letter", label: "包含字母", test: (value: string) => /[a-z]/i.test(value) },
  { id: "digit", label: "包含数字", test: (value: string) => /\d/.test(value) },
  { id: "variety", label: "包含大小写或符号", test: (value: string) => (/[a-z]/.test(value) && /[A-Z]/.test(value)) || /[^a-z0-9]/i.test(value) },
] as const;

export const PASSWORD_STRENGTH_ERROR = "密码强度不足：请满足全部强度规则，并避免常见密码、连续字符或重复字符。";

export function evaluatePasswordStrength(value: string) {
  const rules = PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, met: rule.test(value) }));
  const passed = rules.filter((rule) => rule.met).length;
  const guessable = value.length > 0 && (
    COMMON_PASSWORD.test(value)
    || REPEATED_CHARACTER.test(value)
    || SEQUENTIAL_CHARACTERS.test(value)
  );
  const score = value.length === 0 ? 0 : guessable ? 1 : Math.min(PASSWORD_RULES.length, Math.max(1, passed));

  return {
    rules,
    guessable,
    score,
    strong: passed === PASSWORD_RULES.length && !guessable,
  };
}

export function isStrongPassword(value: string): boolean {
  return evaluatePasswordStrength(value).strong;
}
