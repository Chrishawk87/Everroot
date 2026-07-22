import { getInviteByCode } from "@/app/actions/family";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

// The invite code can arrive as ?invite=CODE — greet the invitee by name and
// carry the code into signup so their tree links to the family forest.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: { invite?: string };
}) {
  const code = searchParams.invite;
  const invite = code ? await getInviteByCode(code) : null;

  return <SignupForm invite={invite} />;
}
