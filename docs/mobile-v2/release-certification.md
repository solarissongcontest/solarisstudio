# Solaris Studio Mobile App V2 release certification

This is the final human gate after automated Quality and Browser audit are green. It exists because an iPhone home indicator remains stubbornly unwilling to testify in unit tests. The checked application behavior must match the current commit, not a previous build.

## Visual review

Open the latest **Browser audit** artifact for the release commit. Review both `visual-ios-320` and `visual-ios-390` captures, including the discovered Edition, Country and Wiki entity pages. Reject the build for clipped content, unexplained dead space, overlapping sticky navigation, incorrect flags, duplicated headers, hidden final rows, broken safe-area spacing, or any screen that reads like desktop UI compressed into a phone.

Record the workflow run URL or artifact identifier in `docs/mobile-v2/release-certification.yml` and change only the reviewed gate to `approved: true`.

## Physical iPhone and iPad pass

Use Safari-installed Home Screen builds on a narrow iPhone-class device, a standard/large iPhone, and an iPad. Test portrait and landscape where listed. On each device verify cold launch, warm resume, tab switching, active-tab reselect to root/top, More/search sheets, keyboard open/close, scrolling to the final control, reduced motion, large text, safe-area top/bottom clearance, and no browser website chrome leaking into standalone mode.

Critical participation flows require an additional check: focus must remain inside modal sheets, global navigation must stay suppressed during the task, drafts must survive interruption where designed, offline/degraded states must never look submitted, and a completed submission must show authoritative server acknowledgement/receipt state.

## Production smoke

After the release commit is deployed, smoke the public app, one signed-in Country account and one Organizer account. Confirm that the production Supabase configuration is the intended project, public reads work, MySolaris loads, notification settings do not expose deployment internals, critical participation routes are usable, and organizer permission boundaries still hold.

Do not approve a gate from a local/dev build. Add concrete evidence such as a production URL plus timestamp, Browser audit run URL, device model/OS note, or QA recording reference.

## Final command

Once every manual gate has evidence and is approved, run:

`bun run certify:mobile-v2`

The command also refuses certification while any release-blocking completion-matrix item remains `partial`. Manual approval is therefore the last gate, not a substitute for unfinished code.
