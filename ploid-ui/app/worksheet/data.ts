export type MemberRow = {
  [key: string]: string;
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActive: string;
  plan: string;
  spend: string;
};

export const initialColumnKeys = [
  "name",
  "email",
  "role",
  "status",
  "lastActive",
  "plan",
  "spend",
  "website",
];

export const initialRows: MemberRow[] = [
  {
    id: "usr_01",
    name: "Maya Patel",
    email: "maya@northstar.io",
    role: "Product designer",
    status: "Active",
    lastActive: "Today, 9:42 AM",
    plan: "Pro",
    spend: "$1,240",
    website: "https://northstar.io",
  },
  {
    id: "usr_02",
    name: "Theo Morgan",
    email: "theo@northstar.io",
    role: "Engineering lead",
    status: "Active",
    lastActive: "Today, 8:17 AM",
    plan: "Pro",
    spend: "$1,240",
    website: "https://linear.app",
  },
  {
    id: "usr_03",
    name: "Jamie Chen",
    email: "jamie@northstar.io",
    role: "Product manager",
    status: "Active",
    lastActive: "Yesterday, 4:31 PM",
    plan: "Team",
    spend: "$860",
    website: "https://figma.com",
  },
  {
    id: "usr_04",
    name: "Alex Rivera",
    email: "alex@northstar.io",
    role: "Frontend engineer",
    status: "Invited",
    lastActive: "—",
    plan: "Pro",
    spend: "$1,240",
    website: "https://vercel.com",
  },
  {
    id: "usr_05",
    name: "Samira Okafor",
    email: "samira@northstar.io",
    role: "Marketing",
    status: "Active",
    lastActive: "Yesterday, 11:08 AM",
    plan: "Team",
    spend: "$860",
    website: "https://hubspot.com",
  },
  {
    id: "usr_06",
    name: "Nico Williams",
    email: "nico@northstar.io",
    role: "Sales",
    status: "Paused",
    lastActive: "Aug 18, 2:04 PM",
    plan: "Starter",
    spend: "$240",
    website: "https://clay.com",
  },
  {
    id: "usr_07",
    name: "Priya Shah",
    email: "priya@northstar.io",
    role: "Customer success",
    status: "Active",
    lastActive: "Aug 18, 9:55 AM",
    plan: "Team",
    spend: "$860",
    website: "https://notion.so",
  },
  {
    id: "usr_08",
    name: "Jordan Lee",
    email: "jordan@northstar.io",
    role: "Researcher",
    status: "Active",
    lastActive: "Aug 17, 3:12 PM",
    plan: "Pro",
    spend: "$1,240",
    website: "https://stripe.com",
  },
  {
    id: "usr_09",
    name: "Rowan Brooks",
    email: "rowan@northstar.io",
    role: "Operations",
    status: "Active",
    lastActive: "Aug 16, 10:40 AM",
    plan: "Starter",
    spend: "$240",
    website: "https://airtable.com",
  },
  {
    id: "usr_10",
    name: "Ari Kim",
    email: "ari@northstar.io",
    role: "Finance",
    status: "Active",
    lastActive: "Aug 15, 5:28 PM",
    plan: "Team",
    spend: "$860",
    website: "https://stripe.com",
  },
];
