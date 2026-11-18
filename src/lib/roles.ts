import type { StaffRole } from '@/db/schema';

// Who may do what. Super admin may do everything (handled in requireStaff).
export const CAN = {
  confirmPayment: ['owner', 'manager', 'cashier', 'captain'],
  cook: ['owner', 'manager', 'cashier', 'station'],
  deliver: ['owner', 'manager', 'cashier', 'captain', 'runner'],
  reject: ['owner', 'manager', 'cashier'],
  toggleLive: ['owner', 'manager', 'cashier', 'station'],
  editMenu: ['owner', 'manager'],
  spots: ['owner', 'manager'],
  reports: ['owner', 'manager'],
  settings: ['owner'],
  coupons: ['owner', 'manager'],
  team: ['owner'],
  tables: ['owner', 'manager', 'cashier', 'captain'],
  pos: ['owner', 'manager', 'cashier', 'captain'],          // billing screen: take orders, send KOT
  settle: ['owner', 'manager', 'cashier', 'captain'],        // take payment, close bills (same people who confirm payments)
  discount: ['owner', 'manager', 'cashier'],
  cancelItem: ['owner', 'manager', 'cashier'],
  cash: ['owner', 'manager', 'cashier'],                     // cash drawer
  inventory: ['owner', 'manager'],
  customers: ['owner', 'manager'],
} satisfies Record<string, StaffRole[]>;

export const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super admin', owner: 'Owner', manager: 'Manager', cashier: 'Cashier / counter',
  station: 'Kitchen / stall station', captain: 'Captain / waiter', runner: 'Runner',
};
