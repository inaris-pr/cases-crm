import "dotenv/config";
import { db } from "./index.js";
import {
  customers,
  cases,
  tasks,
  documents,
  conversations,
  conversationMembers,
  messages,
  messageCaseTags,
} from "./schema.js";
import { sql } from "drizzle-orm";

async function main() {
  console.log("→ Seeding cases database…");

  // Clean slate
  await db.execute(sql`TRUNCATE TABLE
    message_case_tags,
    messages,
    conversation_members,
    conversations,
    documents,
    tasks,
    cases,
    customers
  RESTART IDENTITY CASCADE`);

  const insertedCustomers = await db
    .insert(customers)
    .values([
      {
        name: "Amelia Reyes",
        email: "amelia@helixlabs.io",
        phone: "+1 415 555 0144",
        company: "Helix Labs",
      },
      {
        name: "Jordan Bell",
        email: "jbell@northstar-co.com",
        phone: "+1 312 555 0177",
        company: "Northstar & Co.",
      },
      {
        name: "Priya Shah",
        email: "priya.shah@meridian-partners.com",
        phone: "+1 646 555 0123",
        company: "Meridian Partners",
      },
      {
        name: "Marcus Cole",
        email: "marcus@coleassociates.com",
        phone: "+1 213 555 0166",
        company: "Cole Associates",
      },
      {
        name: "Yuki Tanaka",
        email: "yuki@brightline.ai",
        phone: "+1 415 555 0182",
        company: "Brightline AI",
      },
    ])
    .returning();

  const [amelia, jordan, priya, marcus, yuki] = insertedCustomers;

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  const insertedCases = await db
    .insert(cases)
    .values([
      {
        caseNumber: "CASE-001",
        title: "Series B financing review",
        customerId: amelia.id,
        status: "in_progress",
        priority: "high",
        description:
          "Comprehensive review of the Series B term sheet including liquidation preferences, board composition, and protective provisions. Awaiting redlines from outside counsel.",
        tags: ["financing", "term-sheet", "venture"],
        createdAt: daysAgo(22),
        updatedAt: daysAgo(1),
      },
      {
        caseNumber: "CASE-002",
        title: "Trademark opposition filing",
        customerId: jordan.id,
        status: "review",
        priority: "medium",
        description:
          "Drafting opposition brief against pending TM registration that conflicts with client's senior mark.",
        tags: ["ip", "trademark", "litigation"],
        createdAt: daysAgo(14),
        updatedAt: daysAgo(2),
      },
      {
        caseNumber: "CASE-003",
        title: "Vendor MSA negotiation",
        customerId: priya.id,
        status: "waiting",
        priority: "low",
        description:
          "Negotiating MSA with cloud infrastructure vendor. Awaiting counter-proposal on indemnification scope.",
        tags: ["contracts", "msa", "vendors"],
        createdAt: daysAgo(9),
        updatedAt: daysAgo(3),
      },
      {
        caseNumber: "CASE-004",
        title: "Employment dispute — wrongful termination",
        customerId: marcus.id,
        status: "intake",
        priority: "critical",
        description:
          "Initial intake completed. Preparing demand letter and assessing exposure under state wage statutes.",
        tags: ["employment", "litigation", "demand-letter"],
        createdAt: daysAgo(4),
        updatedAt: daysAgo(4),
      },
      {
        caseNumber: "CASE-005",
        title: "SaaS subscription terms refresh",
        customerId: yuki.id,
        status: "completed",
        priority: "medium",
        description:
          "Refreshed customer-facing subscription agreement to align with updated data protection commitments. Signed-off and live.",
        tags: ["contracts", "saas", "privacy"],
        createdAt: daysAgo(45),
        updatedAt: daysAgo(7),
      },
    ])
    .returning();

  const [c1, c2, c3, c4, c5] = insertedCases;

  await db.insert(tasks).values([
    {
      caseId: c1.id,
      title: "Send redline of Section 5 to outside counsel",
      description: "Highlight changes to liquidation preference language.",
      status: "in_progress",
      dueDate: daysAgo(-2),
      createdAt: daysAgo(20),
    },
    {
      caseId: c1.id,
      title: "Schedule board call for protective provisions sign-off",
      status: "pending",
      dueDate: daysAgo(-5),
      createdAt: daysAgo(18),
    },
    {
      caseId: c1.id,
      title: "Confirm cap table reconciliation",
      status: "completed",
      dueDate: daysAgo(3),
      createdAt: daysAgo(21),
    },
    {
      caseId: c2.id,
      title: "Draft opposition brief — first pass",
      status: "in_progress",
      dueDate: daysAgo(-3),
      createdAt: daysAgo(13),
    },
    {
      caseId: c2.id,
      title: "Pull TTAB precedent on confusion factor 3",
      status: "pending",
      dueDate: daysAgo(-7),
      createdAt: daysAgo(10),
    },
    {
      caseId: c3.id,
      title: "Mark up indemnification clause",
      status: "completed",
      dueDate: daysAgo(2),
      createdAt: daysAgo(8),
    },
    {
      caseId: c4.id,
      title: "Draft demand letter — wage claim",
      status: "in_progress",
      dueDate: daysAgo(-1),
      createdAt: daysAgo(3),
    },
    {
      caseId: c4.id,
      title: "Intake interview with witnesses",
      status: "pending",
      dueDate: daysAgo(-4),
      createdAt: daysAgo(3),
    },
    {
      caseId: c5.id,
      title: "Publish updated DPA addendum",
      status: "completed",
      dueDate: daysAgo(10),
      createdAt: daysAgo(40),
    },
  ]);

  await db.insert(documents).values([
    {
      caseId: c1.id,
      filename: "Series-B-Term-Sheet-v3.pdf",
      fileUrl: "https://example.com/docs/series-b-v3.pdf",
      type: "contract",
      size: 482113,
      tags: ["term-sheet", "v3"],
      createdAt: daysAgo(20),
    },
    {
      caseId: c2.id,
      filename: "TM-Opposition-Draft.docx",
      fileUrl: "https://example.com/docs/tm-opp.docx",
      type: "report",
      size: 89234,
      tags: ["draft"],
      createdAt: daysAgo(11),
    },
    {
      caseId: c3.id,
      filename: "Vendor-MSA-Counterproposal.pdf",
      fileUrl: "https://example.com/docs/msa-counter.pdf",
      type: "contract",
      size: 318007,
      tags: ["msa", "counter"],
      createdAt: daysAgo(6),
    },
    {
      caseId: c4.id,
      filename: "Employee-File-Cole.pdf",
      fileUrl: "https://example.com/docs/employee-file.pdf",
      type: "identity",
      size: 124880,
      tags: ["confidential"],
      createdAt: daysAgo(4),
    },
  ]);

  // Conversations
  const [dm, group] = await db
    .insert(conversations)
    .values([
      { name: null, type: "dm", createdAt: daysAgo(3) },
      { name: "Series B war room", type: "group", createdAt: daysAgo(10) },
    ])
    .returning();

  await db.insert(conversationMembers).values([
    { conversationId: dm.id, memberName: "You" },
    { conversationId: dm.id, memberName: "Amelia Reyes" },
    { conversationId: group.id, memberName: "You" },
    { conversationId: group.id, memberName: "Amelia Reyes" },
    { conversationId: group.id, memberName: "Jordan Bell" },
    { conversationId: group.id, memberName: "Priya Shah" },
  ]);

  const insertedMessages = await db
    .insert(messages)
    .values([
      {
        conversationId: dm.id,
        senderName: "Amelia Reyes",
        content: "Hey — did you get a chance to look at the redline I sent?",
        createdAt: daysAgo(2),
      },
      {
        conversationId: dm.id,
        senderName: "You",
        content: "Going through it now. I think Section 5 still needs work.",
        createdAt: daysAgo(2),
      },
      {
        conversationId: dm.id,
        senderName: "Amelia Reyes",
        content: "Sounds good. Ping me when you have a v4 ready.",
        createdAt: daysAgo(1),
      },
      {
        conversationId: group.id,
        senderName: "Jordan Bell",
        content: "Just pushed the latest cap-table reconciliation to the case file.",
        createdAt: daysAgo(5),
      },
      {
        conversationId: group.id,
        senderName: "You",
        content: "Thanks Jordan — also flagged a question on protective provisions.",
        createdAt: daysAgo(4),
      },
      {
        conversationId: group.id,
        senderName: "Priya Shah",
        content: "Board call is tentatively Wednesday 3pm. Will confirm by EOD.",
        createdAt: daysAgo(3),
      },
    ])
    .returning();

  // Tag the first DM thread to CASE-001 and the war room messages to CASE-001
  await db.insert(messageCaseTags).values([
    { messageId: insertedMessages[0].id, caseId: c1.id },
    { messageId: insertedMessages[1].id, caseId: c1.id },
    { messageId: insertedMessages[3].id, caseId: c1.id },
    { messageId: insertedMessages[5].id, caseId: c1.id },
  ]);

  console.log("✓ Seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
