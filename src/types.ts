export type ServiceId =
  | "haircut"
  | "hair_coloring"
  | "massage"
  | "manicure"
  | "consultation"
  | "dental_cleaning";

export interface Service {
  id: ServiceId;
  name: string;
  /** Duration in minutes. */
  durationMinutes: number;
  aliases: string[];
}

export interface Booking {
  id: string;
  service: ServiceId;
  serviceName: string;
  customerName: string | null;
  /** ISO 8601 start timestamp. */
  start: string;
  /** ISO 8601 end timestamp. */
  end: string;
  createdAt: string;
}

export type Intent =
  | "greeting"
  | "help"
  | "list_services"
  | "book"
  | "check_availability"
  | "list_bookings"
  | "cancel"
  | "affirm"
  | "deny"
  | "unknown";

export interface ParsedMessage {
  intent: Intent;
  service: ServiceId | null;
  /** ISO 8601 datetime if a specific date+time was understood. */
  dateTime: string | null;
  /** True when a date was mentioned but no specific time was given. */
  dateOnly: boolean;
  customerName: string | null;
}
