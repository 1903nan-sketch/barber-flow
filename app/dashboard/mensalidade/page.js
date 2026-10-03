"use client";
import ModuleShell from "../_components/ModuleShell";
import BillingPanel from "../_components/BillingPanel";

export default function Mensalidade(){
 return <ModuleShell title="Mensalidade" eyebrow="Conta">{workspace=><BillingPanel workspace={workspace}/>}</ModuleShell>
}
