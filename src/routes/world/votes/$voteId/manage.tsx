import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldVoteCertification } from "@/components/world/WorldLegislativeVotes";

export const Route=createFileRoute("/world/votes/$voteId/manage")({
  head:()=>({meta:[
    {title:"Certify Institutional Vote — Terra Solaris"},
    {name:"robots",content:"noindex,nofollow"},
  ]}),
  component:()=> {
    const {voteId}=Route.useParams();
    return <WorldPublicGate verifyOnMount><AppShell>
      <WorldVoteCertification key={voteId} voteId={voteId}/>
    </AppShell></WorldPublicGate>;
  },
});
