import SetupSection from "@/components/UserConsole/SetupSection";

/** Read on the server so the request is known on the first render; the section validates every value. */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    // A repeated parameter keeps its first value, as URLSearchParams.get would.
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return <SetupSection query={params.toString()} />;
}
