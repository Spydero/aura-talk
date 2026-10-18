const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function inviteCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
