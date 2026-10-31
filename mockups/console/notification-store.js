/* Offline proposal logic. One scoped Map accepts both sources; no network or persistence. */
(function (root) {
  'use strict';
  function createStore({ now = Date.now, onChange = () => {}, onNotify = () => {} } = {}) {
    const records = new Map();
    let scope = null, epoch = 0, sequence = 0, pollID = 0, inFlight = null, baselined = false;
    const capture = () => ({ epoch });
    const current = ticket => Boolean(scope && ticket && ticket.epoch === epoch);
    const snapshot = () => ({ epoch, active: Boolean(scope), baselined, polling: Boolean(inFlight), records: [...records.values()].map(record => ({ ...record })) });
    const change = () => onChange(snapshot());
    function setScope(next) {
      epoch++; sequence = 0; inFlight = null; baselined = false; records.clear();
      scope = next && ['source', 'principal', 'session', 'namespace'].every(key => typeof next[key] === 'string' && next[key]) ? { ...next } : null;
      change(); return capture();
    }
    function normalize(raw) {
      if (!scope || !raw || typeof raw !== 'object' || typeof raw.name !== 'string') return null;
      if (raw.source && raw.source !== scope.source) return null;
      const parts = raw.name.split('/');
      if (parts.length > 2) return null;
      const name = parts.at(-1), namespace = raw.namespace || (parts.length === 2 ? parts[0] : scope.namespace);
      if (parts.length === 2 && raw.namespace && parts[0] !== raw.namespace) return null;
      const validName = value => typeof value === 'string' && value.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value);
      if (!validName(name) || !validName(namespace) || namespace !== scope.namespace) return null;
      if (typeof raw.requiredBy !== 'string' || !Number.isFinite(Date.parse(raw.requiredBy))) return null;
      const value = typeof raw.decision === 'string' ? raw.decision.toLowerCase() : '';
      const decision = ({ '': 'Pending', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', expired: 'Expired' })[value];
      if (!decision) return null;
      return { key: JSON.stringify([scope.source, namespace, name]), source: scope.source, namespace, name, decision: Date.parse(raw.requiredBy) <= now() && decision === 'Pending' ? 'Expired' : decision, requiredBy: raw.requiredBy };
    }
    function put(record, { notify, via, ticket }) {
      if (!current(ticket)) return false;
      const previous = records.get(record.key);
      // A terminal observation is a tombstone for this session: delayed pending data cannot reopen it.
      if (previous && previous.decision !== 'Pending' && record.decision === 'Pending') return false;
      const isNew = !previous, pending = record.decision === 'Pending';
      const announce = pending && isNew && notify;
      const next = { ...previous, ...record, sequence: ++sequence, via, notified: Boolean(previous?.notified || announce), unread: pending && (announce || Boolean(previous?.unread)) };
      records.set(record.key, next);
      if (announce) onNotify({ ...next });
      return true;
    }
    function observe(raw, ticket = capture(), via = 'investigation') {
      if (!current(ticket)) return false;
      const record = normalize(raw);
      if (!record) return false;
      const accepted = put(record, { notify: true, via, ticket });
      if (accepted) change();
      return accepted;
    }
    function beginPoll() {
      if (!scope || inFlight) return null;
      inFlight = { epoch, id: ++pollID, sequence, baseline: !baselined };
      return { ...inFlight };
    }
    function finishPoll(ticket, result) {
      if (!current(ticket) || !inFlight || ticket.id !== inFlight.id) return { accepted: false, reason: 'obsolete' };
      inFlight = null;
      if (result?.authorized === false) { setScope(null); return { accepted: false, reason: 'denied' }; }
      if (!result || result.error || !Array.isArray(result.records)) { change(); return { accepted: false, reason: 'unavailable' }; }
      const normalized = result.records.map(normalize), complete = result.complete === true && normalized.every(Boolean);
      const present = new Set();
      for (const record of normalized.filter(Boolean)) {
        present.add(record.key);
        const previous = records.get(record.key);
        // A snapshot taken before a stream update must not overwrite that newer observation.
        if (previous && previous.sequence > ticket.sequence) continue;
        put(record, { notify: !ticket.baseline, via: 'poll', ticket });
      }
      if (complete) {
        for (const [key, record] of records) {
          if (record.decision === 'Pending' && record.sequence <= ticket.sequence && !present.has(key)) {
            records.set(key, { ...record, decision: 'No longer pending', unread: false, sequence: ++sequence, via: 'poll' });
          }
        }
        baselined = true;
      }
      expire(); change();
      return { accepted: true, complete };
    }
    function expire() {
      let changed = false;
      for (const [key, record] of records) {
        if (record.decision === 'Pending' && Date.parse(record.requiredBy) <= now()) {
          records.set(key, { ...record, decision: 'Expired', unread: false, sequence: ++sequence }); changed = true;
        }
      }
      return changed;
    }
    function read(key) {
      const record = records.get(key);
      if (!record) return;
      records.set(key, { ...record, unread: false }); change();
    }
    return Object.freeze({ setScope, capture, observe, beginPoll, finishPoll, snapshot, read, expire });
  }
  const api = Object.freeze({ createStore });
  root.KubernautNotificationStore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
