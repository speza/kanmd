export interface ChecklistItem {
  text: string;
  checked: boolean;
}

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export function isValidPriority(value: string): value is Priority {
  return PRIORITIES.includes(value as Priority);
}

export interface Card {
  id: string;
  title: string;
  priority: Priority;
  labels: string[];
  created: string;
  updated?: string;
  description: string;
  checklist: ChecklistItem[];
  column: string;
  rank?: number;
}

export interface Board {
  columns: string[];
  cards: Card[];
}

export class KanmdError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'KanmdError';
  }
}
