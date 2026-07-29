import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getForest } from "@/lib/forest/queries";
import InterviewExperience from "@/components/interview/InterviewExperience";
import { ALL_QUESTIONS, chapterForQuestion } from "@/lib/interview/script";

export const dynamic = "force-dynamic";

// The life interview — a focused, voice-first conversation that grows the tree.
// It can be entered three ways from the + menu:
//   ?mode=resume   → pick up at the next unanswered question
//   ?chapter=<id>  → jump to the first (unanswered) question of that chapter
//   ?mode=note     → a single free-form "quick voice note", no scripted question
export default async function InterviewPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const graph = await getForest(session.user.id);
  if (!graph) redirect("/signup");

  // The family members already in this forest — offered as tappable choices in
  // the "who was part of this?" step so memories can link to real people.
  const people = graph.nodes
    .filter((n) => n.kind === "PERSON")
    .map((n) => {
      const fam = graph.edges.find((e) => e.kind === "FAMILY" && e.toNodeId === n.id);
      return { id: n.id, name: n.title, relationship: fam?.label ?? null };
    });

  // Which scripted questions have already been answered (a memory carries its
  // source questionId in node.data), so "continue" can skip ahead.
  const answered = new Set<string>();
  for (const n of graph.nodes) {
    const qid = (n.data as { questionId?: unknown } | null)?.questionId;
    if (typeof qid === "string") answered.add(qid);
  }

  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const mode = first(searchParams.mode);
  const chapterId = first(searchParams.chapter);

  let startIndex = 0;
  let noteMode = false;
  let skipIntro = false;

  if (mode === "note") {
    noteMode = true;
    skipIntro = true;
  } else if (chapterId) {
    const unanswered = ALL_QUESTIONS.findIndex(
      (q) => chapterForQuestion(q.id)?.id === chapterId && !answered.has(q.id),
    );
    const anyInChapter = ALL_QUESTIONS.findIndex(
      (q) => chapterForQuestion(q.id)?.id === chapterId,
    );
    startIndex = unanswered >= 0 ? unanswered : anyInChapter >= 0 ? anyInChapter : 0;
    skipIntro = true;
  } else if (mode === "resume") {
    const next = ALL_QUESTIONS.findIndex((q) => !answered.has(q.id));
    // If everything is answered, land on the closing screen.
    startIndex = next >= 0 ? next : ALL_QUESTIONS.length;
    skipIntro = true;
  }

  return (
    <InterviewExperience
      displayName={graph.profile.displayName}
      people={people}
      startIndex={startIndex}
      noteMode={noteMode}
      skipIntro={skipIntro}
    />
  );
}
