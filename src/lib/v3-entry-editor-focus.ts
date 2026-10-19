import {
  V3_ENTRY_EDITOR_SECTIONS,
  type V3EntryEditorSection,
} from "./v3-entry";

const HASH_PREFIX = "entry-section-";
const CONFIRMATION_EDIT_PREFIX = "/confirmations/edit/";

const CURRENT_WRITER_STEP: Partial<Record<V3EntryEditorSection, number>> = {
  song: 3,
  artist: 3,
  credits: 3,
  metadata: 4,
  media: 3,
  review: 5,
};

export type V3EntryEditorFocus = {
  section: V3EntryEditorSection;
  /** Existing canonical Confirmation writer step. Null means System support is still missing. */
  step: number | null;
  supported: boolean;
};

export function v3EntryEditorFocusHash(section: V3EntryEditorSection) {
  return `#${HASH_PREFIX}${section}`;
}

function isCanonicalConfirmationEditHref(href: string) {
  const path = href.split("#", 1)[0] ?? "";
  if (!path.startsWith(CONFIRMATION_EDIT_PREFIX)) return false;
  if (path.startsWith("//") || path.includes("\\")) return false;
  const token = path.slice(CONFIRMATION_EDIT_PREFIX.length).split("?", 1)[0]?.trim() ?? "";
  return token.length > 0 && !token.includes("/");
}

export function appendV3EntryEditorFocus(
  href: string,
  section: V3EntryEditorSection | null,
) {
  if (!section || !isCanonicalConfirmationEditHref(href)) return href;
  return `${href.split("#", 1)[0]}${v3EntryEditorFocusHash(section)}`;
}

export function parseV3EntryEditorFocus(hash: string | null | undefined): V3EntryEditorFocus | null {
  if (!hash) return null;
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalized.startsWith(HASH_PREFIX)) return null;

  const section = normalized.slice(HASH_PREFIX.length);
  if (!V3_ENTRY_EDITOR_SECTIONS.includes(section as V3EntryEditorSection)) return null;

  const typedSection = section as V3EntryEditorSection;
  const step = CURRENT_WRITER_STEP[typedSection] ?? null;
  return {
    section: typedSection,
    step,
    supported: step !== null,
  };
}
