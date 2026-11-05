const VIETNAM_PHONE_PATTERN = /(^|[^\d])((?:\+?84|0)(?:[\s.-]*\d){9})(?=$|[^\d])/g;

export function redactPhoneNumbers(value: string) {
  return value.replace(VIETNAM_PHONE_PATTERN, (match, prefix: string, phone: string) => {
    const digits = phone.replace(/\D/g, "");
    const isVietnamPhone =
      (digits.startsWith("0") && digits.length === 10) ||
      (digits.startsWith("84") && digits.length === 11);

    return isVietnamPhone
      ? `${prefix}${"*".repeat(digits.length - 3)}${digits.slice(-3)}`
      : match;
  });
}
