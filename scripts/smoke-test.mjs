// End-to-end smoke test. Run against a backend with an EMPTY database whose bootstrap admin is admin@test.local:
//   APP_BOOTSTRAP_ADMIN_EMAIL=admin@test.local  (backend env)
//   node scripts/smoke-test.mjs               (RVM_API overrides http://localhost:8080)
// It creates test staff, a category and an acknowledgement text, then walks every workflow. Never run it against production.
const BASE = (process.env.RVM_API || 'http://localhost:8080') + '/api';
let failures = 0;

function session() {
  const jar = {};
  return async function call(method, path, body, expect = 200) {
    const headers = { 'Content-Type': 'application/json' };
    if (jar['XSRF-TOKEN']) headers['X-XSRF-TOKEN'] = jar['XSRF-TOKEN'];
    headers.Cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      jar[kv.slice(0, i)] = kv.slice(i + 1);
    }
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    const ok = res.status === expect;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${method} ${path} -> ${res.status}${ok ? '' : ' (expected ' + expect + ') ' + JSON.stringify(data)}`
      + (!ok || res.status < 300 ? '' : `  msg: ${data?.message}`));
    return data;
  };
}

async function login(email) {
  const s = session();
  await s('GET', '/auth/csrf');
  await s('POST', '/auth/dev-login', { email });
  await s('GET', '/auth/csrf');
  return s;
}

const check = (label, cond) => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); };

// ---------------- unauthenticated
const anon = session();
await anon('GET', '/visits', undefined, 401);
await anon('GET', '/auth/csrf');
await anon('POST', '/auth/dev-login', { email: 'nobody@test.local' }, 401);
const pq0 = await anon('GET', '/public/queue');
check('public queue has refreshSeconds from settings', pq0.refreshSeconds === 10 && pq0.tokens.length === 0);

// ---------------- admin sets up master data
const admin = await login('admin@test.local');
const mk = (email, fullName, roles, department) => admin('POST', '/admin/staff', { email, fullName, roles, active: true, department });
await mk('recep@test.local', 'Reception One', ['RECEPTIONIST'], 'Front office');
const host = await mk('host@test.local', 'Host Officer A', ['HOST_OFFICER'], 'Investigations');
const host2 = await mk('host2@test.local', 'Host Officer B', ['HOST_OFFICER'], 'Legal');
await mk('gate@test.local', 'Gate One', ['GATE_OFFICER']);
await mk('sup@test.local', 'Supervisor One', ['SECURITY_SUPERVISOR']);
await mk('mgmt@test.local', 'Manager One', ['MANAGEMENT']);
await admin('POST', '/admin/staff', { email: 'host@test.local', fullName: 'Duplicate', roles: ['HOST_OFFICER'], active: true }, 409);
const cat = await admin('POST', '/admin/categories', { code: 'GENERAL', name: 'General public', requiresAppointment: false, requiresDeviceCustody: true, active: true });
await admin('POST', '/admin/categories', { code: 'bad code', name: 'x', active: true }, 400);
const ack = await admin('POST', '/admin/ack-texts', { textEn: 'I agree to the rules.', textSi: 'මම එකඟ වෙමි.', textTa: 'நான் ஒப்புக்கொள்கிறேன்.' });
await admin('POST', `/admin/ack-texts/${ack.id}/activate`);
await admin('PUT', '/admin/settings/ID_SCAN_REUSE_DAYS', { value: 'abc' }, 400);
await admin('PUT', '/admin/settings/ID_SCAN_REUSE_DAYS', { value: '90' });
await admin('GET', '/visits', undefined, 403);   // admin is not a receptionist

// ---------------- reception registers a visit
const recep = await login('recep@test.local');
const visitor = await recep('POST', '/visitors', { fullName: 'Kamal Perera', idType: 'NIC', idNumber: '199012345678', mobile: '0771234567' });
await recep('POST', '/visitors', { fullName: 'Kamal P', idType: 'NIC', idNumber: '199012345678' }, 409);
const dupes = await recep('GET', '/visitors/possible-duplicates?idNumber=199012345678&mobile=&fullName=x');
check('duplicate detection finds existing profile', dupes.length === 1);
const found = await recep('GET', '/visitors?q=kamal');
check('visitor search works', found.length === 1);

const visit = await recep('POST', '/visits', { visitorId: visitor.id, categoryId: cat.id, hostId: host.id, purpose: 'Complaint follow-up' });
check('visit starts at PENDING_VERIFICATION', visit.status === 'PENDING_VERIFICATION');
const vs = await recep('GET', `/visits/${visit.id}/verification`);
check('no stored scan -> reuse not allowed', vs.reuseAllowed === false && vs.reuseDays === 90);
await recep('POST', `/visits/${visit.id}/verify`, { method: 'REUSED_SCAN' }, 400);
await recep('POST', `/visits/${visit.id}/verify`, { method: 'EXCEPTION', note: 'short' }, 400);
await recep('POST', `/visits/${visit.id}/verify`, { method: 'EXCEPTION', note: 'Lost NIC, police report shown' });
await recep('POST', `/visits/${visit.id}/sign`, { language: 'si', signaturePng: 'data:image/png;base64,xx' }, 400);
const signed = await recep('POST', `/visits/${visit.id}/sign`, { language: 'si', signaturePng: 'data:image/png;base64,' + 'A'.repeat(400) });
check('token 1 assigned and WAITING', signed.tokenNo === 1 && signed.status === 'WAITING');
const pq = await anon('GET', '/public/queue');
check('public queue shows token only (no names)', pq.tokens.length === 1 && JSON.stringify(pq).indexOf('Kamal') === -1);

// ---------------- host responds
const hostS = await login('host@test.local');
const inbox = await hostS('GET', '/host/visits');
check('host sees the visit', inbox.length === 1);
const host2S = await login('host2@test.local');
await host2S('POST', `/host/visits/${visit.id}/respond`, { action: 'ACCEPT' }, 403);
await hostS('POST', `/host/visits/${visit.id}/respond`, { action: 'DECLINE' }, 400);
await hostS('POST', `/host/visits/${visit.id}/respond`, { action: 'DELAY', delayMinutes: 10 });
await hostS('POST', `/host/visits/${visit.id}/respond`, { action: 'ACCEPT', note: 'Send up' });

// ---------------- entry, devices, items, checkout
await recep('POST', `/visits/${visit.id}/approve-entry`, { badgeNo: 'B-07', deviceCustodyConfirmed: false }, 400);
const dev = await recep('POST', '/devices', { visitId: visit.id, tagNo: 't-01', deviceType: 'Mobile phone' });
await recep('POST', '/devices', { visitId: visit.id, tagNo: 'T-01', deviceType: 'Laptop' }, 409);
await recep('POST', `/visits/${visit.id}/approve-entry`, { badgeNo: 'B-07', deviceCustodyConfirmed: true });
await recep('POST', `/visits/${visit.id}/items`, { description: 'Document file', quantity: 2 });
await recep('POST', `/visits/${visit.id}/check-out`, undefined, 409);
await recep('POST', `/devices/${dev.id}/return`);
await recep('POST', `/visits/${visit.id}/check-out`);
const detail = await recep('GET', `/visits/${visit.id}`);
check('visit COMPLETED with history', detail.summary.status === 'COMPLETED' && detail.history.length >= 8);
const dash = await recep('GET', '/dashboard/reception');
check('reception dashboard counts completed', dash.counts.COMPLETED === 1 && dash.total === 1);

// ---------------- appointments + overlap
const start = new Date(Date.now() + 2 * 3600e3); start.setMinutes(0, 0, 0);
const iso = (d, addMin) => new Date(d.getTime() + addMin * 60000).toISOString();
await recep('POST', '/appointments', { hostId: host.id, visitorName: 'Nimal', startsAt: iso(start, 0), endsAt: iso(start, 30) });
await recep('POST', '/appointments', { hostId: host.id, visitorName: 'Sunil', startsAt: iso(start, 15), endsAt: iso(start, 45) }, 409);
await recep('POST', '/appointments', { hostId: host.id, visitorName: 'Sunil', startsAt: iso(start, 30), endsAt: iso(start, 60) });
await hostS('POST', '/appointments', { hostId: host2.id, visitorName: 'X', startsAt: iso(start, 0), endsAt: iso(start, 30) }, 403);
const mine = await hostS('GET', `/appointments?from=${iso(start, -600)}&to=${iso(start, 600)}`);
check('host sees own appointments', mine.length === 2);

// ---------------- gate
const gate = await login('gate@test.local');
const lk = await gate('GET', '/gate/lookup?plate=wp%20cab-1234');
check('unknown plate normalised', lk.vehicle === null && lk.normalisedPlate === 'WPCAB1234');
const veh = await gate('POST', '/gate/vehicles', { plateNo: 'WP CAB 1234', ownerType: 'VISITOR', ownerName: 'Kamal' });
await gate('POST', '/gate/vehicles', { plateNo: 'wpcab1234', ownerType: 'VISITOR' }, 409);
await gate('POST', '/gate/movements', { vehicleId: veh.id, direction: 'EXIT', decision: 'ADMITTED' }, 409);
await gate('POST', '/gate/movements', { vehicleId: veh.id, direction: 'ENTRY', decision: 'ADMITTED', gate: 'Main' });
await gate('POST', '/gate/movements', { vehicleId: veh.id, direction: 'ENTRY', decision: 'ADMITTED' }, 409);
await gate('POST', '/gate/movements', { vehicleId: veh.id, direction: 'EXIT', decision: 'ADMITTED' });
await gate('PUT', `/gate/vehicles/${veh.id}/flag`, { flagged: true, blocked: true, reason: 'x' }, 403);
const sup = await login('sup@test.local');
await sup('PUT', `/gate/vehicles/${veh.id}/flag`, { flagged: true, blocked: true, reason: 'Under inquiry' });
await gate('POST', '/gate/movements', { vehicleId: veh.id, direction: 'ENTRY', decision: 'ADMITTED', reason: 'please' }, 403);
await gate('POST', '/gate/movements', { vehicleId: veh.id, direction: 'ENTRY', decision: 'DENIED' }, 400);
await gate('POST', '/gate/movements', { vehicleId: veh.id, direction: 'ENTRY', decision: 'DENIED', reason: 'Blocked vehicle' });
await sup('POST', '/gate/movements', { vehicleId: veh.id, direction: 'ENTRY', decision: 'ADMITTED', reason: 'Escorted by supervisor' });
const gd = await gate('GET', '/dashboard/gate');
check('gate dashboard: 1 inside, 1 denied, exceptions listed', gd.insideCount === 1 && gd.deniedToday === 1 && gd.exceptions.length >= 2);

// ---------------- management + audit
const mgmt = await login('mgmt@test.local');
const md = await mgmt('GET', '/dashboard/management?days=7');
check('management aggregates', md.totalVisits === 1 && md.uniqueVisitors === 1 && md.byCategory[0].name === 'General public' && md.vehicleDenials === 1);
check('management payload has no visitor names', JSON.stringify(md).indexOf('Kamal') === -1);
await mgmt('GET', '/audit', undefined, 403);
const page = await admin('GET', '/audit?size=5');
check('audit search paginates', page.items.length === 5 && page.total > 30);
const v1 = await admin('GET', '/audit/verify');
check('audit chain valid', v1.valid === true && v1.checked === page.total);
await sup('GET', '/audit/actions');

// ---------------- self-lockout guard and logout
const me = await admin('GET', '/auth/me');
await admin('PUT', `/admin/staff/${me.id}`, { email: me.email, fullName: 'Admin', roles: ['MANAGEMENT'], active: true }, 400);
await recep('POST', '/auth/logout');
await recep('GET', '/visits', undefined, 401);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
