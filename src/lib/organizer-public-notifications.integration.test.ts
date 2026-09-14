import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/my-solaris/notices.tsx");
const organizerRecipientModule = source(
  "src/components/mysolaris/modules/OrganizerRecipientNoticesModule.tsx",
);
const organizerPublicModule = source(
  "src/components/mysolaris/modules/OrganizerPublicNoticesModule.tsx",
);
const recipientInbox = source("src/lib/studio2-recipient-inbox.ts");
const workspaceContext = source("src/components/mysolaris/MySolarisContext.tsx");
const migration = source(
  "supabase/migrations/20260914222000_organizer_recipient_notice_inbox.sql",
);

describe("organizer MySolaris communications", () => {
  it("routes an organizer with an active country account to the real recipient inbox", () => {
    expect(route).toContain('access?.isOrganizer && access.countryId && access.countryStatus === "active"');
    expect(route).toContain("<OrganizerRecipientNoticesModule />");
    expect(route).toContain("<OrganizerPublicNoticesModule />");
    expect(organizerPublicModule).toContain("loadPublicHomeAnnouncements(10)");
  });

  it("shows and records acknowledgement actions for the organizer's delegation role", () => {
    expect(organizerRecipientModule).toContain("Acknowledgement required");
    expect(organizerRecipientModule).toContain("Acknowledge notice");
    expect(organizerRecipientModule).toContain("acknowledgeStudio2InboxNotice");
    expect(organizerRecipientModule).toContain("markStudio2NoticeOpened");
    expect(organizerRecipientModule).toContain("archiveStudio2Notice");
  });

  it("loads a recipient-scoped projection instead of the organizer inspection view", () => {
    expect(recipientInbox).toContain('client.rpc("studio2_my_notice_inbox"');
    expect(workspaceContext).toContain("loadStudio2RecipientNoticeInbox");
    expect(workspaceContext).not.toContain("loadPublicHomeAnnouncements");
    expect(workspaceContext).not.toContain("loadStudio2NoticeInbox");
  });

  it("keeps organizer inspection separate from delegation receipt eligibility", () => {
    expect(migration).toContain("studio2_user_can_receive_notice_as_recipient");
    expect(migration).toContain("studio2_my_notice_inbox");
    expect(migration).toContain("r.recipient_user_id = auth.uid()");
    expect(migration).toContain("'delegation_inbox' = any(n.display_surfaces)");
    expect(migration).toContain("This notice does not require acknowledgement");
    expect(migration).not.toContain("if public.has_role(p_user_id, 'organizer'::public.app_role) then\n    return true");
  });
});
