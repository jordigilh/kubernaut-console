export function shouldAnchorToNewRca(
  previousRcaMessageId: string | undefined,
  currentRcaMessageId: string | undefined,
  userScrolledUp: boolean,
): boolean {
  return !userScrolledUp
    && currentRcaMessageId !== undefined
    && previousRcaMessageId !== currentRcaMessageId;
}
