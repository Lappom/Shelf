import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ElevenHeader } from "@/components/marketing/ElevenHeader";
import { HomeHero } from "@/components/marketing/HomeHero";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) redirect("/library");

  return (
    <div className="marketing-shell bg-background min-h-screen">
      <ElevenHeader />
      <HomeHero />
    </div>
  );
}
