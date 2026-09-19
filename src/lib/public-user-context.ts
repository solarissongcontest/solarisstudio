import type { AccountAccess } from "./country-account";
import { PUBLIC_GLOBAL_AREAS, type PublicGlobalArea } from "./public-navigation";

export type PublicUserContext = {
  signedIn: boolean;
  organizer: boolean;
  hod: boolean;
  countryId?: string;
  currentEdition?: string;
};

export function buildPublicUserContext({
  userId,
  access,
  currentEdition,
}: {
  userId?: string | null;
  access: Pick<AccountAccess, "isOrganizer" | "countryId">;
  currentEdition?: string | null;
}): PublicUserContext {
  const signedIn = Boolean(userId);
  return {
    signedIn,
    organizer: signedIn && access.isOrganizer,
    hod: signedIn && Boolean(access.countryId),
    ...(access.countryId ? { countryId: access.countryId } : {}),
    ...(currentEdition ? { currentEdition } : {}),
  };
}

export type ContextualGlobalDestination = PublicGlobalArea & {
  label: string;
  to: string;
};

export function publicGlobalAreasForContext(
  context: PublicUserContext,
): ContextualGlobalDestination[] {
  return PUBLIC_GLOBAL_AREAS.map((item) => {
    if (item.id !== "me") return item;

    return {
      ...item,
      label: context.signedIn ? "Me" : "Sign in",
      to: context.signedIn ? "/my-solaris" : "/auth",
      description: context.signedIn
        ? "Your tasks, country, messages and account."
        : "Sign in to access MySolaris and country tools.",
    };
  });
}
