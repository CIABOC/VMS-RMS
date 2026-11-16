// Single source of truth for the screens: drives the sidebar, the home launcher,
// route guards and the counts on the home page (nothing is counted by hand).
//
// `path` is the menu entry. Screens 04, 05 and 07 belong to one visit, so their menu entry
// opens the queue, where a visit is picked.

export const SCREENS = [
  { no: '01', group: 'Access', title: 'SSO sign-in', summary: 'Single Sign-On only, no staff passwords', path: '/sign-in', roles: [], menu: false },
  { no: '02', group: 'Reception', title: 'Reception dashboard', summary: "Today's numbers, waiting visitors, alerts", path: '/reception', roles: ['RECEPTIONIST'] },
  { no: '03', group: 'Reception', title: 'Register visitor', summary: 'Category, profile search, duplicates', path: '/visits/new', roles: ['RECEPTIONIST'] },
  { no: '04', group: 'Reception', title: 'Identity verification', summary: 'Stored-scan reuse rules and exceptions', path: '/queue?step=PENDING_VERIFICATION', roles: ['RECEPTIONIST'], menu: false },
  { no: '05', group: 'Reception', title: 'Signature capture', summary: 'Per-visit acknowledgement in three languages', path: '/queue?step=PENDING_SIGNATURE', roles: ['RECEPTIONIST'], menu: false },
  { no: '06', group: 'Reception', title: 'Live queue board', summary: 'Visits by status, public token display', path: '/queue', roles: ['RECEPTIONIST'] },
  { no: '07', group: 'Reception', title: 'Visit detail', summary: 'Entry approval, items, audited history', path: '/queue', roles: ['RECEPTIONIST'], menu: false },
  { no: '08', group: 'Host', title: 'Host officer inbox', summary: 'Accept, delay, redirect or decline', path: '/host', roles: ['HOST_OFFICER'] },
  { no: '09', group: 'Reception', title: 'Appointments', summary: 'Host calendar with overlap checks', path: '/appointments', roles: ['RECEPTIONIST', 'HOST_OFFICER'] },
  { no: '10', group: 'Vehicles', title: 'Gate console', summary: 'Plate lookup and admission decision', path: '/gate', roles: ['GATE_OFFICER', 'SECURITY_SUPERVISOR'] },
  { no: '11', group: 'Vehicles', title: 'Gate and security dashboard', summary: 'Vehicles inside, flags, exceptions', path: '/gate/dashboard', roles: ['GATE_OFFICER', 'SECURITY_SUPERVISOR'] },
  { no: '12', group: 'Category workflows', title: 'Device custody', summary: 'Tokens, handover and return', path: '/devices', roles: ['RECEPTIONIST'] },
  { no: '13', group: 'Insights', title: 'Management dashboard', summary: 'Aggregate indicators only', path: '/insights', roles: ['MANAGEMENT'] },
  { no: '14', group: 'System', title: 'Admin master data', summary: 'Limits, texts, role mapping', path: '/admin', roles: ['SYSTEM_ADMIN'] },
  { no: '15', group: 'System', title: 'Audit log', summary: 'Events and integrity check', path: '/audit', roles: ['SYSTEM_ADMIN', 'SECURITY_SUPERVISOR'] },
];

export const canSee = (screen, roles) => screen.roles.length === 0 || screen.roles.some((r) => roles.includes(r));

export const screensFor = (roles) => SCREENS.filter((s) => s.roles.length > 0 && canSee(s, roles));

export const menuFor = (roles) => screensFor(roles).filter((s) => s.menu !== false);

export const rolesCovered = () => new Set(SCREENS.flatMap((s) => s.roles)).size;

export const byNo = (no) => SCREENS.find((s) => s.no === no);
