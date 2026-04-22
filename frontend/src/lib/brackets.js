export const GENERATION_PRESETS = [
  {
    id: "fair_draw",
    label: "Fair Draw",
    shortLabel: "Fair",
    description: "Avoid same-club round-one collisions first, then keep seed spread reasonable.",
  },
  {
    id: "seeded_championship",
    label: "Seeded Championship",
    shortLabel: "Seeded",
    description: "Protect top seeds and still try to prevent same-club first-round fights.",
  },
  {
    id: "open_draw",
    label: "Open Draw",
    shortLabel: "Open",
    description: "Looser bracket style with light conflict control when a faster draw is acceptable.",
  },
];

export const BRACKET_STATUS_LABELS = {
  draft: "Draft",
  locked: "Locked",
  live: "Live",
  completed: "Completed",
};
