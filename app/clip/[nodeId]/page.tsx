import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMemoryClip } from "@/lib/forest/queries";
import ClipCard from "@/components/clip/ClipCard";

export const dynamic = "force-dynamic";

// A shareable memory clip. Viewable by the owner and their linked family.
export default async function ClipPage({ params }: { params: { nodeId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?next=/clip/${params.nodeId}`);
  }

  const clip = await getMemoryClip(params.nodeId, session.user.id);
  if (!clip) redirect("/forest");

  if (!clip.canView) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center font-sans">
        <h1 className="font-serif text-2xl text-parchment">This memory is private</h1>
        <p className="mt-3 text-parchment/70">
          Only the person who recorded it and their family forest can open this keepsake.
        </p>
        <Link href="/forest" className="mt-6 text-sm text-canopy-light hover:underline">
          ← Back to your forest
        </Link>
      </main>
    );
  }

  return <ClipCard clip={clip} />;
}
