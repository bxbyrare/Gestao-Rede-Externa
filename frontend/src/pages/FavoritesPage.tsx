import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Pencil, Plus, Search, Trash2, Eye } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Favorite } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import SpotlightCard from '../components/SpotlightCard';
import Modal from '../components/Modal';

const COLORS = [
  { value: 'Vermelho', dot: '#ef4444', chipBg: 'rgba(239,68,68,0.14)', chipText: '#fca5a5' },
  { value: 'Amarelo', dot: '#eab308', chipBg: 'rgba(234,179,8,0.14)', chipText: '#fde047' },
  { value: 'Verde', dot: '#22c55e', chipBg: 'rgba(34,197,94,0.14)', chipText: '#86efac' },
  { value: 'Roxo', dot: '#a855f7', chipBg: 'rgba(168,85,247,0.14)', chipText: '#d8b4fe' },
  { value: 'Azul', dot: '#3b82f6', chipBg: 'rgba(59,130,246,0.14)', chipText: '#93c5fd' },
];

function colorMeta(value: string) {
  return COLORS.find((c) => c.value === value) || COLORS[0];
}

const emptyForm = { title: '', link: '', color: 'Vermelho' };

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Favorite | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    api.get<Favorite[]>('/api/favorites').then(setFavorites).catch(() => setFavorites([]));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!favorites) return [];
    const q = search.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((f) => f.title.toLowerCase().includes(q) || f.link.toLowerCase().includes(q));
  }, [favorites, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(fav: Favorite) {
    setEditing(fav);
    setForm({ title: fav.title, link: fav.link, color: fav.color });
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    setIsSaving(true);
    try {
      if (editing) {
        await api.post(`/api/favorites/${editing.id}`, form);
      } else {
        await api.post('/api/favorites', form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(fav: Favorite) {
    if (!confirm(`Excluir o favorito "${fav.title}"?`)) return;
    await api.delete(`/api/favorites/${fav.id}`);
    load();
  }

  async function handleAccess(fav: Favorite) {
    api.post(`/api/favorites/${fav.id}/click`).catch(() => {});
    window.open(fav.link, '_blank', 'noopener,noreferrer');
  }

  return (
    <div>
      <PageHeader
        title="Favoritos"
        subtitle="Links e ferramentas de uso frequente da operação"
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Cadastrar Favorito
          </Button>
        }
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou link..." className="pl-11 rounded-full" />
      </div>

      {favorites === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhum favorito encontrado.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((fav) => {
            const meta = colorMeta(fav.color);
            return (
              <SpotlightCard key={fav.id} spotlightColor="rgba(238, 44, 36, 0.18)" className="flex flex-col gap-4 relative overflow-hidden group animate-in">
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: meta.dot }} />
                <div className="flex items-center justify-between">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={{ background: meta.chipBg, color: meta.chipText }}
                  >
                    {fav.color}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-faint)]">
                    <Eye className="w-3 h-3" /> {fav.access_count}x
                  </span>
                </div>
                <h3 className="font-bold text-base leading-snug">{fav.title}</h3>
                <div className="mt-auto flex items-center gap-2">
                  <Button onClick={() => handleAccess(fav)} className="flex-1">
                    <ExternalLink className="w-4 h-4" /> Acessar Link
                  </Button>
                  <button
                    onClick={() => openEdit(fav)}
                    aria-label="Editar favorito"
                    className="w-11 h-11 shrink-0 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(fav)}
                    aria-label="Excluir favorito"
                    className="w-11 h-11 shrink-0 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Favorito' : 'Novo Favorito'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Favorito'}</Button>
          </>
        }
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Nome">
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex: Sistema Claro / Documentação" />
        </Field>
        <Field label="Link">
          <Input value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} placeholder="https://exemplo.com" />
        </Field>
        <Field label="Cor">
          <Select value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}>
            {COLORS.map((c) => (
              <option key={c.value} value={c.value}>{c.value}</option>
            ))}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}
