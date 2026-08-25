import { Construction } from 'lucide-react';
import { Card, PageHeader } from '../components/ui';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <Card className="p-12 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-[var(--color-accent-dim)] flex items-center justify-center text-[var(--color-accent)]">
          <Construction className="w-7 h-7" />
        </div>
        <h3 className="font-bold text-lg">Módulo em migração</h3>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm">
          Este módulo ainda está na versão anterior do sistema e será atualizado para a nova interface em breve.
        </p>
      </Card>
    </div>
  );
}
