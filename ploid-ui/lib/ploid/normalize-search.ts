import type { PersonRow, PloidSearchResponse } from "./types";

const present = (value: string | null | undefined) => value ?? undefined;

function personId(
  person: { linkedin_url?: string | null; name?: string | null },
  index: number,
) {
  // LinkedIn is the only durable person identifier exposed by this endpoint.
  // The index fallback is stable within the returned response and never leaks
  // the raw Ploid result into the table identity.
  const source = person.linkedin_url || person.name || `result-${index + 1}`;
  return `person_${encodeURIComponent(source).replace(/%/g, "_")}`;
}

export function normalizePeopleSearchResponse(response: PloidSearchResponse): {
  rows: PersonRow[];
  warning?: string;
  requestId?: string;
} {
  return {
    rows: response.data.results.map((result, index) => {
      const name = present(result.person.name);
      const [firstName, ...lastNameParts] = name?.trim().split(/\s+/) ?? [];
      return {
        id: personId(result.person, index),
        ...(name ? { name } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastNameParts.length ? { lastName: lastNameParts.join(" ") } : {}),
        ...(present(result.person.title) ? { title: present(result.person.title) } : {}),
        ...(present(result.person.company) ? { company: present(result.person.company) } : {}),
        ...(present(result.person.location) ? { location: present(result.person.location) } : {}),
        ...(present(result.person.linkedin_url)
          ? { linkedinUrl: present(result.person.linkedin_url) }
          : {}),
        raw: result,
      };
    }),
    ...(response.meta.warning ? { warning: response.meta.warning } : {}),
    ...(response.meta.request_id ? { requestId: response.meta.request_id } : {}),
  };
}
