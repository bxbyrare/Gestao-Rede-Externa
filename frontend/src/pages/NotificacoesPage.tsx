import { useEffect, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui';
import Modal from '../components/Modal';

interface Notification {
  id: number;
  event_date: string;
  reason: string;
  description: string;
  coordinator_name: string;
  count_label: string;
}

const emptyForm = { event_date: '', reason: '', description: '', coordinator_name: '' };

function formatDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function NotificacoesPage() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  function load() {
    api.get<Notification[]>('/api/notifications').then(setItems).catch(() => setItems([]));
  }

  useEffect(load, []);

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  async function submit() {
    if (!form.event_date || !form.reason.trim() || !form.description.trim() || !form.coordinator_name.trim()) {
      setError('Data, Porquê, Descritivo e Coordenador são obrigatórios.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await api.post('/api/notifications', form);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(n: Notification) {
    if (!confirm(`Excluir a "${n.count_label}"?`)) return;
    await api.delete(`/api/notifications/${n.id}`);
    load();
  }

  function openImport() {
    setCsvText('');
    setError(null);
    setImportModalOpen(true);
  }

  async function submitImport() {
    if (!csvText.trim()) {
      setError('Suba um arquivo ou cole os dados para importar.');
      return;
    }
    setError(null);
    setIsImporting(true);
    try {
      const res = await api.post<{ imported: number; errors: string[] }>('/api/notifications/bulk', { csv_data: csvText });
      if (res.errors?.length) {
        alert(`${res.imported} notificação(ões) importada(s). ${res.errors.length} linha(s) com erro:\n${res.errors.join('\n')}`);
      } else {
        alert(`${res.imported} notificação(ões) importada(s) com sucesso!`);
      }
      setImportModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao importar.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Notificações"
        subtitle="Registro de notificações — acesso restrito a Coordenadores Claro"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openImport}>
              <Upload className="w-4 h-4" /> Subir Notificações
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = '/api/notifications/export'; }}>
              <Download className="w-4 h-4" /> Exportar Excel
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" /> Incluir
            </Button>
          </div>
        }
      />

      {items === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhuma notificação registrada.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Porquê</th>
                <th className="px-4 py-3">Descritivo</th>
                <th className="px-4 py-3">Contagem</th>
                <th className="px-4 py-3">Coordenador</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] align-top">
                  <td className="px-4 py-3 mono whitespace-nowrap">{formatDate(n.event_date)}</td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{n.reason}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] max-w-md">{n.description}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--color-success-dim)] text-[var(--color-success)]">{n.count_label}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{n.coordinator_name}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(n)} aria-label="Excluir notificação" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
        title="Nova Notificação"
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button><Button onClick={submit} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Data">
          <Input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
        </Field>
        <Field label="Porquê">
          <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Ex: Férias, Gestão de Infra..." />
        </Field>
        <Field label="Descritivo">
          <Textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <Field label="Coordenador">
          <Input value={form.coordinator_name} onChange={(e) => setForm((f) => ({ ...f, coordinator_name: e.target.value }))} />
        </Field>
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Subir Notificações (CSV)"
        footer={<><Button variant="ghost" onClick={() => setImportModalOpen(false)}>Cancelar</Button><Button onClick={submitImport} disabled={isImporting}>{isImporting ? 'Processando...' : 'Processar Importação'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Subir arquivo (.csv)" hint="Colunas: Data;Porquê;Descritivo;Coordenador (separadas por ; ou ,). Data no formato DD/MM/AAAA.">
          <input
            type="file"
            accept=".csv,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setCsvText(String(reader.result || ''));
              reader.readAsText(file, 'utf-8');
            }}
            className="w-full text-sm text-[var(--color-text-muted)] file:mr-3 file:h-9 file:px-4 file:rounded-full file:border-0 file:bg-white/[0.06] file:text-[var(--color-text)] file:text-sm"
          />
        </Field>
        <Field label="Ou cole os dados CSV">
          <Textarea rows={6} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="10/08/2026;Férias;Descrição do ocorrido;Nome do Coordenador" />
        </Field>
      </Modal>
    </div>
  );
}
