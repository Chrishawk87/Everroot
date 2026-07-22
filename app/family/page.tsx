import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getFamilyForest } from "@/lib/forest/queries";
import FamilyForestExperience from "@/components/forest/FamilyForestExperience";
import type { FamilyTreeData } from "@/components/forest/FamilyForestCanvas";

export const dynamic = "force-dynamic";

// The family forest — every connected tree in one shared world.
export default async function FamilyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const family = await getFamilyForest(session.user.id);
  if (!family) redirect("/signup");

  const trees: FamilyTreeData[] = [
    {
      userId: session.user.id,
      displayName: family.self.profile.displayName,
      relationship: null,
      isSelf: true,
      graph: family.self,
    },
    ...family.members.map((m) => ({
      userId: m.userId,
      displayName: m.graph.profile.displayName,
      relationship: m.relationship,
      isSelf: false,
      graph: m.graph,
    })),
  ];

  return <FamilyForestExperience trees={trees} />;
}
