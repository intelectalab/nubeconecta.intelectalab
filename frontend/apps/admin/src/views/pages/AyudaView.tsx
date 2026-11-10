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
  const articleList = useLoad(() => api.support.kb.articles.list({ q: query.trim() || undefined, filter: section === 'articles' ? { visibility, status } : {}, cursor: section === 'articles' ? cursor : null, size: PAGE_SIZE, sort: '-created_at' }), [query, visibility, status, cursor, section, reload]);
  const categoryList = useLoad(() => api.support.kb.categories.list({ q: section === 'categories' ? query.trim() || undefined : undefined, cursor: categoryCursor, size: PAGE_SIZE, sort: 'sort_order' }), [section, query, categoryCursor, reload]);
  const brands = useLoad(() => api.brands.list({ size: PAGE_SIZE, sort: 'name', filter: { status: 'active' } }), []);
  const rows = articleList.data?.data ?? [];
  const categories = categoryList.data?.data ?? [];
  const readerArticle = rows.find((article) => article.id === selectedId) ?? rows[0] ?? null;

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
    <PageHead crumbs={[[ 'Soporte', 'tickets' ], [ 'Centro de ayuda', 'ayuda' ]]} title="Centro de ayuda" sub="Administre artículos y categorías de la base de conocimientos." />
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
      <section className="card" aria-busy={articleList.loading}>
        {articleList.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudieron cargar los artículos: {errorText(articleList.error)} <button className="btn sm" type="button" onClick={articleList.reload}>Reintentar</button></Note></div>
          : articleList.loading && !articleList.data ? <Skeleton variant="table" rows={5} />
            : rows.length ? <><div className="tw"><table className="t"><thead><tr><th>Título</th><th>Categoría</th><th>Visibilidad</th><th>Estado</th><th>Marca</th><th>Actualizado</th><th /></tr></thead><tbody>{rows.map((article) => <tr key={article.id}>
              <td className="strong">{article.title}<div className="sub mono">{article.slug}</div></td><td>{article.category?.name ?? '—'}</td><td><Chip>{visibilityLabel(article.visibility)}</Chip></td><td><Chip kind={article.status === 'published' ? 'ok' : article.status === 'draft' ? 'warn' : 'neutral'}>{statusLabel(article.status)}</Chip></td><td>{article.brand?.name ?? 'Todas las marcas'}</td><td className="nw">{new Date(article.updated_at).toLocaleString('es-PE')}</td><td className="nw"><button className="btn sm" type="button" onClick={() => editArticle(article)}>Editar</button>{' '}<button className="btn sm danger" type="button" disabled={busy} onClick={() => void removeArticle(article)}>Borrar</button></td>
            </tr>)}</tbody></table></div><Pager meta={articleList.data?.meta ?? { prev_cursor: null, next_cursor: null }} loading={articleList.loading} cursor={cursor} setCursor={setCursor} /></> : <EmptyState title="Sin artículos" text="Cree un artículo o ajuste los filtros." />}
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
      <section className="card" aria-busy={categoryList.loading}>{categoryList.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudieron cargar las categorías: {errorText(categoryList.error)} <button className="btn sm" type="button" onClick={categoryList.reload}>Reintentar</button></Note></div>
        : categoryList.loading && !categoryList.data ? <Skeleton variant="table" rows={4} />
          : categories.length ? <><div className="tw"><table className="t"><thead><tr><th>Nombre</th><th>Slug</th><th>Visibilidad</th><th>Orden</th><th /></tr></thead><tbody>{categories.map((category) => <tr key={category.id}><td className="strong">{category.name}</td><td className="mono">{category.slug}</td><td><Chip>{visibilityLabel(category.visibility)}</Chip></td><td>{category.sort_order}</td><td className="nw"><button className="btn sm" type="button" onClick={() => editCategory(category)}>Editar</button>{' '}<button className="btn sm danger" type="button" disabled={busy} onClick={() => void removeCategory(category)}>Borrar</button></td></tr>)}</tbody></table></div><Pager meta={categoryList.data?.meta ?? { prev_cursor: null, next_cursor: null }} loading={categoryList.loading} cursor={categoryCursor} setCursor={setCategoryCursor} /></> : <EmptyState title="Sin categorías" text="Cree una categoría para organizar los artículos." />}</section>
    </> : null}

    {section === 'reader' ? <div className="grid g-2" style={{ alignItems: 'start' }}>
      <section className="card" aria-busy={articleList.loading}><Toolbar count={`${rows.length} artículos`}><input className="input" aria-label="Buscar ayuda" placeholder="Buscar ayuda" value={query} onChange={(e) => setQuery(e.target.value)} /></Toolbar>
        {articleList.error ? <div className="card-b"><Note kind="warn" role="alert">No se pudieron cargar los artículos: {errorText(articleList.error)} <button className="btn sm" type="button" onClick={articleList.reload}>Reintentar</button></Note></div> : articleList.loading && !articleList.data ? <Skeleton variant="table" rows={4} /> : rows.length ? <div className="card-b" style={{ display: 'grid', gap: 6 }}>{rows.map((article) => <button key={article.id} type="button" className="btn" style={{ textAlign: 'left', justifyContent: 'start' }} onClick={() => setSelectedId(article.id)} aria-current={readerArticle?.id === article.id ? 'true' : undefined}>{article.title}<span className="sub">{article.category?.name ?? 'Sin categoría'}</span></button>)}</div> : <EmptyState title="Sin artículos" text="No hay resultados para esta búsqueda." />}
      </section>
      <section className="card">{readerArticle ? <><div className="card-h"><div><h2 className="sec">{readerArticle.title}</h2><div className="sub">{readerArticle.category?.name ?? 'Sin categoría'} · {visibilityLabel(readerArticle.visibility)} · {statusLabel(readerArticle.status)}</div></div></div><div className="card-b"><RichOut html={readerArticle.body} /></div></> : <div className="card-b"><EmptyState title="Seleccione un artículo" text="El contenido se mostrará aquí." /></div>}</section>
    </div> : null}
  </>;
}

function Pager({ meta, loading, cursor, setCursor }: { meta: { prev_cursor: string | null; next_cursor: string | null }; loading: boolean; cursor: string | null; setCursor: (value: string | null) => void }) {
  if (!meta.prev_cursor && !meta.next_cursor) return null;
  return <div className="card-b" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn sm" type="button" disabled={loading || !meta.prev_cursor} onClick={() => setCursor(meta.prev_cursor)}>Anterior</button><button className="btn sm" type="button" disabled={loading || !meta.next_cursor || cursor === meta.next_cursor} onClick={() => setCursor(meta.next_cursor)}>Siguiente</button></div>;
}
