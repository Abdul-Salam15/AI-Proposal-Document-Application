import type { SectionContent, SectionKey } from "./sections";

// Section 11.1: "Use a local mock mode during development... stub out the
// Claude API response with static sample text." Deliberately static (not
// proposal-specific) so it's obviously a stub, not real output.
const MOCK_CONTENT: Record<SectionKey, SectionContent> = {
  introduction:
    "[MOCK] Thank you for taking the time to speak with us about your project. This proposal outlines how we'd approach your needs based on our conversation.",
  project_scope:
    "[MOCK] The scope of this engagement covers the work discussed during the discovery call, delivered in the phases outlined below.",
  recommended_approach:
    "[MOCK] Based on what you've shared, we recommend a phased approach combining the services below to address your goals directly.",
  deliverables: [
    "[MOCK] Discovery and requirements workshop",
    "[MOCK] Core implementation of the recommended services",
    "[MOCK] Stakeholder review and handoff",
  ],
  timeline: {
    intro: "[MOCK] We propose the following phased timeline, with milestones checked in along the way.",
    phases: [
      { phase: "[MOCK] Phase 1", focus: "[MOCK] Discovery", details: "[MOCK] Requirements gathering and planning." },
      { phase: "[MOCK] Phase 2", focus: "[MOCK] Build", details: "[MOCK] Core implementation and integration." },
      { phase: "[MOCK] Phase 3", focus: "[MOCK] Launch", details: "[MOCK] Rollout and handoff." },
    ],
  },
  pricing: {
    summary: "[MOCK] Pricing is structured across milestones tied to project phases, covering the full scope described above.",
    totalInvestmentLabel: "[MOCK] $0",
    milestones: [
      { label: "[MOCK] Kickoff", percent: 40 },
      { label: "[MOCK] Midpoint delivery", percent: 30 },
      { label: "[MOCK] Final delivery", percent: 30 },
    ],
  },
  next_steps:
    "[MOCK] To move forward, reply to confirm and we'll schedule a kickoff call with your point of contact.",
};

export function mockSectionContent(sectionKey: SectionKey): SectionContent {
  return MOCK_CONTENT[sectionKey];
}
