export type Motif =
  | "book"
  | "garden"
  | "ark"
  | "storm"
  | "desert"
  | "fire"
  | "city"
  | "palm"
  | "star"
  | "well"
  | "palace"
  | "lamp"
  | "market"
  | "staff"
  | "balance"
  | "harp"
  | "throne"
  | "sprout"
  | "fish"
  | "niche"
  | "crown"
  | "dove";

export type Story = {
  number: number;
  slug: string;
  name: string;
  subtitle: string;
  motif: Motif;
  palette: [string, string, string];
  paragraphs: string[];
  lesson: string;
  image?: string;
};
