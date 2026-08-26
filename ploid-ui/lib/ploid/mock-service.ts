import type {
  AgentResponse,
  PloidAgentRequest,
  PloidResponse,
  PloidSearchRequest,
  PloidSearchResponse,
} from "./types";

export const isMockApiEnabled = () =>
  process.env.MOCK_API?.trim().toLowerCase() === "true";

const meta = () => ({
  request_id: `mock_${crypto.randomUUID()}`,
  acu_used: 0,
  mock: true,
});

const people = [
  {
    name: "Maya Chen",
    title: "Engineering Manager",
    company: "Northstar Systems",
    location: "San Francisco, CA",
    linkedin_url: "https://www.linkedin.com/in/maya-chen-mock",
  },
  {
    name: "Jordan Patel",
    title: "VP Engineering",
    company: "Atlas Cloud",
    location: "San Francisco, CA",
    linkedin_url: "https://www.linkedin.com/in/jordan-patel-mock",
  },
  {
    name: "Alex Morgan",
    title: "Director of Platform",
    company: "Forge AI",
    location: "San Francisco, CA",
    linkedin_url: "https://www.linkedin.com/in/alex-morgan-mock",
  },
];

const companies = [
  {
    name: "Northstar Systems",
    domain: "https://northstar.example",
    industry: "Fleet operations software",
    product: "Cross-OEM warranty workflow automation",
  },
  {
    name: "Atlas Cloud",
    domain: "https://atlas.example",
    industry: "Cloud infrastructure",
    product: "Infrastructure observability platform",
  },
  {
    name: "Forge AI",
    domain: "https://forge.example",
    industry: "Enterprise AI",
    product: "Knowledge automation for operations teams",
  },
];

const markets = [
  {
    name: "Commercial fleet warranty software",
    segment: "Fleet operations",
    description:
      "Workflow tools for warranty claims, recovery, and OEM coordination.",
  },
  {
    name: "AI infrastructure",
    segment: "Enterprise software",
    description:
      "Compute, observability, and orchestration products for production AI.",
  },
  {
    name: "Revenue intelligence",
    segment: "Go-to-market",
    description:
      "Data products that prioritize accounts and automate research workflows.",
  },
];

export function mockPeopleSearch(
  input: PloidSearchRequest,
): PloidSearchResponse {
  const results = people
    .slice(0, input.num_results ?? 25)
    .map((person, index) => ({
      url: person.linkedin_url,
      title: `${person.name} · ${person.title}`,
      score: 1 - index / 10,
      person,
    }));
  return {
    data: {
      results,
      search_time_ms: 4,
      rows_indexed: results.length,
      request: {
        query: input.query,
        type: input.type ?? "instant",
        category: "people",
        num_results: input.num_results ?? 25,
      },
    },
    meta: meta(),
  };
}

/** Generates only operations using the stable columns embedded in the workspace context. */
export function mockAgentResponse(request: PloidAgentRequest): AgentResponse {
  const prompt = request.prompt.toLowerCase();
  const rows = prompt.includes("person_name")
    ? people.map((item) => ({
        values: {
          person_name: item.name,
          person_contact: `${item.title} at ${item.company}`,
          person_linkedin: item.linkedin_url,
        },
      }))
    : prompt.includes("market_name")
      ? markets.map((item) => ({
          values: {
            market_name: item.name,
            market_segment: item.segment,
            market_description: item.description,
          },
        }))
      : companies.map((item) => ({
          values: {
            company_name: item.name,
            company_domain: item.domain,
            company_industry: item.industry,
            company_product_service: item.product,
          },
        }));
  const kind = prompt.includes("person_name")
    ? "people"
    : prompt.includes("market_name")
      ? "markets"
      : "companies";
  return {
    data: {
      output: `Mock Ploid completed ${kind} research.`,
      artifacts: [],
      structured_output: {
        message: "Mock structured table result",
        operations: [{ type: "add_rows", rows }],
      },
    },
    meta: meta(),
  };
}

export function mockPersonEnrichment(input: {
  linkedinUrl: string;
  enrichments: Array<"profile" | "email" | "phone">;
}): PloidResponse<Record<string, unknown>> {
  const data: Record<string, unknown> = {};
  if (input.enrichments.includes("email"))
    data.email = "maya.chen@northstar.example";
  if (input.enrichments.includes("phone")) data.phone = "+1 415 555 0148";
  if (input.enrichments.includes("profile"))
    data.profile = {
      linkedin_url: input.linkedinUrl,
      headline: "Engineering leader",
      company: "Northstar Systems",
    };
  return { data, meta: meta() };
}

export function mockSocialEnrichment(input: {
  platform: string;
  identifier: string;
}): PloidResponse<{ platform: string; profile: Record<string, unknown> }> {
  return {
    data: {
      platform: input.platform,
      profile: {
        username: "mock-profile",
        url: input.identifier,
        bio: "Mock social profile returned by MOCK_API",
        followers: 1250,
      },
    },
    meta: meta(),
  };
}
