import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldGuardInquiryWorkspace } from "@/components/world/WorldGuardInquiryWorkspace";

export const Route = createFileRoute("/world/guard/inquiries/")({
  head:()=>({
    meta:[
      {title:"GUARD Formal Inquiries — Terra Solaris"},
      {name:"description",content:"Authenticated GUARD compliance inquiries, official country responses and Chairperson review."},
      {name:"robots",content:"noindex,nofollow"},
    ],
  }),
  component:GuardInquiryPage,
});

function GuardInquiryPage(){
  return <WorldPublicGate verifyOnMount><WorldGuardInquiryWorkspace/></WorldPublicGate>;
}
