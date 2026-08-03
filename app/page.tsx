import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LandingIntro from "@/components/landing/LandingIntro";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/forest");

  // First-touch marketing surface: a cinematic, auto-playing (but skippable)
  // journey up to the great tree that lands the emotional pitch and the CTA.
  return <LandingIntro />;
}
