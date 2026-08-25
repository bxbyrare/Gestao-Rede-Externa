import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { InventoryItem } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';

const emptyForm = { category: '', name: '', quantity: '0', serial_number: '', description: '' };

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    api.get<InventoryItem[]>('/api/inventory').then(setItems).catch(() => setItems([]));
  }

  useEffect(load, []);

  const categories = useMemo(() => {
    if (!items) return [];
    return Array.from(new Set(items.map((i) => i.category))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let list = items;
    if (categoryFilter) list = list.filter((i) => i.category === categoryFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q) || (i.serial_number || '').toLowerCase().includes(q));
    return list;
  }, [items, search, categoryFilter]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditing(item);
    setForm({ category: item.category, name: item.name, quantity: String(item.quantity), serial_number: item.serial_number || '', description: item.description || '' });
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    setIsSaving(true);
    try {
      const payload = { ...form, quantity: Number(form.quantity) };
      if (editing) {
        await api.put(`/api/inventory/${editing.id}`, payload);
      } else {
        await api.post('/api/inventory', payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(item: InventoryItem) {
    if (!confirm(`Excluir o item "${item.name}" do inventário?`)) return;
    await api.delete(`/api/inventory/${item.id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Inventário"
        subtitle="Controle de itens físicos e materiais da operação"
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Cadastrar Item
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou nº de série..." className="pl-11 rounded-full" />
        </div>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="sm:max-w-[220px]">
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>

      {items === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhum item encontrado.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Qtd.</th>
                <th className="px-5 py-3">Nº de Série</th>
                <th className="px-5 py-3">Cadastrado em</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-[var(--color-text-muted)]">{item.category}</td>
                  <td className="px-5 py-3 font-semibold">{item.name}</td>
                  <td className="px-5 py-3 mono">{item.quantity}</td>
                  <td className="px-5 py-3 mono text-[var(--color-text-muted)]">{item.serial_number || '—'}</td>
                  <td className="px-5 py-3 text-[var(--color-text-faint)]">{item.created_at}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openEdit(item)} aria-label="Editar item" className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(item)} aria-label="Excluir item" className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Item' : 'Novo Item'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Item'}</Button>
          </>
        }
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Categoria">
          <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Ex: Ferramentas, EPI, Equipamentos..." disabled={!!editing} />
        </Field>
        <Field label="Nome">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Quantidade">
          <Input type="number" min={0} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
        </Field>
        <Field label="Número de Série">
          <Input value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} />
        </Field>
        <Field label="Descrição">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </Modal>
    </div>
  );
}
