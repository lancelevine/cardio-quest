// Cardio Quest Strava bridge. Deploy as a Cloudflare Worker with KV binding SESSIONS.
// Secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, APP_ORIGIN.
// Public vars: CALLBACK_URL = https://YOUR-WORKER.workers.dev/callback
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...headers}});
const cookie=req=>(req.headers.get("Cookie")||"").match(/(?:^|; )cq_session=([a-f0-9-]+)/)?.[1];
const random=()=>crypto.randomUUID();
export default {async fetch(req,env){
 const url=new URL(req.url), origin=env.APP_ORIGIN||"https://lancelevine.github.io";
 const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,OPTIONS"};
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(!env.SESSIONS||!env.STRAVA_CLIENT_ID||!env.STRAVA_CLIENT_SECRET||!env.CALLBACK_URL)return json({error:"Worker not configured"},503,cors);
 const sid=cookie(req),session=sid?await env.SESSIONS.get("session:"+sid,"json"):null;
 if(url.pathname==="/connect"){
  const state=random(),newSid=random();await env.SESSIONS.put("state:"+state,newSid,{expirationTtl:600});
  const p=new URLSearchParams({client_id:env.STRAVA_CLIENT_ID,redirect_uri:env.CALLBACK_URL,response_type:"code",approval_prompt:"auto",scope:"activity:read",state});
  return new Response(null,{status:302,headers:{Location:"https://www.strava.com/oauth/authorize?"+p,"Set-Cookie":"cq_session="+newSid+"; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=2592000"}});
 }
 if(url.pathname==="/callback"){
  const state=url.searchParams.get("state"),expected=state?await env.SESSIONS.get("state:"+state):null;
  if(!expected||expected!==sid)return json({error:"Invalid authorization state"},403);
  await env.SESSIONS.delete("state:"+state);
  if(!url.searchParams.get("code"))return Response.redirect(origin+"/cardio-quest/?strava=denied",302);
  const body=new URLSearchParams({client_id:env.STRAVA_CLIENT_ID,client_secret:env.STRAVA_CLIENT_SECRET,code:url.searchParams.get("code"),grant_type:"authorization_code"});
  const response=await fetch("https://www.strava.com/oauth/token",{method:"POST",body});const data=await response.json();
  if(!response.ok)return json({error:"Strava authorization failed"},502);
  await env.SESSIONS.put("session:"+sid,JSON.stringify({refresh_token:data.refresh_token,access_token:data.access_token,expires_at:data.expires_at}),{expirationTtl:2592000});
  return Response.redirect(origin+"/cardio-quest/?strava=connected",302);
 }
 if(url.pathname==="/status")return json({connected:!!session},200,cors);
 if(url.pathname==="/disconnect"){
  if(sid)await env.SESSIONS.delete("session:"+sid);
  return json({connected:false},200,{"Set-Cookie":"cq_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0",...cors});
 }
 if(url.pathname==="/activities"){
  if(!session)return json({error:"Not connected. Connect Strava first."},401,cors);
  let token=session.access_token;
  if(session.expires_at<Date.now()/1000+60){
   const body=new URLSearchParams({client_id:env.STRAVA_CLIENT_ID,client_secret:env.STRAVA_CLIENT_SECRET,grant_type:"refresh_token",refresh_token:session.refresh_token});
   const refresh=await fetch("https://www.strava.com/oauth/token",{method:"POST",body}),d=await refresh.json();
   if(!refresh.ok)return json({error:"Strava session expired; reconnect."},401,cors);
   session.access_token=d.access_token;session.refresh_token=d.refresh_token;session.expires_at=d.expires_at;token=d.access_token;
   await env.SESSIONS.put("session:"+sid,JSON.stringify(session),{expirationTtl:2592000});
  }
  const r=await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=100&page=1",{headers:{Authorization:"Bearer "+token}});
  if(!r.ok)return json({error:"Strava activity request failed"},r.status,cors);
  const activities=await r.json();
  return json(activities.filter(a=>["Run","Walk","Hike","VirtualRun"].includes(a.sport_type||a.type)).map(a=>({id:a.id,name:a.name,date:a.start_date_local?.slice(0,10),distance_m:a.distance,moving_time_s:a.moving_time,elapsed_time_s:a.elapsed_time,type:a.sport_type||a.type})),200,cors);
 }
 return json({error:"Not found"},404,cors);
}};
