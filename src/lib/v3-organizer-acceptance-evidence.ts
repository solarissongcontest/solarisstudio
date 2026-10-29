// V3 presentation/projection modules must not own a Supabase client. Keep this
// compatibility export while the actual RPC adapter lives at the integration
// boundary, where S16 can audit it as a governed command caller.
export * from "@/integrations/v3/organizer-acceptance-evidence";
