import { useState, type FormEvent } from 'react';
import { api, isProblem, type KbArticle, type KbArticleInput, type KbCategory, type KbCategoryInput, type KbStatus, type KbVisibility } from '@hub/api';
import { useApp } from '../../app/context';
import type { ViewProps } from '../../app/routes';
import { Icon } from '../../components/Icon';
import { Chip, EmptyState, Note, PageHead, Select, Skeleton, Toolbar } from '../../components/ui';
import { RichOut } from '../../components/RichText';
import { errorText, useLoad } from './clientes/shared';

const PAGE_SIZE = 50;
type Section = 'articles' | 'categories' | 'reader';
type ArticleDraft = { id?: string; version?: number; title: string; slug: string; body: string; kb_category_id: string; brand_id: string; visibility: KbVisibility; status: KbStatus };
type CategoryDraft = { id?: string; version?: number; name: string; slug: string; visibility: KbVisibility; sort_order: string };
const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const VISIBILITY: [KbVisibility | '', string][] = [['', 'Todas las visibilidades'], ['public', 'Pública'], ['internal', 'Interna']];
const STATUSES: [KbStatus | '', string][] = [['', 'Todos los estados'], ['draft', 'Borrador'], ['published', 'Publicado'], ['archived', 'Archivado']];
const visibilityLabel = (value: KbVisibility) => value === 'public' ? 'Pública' : 'Interna';
const statusLabel = (value: KbStatus) => value === 'draft' ? 'Borrador' : value === 'published' ? 'Publicado' : 'Archivado';

export default function AyudaView(_props: ViewProps) {
  const { toast } = useApp();
  const [section, setSection] = useState<Section>('articles');
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<KbVisibility | ''>('');
  const [status, setStatus] = useState<KbStatus | ''>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [categoryCursor, setCategoryCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [articleDraft, setArticleDraft] = useState<ArticleDraft | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = () => setReload((n) => n + 1);
  const articleList = useLoad(() => api.support.kb.articles.list({ q: query.trim() || undefined, filter: section === 'articles' ? { visibility, status } : {}, cursor: section === 'articles' ? cursor : null, size: PAGE_SIZE, sort: '-updated_at' }), [query, visibility, status, cursor, section, reload]);
  const categoryList = useLoad(() => api.support.kb.categories.list({ q: section === 'categories' ? query.trim() || undefined : undefined, cursor: categoryCursor, size: PAGE_SIZE, sort: 'sort_order' }), [section, query, categoryCursor, reload]);
  const brands = useLoad(() => api.brands.list({ size: PAGE_SIZE, sort: 'name', filter: { status: 'active' } }), []);
  const rows = articleList.data?.data ?? [];
  const categories = categoryList.data?.data ?? [];
  const [readerCat, setReaderCat] = useState('');
  const openArticle = rows.find((article) => article.id === selectedId) ?? null;
  const readerCategories = [...new Set(rows.map((article) => article.category?.name ?? 'Sin categoría'))];
  const readerRows = rows.filter((article) => !readerCat || (article.category?.name ?? 'Sin categoría') === readerCat);
  const related = openArticle ? rows.filter((article) => article.id !== openArticle.id && (article.category?.name ?? '') === (openArticle.category?.name ?? '')).slice(0, 3) : [];

  const beginNewArticle = () => setArticleDraft({ title: '', slug: '', body: '', kb_category_id: '', brand_id: '', visibility: 'internal', status: 'draft' });
  const editArticle = (article: KbArticle) => setArticleDraft({ id: article.id, version: article.version, title: article.title, slug: article.slug, body: article.body, kb_category_id: article.kb_category_id ?? '', brand_id: article.brand_id ?? '', visibility: article.visibility, status: article.status });
  const saveArticle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!articleDraft) return;
    setBusy(true);
    const input: KbArticleInput = { title: articleDraft.title.trim(), slug: articleDraft.slug.trim(), body: articleDraft.body, kb_category_id: articleDraft.kb_category_id || null, brand_id: articleDraft.brand_id || null, visibility: articleDraft.visibility, status: articleDraft.status };
    try {
      if (articleDraft.id) await api.support.kb.articles.update(articleDraft.id, articleDraft.version ?? 0, input);
      else await api.support.kb.articles.create(input);
      toast(articleDraft.id ? 'Artículo actualizado' : 'Artículo creado', input.title);
      setArticleDraft(null); changed();
    } catch (error) {
      toast(isProblem(error) && error.status === 409 ? 'Conflicto de versión' : 'No se pudo guardar el artículo', errorText(error), 'err');
      if (isProblem(error) && (error.status === 409 || error.code === 'version_conflict')) {
        if (articleDraft.id) { try { const fresh = await api.support.kb.articles.get(articleDraft.id); editArticle(fresh); } catch { changed(); } }
        changed();
      }
    } finally { setBusy(false); }
  };
  const removeArticle = async (article: KbArticle) => {
    if (!window.confirm(`¿Eliminar el artículo «${article.title}»? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    try { await api.support.kb.articles.remove(article.id, article.version); toast('Artículo eliminado', article.title, 'warn'); changed(); }
    catch (error) { toast('No se pudo eliminar el artículo', errorText(error), 'err'); if (isProblem(error) && (error.status === 409 || error.code === 'version_conflict')) { try { await api.support.kb.articles.get(article.id); } catch { /* el registro pudo haber sido eliminado */ } finally { changed(); } } }
    finally { setBusy(false); }
  };
  const editCategory = (category: KbCategory) => setCategoryDraft({ id: category.id, version: category.version, name: category.name, slug: category.slug, visibility: category.visibility, sort_order: String(category.sort_order) });
  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryDraft) return;
    setBusy(true);
    const input: KbCategoryInput = { name: categoryDraft.name.trim(), slug: categoryDraft.slug.trim(), visibility: categoryDraft.visibility, sort_order: Number(categoryDraft.sort_order) };
    try {
      if (categoryDraft.id) await api.support.kb.categories.update(categoryDraft.id, categoryDraft.version ?? 0, input);
      else await api.support.kb.categories.create(input);
      toast(categoryDraft.id ? 'Categoría actualizada' : 'Categoría creada', input.name);
      setCategoryDraft(null); changed();
    } catch (error) {
      toast(isProblem(error) && error.status === 409 ? 'Conflicto de versión' : 'No se pudo guardar la categoría', errorText(error), 'err');
      if (isProblem(error) && (error.status === 409 || error.code === 'version_conflict')) {
        if (categoryDraft.id) { try { const fresh = await api.support.kb.categories.get(categoryDraft.id); editCategory(fresh); } catch { changed(); } }
        changed();
      }
    } finally { setBusy(false); }
  };
  const removeCategory = async (category: KbCategory) => {
    if (!window.confirm(`¿Eliminar la categoría «${category.name}»?`)) return;
    setBusy(true);
    try { await api.support.kb.categories.remove(category.id, category.version); toast('Categoría eliminada', category.name, 'warn'); changed(); }
    catch (error) { toast('No se pudo eliminar la categoría', errorText(error), 'err'); if (isProblem(error) && (error.status === 409 || error.code === 'version_conflict')) { try { await api.support.kb.categories.get(category.id); } catch { /* el registro pudo haber sido eliminado */ } finally { changed(); } } }
    finally { setBusy(false); }
  };

  return <>
    <style>{AYUDA_CSS}</style>
    <PageHead crumbs={[[ 'Soporte', 'tickets' ], [ 'Centro de ayuda', 'ayuda' ]]} title="Centro de ayuda" sub="Escriba, ordene y consulte las guías que usa su equipo y sus clientes." />
    <div className="seg" role="tablist" aria-label="Secciones del centro de ayuda">
      {([['articles', 'Artículos'], ['categories', 'Categorías'], ['reader', 'Ver ayuda']] as [Section, string][]).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={section === id} aria-pressed={section === id} onClick={() => { setSection(id); setQuery(''); setCursor(null); setCategoryCursor(null); }}>{label}</button>)}
    </div>

    {section === 'articles' ? <>
      <Toolbar count={`${rows.length}${articleList.data?.meta?.has_more ? '+' : ''} artículos`}>
        <input className="input" aria-label="Buscar artículos" placeholder="Buscar artículos" value={query} onChange={(e) => { setQuery(e.target.value); setCursor(null); }} />
        <Select label="Visibilidad" value={visibility} onChange={(value) => { setVisibility(value as KbVisibility | ''); setCursor(null); }} options={VISIBILITY} />
        <Select label="Estado" value={status} onChange={(value) => { setStatus(value as KbStatus | ''); setCursor(null); }} options={STATUSES} />
        <button className="btn primary" type="button" onClick={beginNewArticle}><Icon name="plus" size="sm" /> Nuevo artículo</button>
      </Toolbar>
      {articleDraft ? <form className="card card-b" onSubmit={(event) => void saveArticle(event)} style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
        <h2 className="sec">{articleDraft.id ? 'Editar artículo' : 'Nuevo artículo'}</h2>
        <div className="form-grid">
          <label className="field">Título<input className="input" required maxLength={255} value={articleDraft.title} onChange={(e) => setArticleDraft({ ...articleDraft, title: e.target.value, slug: !articleDraft.slug || articleDraft.slug === slugify(articleDraft.title) ? slugify(e.target.value) : articleDraft.slug })} /></label>
          <label className="field">Slug<input className="input" required maxLength={255} value={articleDraft.slug} onChange={(e) => setArticleDraft({ ...articleDraft, slug: slugify(e.target.value) })} /></label>
          <label className="field">Categoría<select className="select" value={articleDraft.kb_category_id} onChange={(e) => setArticleDraft({ ...articleDraft, kb_category_id: e.target.value })}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="field">Marca<select className="select" value={articleDraft.brand_id} onChange={(e) => setArticleDraft({ ...articleDraft, brand_id: e.target.value })}><option value="">Todas las marcas</option>{(brands.data?.data ?? []).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
          <label className="field">Visibilidad<select className="select" value={articleDraft.visibility} onChange={(e) => setArticleDraft({ ...articleDraft, visibility: e.target.value as KbVisibility })}><option value="public">Pública</option><option value="internal">Interna</option></select></label>
          <label className="field">Estado<select className="select" value={articleDraft.status} onChange={(e) => setArticleDraft({ ...articleDraft, status: e.target.value as KbStatus })}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label>
          <label className="field full">Cuerpo<textarea className="input" rows={12} value={articleDraft.body} onChange={(e) => setArticleDraft({ ...articleDraft, body: e.target.value })} /></label>
        </div>
        <div><button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>{' '}<button className="btn" type="button" disabled={busy} onClick={() => setArticleDraft(null)}>Cancelar</button></div>
      </form> : null}
      <section aria-busy={articleList.loading}>
        {articleList.error ? <Note kind="warn" role="alert">No se pudieron cargar los artículos: {errorText(articleList.error)} <button className="btn sm" type="button" onClick={articleList.reload}>Reintentar</button></Note>
          : articleList.loading && !articleList.data ? <Skeleton variant="table" rows={5} />
            : rows.length ? <><ul className="ay-list">{rows.map((article) => <li key={article.id} className="ay-row">
              <div className="ay-row-main">
                <div className="ay-row-title">{article.title}</div>
                <div className="ay-row-meta"><span className="ay-cat">{article.category?.name ?? 'Sin categoría'}</span><span aria-hidden="true">·</span><span>{article.brand?.name ?? 'Todas las marcas'}</span><span aria-hidden="true">·</span><span>Actualizado {new Date(article.updated_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                <div className="ay-row-slug mono">/{article.slug}</div>
              </div>
              <div className="ay-row-chips"><Chip>{visibilityLabel(article.visibility)}</Chip><Chip kind={article.status === 'published' ? 'ok' : article.status === 'draft' ? 'warn' : 'neutral'}>{statusLabel(article.status)}</Chip></div>
              <div className="ay-row-actions"><button className="btn sm" type="button" onClick={() => editArticle(article)}>Editar</button><button className="btn sm danger" type="button" disabled={busy} onClick={() => void removeArticle(article)}>Borrar</button></div>
            </li>)}</ul><Pager meta={articleList.data?.meta ?? { prev_cursor: null, next_cursor: null }} loading={articleList.loading} cursor={cursor} setCursor={setCursor} /></> : <EmptyState title="Sin artículos" text="Cree un artículo o ajuste los filtros." />}
      </section>
    </> : null}

    {section === 'categories' ? <>
      <Toolbar count={`${categories.length}${categoryList.data?.meta?.has_more ? '+' : ''} categorías`}>
        <input className="input" aria-label="Buscar categorías" placeholder="Buscar categorías" value={query} onChange={(e) => { setQuery(e.target.value); setCategoryCursor(null); }} />
        <button className="btn primary" type="button" onClick={() => setCategoryDraft({ name: '', slug: '', visibility: 'internal', sort_order: '0' })}><Icon name="plus" size="sm" /> Nueva categoría</button>
      </Toolbar>
      {categoryDraft ? <form className="card card-b" onSubmit={(event) => void saveCategory(event)} style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
        <h2 className="sec">{categoryDraft.id ? 'Editar categoría' : 'Nueva categoría'}</h2><div className="form-grid">
          <label className="field">Nombre<input className="input" required maxLength={255} value={categoryDraft.name} onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value, slug: !categoryDraft.slug || categoryDraft.slug === slugify(categoryDraft.name) ? slugify(e.target.value) : categoryDraft.slug })} /></label>
          <label className="field">Slug<input className="input" required maxLength={255} value={categoryDraft.slug} onChange={(e) => setCategoryDraft({ ...categoryDraft, slug: slugify(e.target.value) })} /></label>
          <label className="field">Visibilidad<select className="select" value={categoryDraft.visibility} onChange={(e) => setCategoryDraft({ ...categoryDraft, visibility: e.target.value as KbVisibility })}><option value="public">Pública</option><option value="internal">Interna</option></select></label>
          <label className="field">Orden<input className="input" type="number" step="1" value={categoryDraft.sort_order} onChange={(e) => setCategoryDraft({ ...categoryDraft, sort_order: e.target.value })} /></label>
        </div><div><button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>{' '}<button className="btn" type="button" disabled={busy} onClick={() => setCategoryDraft(null)}>Cancelar</button></div>
      </form> : null}
      <section aria-busy={categoryList.loading}>{categoryList.error ? <Note kind="warn" role="alert">No se pudieron cargar las categorías: {errorText(categoryList.error)} <button className="btn sm" type="button" onClick={categoryList.reload}>Reintentar</button></Note>
        : categoryList.loading && !categoryList.data ? <Skeleton variant="table" rows={4} />
          : categories.length ? <><div className="ay-grid">{categories.map((category) => <article key={category.id} className="ay-card">
            <div className="ay-card-top"><span className="ay-badge" aria-hidden="true">{category.name.trim().charAt(0).toUpperCase() || '#'}</span><Chip>{visibilityLabel(category.visibility)}</Chip></div>
            <h3 className="ay-card-title">{category.name}</h3>
            <div className="ay-row-slug mono">/{category.slug}</div>
            <div className="ay-card-foot"><span className="ay-row-meta">Orden {category.sort_order}</span><span className="ay-row-actions"><button className="btn sm" type="button" onClick={() => editCategory(category)}>Editar</button><button className="btn sm danger" type="button" disabled={busy} onClick={() => void removeCategory(category)}>Borrar</button></span></div>
          </article>)}</div><Pager meta={categoryList.data?.meta ?? { prev_cursor: null, next_cursor: null }} loading={categoryList.loading} cursor={categoryCursor} setCursor={setCategoryCursor} /></> : <EmptyState title="Sin categorías" text="Cree una categoría para organizar los artículos." />}</section>
    </> : null}

    {section === 'reader' ? <div className="ay-reader" aria-busy={articleList.loading}>
      {openArticle ? <div className="ay-read">
        <button className="btn sm" type="button" onClick={() => setSelectedId(null)}>← Volver al centro de ayuda</button>
        <article className="ay-paper">
          <div className="ay-eyebrow">{openArticle.category?.name ?? 'Sin categoría'}</div>
          <h2 className="ay-title">{openArticle.title}</h2>
          <div className="ay-row-chips"><Chip>{visibilityLabel(openArticle.visibility)}</Chip>{openArticle.status !== 'published' ? <Chip kind={openArticle.status === 'draft' ? 'warn' : 'neutral'}>{statusLabel(openArticle.status)}</Chip> : null}<span className="ay-row-meta">Actualizado {new Date(openArticle.updated_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
          <div className="ay-body"><RichOut html={openArticle.body} /></div>
        </article>
        {related.length ? <div><div className="ay-eyebrow">Más en {openArticle.category?.name ?? 'esta sección'}</div><div className="ay-grid">{related.map((article) => <ArticleCard key={article.id} article={article} onOpen={() => setSelectedId(article.id)} />)}</div></div> : null}
      </div> : <>
        <div className="ay-hero">
          <h2 className="ay-hero-title">¿En qué podemos ayudarle?</h2>
          <input className="input ay-search" aria-label="Buscar ayuda" placeholder="Busque una guía, un tema o una palabra clave" value={query} onChange={(e) => setQuery(e.target.value)} />
          {readerCategories.length > 1 ? <div className="ay-pills" role="group" aria-label="Filtrar por categoría"><button type="button" className="ay-pill" aria-pressed={!readerCat} onClick={() => setReaderCat('')}>Todas</button>{readerCategories.map((name) => <button key={name} type="button" className="ay-pill" aria-pressed={readerCat === name} onClick={() => setReaderCat(name)}>{name}</button>)}</div> : null}
        </div>
        {articleList.error ? <Note kind="warn" role="alert">No se pudieron cargar los artículos: {errorText(articleList.error)} <button className="btn sm" type="button" onClick={articleList.reload}>Reintentar</button></Note>
          : articleList.loading && !articleList.data ? <Skeleton variant="table" rows={4} />
            : readerRows.length ? <div className="ay-grid">{readerRows.map((article) => <ArticleCard key={article.id} article={article} onOpen={() => setSelectedId(article.id)} />)}</div> : <EmptyState title="Sin resultados" text="Pruebe con otras palabras o quite el filtro de categoría." />}
      </>}
    </div> : null}
  </>;
}

const excerpt = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);

function ArticleCard({ article, onOpen }: { article: KbArticle; onOpen: () => void }) {
  const text = excerpt(article.body);
  return <button type="button" className="ay-card ay-card-btn" onClick={onOpen}>
    <div className="ay-card-top"><span className="ay-badge" aria-hidden="true">{(article.category?.name ?? '?').trim().charAt(0).toUpperCase()}</span><span className="ay-cat">{article.category?.name ?? 'Sin categoría'}</span></div>
    <h3 className="ay-card-title">{article.title}</h3>
    {text ? <p className="ay-excerpt">{text}{text.length >= 150 ? '…' : ''}</p> : null}
    <span className="ay-more">Leer guía →</span>
  </button>;
}

const AYUDA_CSS = `
.ay-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ay-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:16px;padding:14px 18px;background:var(--surface);border:1px solid var(--border);border-radius:12px;transition:border-color .15s,box-shadow .15s}
.ay-row:hover{border-color:var(--brand-line);box-shadow:0 2px 10px rgba(0,0,0,.06)}
.ay-row-title{font-weight:650;font-size:15px;color:var(--text);overflow-wrap:anywhere}
.ay-row-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);margin-top:3px}
.ay-row-slug{font-size:11.5px;color:var(--faint);margin-top:2px}
.ay-row-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.ay-row-actions{display:flex;gap:6px}
.ay-cat{color:var(--brand-text);font-weight:600}
.ay-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.ay-card{display:flex;flex-direction:column;gap:8px;padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:14px;text-align:left;color:var(--text);font:inherit}
.ay-card-btn{cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s}
.ay-card-btn:hover,.ay-card-btn:focus-visible{transform:translateY(-2px);border-color:var(--brand-line);box-shadow:0 6px 18px rgba(0,0,0,.08)}
.ay-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px}
.ay-card-title{margin:0;font-size:16px;line-height:1.3;font-weight:700;overflow-wrap:anywhere}
.ay-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:8px;border-top:1px dashed var(--border)}
.ay-badge{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:10px;background:var(--brand-soft);color:var(--brand-text);font-weight:700}
.ay-excerpt{margin:0;color:var(--muted);font-size:13.5px;line-height:1.5}
.ay-more{margin-top:auto;color:var(--brand-text);font-weight:600;font-size:13px}
.ay-reader{display:grid;gap:20px}
.ay-hero{display:grid;gap:14px;justify-items:center;text-align:center;padding:34px 20px;border-radius:16px;background:linear-gradient(135deg,var(--brand-soft),var(--surface-2));border:1px solid var(--border)}
.ay-hero-title{margin:0;font-size:26px;line-height:1.2;color:var(--text)}
.ay-search{width:min(560px,100%);padding:12px 16px;font-size:15px;border-radius:999px}
.ay-pills{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
.ay-pill{border:1px solid var(--border);background:var(--surface);color:var(--text-2);border-radius:999px;padding:5px 14px;font:inherit;font-size:13px;cursor:pointer}
.ay-pill:hover{border-color:var(--brand-line)}
.ay-pill[aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.ay-read{display:grid;gap:22px;justify-items:start}
.ay-read>div{width:100%}
.ay-paper{width:min(760px,100%);margin-inline:auto;display:grid;gap:12px;padding:32px 36px;background:var(--surface);border:1px solid var(--border);border-radius:16px}
.ay-eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--brand-text);margin-bottom:10px}
.ay-paper .ay-eyebrow{margin:0}
.ay-title{margin:0;font-size:28px;line-height:1.2;color:var(--text)}
.ay-body{margin-top:8px;padding-top:18px;border-top:1px solid var(--border);font-size:15.5px;line-height:1.7;color:var(--text-2)}
@media (max-width:720px){.ay-row{grid-template-columns:1fr}.ay-paper{padding:20px}.ay-hero-title{font-size:21px}}
`;

function Pager({ meta, loading, cursor, setCursor }: { meta: { prev_cursor: string | null; next_cursor: string | null }; loading: boolean; cursor: string | null; setCursor: (value: string | null) => void }) {
  if (!meta.prev_cursor && !meta.next_cursor) return null;
  return <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn sm" type="button" disabled={loading || !meta.prev_cursor} onClick={() => setCursor(meta.prev_cursor)}>Anterior</button><button className="btn sm" type="button" disabled={loading || !meta.next_cursor || cursor === meta.next_cursor} onClick={() => setCursor(meta.next_cursor)}>Siguiente</button></div>;
}
