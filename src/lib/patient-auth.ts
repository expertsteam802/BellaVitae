export function normalizePatientPhone(value: string) {
  const digits = value.replace(/\\D/g, "");
  const national = digits.startsWith("250") ? digits : digits.startsWith("0") ? "250" + digits.slice(1) : "250" + digits;
  if (!/^2507\\d{8}$/.test(national)) {
    throw new Error("Enter a valid Rwanda mobile number, for example 0788 123 456.");
  }
  return { phone: "+" + national, signInEmail: national + "@patients.bellavitae.invalid" };
}
