import { createFileRoute } from "@tanstack/react-router";
import { statusKeyIsValid } from "@/lib/status-auth.server";

function istDate(offset = 0) { return new Date(Date.now() + 19800000 + offset * 86400000).toISOString().slice(0, 10); }

export const Route = createFileRoute("/api/public/status-data")({
  server: { handlers: { GET: async ({ request }) => {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!(await statusKeyIsValid(key))) return new Response("Not found", { status: 404 });
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const today=istDate(), tomorrow=istDate(1), now=Date.now();
    const [items,india,results,medals,logs,upcoming,indiaResults,medalRows,standing,live,entered,watchRows,liveRows,lastRuns,sports]=await Promise.all([
      db.from("schedule_items").select("*",{count:"exact",head:true}), db.from("schedule_items").select("*",{count:"exact",head:true}).eq("has_india",true),
      db.from("india_results").select("*",{count:"exact",head:true}), db.from("india_medals").select("*",{count:"exact",head:true}), db.from("fetch_log").select("*").order("id",{ascending:false}).limit(10),
      db.from("schedule_items").select("sport_code,res_code,event_name,phase_name,start_ist,date_ist,status,status_desc,orgs,is_h2h").eq("has_india",true).in("date_ist",[today,tomorrow]).order("start_ist",{ascending:true}),
      db.from("india_results").select("sport_code,res_code,opponent_name,spoken_summary_en"), db.from("india_medals").select("*").order("won_at",{ascending:false}).limit(25),
      db.from("medal_standings").select("*").eq("org_code","IND").maybeSingle(), db.from("schedule_items").select("sport_code,res_code,event_name,phase_name,start_ist,status,status_desc").eq("has_india",true).or("is_live.eq.true,status.eq.RUNNING").order("start_ist",{ascending:true}),
      db.from("schedule_items").select("sport_code,date_ist").eq("india_entered",true).eq("has_india",false).in("date_ist",[today,tomorrow]),
      db.from("schedule_items").select("sport_code,event_name,phase_name,status,status_desc,is_live,start_time,india_result_fetched_at,updated_at").eq("has_india",true).gte("start_time",new Date(now-21600000).toISOString()).lte("start_time",new Date(now+900000).toISOString()),
      db.from("schedule_items").select("sport_code,event_name,phase_name,status,status_desc,is_live,start_time,india_result_fetched_at,updated_at").eq("has_india",true).eq("is_live",true),
      db.from("fetch_log").select("mode,started_at,ok").in("mode",["india_now","india_today"]).eq("ok",true).order("id",{ascending:false}).limit(40), db.from("sports").select("code,name")
    ]);
    const sportName=new Map((sports.data??[]).map((s:any)=>[s.code,s.name??s.code]));
    const resMap=new Map((indiaResults.data??[]).map((r:any)=>[`${r.sport_code}|${r.res_code}`,r]));
    const watchMap=new Map<string,any>();
    for(const r of watchRows.data??[]) if(String(r.status??"").toUpperCase()!=="OFFICIAL") watchMap.set(`${r.sport_code}|${r.event_name}|${r.start_time}`,r);
    for(const r of liveRows.data??[]) watchMap.set(`${r.sport_code}|${r.event_name}|${r.start_time}`,r);
    const enteredCounts:Record<string,number>={[today]:0,[tomorrow]:0}; for(const e of entered.data??[]) if(e.date_ist) enteredCounts[e.date_ist]=(enteredCounts[e.date_ist]??0)+1;
    const data={watch:[...watchMap.values()].map(r=>({...r,age:Math.round((now-Date.parse(r.india_result_fetched_at??r.updated_at))/60000)})),lastRun:{india_now:(lastRuns.data??[]).find((l:any)=>l.mode==="india_now")?.started_at??null,india_today:(lastRuns.data??[]).find((l:any)=>l.mode==="india_today")?.started_at??null},counts:{items:items.count??0,india:india.count??0,results:results.count??0,medals:medals.count??0},logs:logs.data??[],medalRows:(medalRows.data??[]).map((m:any)=>({...m,sport:sportName.get(m.sport_code)??m.sport_code})),standing:standing.data??null,live:(live.data??[]).map((r:any)=>({...r,sport:sportName.get(r.sport_code)??r.sport_code,summary:(resMap.get(`${r.sport_code}|${r.res_code}`) as any)?.spoken_summary_en??""})),enteredCounts,rows:(upcoming.data??[]).map((r:any)=>{const res=resMap.get(`${r.sport_code}|${r.res_code}`) as any;return {...r,sport:sportName.get(r.sport_code)??r.sport_code,opponent:res?.opponent_name??(r.orgs??[]).filter((o:string)=>o!=="IND").slice(0,2).join(", "),summary:res?.spoken_summary_en??""}}),today,tomorrow};
    return Response.json({ok:true,data},{headers:{"Cache-Control":"no-store"}});
  } } },
});