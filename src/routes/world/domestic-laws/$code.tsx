import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldDomesticLaws } from "@/components/world/WorldDomesticLaws";

export const Route=createFileRoute("/world/domestic-laws/$code")({
  head:({params})=>({meta:[
    {title:params.code.toUpperCase()+" — Domestic legislation — Terra Solaris"},
    {name:"description",content:"Published Terra Solaris domestic laws, legislation and fictional government processes."},
  ]}),
  component:DomesticLawRoute,
});
function DomesticLawRoute(){
  const {code}=Route.useParams();
  return <WorldPublicGate verifyOnMount>
    <AppShell><WorldDomesticLaws code={code}/></AppShell>
  </WorldPublicGate>;
}
