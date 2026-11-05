type Scope = { editionId: string; contextVersion: number };

/** UI completion scope only; server commands remain the permission authority. */
export function isCurrentAnniversaryCommand(command: Scope, current: Scope): boolean {
  return Boolean(command.editionId) && command.editionId === current.editionId &&
    Number.isSafeInteger(command.contextVersion) && command.contextVersion >= 0 &&
    command.contextVersion === current.contextVersion;
}
