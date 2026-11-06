import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldVoteDirectory } from "@/components/world/WorldLegislativeVotes";

export const Route=createFileRoute("/world/votes/")({
  head:()=>({meta:[
    {title:"Certified Institutional Votes — Terra Solaris"},
    {name:"description",content:"Official published legislative vote results and country roll calls."},
  ]}),
  component:()=> <WorldPublicGate verifyOnMount><AppShell><WorldVoteDirectory/></AppShell></WorldPublicGate>,
});
