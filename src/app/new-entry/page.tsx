"use client";

import { useSearchParams } from "next/navigation";
import { NewEntryScreen } from "@/components/screens/NewEntryScreen";

export default function NewEntryPage() {
  const searchParams = useSearchParams();
  const entryType = searchParams.get("type") ?? "expense";
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <div className="ui-card p-5 sm:p-8">
        <NewEntryScreen entryType={entryType} />
      </div>
    </main>
  );
}
