/**
 * WordPress › Contacto por marca y Documentos legales (prototipo vWp,
 * pestañas «contacto» y «legales»; handlers ctF, ctSave, lgEdit, lgPub;
 * l.2487-2490 y l.2513-2518).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { type BrandContactKind, type BrandContactPoint, type BrandContactPointInput, type LegalDocument, type LegalKind, type LegalVersion } from '@hub/api';
import { useApp } from '../../../app/context';
import { Icon } from '../../../components/Icon';
import { Modal, Sheet } from '../../../components/Modal';
import { Chip, Note } from '../../../components/ui';
import { ScBox, copyText } from './shared';
import { errorText, useCan, useLoad, useLookups } from '../clientes/shared';
import { hub } from '../../../auth/client';

const KIND_LABEL: Record<BrandContactKind, string> = { phone: 'Teléfono', email: 'Correo', whatsapp: 'WhatsApp', address: 'Dirección', hours: 'Horario' };
const KINDS = Object.keys(KIND_LABEL) as BrandContactKind[];
const KIND_PH: Record<BrandContactKind, string> = { phone: '+5115551234', whatsapp: '+519XXXXXXXX', email: 'ventas@marca.pe', address: 'Av. Ejemplo 123, Lima', hours: 'Lun–Vie 9:00–18:00' };

export function WpContacto() {
  const { toast } = useApp();
  const can = useCan();
  const { brands } = useLookups();
  const [brandId, setBrandId] = useState('');
  useEffect(() => {
    if (!brandId && brands[0]) setBrandId(brands[0].id);
  }, [brands, brandId]);
  const res = useLoad(() => (brandId ? hub.brands.contactPoints.list(brandId).then((r) => r.data) : Promise.resolve([] as BrandContactPoint[])), [brandId]);
  const points = res.data ?? [];
  const canEdit = can('brands.brand.update');
  const brand = brands.find((b) => b.id === brandId);
  const [form, setForm] = useState<BrandContactPoint | 'new' | null>(null);

  const remove = async (p: BrandContactPoint) => {
    try {
      await hub.brands.contactPoints.remove(p.id);
      toast('Contacto eliminado');
      res.reload();
    } catch (e) {
      toast('No se pudo', errorText(e), 'err');
    }
  };

  return (
    <div className="card-b" style={{ paddingTop: 16 }}>
      <div className="grid g-2">
        <div className="stack">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" htmlFor="ctB" style={{ flex: 1, minWidth: 180 }}>
              Marca
              <select id="ctB" className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            {canEdit ? (
              <button type="button" className="btn primary" disabled={!brandId} onClick={() => setForm('new')}>
                <Icon name="plus" size="sm" /> Nuevo contacto
              </button>
            ) : null}
          </div>
          {res.error ? (
            <Note kind="warn">No se pudo cargar: {errorText(res.error)} <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note>
          ) : res.loading ? (
            <p className="sub">Cargando…</p>
          ) : points.length === 0 ? (
            <p className="sub">Sin puntos de contacto para esta marca. Agrega el primero.</p>
          ) : (
            <ul className="rows" style={{ marginTop: 8 }}>
              {points.map((p) => (
                <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="grow">
                    <b>{KIND_LABEL[p.kind]}</b>
                    {p.label?.es ? <span className="sub"> · {p.label.es}</span> : null}{' '}
                    {p.is_primary ? <Chip kind="ok">Principal</Chip> : null}
                    {!p.is_public ? <Chip kind="">Oculto en la web</Chip> : null}
                    <div className="mono">{p.value}</div>
                  </div>
                  {canEdit ? (
                    <>
                      <button type="button" className="btn sm" onClick={() => setForm(p)}>Editar</button>
                      <button type="button" className="btn sm danger" onClick={() => void remove(p)}>Quitar</button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="stack">
          <div className="field">
            Shortcode
            <ScBox code={`[hub_contacto marca="${brand?.code ?? ''}"]`} id="scCt" />
          </div>
          <Note kind="warn" icon="info">El contacto marcado como <b>Principal</b> es el que muestra <code>[hub_contacto campo="…"]</code> sin etiqueta. Solo uno por tipo.</Note>
        </div>
      </div>
      {form && brandId ? <ContactForm brandId={brandId} point={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); res.reload(); }} /> : null}
    </div>
  );
}

function ContactForm({ brandId, point, onClose, onSaved }: { brandId: string; point: BrandContactPoint | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [kind, setKind] = useState<BrandContactKind>(point?.kind ?? 'phone');
  const [value, setValue] = useState(point?.value ?? '');
  const [label, setLabel] = useState(point?.label?.es ?? '');
  const [primary, setPrimary] = useState(point?.is_primary ?? false);
  const [pub, setPub] = useState(point?.is_public ?? true);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const v = kind === 'phone' || kind === 'whatsapp' ? value.replace(/\s/g, '') : value.trim();
    const lbl: Record<string, string> = label.trim() ? { es: label.trim() } : {};
    const input: BrandContactPointInput = { brand_id: brandId, kind, value: v, label: lbl, is_primary: primary, is_public: pub };
    try {
      if (point) await hub.brands.contactPoints.update(point.id, point.version, input);
      else await hub.brands.contactPoints.create(input);
      toast(point ? 'Contacto actualizado' : 'Contacto creado', 'Se refleja en las webs de la marca.');
      onSaved();
    } catch (err) {
      toast('No se pudo guardar', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open bare onClose={onClose} title={point ? 'Editar contacto' : 'Nuevo contacto'}>
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <label className="field">Tipo*<select className="input" value={kind} onChange={(e) => setKind(e.target.value as BrandContactKind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
        <label className="field">Etiqueta<input className="input" value={label} placeholder="Ventas, Soporte…" onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="field full">Valor*<input required className="input" value={value} placeholder={KIND_PH[kind]} onChange={(e) => setValue(e.target.value)} /></label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Principal (de su tipo)</label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> Visible en la web</label>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}

const LEGAL_KIND_LABEL: Record<LegalKind, string> = {
  terms: 'Términos y condiciones',
  privacy: 'Política de privacidad',
  refunds: 'Reembolsos y cancelaciones',
  sla: 'Acuerdo de nivel de servicio (SLA)',
  acceptable_use: 'Uso aceptable',
  legal_notice: 'Aviso legal',
};
const LEGAL_KINDS = Object.keys(LEGAL_KIND_LABEL) as LegalKind[];
const VSTATUS: Record<LegalVersion['status'], { label: string; kind: '' | 'ok' | 'warn' }> = {
  draft: { label: 'Borrador', kind: 'warn' },
  published: { label: 'Vigente', kind: 'ok' },
  superseded: { label: 'Reemplazada', kind: '' },
};
const fDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function WpLegales() {
  const { toast } = useApp();
  const can = useCan();
  const canEdit = can('web_connector.legal_document.create') || can('web_connector.legal_document.update');
  const { brands } = useLookups();
  const [brandId, setBrandId] = useState('');
  useEffect(() => {
    if (!brandId && brands[0]) setBrandId(brands[0].id);
  }, [brands, brandId]);
  const res = useLoad(() => (brandId ? hub.webConnector.legalDocuments.list(brandId).then((r) => r.data) : Promise.resolve([] as LegalDocument[])), [brandId]);
  const docs = res.data ?? [];
  const brand = brands.find((b) => b.id === brandId);
  const [newDoc, setNewDoc] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const remove = async (d: LegalDocument) => {
    if (!window.confirm(`¿Eliminar «${d.title}» y todas sus versiones? Esta acción no se puede deshacer.`)) return;
    try {
      await hub.webConnector.legalDocuments.remove(d.id);
      toast('Documento eliminado');
      res.reload();
    } catch (e) {
      toast('No se pudo', errorText(e), 'err');
    }
  };

  return (
    <div className="card-b" style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <label className="field" htmlFor="lgB" style={{ minWidth: 200 }}>
          Marca
          <select id="lgB" className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        {can('web_connector.legal_document.create') ? (
          <button type="button" className="btn primary" disabled={!brandId} onClick={() => setNewDoc(true)}>
            <Icon name="plus" size="sm" /> Nuevo documento
          </button>
        ) : null}
      </div>

      {res.error ? (
        <Note kind="warn">No se pudo cargar: {errorText(res.error)} <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note>
      ) : res.loading ? (
        <p className="sub">Cargando…</p>
      ) : docs.length === 0 ? (
        <p className="sub">Esta marca aún no tiene documentos legales. Crea el primero con «Nuevo documento».</p>
      ) : (
        <div className="tw">
          <table className="t">
            <thead>
              <tr><th>Documento</th><th>Tipo</th><th>Versión vigente</th><th>Vigente desde</th><th>Shortcode</th><th className="r">Acciones</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const code = `[hub_documento_legal doc="${d.slug}" marca="${brand?.code ?? ''}"]`;
                const hasDraft = (d.versions ?? []).some((v) => v.status === 'draft');
                return (
                  <tr key={d.id}>
                    <td>
                      <b style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="contract" size="sm" />{d.title}</b>
                      {hasDraft ? <> <Chip kind="warn">Borrador sin publicar</Chip></> : null}
                    </td>
                    <td className="sub">{LEGAL_KIND_LABEL[d.kind]}</td>
                    <td>{d.published_label ? <span className="mono">{d.published_label}</span> : <span className="sub">Sin versión vigente</span>}</td>
                    <td className="num">{fDate(d.effective_at)}</td>
                    <td>
                      <button type="button" className="btn sm ghost mono" title="Copiar shortcode" onClick={() => copyText(code, toast)}>
                        [hub_documento_legal doc="{d.slug}"]
                      </button>
                    </td>
                    <td className="r nw">
                      <button type="button" className="btn sm" onClick={() => setOpenId(d.id)}>{canEdit ? <><Icon name="edit" size="sm" /> Gestionar</> : 'Ver'}</button>{' '}
                      {can('web_connector.legal_document.delete') ? <button type="button" className="btn sm danger" onClick={() => void remove(d)}>Quitar</button> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {newDoc && brandId ? <NewDocModal brandId={brandId} onClose={() => setNewDoc(false)} onSaved={(id) => { setNewDoc(false); res.reload(); setOpenId(id); }} /> : null}
      {openId ? <DocSheet id={openId} readOnly={!canEdit} onClose={() => setOpenId(null)} onChanged={() => res.reload()} /> : null}
    </div>
  );
}

function NewDocModal({ brandId, onClose, onSaved }: { brandId: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { toast } = useApp();
  const [kind, setKind] = useState<LegalKind>('terms');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [label, setLabel] = useState('2026-01');
  const [body, setBody] = useState('<p></p>');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const s = (slugTouched ? slug : slugify(title)).trim();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) {
      toast('Identificador inválido', 'Usa minúsculas, números y guiones (ej. terminos-y-condiciones).', 'err');
      return;
    }
    setBusy(true);
    try {
      const doc = await hub.webConnector.legalDocuments.create({ brand_id: brandId, kind, title: title.trim(), slug: s, version_label: label.trim(), body });
      toast('Documento creado', 'Se creó con un primer borrador. Edítalo y publícalo cuando esté listo.');
      onSaved(doc.id);
    } catch (err) {
      toast('No se pudo crear', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open bare onClose={onClose} title="Nuevo documento legal">
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <label className="field">Tipo*<select className="input" value={kind} onChange={(e) => setKind(e.target.value as LegalKind)}>{LEGAL_KINDS.map((k) => <option key={k} value={k}>{LEGAL_KIND_LABEL[k]}</option>)}</select></label>
        <label className="field">Título*<input required className="input" value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} placeholder="Términos y condiciones" /></label>
        <label className="field">Identificador (shortcode)*<input required className="input mono" value={slugTouched ? slug : slugify(title)} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} placeholder="terminos-y-condiciones" /></label>
        <label className="field">Etiqueta de la primera versión*<input required className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2026-01" /></label>
        <label className="field full">Contenido (borrador)<textarea className="input" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="HTML sencillo: <p>…</p>, <ul>, <strong>…" /></label>
        <Note icon="info">Se guarda como borrador. Publícalo desde «Gestionar» para que entre en vigencia; publicar exige la revisión legal y la fecha de vigencia.</Note>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Crear documento</button></div>
      </form>
    </Modal>
  );
}

function DocSheet({ id, readOnly, onClose, onChanged }: { id: string; readOnly: boolean; onClose: () => void; onChanged: () => void }) {
  const { toast } = useApp();
  const can = useCan();
  const canApprove = can('web_connector.legal_document.approve');
  const res = useLoad(() => hub.webConnector.legalDocuments.get(id), [id]);
  const doc = res.data;
  const [verEdit, setVerEdit] = useState<LegalVersion | 'new' | null>(null);
  const [publishVer, setPublishVer] = useState<LegalVersion | null>(null);

  const reload = () => { res.reload(); onChanged(); };

  const removeVersion = async (v: LegalVersion) => {
    if (!window.confirm(`¿Eliminar el borrador «${v.version_label}»?`)) return;
    try {
      await hub.webConnector.legalDocuments.removeVersion(id, v.id);
      toast('Borrador eliminado');
      reload();
    } catch (e) {
      toast('No se pudo', errorText(e), 'err');
    }
  };

  return (
    <>
      <Sheet open onClose={onClose} title={doc ? doc.title : 'Documento legal'} sub={doc ? `${LEGAL_KIND_LABEL[doc.kind]} · [hub_documento_legal doc="${doc.slug}"]` : undefined}>
        {res.error ? (
          <Note kind="warn">No se pudo cargar: {errorText(res.error)} <button type="button" className="btn sm" onClick={res.reload}>Reintentar</button></Note>
        ) : !doc ? (
          <p className="sub">Cargando…</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h3 className="fs" style={{ margin: 0 }}>Versiones</h3>
              {!readOnly ? <button type="button" className="btn sm" onClick={() => setVerEdit('new')}><Icon name="plus" size="sm" /> Nueva versión</button> : null}
            </div>
            <ul className="rows">
              {(doc.versions ?? []).map((v) => (
                <li key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="grow">
                    <b className="mono">{v.version_label}</b> <Chip kind={VSTATUS[v.status].kind}>{VSTATUS[v.status].label}</Chip>
                    <div className="sub">
                      {v.status === 'published' ? `Vigente desde ${fDate(v.effective_at)}` : v.status === 'superseded' ? `Reemplazada ${fDate(v.superseded_at)}` : 'Sin publicar'}
                      {v.legal_reviewed_by ? ` · Revisó: ${v.legal_reviewed_by}` : ''}
                    </div>
                    {v.change_summary ? <div className="sub">{v.change_summary}</div> : null}
                  </div>
                  {!readOnly && v.status === 'draft' ? (
                    <>
                      <button type="button" className="btn sm" onClick={() => setVerEdit(v)}>Editar</button>
                      {canApprove ? <button type="button" className="btn sm primary" onClick={() => setPublishVer(v)}><Icon name="upload" size="sm" /> Publicar</button> : null}
                      {can('web_connector.legal_document.delete') ? <button type="button" className="btn sm danger" onClick={() => void removeVersion(v)}>Quitar</button> : null}
                    </>
                  ) : (
                    <button type="button" className="btn sm" onClick={() => setVerEdit(v)}>Ver</button>
                  )}
                </li>
              ))}
            </ul>
            {!canApprove ? <Note kind="warn" icon="info" style={{ marginTop: 10 }}>No tienes permiso para publicar (requiere aprobación legal). Puedes dejar el borrador listo para quien apruebe.</Note> : null}
          </>
        )}
      </Sheet>
      {verEdit && doc ? <VersionEditor docId={id} version={verEdit === 'new' ? null : verEdit} readOnly={readOnly || (verEdit !== 'new' && verEdit.status !== 'draft')} onClose={() => setVerEdit(null)} onSaved={() => { setVerEdit(null); reload(); }} /> : null}
      {publishVer ? <PublishModal docId={id} version={publishVer} onClose={() => setPublishVer(null)} onPublished={() => { setPublishVer(null); reload(); }} /> : null}
    </>
  );
}

function VersionEditor({ docId, version, readOnly, onClose, onSaved }: { docId: string; version: LegalVersion | null; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [label, setLabel] = useState(version?.version_label ?? '');
  const [body, setBody] = useState(version?.body ?? '<p></p>');
  const [summary, setSummary] = useState(version?.change_summary ?? '');
  const [reviewer, setReviewer] = useState(version?.legal_reviewed_by ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!label.trim()) { toast('Falta la etiqueta', 'Dale una etiqueta a la versión (ej. 2026-06).', 'err'); return; }
    setBusy(true);
    try {
      if (version) {
        await hub.webConnector.legalDocuments.updateVersion(docId, version.id, version.version, { version_label: label.trim(), body, change_summary: summary.trim() || null, legal_reviewed_by: reviewer.trim() || null });
      } else {
        await hub.webConnector.legalDocuments.createVersion(docId, { version_label: label.trim(), body, change_summary: summary.trim() || null });
      }
      toast(version ? 'Versión guardada' : 'Borrador creado');
      onSaved();
    } catch (e) {
      toast('No se pudo guardar', errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={version ? (readOnly ? 'Ver versión' : 'Editar versión') : 'Nueva versión'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
          {!readOnly ? <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Guardar borrador</button> : null}
        </>
      }
    >
      <label className="field">Etiqueta de la versión<input className="input" value={label} disabled={readOnly} onChange={(e) => setLabel(e.target.value)} placeholder="2026-06" /></label>
      <label className="field">Resumen de cambios<input className="input" value={summary} disabled={readOnly} onChange={(e) => setSummary(e.target.value)} placeholder="Qué cambió respecto a la versión anterior" /></label>
      <label className="field">Revisado por (asesoría legal)<input className="input" value={reviewer} disabled={readOnly} onChange={(e) => setReviewer(e.target.value)} placeholder="Estudio jurídico / abogado" /></label>
      <label className="field">Contenido<textarea className="input" rows={16} value={body} disabled={readOnly} onChange={(e) => setBody(e.target.value)} /></label>
      <Note icon="info">El contenido se sanea al guardar: solo se conservan etiquetas de texto seguras (sin scripts ni estilos).</Note>
    </Sheet>
  );
}

function PublishModal({ docId, version, onClose, onPublished }: { docId: string; version: LegalVersion; onClose: () => void; onPublished: () => void }) {
  const { toast } = useApp();
  const [reviewer, setReviewer] = useState(version.legal_reviewed_by ?? '');
  const [effective, setEffective] = useState(new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reviewer.trim()) { toast('Falta la revisión legal', 'Indica quién validó el texto.', 'err'); return; }
    setBusy(true);
    try {
      await hub.webConnector.legalDocuments.publishVersion(docId, version.id, version.version, { legal_reviewed_by: reviewer.trim(), effective_at: effective });
      toast('Versión publicada', `${version.version_label} entra en vigencia el ${fDate(effective)}. Reemplaza a la anterior.`);
      onPublished();
    } catch (err) {
      toast('No se pudo publicar', errorText(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open bare onClose={onClose} title="Publicar versión" >
      <form className="modal-b" onSubmit={(e) => void submit(e)}>
        <p className="sub">Vas a publicar <b className="mono">{version.version_label}</b>. Pasará a ser la versión vigente y la anterior quedará como reemplazada.</p>
        <label className="field full">Revisado por (asesoría legal)*<input required className="input" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Estudio jurídico / abogado" /></label>
        <label className="field">Vigente desde*<input required type="date" className="input" value={effective} onChange={(e) => setEffective(e.target.value)} /></label>
        <Note kind="warn" icon="info">Una versión publicada ya no se puede editar. El carrito registra qué versión aceptó cada cliente, por eso cada cambio es una versión nueva.</Note>
        <div className="modal-f"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}><Icon name="upload" size="sm" /> Publicar</button></div>
      </form>
    </Modal>
  );
}
