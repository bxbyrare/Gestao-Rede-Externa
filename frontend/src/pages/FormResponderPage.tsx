import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Loader2,
  Camera,
  X,
  FileText,
  User,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../state/AuthContext';
import GsapSecurityBackground from '../components/GsapSecurityBackground';
import { formatPersonName } from '../utils/formatName';

interface Question {
  title: string;
  type: 'text' | 'textarea' | 'radio' | 'select' | 'checkbox' | 'date' | 'time' | 'scale' | 'file';
  options?: string[];
  required?: boolean;
}

interface FormDetail {
  id: number;
  title: string;
  slug: string;
  category: string;
  description: string | null;
  link?: string | null;
  questions: Question[];
}

export default function FormResponderPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form respondent state
  const [technicianName, setTechnicianName] = useState('');
  const [technicianPhone, setTechnicianPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [protocol, setProtocol] = useState('');

  // Auto-fill logged in user info
  useEffect(() => {
    if (user) {
      if (user.name) setTechnicianName(formatPersonName(user.name));
      else if (user.username) setTechnicianName(formatPersonName(user.username));
      if (user.phone) setTechnicianPhone(user.phone);
    }
  }, [user]);

  // Load public form data
  useEffect(() => {
    if (!slug) return;
    setIsLoading(true);
    setError(null);

    api
      .get<FormDetail>(`/api/public/forms/${slug}`)
      .then((data) => {
        setForm(data);
        // Initialize default empty answers
        const initialAnswers: Record<string, any> = {};
        (data.questions || []).forEach((q) => {
          if (q.type === 'checkbox') {
            initialAnswers[q.title] = [];
          } else {
            initialAnswers[q.title] = '';
          }
        });
        setAnswers(initialAnswers);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Formulário não encontrado ou inativo.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [slug]);

  function handleAnswerChange(title: string, value: any) {
    setAnswers((prev) => ({ ...prev, [title]: value }));
  }

  function handleCheckboxToggle(title: string, option: string) {
    setAnswers((prev) => {
      const currentList: string[] = Array.isArray(prev[title]) ? prev[title] : [];
      if (currentList.includes(option)) {
        return { ...prev, [title]: currentList.filter((item) => item !== option) };
      } else {
        return { ...prev, [title]: [...currentList, option] };
      }
    });
  }

  function handleFileSelect(title: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFiles((prev) => ({ ...prev, [title]: file }));

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setFilePreviews((prev) => ({ ...prev, [title]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreviews((prev) => ({ ...prev, [title]: '' }));
    }
  }

  function handleRemoveFile(title: string) {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[title];
      return next;
    });
    setFilePreviews((prev) => {
      const next = { ...prev };
      delete next[title];
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!technicianName.trim()) {
      setError('Por favor, informe seu nome ou identificação de técnico.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate required questions
    if (form?.questions) {
      for (const q of form.questions) {
        if (q.required) {
          if (q.type === 'file') {
            if (!files[q.title]) {
              setError(`O campo "${q.title}" é obrigatório (anexe uma foto ou documento).`);
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
          } else if (q.type === 'checkbox') {
            const list = answers[q.title];
            if (!list || !Array.isArray(list) || list.length === 0) {
              setError(`Selecione ao menos uma opção em "${q.title}".`);
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
          } else {
            const val = answers[q.title];
            if (!val || String(val).trim() === '') {
              setError(`Por favor, responda o campo obrigatório "${q.title}".`);
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
          }
        }
      }
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('t\u00e9cnico', technicianName.trim());
      formData.append('telefone', technicianPhone.trim());

      // Append text answers
      Object.entries(answers).forEach(([key, val]) => {
        if (Array.isArray(val)) {
          val.forEach((item) => formData.append(key, item));
        } else {
          formData.append(key, String(val ?? ''));
        }
      });

      // Append file attachments
      Object.entries(files).forEach(([key, file]) => {
        formData.append(key, file);
      });

      await api.postFormData(`/f/${slug}/submit`, formData);

      // Generate random protocol
      const now = new Date();
      const code = Math.floor(1000 + Math.random() * 9000);
      const prot = `GRE-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${code}`;
      setProtocol(prot);
      setSubmitSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erro ao enviar respostas. Verifique sua conexão e tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#06080D] relative">
        <GsapSecurityBackground />
        <div className="relative z-10 flex flex-col items-center gap-3 text-neutral-400 text-xs">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <span>Carregando formulário Claro Gestão...</span>
        </div>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#06080D] relative">
        <GsapSecurityBackground />
        <div className="relative z-10 w-full max-w-md rounded-[28px] p-2 bg-gradient-to-b from-white/[0.1] to-white/[0.02] border border-white/10 backdrop-blur-2xl">
          <div className="rounded-[22px] p-8 bg-[#090C13]/95 border border-white/[0.05] text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-600/15 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-white">Formulário Indisponível</h2>
            <p className="text-xs text-neutral-400 leading-relaxed">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Voltar ao Início
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Se o formulário ainda não possuir perguntas nativas cadastradas
  if (form && (!form.questions || form.questions.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#06080D] relative">
        <GsapSecurityBackground />
        <div className="relative z-10 w-full max-w-lg rounded-[28px] p-2 bg-gradient-to-b from-white/[0.1] to-white/[0.02] border border-white/10 backdrop-blur-2xl">
          <div className="rounded-[22px] p-8 bg-[#090C13]/95 border border-white/[0.05] text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto shadow-lg shadow-blue-600/10">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] px-3 py-1 rounded-full bg-white/[0.05] text-neutral-300 border border-white/10">
                {form.category || 'Formulário'}
              </span>
              <h1 className="text-xl font-black text-white tracking-tight mt-3">
                {form.title}
              </h1>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                {form.description || 'Formulário nativo em configuração. Adicione as perguntas no painel de gestão para habilitar o envio de respostas.'}
              </p>
            </div>
            <div className="pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Voltar ao Sistema Claro Gestão
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080D] text-white p-4 sm:p-8 relative selection:bg-red-500/30">
      <GsapSecurityBackground />

      <main className="relative z-10 max-w-3xl mx-auto space-y-6 pt-4 pb-20">
        {/* Brand Header */}
        <header className="flex items-center justify-between border-b border-white/[0.08] pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full p-1 bg-gradient-to-br from-[#EE2C24] via-[#D11A12] to-[#800A05] border border-red-500/40 shadow-lg shadow-red-600/20 flex items-center justify-center">
              <img src="/claro-icon.png" alt="Claro" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-tight text-white">
                Gestão <span className="text-red-500">REDE EXTERNA</span>
              </div>
              <div className="text-[10px] text-neutral-400 uppercase tracking-widest font-mono">
                Formulário Oficial de Campo
              </div>
            </div>
          </div>

          <span className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-neutral-300">
            {form?.category || 'Inspeção'}
          </span>
        </header>

        {submitSuccess ? (
          /* Confirmation Success Screen */
          <div className="rounded-[32px] p-2 bg-gradient-to-b from-white/[0.12] via-white/[0.04] to-white/[0.02] border border-white/[0.08] shadow-2xl backdrop-blur-3xl animate-fade-in">
            <div className="rounded-[26px] p-8 sm:p-12 bg-[#090C13]/95 border border-white/[0.05] text-center space-y-5">
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  Protocolo: {protocol}
                </span>
                <h1 className="text-2xl font-black text-white tracking-tight mt-3">
                  Resposta Registrada com Sucesso!
                </h1>
                <p className="text-xs text-neutral-400 mt-2 max-w-md mx-auto leading-relaxed">
                  As informações e evidências fotográficas foram salvas diretamente na base de dados do{' '}
                  <strong className="text-white">Gestão Rede Externa Claro</strong>.
                </p>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitSuccess(false);
                    setAnswers({});
                    setFiles({});
                    setFilePreviews({});
                  }}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-xs tracking-wide uppercase transition-all shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  Enviar Outra Resposta
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white font-semibold text-xs tracking-wide uppercase transition-colors border border-white/10 cursor-pointer"
                >
                  Ir para o Portal
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Form Content Card */
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Form Title & Instructions Card */}
            <div className="rounded-[30px] p-2 bg-gradient-to-b from-white/[0.1] to-white/[0.02] border border-white/[0.08] backdrop-blur-2xl">
              <div className="rounded-[24px] p-6 sm:p-8 bg-[#090C13]/95 border border-white/[0.05] space-y-3">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {form?.title}
                </h1>
                {form?.description && (
                  <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed whitespace-pre-line border-t border-white/[0.06] pt-3">
                    {form.description}
                  </p>
                )}
                <div className="text-[11px] text-red-400 font-medium pt-1">
                  * Indica campo de preenchimento obrigatório
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/30 text-red-300 text-xs flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Respondent Identification Card */}
            <div className="rounded-[28px] p-2 bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] backdrop-blur-xl">
              <div className="rounded-[22px] p-6 bg-[#090C13]/90 border border-white/[0.04] space-y-4">
                <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-neutral-300 border-b border-white/[0.06] pb-3">
                  <User className="w-4 h-4 text-red-500" />
                  <span>Identificação do Técnico / Colaborador</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                      Nome Completo do Técnico <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: João Silva da Silva"
                      value={technicianName}
                      onChange={(e) => setTechnicianName(e.target.value)}
                      className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-600 focus:border-red-500 transition-colors outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                      Telefone / WhatsApp / TOA (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: (21) 98888-7777 ou Login TOA"
                      value={technicianPhone}
                      onChange={(e) => setTechnicianPhone(e.target.value)}
                      className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-600 focus:border-red-500 transition-colors outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Converted Questions */}
            {form?.questions && form.questions.length > 0 ? (
              <div className="space-y-4">
                {form.questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="rounded-[28px] p-2 bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] backdrop-blur-xl"
                  >
                    <div className="rounded-[22px] p-6 bg-[#090C13]/90 border border-white/[0.04] space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <label className="text-sm font-bold text-white leading-snug">
                          <span className="text-neutral-400 font-mono text-xs mr-2">
                            {idx + 1}.
                          </span>
                          {q.title}
                          {q.required && <span className="text-red-500 ml-1 font-bold">*</span>}
                        </label>
                      </div>

                      {/* Question Renderers */}
                      {q.type === 'text' && (
                        <input
                          type="text"
                          required={q.required}
                          placeholder="Sua resposta..."
                          value={answers[q.title] || ''}
                          onChange={(e) => handleAnswerChange(q.title, e.target.value)}
                          className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-600 focus:border-red-500 transition-colors outline-none"
                        />
                      )}

                      {q.type === 'textarea' && (
                        <textarea
                          rows={3}
                          required={q.required}
                          placeholder="Digite detalhadamente..."
                          value={answers[q.title] || ''}
                          onChange={(e) => handleAnswerChange(q.title, e.target.value)}
                          className="w-full p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-600 focus:border-red-500 transition-colors outline-none resize-y"
                        />
                      )}

                      {q.type === 'radio' && q.options && (
                        <div className="space-y-2 pt-1">
                          {q.options.map((opt, oIdx) => (
                            <label
                              key={oIdx}
                              className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                answers[q.title] === opt
                                  ? 'bg-red-950/20 border-red-500/40 text-white'
                                  : 'bg-white/[0.02] border-white/[0.06] text-neutral-300 hover:bg-white/[0.04]'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q_${idx}`}
                                required={q.required}
                                checked={answers[q.title] === opt}
                                onChange={() => handleAnswerChange(q.title, opt)}
                                className="w-4 h-4 accent-red-600"
                              />
                              <span className="text-xs font-medium">{opt}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {q.type === 'checkbox' && q.options && (
                        <div className="space-y-2 pt-1">
                          {q.options.map((opt, oIdx) => {
                            const isChecked =
                              Array.isArray(answers[q.title]) && answers[q.title].includes(opt);
                            return (
                              <label
                                key={oIdx}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                  isChecked
                                    ? 'bg-red-950/20 border-red-500/40 text-white'
                                    : 'bg-white/[0.02] border-white/[0.06] text-neutral-300 hover:bg-white/[0.04]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleCheckboxToggle(q.title, opt)}
                                  className="w-4 h-4 accent-red-600 rounded"
                                />
                                <span className="text-xs font-medium">{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {q.type === 'select' && q.options && (
                        <select
                          required={q.required}
                          value={answers[q.title] || ''}
                          onChange={(e) => handleAnswerChange(q.title, e.target.value)}
                          className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white focus:border-red-500 transition-colors outline-none cursor-pointer"
                        >
                          <option value="" className="bg-[#0D111A]">
                            Selecione uma opção...
                          </option>
                          {q.options.map((opt, oIdx) => (
                            <option key={oIdx} value={opt} className="bg-[#0D111A]">
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}

                      {q.type === 'date' && (
                        <input
                          type="date"
                          required={q.required}
                          value={answers[q.title] || ''}
                          onChange={(e) => handleAnswerChange(q.title, e.target.value)}
                          className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white focus:border-red-500 transition-colors outline-none"
                        />
                      )}

                      {q.type === 'time' && (
                        <input
                          type="time"
                          required={q.required}
                          value={answers[q.title] || ''}
                          onChange={(e) => handleAnswerChange(q.title, e.target.value)}
                          className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white focus:border-red-500 transition-colors outline-none"
                        />
                      )}

                      {q.type === 'scale' && (
                        <div className="flex items-center justify-between gap-1 sm:gap-2 pt-2 overflow-x-auto pb-1">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => handleAnswerChange(q.title, String(num))}
                              className={`flex-1 min-w-[36px] h-11 rounded-xl text-xs font-mono font-bold flex items-center justify-center transition-all cursor-pointer ${
                                answers[q.title] === String(num)
                                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 scale-105 border border-red-500'
                                  : 'bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.08]'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.type === 'file' && (
                        <div className="space-y-3 pt-1">
                          {filePreviews[q.title] ? (
                            <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-black/40 max-w-sm">
                              <img
                                src={filePreviews[q.title]}
                                alt="Evidência"
                                className="w-full h-48 object-cover"
                              />
                              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFile(q.title)}
                                  className="p-1.5 rounded-lg bg-black/60 hover:bg-black text-white text-xs backdrop-blur-md transition-colors cursor-pointer"
                                  title="Remover foto"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="p-2.5 text-[11px] text-neutral-300 truncate bg-black/70">
                                {files[q.title]?.name}
                              </div>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer group">
                              <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/10 text-neutral-300 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                                <Camera className="w-6 h-6 text-red-500" />
                              </div>
                              <span className="text-xs font-semibold text-white">
                                Tirar Foto ou Anexar Arquivo
                              </span>
                              <span className="text-[11px] text-neutral-400 mt-0.5">
                                Clique para abrir a câmera ou galeria do celular
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => handleFileSelect(q.title, e)}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Fallback if no questions are converted yet */
              <div className="rounded-[28px] p-2 bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] backdrop-blur-xl">
                <div className="rounded-[22px] p-8 bg-[#090C13]/90 border border-white/[0.04] text-center space-y-3">
                  <FileText className="w-10 h-10 text-neutral-400 mx-auto" />
                  <p className="text-sm font-semibold text-white">
                    Formulário sem perguntas configuradas.
                  </p>
                  <p className="text-xs text-neutral-400">
                    O coordenador ainda não adicionou ou converteu perguntas para este formulário.
                  </p>
                </div>
              </div>
            )}

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-sm tracking-wide uppercase transition-all shadow-xl shadow-red-600/30 flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Enviando Respostas e Evidências...</span>
                  </>
                ) : (
                  <>
                    <span>Finalizar e Enviar Resposta</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
