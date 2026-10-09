export type VerificationLeadRow = {
  id: string;
  email: string | null;
  email_status: string;
};

export function verificationCandidates(leads: VerificationLeadRow[]) {
  return leads.filter((lead) => Boolean(lead.email) && lead.email_status === "found");
}
