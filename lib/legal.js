// Bump when the Terms or Privacy Policy change materially: every user is asked to accept again.
export const LEGAL_VERSION="2026-10-03";
export const REQUIRED_CONSENTS=["terms","privacy"];
export const TRIAL_DAYS=14;
export const SUPPORT_EMAIL="rup@3ruptix.com";

// "YYYY-MM-DD" in São Paulo time, matching how the database computes billing dates.
export function todaySP(){
 return new Date().toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"});
}
export function addDaysISO(iso,days){
 const d=new Date(String(iso)+"T12:00:00Z");
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
}
// Trial is over from trial_ends_at on, unless the shop has paid at least once.
export function trialEnded(tenant){
 return Boolean(tenant?.trial_ends_at&&!tenant?.last_paid_at&&todaySP()>=String(tenant.trial_ends_at).slice(0,10));
}
