import bcrypt from "bcryptjs";

export function hashSecret(value: string) {
  return bcrypt.hash(value, 10);
}

export function checkSecret(value: string, hash: string) {
  return bcrypt.compare(value, hash);
}
