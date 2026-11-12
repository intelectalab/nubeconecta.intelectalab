/**
 * Detalle de un dominio (panel lateral) con contactos editables por rol
 * (registrant / admin / tech / billing) contra la API real de M-DOM.
 */
import { useState, type FormEvent } from 'react';
import { DOMAIN_CONTACT_ROLES, isProblem, type Domain, type DomainContact, type DomainContactInput, type DomainContactRole } from '@hub/api';
import { useApp } from '../../../app/context';
import { Modal, Sheet } from '../../../components/Modal';
import { Chip, Kv, Note } from '../../../components/ui';
import { COUNTRY_OPTIONS, errorText, fDateTime, fieldErrors, useCan, useLoad } from '../clientes/shared';
import { CONTACT_ROLE_LABEL, DOMAIN_STATUS_LABEL, domainsApi, fDay, HOLDER_LABEL } from './shared';

const yn = (b: boolean) => (b ? 'Sí' : 'No');

export function DomainDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const res = useLoad(() => domainsApi.get(id), [id]);
  const d = res.data;
  return (
    <Sheet open onClose={onClose} title={d?.name ?? 'Dominio'} sub={d ? `${DOMAIN_STATUS_LABEL[d.status]} · Titular: ${HOLDER_LABEL[d.holder]}` : undefined}>
      {res.error ? (
        <Note kind="warn" icon="tri" role="alert">
          No se pudo cargar el dominio: {errorText(res.error)}{' '}
          <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button>
        </Note>
      ) : !d ? (
        <p className="sub">Cargando dominio…</p>
      ) : (
        <>
          <Kv
            items={[
              ['Registrador', d.registrar ? `${d.registrar.name} · ${d.registrar.account_label}` : '—'],
              ['Cliente', d.customer ? `${d.customer.name} (${d.customer.code})` : '—'],
              ['Servicio', d.service ? `${d.service.label} (${d.service.code})` : '—'],
              ['Registrado', fDay(d.registered_at)],
              ['Vence (real)', fDay(d.registry_expires_at)],
              ['Vence (comercial)', fDay(d.commercial_due_date)],
              ['Días restantes', d.days_remaining === null ? '—' : String(d.days_remaining)],
              ['Renovación automática', yn(d.auto_renew)],
              ['Bloqueo de transferencia', yn(d.lock)],
              ['DNSSEC', yn(d.dnssec)],
              ['Privacidad WHOIS', yn(d.privacy)],
              ['Nameservers', d.nameservers.length ? <span className="mono">{d.nameservers.join(', ')}</span> : '—'],
              ['Última sincronización', fDateTime(d.last_synced_at)],
            ]}
          />
          {d.contacts === undefined ? null : (
            <Contacts
              domain={d}
              contacts={d.contacts}
              reload={() => {
                res.reload();
                onChanged();
              }}
            />
          )}
        </>
      )}
    </Sheet>
  );
}

function addressText(c: DomainContact): string {
  const a = c.address;
  return [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(', ');
}

function Contacts({ domain, contacts, reload }: { domain: Domain; contacts: DomainContact[]; reload: () => void }) {
  const { dialogs, toast } = useApp();
  const can = useCan();
  const canEdit = can('domains.domain_contact.update');
  const [form, setForm] = useState<{ contact: DomainContact | null; role: DomainContactRole } | null>(null);

  const remove = (c: DomainContact) =>
    dialogs.confirm({
      title: 'Eliminar contacto',
      body: (
        <p style={{ margin: 0 }}>
          ¿Eliminar el contacto {CONTACT_ROLE_LABEL[c.role].toLowerCase()} <b>{c.name}</b>? Esta acción no se puede deshacer.
        </p>
      ),
      okLabel: 'Eliminar',
      danger: true,
      onOk: () => {
        domainsApi.removeContact(domain.id, c.id).then(
          () => {
            toast('Contacto eliminado', c.name);
            reload();
          },
          (e: unknown) => toast('No se pudo eliminar el contacto', errorText(e), 'err'),
        );
      },
    });

  return (
    <section style={{ marginTop: 20 }}>
      <h3 className="sec" style={{ margin: '0 0 8px' }}>Contactos</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        {DOMAIN_CONTACT_ROLES.map((role) => {
          const list = contacts.filter((c) => c.role === role);
          return (
            <div key={role} className="card">
              <div className="card-b" style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <b>{CONTACT_ROLE_LABEL[role]}</b>
                  {canEdit && !list.length ? <button type="button" className="btn sm" onClick={() => setForm({ contact: null, role })}>Agregar</button> : null}
                </div>
                {list.length ? (
                  list.map((c) => (
                    <div key={c.id} style={{ display: 'grid', gap: 2 }}>
                      <div>{c.name}{c.company ? <span className="sub"> · {c.company}</span> : null}</div>
                      <div className="sub">{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                      {addressText(c) ? <div className="sub">{addressText(c)}</div> : null}
                      {c.synced_at ? <div><Chip kind="outline">Sincronizado con el registrador</Chip></div> : null}
                      {canEdit ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button type="button" className="btn sm" onClick={() => setForm({ contact: c, role: c.role })}>Editar</button>
                          <button type="button" className="btn sm" onClick={() => remove(c)}>Eliminar</button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <span className="sub">Sin contacto registrado.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {form ? (
        <ContactForm
          domainId={domain.id}
          contact={form.contact}
          role={form.role}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
          onConflict={reload}
        />
      ) : null}
    </section>
  );
}

function ContactForm({ domainId, contact, role: initialRole, onClose, onSaved, onConflict }: { domainId: string; contact: DomainContact | null; role: DomainContactRole; onClose: () => void; onSaved: () => void; onConflict: () => void }) {
  const { toast } = useApp();
  const a = contact?.address ?? {};
  const [role, setRole] = useState<DomainContactRole>(initialRole);
  const [name, setName] = useState(contact?.name ?? '');
  const [company, setCompany] = useState(contact?.company ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [line1, setLine1] = useState(a.line1 ?? '');
  const [line2, setLine2] = useState(a.line2 ?? '');
  const [city, setCity] = useState(a.city ?? '');
  const [state, setState] = useState(a.state ?? '');
  const [postal, setPostal] = useState(a.postal_code ?? '');
  const [country, setCountry] = useState(a.country ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const nn = (v: string) => (v.trim() ? v.trim() : null);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setMessage('');
    setErrs({});
    if (!name.trim() || !email.trim()) {
      setMessage('Complete el nombre y el correo.');
      return;
    }
    const input: DomainContactInput = {
      role,
      name: name.trim(),
      email: email.trim(),
      company: nn(company),
      phone: nn(phone),
      address: { line1: nn(line1), line2: nn(line2), city: nn(city), state: nn(state), postal_code: nn(postal), country: country ? country.trim().toUpperCase() : null },
    };
    setBusy(true);
    try {
      if (contact) await domainsApi.updateContact(domainId, contact.id, contact.version, input);
      else await domainsApi.createContact(domainId, input);
      toast(contact ? 'Contacto actualizado' : 'Contacto agregado', input.name);
      onSaved();
    } catch (e) {
      if (isProblem(e) && e.code === 'version_conflict') {
        toast('Contacto modificado por otra persona', 'Se recargó el detalle; vuelva a intentarlo.', 'info');
        onConflict();
        onClose();
      } else {
        setErrs(fieldErrors(e));
        setMessage(isProblem(e) && e.status === 422 ? 'Revise los campos marcados.' : errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => (errs[k] ? <span className="err" role="alert">{errs[k]}</span> : null);
  return (
    <Modal open wide onClose={onClose} title={contact ? 'Editar contacto' : 'Agregar contacto'} sub={CONTACT_ROLE_LABEL[role]} bare>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label className="field">Rol
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as DomainContactRole)}>
              {DOMAIN_CONTACT_ROLES.map((r) => <option key={r} value={r}>{CONTACT_ROLE_LABEL[r]}</option>)}
            </select>
            {err('role')}
          </label>
          <label className="field">Nombre*<input className="input" required value={name} onChange={(e) => setName(e.target.value)} />{err('name')}</label>
          <label className="field">Correo*<input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />{err('email')}</label>
          <label className="field">Teléfono<input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />{err('phone')}</label>
          <label className="field full">Empresa<input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />{err('company')}</label>
          <label className="field full">Dirección<input className="input" value={line1} onChange={(e) => setLine1(e.target.value)} />{err('address.line1')}</label>
          <label className="field full">Dirección (línea 2)<input className="input" value={line2} onChange={(e) => setLine2(e.target.value)} />{err('address.line2')}</label>
          <label className="field">Ciudad<input className="input" value={city} onChange={(e) => setCity(e.target.value)} />{err('address.city')}</label>
          <label className="field">Región / estado<input className="input" value={state} onChange={(e) => setState(e.target.value)} />{err('address.state')}</label>
          <label className="field">Código postal<input className="input" value={postal} onChange={(e) => setPostal(e.target.value)} />{err('address.postal_code')}</label>
          <label className="field">País
            <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">—</option>
              {COUNTRY_OPTIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              {country && !COUNTRY_OPTIONS.some(([c]) => c === country) ? <option value={country}>{country}</option> : null}
            </select>
            {err('address.country')}
          </label>
        </div>
        <div className="err" role="alert">{message}</div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
