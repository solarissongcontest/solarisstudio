import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldVoteDetail } from "@/components/world/WorldLegislativeVotes";

export const Route=createFileRoute("/world/votes/$voteId/")({
  head:()=>({meta:[
    {title:"Institutional Voting Record — Terra Solaris"},
    {name:"description",content:"Published legislative vote or authorized ballot state."},
  ]}),
  component:()=> {
    const {voteId}=Route.useParams();
    return <WorldPublicGate verifyOnMount><AppShell>
      <WorldVoteDetail key={voteId} voteId={voteId}/>
    </AppShell></WorldPublicGate>;
  },
});
