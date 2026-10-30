/**
 * The fog before the welcome screen. On a full load that will open the day's
 * welcome screen, a small script in the page covers the app with fog at the
 * very first paint (before anything else shows), so the welcome screen comes
 * into view through it. The welcome screen, or the app deciding there's
 * nothing to greet you with, lifts it. Leaving the welcome screen for Today
 * from another page brings it back for the walk, and Today lifts it.
 */

/** Runs in the page before anything paints: the same checks DailyLogin makes for the day's welcome (first visit, or still open from earlier). */
export const FOG_SCRIPT = `(function(){try{var n=new Date(),s=localStorage,d=new Date(n.getTime()-330*60000),p=function(x){return(x<10?"0":"")+x},k=d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()),go=s.getItem("daily-login")!==k;if(!go){var q=JSON.parse(s.getItem("welcome-pending")||"null");go=!!(q&&q.day===k&&q.mode==="day"&&!(q.until&&n.getTime()<q.until))||s.getItem("daily-login-open")===k}if(!go)return;var h=n.getHours(),e=document.documentElement;e.setAttribute("data-fog",h<5||h>=21?"night":h<9?"dawn":h<17?"day":"dusk");setTimeout(function(){if(e.hasAttribute("data-fog")){e.setAttribute("data-fog-lift","");setTimeout(function(){e.removeAttribute("data-fog");e.removeAttribute("data-fog-lift")},1000)}},9000)}catch(_){}})();`;

const timeOf = (h = new Date().getHours()) => (h < 5 || h >= 21 ? "night" : h < 9 ? "dawn" : h < 17 ? "day" : "dusk");

let safety: ReturnType<typeof setTimeout> | undefined;

/** Fog over the app (for the walk on to Today), lifting by itself if nothing else does. */
export function fogOn() {
  const e = document.documentElement;
  e.removeAttribute("data-fog-lift");
  e.setAttribute("data-fog", timeOf());
  clearTimeout(safety);
  safety = setTimeout(liftFog, 6000);
}

/** The fog fades away, if there is any. */
export function liftFog() {
  if (typeof document === "undefined") return;
  const e = document.documentElement;
  if (!e.hasAttribute("data-fog") || e.hasAttribute("data-fog-lift")) return;
  clearTimeout(safety);
  e.setAttribute("data-fog-lift", "");
  setTimeout(() => {
    if (!e.hasAttribute("data-fog-lift")) return;
    e.removeAttribute("data-fog");
    e.removeAttribute("data-fog-lift");
  }, 1000);
}
