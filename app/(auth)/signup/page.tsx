import { getInviteByCode } from "@/app/actions/family";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

// The invite code can arrive as ?invite=CODE — greet the invitee by name and
// carry the code into signup so their tree links to the family forest.
// A gift code arrives as ?gift=CODE — carried through so the brand-new account
// claims its prepaid lifetime unlock the moment it's created.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: { invite?: string; gift?: string };
}) {
  const code = searchParams.invite;
  const invite = code ? await getInviteByCode(code) : null;
  const gift = typeof searchParams.gift === "string" ? searchParams.gift : undefined;

  return <SignupForm invite={invite} gift={gift} />;
}
