import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getForest } from "@/lib/forest/queries";
import InterviewExperience from "@/components/interview/InterviewExperience";

export const dynamic = "force-dynamic";

// The life interview — a focused, voice-first conversation that grows the tree.
export default async function InterviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const graph = await getForest(session.user.id);
  if (!graph) redirect("/signup");

  return <InterviewExperience displayName={graph.profile.displayName} />;
}
