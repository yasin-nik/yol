import type { SeatMapData } from './seat-map';

export type Hold = {
  id: string;
  expiresAt: string;
  seatIds: string[];
  totalRial: number;
  paymentState: string;
};
export type InventorySnapshot = {
  data: SeatMapData;
  hold: Hold | null;
  serverTime: string;
  maxSeats: number;
  title: string;
  startsAt: string;
  venue: string;
};
