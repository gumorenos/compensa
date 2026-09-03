export function canChangeEmailWithoutTransactionalDelivery(emailVerified: boolean): boolean {
  return emailVerified === false;
}
