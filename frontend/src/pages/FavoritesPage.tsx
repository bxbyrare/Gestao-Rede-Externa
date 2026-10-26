import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Pencil, Plus, Search, Trash2, Eye } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Favorite } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import { hasPermission, useAuth } from '../state/AuthContext';

const COLORS = [
  { value: 'Vermelho', dot: '#EE2C24', chipBg: 'rgba(238,44,36,0.12)', chipText: '#ff8a84', border: 'rgba(238,44,36,0.30)' },
  { value: 'Amarelo', dot: '#f59e0b', chipBg: 'rgba(245,158,11,0.10)', chipText: '#fde68a', border: 'rgba(245,158,11,0.25)' },
  { value: 'Verde', dot: '#10b981', chipBg: 'rgba(16,185,129,0.10)', chipText: '#a7f3d0', border: 'rgba(16,185,129,0.25)' },
  { value: 'Roxo', dot: '#8b5cf6', chipBg: 'rgba(139,92,246,0.10)', chipText: '#ddd6fe', border: 'rgba(139,92,246,0.25)' },
  { value: 'Azul', dot: '#38bdf8', chipBg: 'rgba(56,189,248,0.10)', chipText: '#bae6fd', border: 'rgba(56,189,248,0.25)' },
];

function colorMeta(value: string) {
  return COLORS.find((c) => c.value === value) || COLORS[0];
}

const emptyForm = { title: '', link: '', color: 'Vermelho' };

export default function FavoritesPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'favoritos.create');
  const canEdit = hasPermission(user, 'favoritos.edit');
  const canDelete = hasPermission(user, 'favoritos.delete');
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
          canCreate ? (
            <Button onClick={openCreate} className="bg-white hover:bg-neutral-100 text-black shadow-sm font-semibold rounded-xl">
              <Plus className="w-4 h-4" /> Cadastrar Favorito
            </Button>
          ) : undefined
        }
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou link..."
          className="pl-11 rounded-xl bg-white/[0.03] border-white/10 text-white placeholder:text-neutral-500"
        />
      </div>

      {favorites === null ? (
        <p className="text-sm text-neutral-400">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-neutral-400">Nenhum favorito encontrado.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((fav) => {
            const meta = colorMeta(fav.color);
            return (
              <div
                key={fav.id}
                className="group relative flex flex-col justify-between rounded-2xl p-5 bg-[#090C13]/85 border border-white/[0.08] hover:border-white/20 hover:bg-[#0E131F]/90 transition-all duration-300 shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl"
              >
                <div>
                  {/* Top Bar with Status Tag & Counter */}
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border"
                      style={{ background: meta.chipBg, color: meta.chipText, borderColor: meta.border }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
                      {fav.color}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 font-mono">
                      <Eye className="w-3 h-3 text-neutral-400" /> {fav.access_count}x
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-[15px] leading-snug text-white group-hover:text-white transition-colors mb-4 line-clamp-2">
                    {fav.title}
                  </h3>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                  <button
                    onClick={() => handleAccess(fav)}
                    className="flex-1 h-9 px-3 rounded-xl bg-white/[0.05] hover:bg-white text-neutral-200 hover:text-black border border-white/10 hover:border-transparent text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-neutral-400 group-hover:text-black transition-colors" /> Acessar Link
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => openEdit(fav)}
                      aria-label="Editar favorito"
                      className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.08] hover:border-white/15 transition-all cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(fav)}
                      aria-label="Excluir favorito"
                      className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-neutral-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
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
        {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}
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
