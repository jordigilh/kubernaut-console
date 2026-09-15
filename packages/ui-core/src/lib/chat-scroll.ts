export function shouldAnchorToNewRca(
  previousRcaMessageId: string | undefined,
  currentRcaMessageId: string | undefined,
  userScrolledUp: boolean,
): boolean {
  return !userScrolledUp
    && currentRcaMessageId !== undefined
    && previousRcaMessageId !== currentRcaMessageId;
}

/** A newly submitted turn takes precedence over the previous scroll intent. */
export function userScrolledUpAfterSubmit(userScrolledUp: boolean, text: string): boolean {
  return text.trim().length > 0 ? false : userScrolledUp;
}
