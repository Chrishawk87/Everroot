"use client";

import Link from "next/link";
import type { Book } from "@/lib/forest/queries";

// Print styles live here so the book prints as clean paper regardless of the
// app's dark theme, and the on-screen toolbar disappears on paper.
const PRINT_CSS = `
.book-toolbar { }
@media print {
  .no-print { display: none !important; }
  .book-page { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
  .book-section { break-before: page; }
  .book-section:first-of-type { break-before: auto; }
  .book-chapter { break-inside: avoid; }
  @page { margin: 20mm; }
}
`;

function paragraphs(body: string): string[] {
  return body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function BookView({ book, isSelf }: { book: Book; isSelf: boolean }) {
  const firstName = book.displayName.split(" ")[0] || book.displayName;
  const subtitleBits = [book.familyPosition, book.birthYear ? `b. ${book.birthYear}` : null].filter(
    Boolean,
  );

  return (
    <div className="min-h-screen bg-[#2a2f26] py-8 font-sans print:bg-white print:py-0">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Toolbar — screen only */}
      <div className="no-print mx-auto mb-6 flex max-w-[820px] items-center justify-between px-4">
        <Link
          href={isSelf ? "/forest" : "/family"}
          className="text-sm text-parchment/70 transition hover:text-parchment"
        >
          ← Back
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full border border-fruit/50 bg-fruit/20 px-5 py-2 text-sm font-semibold text-parchment transition hover:brightness-110"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" rx="1" />
          </svg>
          Print / Save as PDF
        </button>
      </div>

      {/* The paper */}
      <article className="book-page mx-auto max-w-[820px] bg-[#f7f2e8] px-12 py-16 text-[#2b2417] shadow-2xl print:px-0 print:py-0 sm:px-16">
        {/* Cover */}
        <header className="mb-16 border-b border-[#2b2417]/15 pb-12 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-[#8a7b57]">The Story of</p>
          <h1 className="mt-4 font-serif text-5xl leading-tight text-[#2b2417]">{book.displayName}</h1>
          {subtitleBits.length ? (
            <p className="mt-3 font-serif text-lg italic text-[#6b6047]">{subtitleBits.join(" · ")}</p>
          ) : null}
          <p className="mt-8 text-xs uppercase tracking-[0.25em] text-[#8a7b57]">
            {book.memoryCount} {book.memoryCount === 1 ? "memory" : "memories"} · {book.stageLabel}
          </p>
        </header>

        {book.sections.length === 0 ? (
          <p className="py-12 text-center font-serif text-lg italic text-[#6b6047]">
            {isSelf ? "Your" : `${firstName}'s`} story is just beginning. Record a few memories and
            they'll fill these pages.
          </p>
        ) : (
          book.sections.map((section) => (
            <section key={section.key} className="book-section mb-14">
              <div className="mb-8 text-center">
                <h2 className="font-serif text-3xl text-[#2b2417]">{section.label}</h2>
                {section.subtitle ? (
                  <p className="mt-1 font-serif text-sm italic text-[#8a7b57]">{section.subtitle}</p>
                ) : null}
              </div>

              {section.chapters.map((ch) => (
                <div key={ch.nodeId} className="book-chapter mb-9">
                  <h3 className="font-serif text-xl text-[#2b2417]">{ch.title}</h3>
                  {ch.question ? (
                    <p className="mt-1 font-serif text-sm italic text-[#8a7b57]">“{ch.question}”</p>
                  ) : null}
                  {ch.body ? (
                    <div className="mt-3 space-y-3">
                      {paragraphs(ch.body).map((p, i) => (
                        <p key={i} className="font-serif text-[15px] leading-7 text-[#3a3325]">
                          {p}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 font-serif text-sm italic text-[#a89b78]">
                      A memory kept in the tree.
                    </p>
                  )}
                </div>
              ))}
            </section>
          ))
        )}

        {/* The family */}
        {book.family.length ? (
          <section className="book-section mt-6 border-t border-[#2b2417]/15 pt-12">
            <div className="mb-8 text-center">
              <h2 className="font-serif text-3xl text-[#2b2417]">The Family Around {firstName}</h2>
            </div>
            <ul className="mx-auto max-w-md space-y-2">
              {book.family.map((p, i) => (
                <li key={i} className="flex items-baseline justify-between border-b border-[#2b2417]/10 pb-2">
                  <span className="font-serif text-lg text-[#2b2417]">{p.name}</span>
                  {p.relationship ? (
                    <span className="font-serif text-sm italic text-[#8a7b57]">{p.relationship}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-16 border-t border-[#2b2417]/15 pt-8 text-center">
          <p className="font-serif text-sm italic text-[#8a7b57]">Grown in EverRoot — a living legacy.</p>
        </footer>
      </article>
    </div>
  );
}
