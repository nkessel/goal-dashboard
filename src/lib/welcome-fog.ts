/**
 * The fog before the welcome screen. On a full load that will open the day's
 * welcome screen, a small script in the page covers the app with fog at the
 * very first paint (before anything else shows), so the welcome screen comes
 * into view through it. The welcome screen, or the app deciding there's
 * nothing to greet you with, lifts it. Leaving the welcome screen for Today
 * from another page brings it back for the walk, and Today lifts it.
 */

/** Runs in the page before anything paints: the same checks DailyLogin makes (the day's first visit, one still open from earlier, or welcome back being due). */
export const FOG_SCRIPT = `(function(){try{var n=Date.now(),s=localStorage,J=function(k,f){try{return JSON.parse(s.getItem(k)||f)}catch(_){return JSON.parse(f)}},d=new Date(n-330*60000),p=function(x){return(x<10?"0":"")+x},k=d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()),st=J("toucan-style","{}"),pop=Array.isArray(st.avoid)&&st.avoid.indexOf("popups")>=0,go=s.getItem("daily-login")!==k;if(!go){var q=J("welcome-pending","null");if(q&&q.day===k&&!(q.until&&n<q.until)&&!(q.away&&q.away!==location.pathname))go=q.mode==="day"||q.kept||!pop;else if(!q||q.day!==k){var fx=J("goalFxSaved","{}"),h=fx.welcomeBackHours;h=typeof h=="number"&&h%1===0&&h>=0&&h<=12?h:5;go=!!h&&st.returnCheckIn!==false&&!pop&&n-Number(s.getItem("welcome-back-at")||0)>=h*3600000}}if(!go&&s.getItem("daily-login-open")===k)go=true;if(!go)return;var hr=new Date().getHours(),e=document.documentElement;e.setAttribute("data-fog",hr<5||hr>=21?"night":hr<9?"dawn":hr<17?"day":"dusk");setTimeout(function(){if(e.hasAttribute("data-fog")){e.setAttribute("data-fog-lift","");setTimeout(function(){e.removeAttribute("data-fog");e.removeAttribute("data-fog-lift")},1000)}},25000)}catch(_){}})();`;

const timeOf = (h = new Date().getHours()) => (h < 5 || h >= 21 ? "night" : h < 9 ? "dawn" : h < 17 ? "day" : "dusk");

let safety: ReturnType<typeof setTimeout> | undefined;

/** Fog over the app (for the walk on to Today), lifting by itself if nothing else does. */
export function fogOn(ms = 6000) {
  const e = document.documentElement;
  e.removeAttribute("data-fog-lift");
  e.setAttribute("data-fog", timeOf());
  clearTimeout(safety);
  safety = setTimeout(liftFog, ms);
}

/** Gone at once, no fade (when it turns out nothing is coming). */
export function clearFog() {
  const e = document.documentElement;
  clearTimeout(safety);
  e.removeAttribute("data-fog");
  e.removeAttribute("data-fog-lift");
}

/** Would the welcome screen open right now? The same checks as the script above (and DailyLogin). */
export function welcomeDue(): boolean {
  try {
    const n = Date.now();
    const s = localStorage;
    const J = <T,>(k: string, f: T): T => {
      try {
        return (JSON.parse(s.getItem(k) || "null") as T) ?? f;
      } catch {
        return f;
      }
    };
    const d = new Date(n - 330 * 60000);
    const p = (x: number) => (x < 10 ? "0" : "") + x;
    const k = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const st = J<{ avoid?: string[]; returnCheckIn?: boolean }>("toucan-style", {});
    const pop = Array.isArray(st.avoid) && st.avoid.includes("popups");
    if (s.getItem("daily-login") !== k) return true;
    const q = J<{ day?: string; until?: number; away?: string; mode?: string; kept?: boolean } | null>("welcome-pending", null);
    if (q && q.day === k) {
      if (q.until && n < q.until) return false;
      if (q.away && q.away !== location.pathname) return false;
      return q.mode === "day" || !!q.kept || !pop;
    }
    const fx = J<{ welcomeBackHours?: number }>("goalFxSaved", {});
    let h = fx.welcomeBackHours;
    h = typeof h === "number" && h % 1 === 0 && h >= 0 && h <= 12 ? h : 5;
    return !!h && st.returnCheckIn !== false && !pop && n - Number(s.getItem("welcome-back-at") || 0) >= h * 3600000;
  } catch {
    return false;
  }
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
