import { saveNightAction } from "@/app/actions";
import { eveningDayKey } from "@/components/evening/evening-clock";
import { nextDayKey, type NightDraft } from "./NightFields";

/**
 * Save last night: its times, and the factors for the day they were picked for. Today's factors belong to
 * tonight's sleep, so they're kept with tomorrow morning's entry (and show as picked there).
 */
export async function saveNightToo(night: NightDraft) {
  if (!night.today) return saveNightAction({ bed: night.bed || null, wake: night.wake || null, effort: night.effort, hindrances: night.hindrances });
  // The times go to this morning (keeping yesterday's factors as they were); the factors to tomorrow morning.
  const res = await saveNightAction({ bed: night.bed || null, wake: night.wake || null, effort: [], hindrances: [], keep: true });
  await saveNightAction({ day: nextDayKey(res.day ?? eveningDayKey()), bed: null, wake: null, effort: night.effort, hindrances: night.hindrances });
  return res;
}
