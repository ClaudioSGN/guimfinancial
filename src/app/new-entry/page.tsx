"use client";

import { useSearchParams } from "next/navigation";
import { NewEntryScreen } from "@/components/screens/NewEntryScreen";

export default function NewEntryPage() {
  const searchParams = useSearchParams();
  const entryType = searchParams.get("type") ?? "expense";
  return <NewEntryScreen entryType={entryType} />;
}
