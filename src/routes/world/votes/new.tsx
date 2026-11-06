import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldVoteOpenWorkspace } from "@/components/world/WorldLegislativeVotes";

export const Route=createFileRoute("/world/votes/new")({
  head:()=>({meta:[{title:"Open Legislative Vote — Terra Solaris"},
    {name:"robots",content:"noindex,nofollow"}]}),
  component:()=> <WorldPublicGate verifyOnMount><AppShell><WorldVoteOpenWorkspace/></AppShell></WorldPublicGate>,
});
