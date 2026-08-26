export type PloidSurface = "search" | "enrich" | "agent";

/** A deterministic router: no model call is used to choose a Ploid product. */
export function choosePloidSurface(prompt: string): PloidSurface {
  const value = prompt.toLowerCase();
  const hasLinkedInProfile = /linkedin\.com\/in\//.test(value);
  if (hasLinkedInProfile && /\b(enrich|email|phone|contact|profile)\b/.test(value))
    return "enrich";

  const asksForPeople = /\b(people|person|managers?|directors?|engineers?|founders?|executives?|leaders?|vp|ceo|cto)\b/.test(value);
  const openEndedResearch = /\b(explain|why|fit|compare|responsible|cross-|across|evaluate|judg(?:e|ment)|strategy|market)\b/.test(value);
  return asksForPeople && !openEndedResearch ? "search" : "agent";
}
