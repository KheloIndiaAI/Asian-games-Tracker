import { createFileRoute } from "@tanstack/react-router";
import { ScheduleScreen } from "@/components/c4b/ScheduleScreen";
import { todayIst } from "@/lib/format";
import { dayQuery, daysQuery } from "@/lib/app-data";
import { pageHead } from "@/lib/seo";

const TITLE = "Schedule — India at the Asian Games 2026 | Cheer4Bharat";
const DESCRIPTION =
  "Day by day schedule of India's events at the Asian Games 2026 in Aichi-Nagoya, with India times, medal events and every country's fixtures.";

export const Route = createFileRoute("/schedule/")({
  head: () => pageHead({ title: TITLE, description: DESCRIPTION, path: "/schedule" }),
  loader: async ({ context }) => {
    const date = todayIst();
    const [day, days] = await Promise.all([
      context.queryClient.ensureQueryData(dayQuery(date, false, "IST")),
      context.queryClient.ensureQueryData(daysQuery("IST")),
    ]);
    return { tz: "IST" as const, day, days };
  },
  component: ScheduleIndex,
});

function ScheduleIndex() {
  const seed = Route.useLoaderData();
  return <ScheduleScreen date={todayIst()} seed={seed} />;
}
