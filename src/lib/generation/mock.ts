import type { SectionKey } from "./sections";

// Section 11.1: "Use a local mock mode during development... stub out the
// Claude API response with static sample text." Deliberately static (not
// proposal-specific) so it's obviously a stub, not real output.
const MOCK_CONTENT: Record<SectionKey, string> = {
  introduction:
    "[MOCK] Thank you for taking the time to speak with us about your project. This proposal outlines how we'd approach your needs based on our conversation.",
  project_scope:
    "[MOCK] The scope of this engagement covers the work discussed during the discovery call, delivered in the phases outlined below.",
  recommended_approach:
    "[MOCK] Based on what you've shared, we recommend a phased approach combining the services below to address your goals directly.",
  deliverables:
    "[MOCK] Deliverables include the core assets and milestones associated with the recommended services above.",
  timeline:
    "[MOCK] We propose the timeline discussed during the call, with milestones checked in along the way.",
  pricing:
    "[MOCK] Pricing is structured as discussed during the call, covering the full scope described above.",
  next_steps:
    "[MOCK] To move forward, reply to confirm and we'll schedule a kickoff call with your point of contact.",
};

export function mockSectionContent(sectionKey: SectionKey): string {
  return MOCK_CONTENT[sectionKey];
}
