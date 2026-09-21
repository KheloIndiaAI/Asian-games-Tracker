import { createFileRoute } from "@tanstack/react-router";
import { ScheduleScreen } from "@/components/c4b/ScheduleScreen";
import { dayQuery, daysQuery } from "@/lib/app-data";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/schedule/$date")({
  head: ({ params }) => {
    const title = `India's schedule on ${params.date} — Asian Games 2026 | Cheer4Bharat`;
    const description = `Every Indian event on ${params.date} at the Asian Games 2026, with start times in India time and medal events flagged.`;
    return pageHead({ title, description, path: `/schedule/${params.date}` });
  },
  loader: async ({ context, params }) => {
    const [day, days] = await Promise.all([
      context.queryClient.ensureQueryData(dayQuery(params.date, false, "IST")),
      context.queryClient.ensureQueryData(daysQuery("IST")),
    ]);
    return { tz: "IST" as const, day, days };
  },
  component: DateScreen,
});

function DateScreen() {
  const { date } = Route.useParams();
  const seed = Route.useLoaderData();
  return <ScheduleScreen date={date} seed={seed} />;
}
