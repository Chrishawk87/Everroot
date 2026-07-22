import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBook } from "@/lib/forest/queries";
import BookView from "@/components/book/BookView";

export const dynamic = "force-dynamic";

// The Book of the Tree — a printable keepsake of a person's whole story.
// Viewable by the owner and their linked family.
export default async function BookPage({ params }: { params: { userId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?next=/book/${params.userId}`);
  }

  const book = await getBook(params.userId, session.user.id);
  if (!book) redirect("/forest");

  if (!book.canView) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center font-sans">
        <h1 className="font-serif text-2xl text-parchment">This book is private</h1>
        <p className="mt-3 text-parchment/70">
          Only {book.displayName} and their family forest can open this keepsake.
        </p>
        <Link href="/forest" className="mt-6 text-sm text-canopy-light hover:underline">
          ← Back to your forest
        </Link>
      </main>
    );
  }

  const isSelf = params.userId === session.user.id;
  return <BookView book={book} isSelf={isSelf} />;
}
