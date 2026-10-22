import { getConfigRows } from "@/lib/queries";
import { RulesForm } from "./RulesForm";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const data = await getConfigRows();
  return <RulesForm initial={JSON.parse(JSON.stringify(data))} />;
}
