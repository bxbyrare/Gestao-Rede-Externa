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
  Sun,
  Moon,
  Image as ImageIcon,
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

  // Fundo Branco (Modo Sol/Campo) vs Modo Escuro
  // Formulários de inspeção visual e vistorias abrem por padrão em Fundo Branco para visibilidade sob luz solar
  const isInspectionSlug = Boolean(
    slug?.toLowerCase().includes('inspecao') ||
    slug?.toLowerCase().includes('vistoria')
  );
  const [isLightMode, setIsLightMode] = useState<boolean>(() => isInspectionSlug);

  useEffect(() => {
    if (
      slug?.toLowerCase().includes('inspecao') ||
      slug?.toLowerCase().includes('vistoria') ||
      form?.title?.toLowerCase().includes('inspeção') ||
      form?.title?.toLowerCase().includes('inspecao') ||
      form?.title?.toLowerCase().includes('vistoria')
    ) {
      setIsLightMode(true);
    }
  }, [slug, form?.title]);

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

  // Dynamic design tokens for Light (Modo Sol/Campo) vs Dark Mode
  const bgMain = isLightMode ? 'bg-[#F4F6F9] text-slate-900' : 'bg-[#06080D] text-white';
  const cardOuter = isLightMode
    ? 'rounded-[26px] p-1.5 bg-slate-200/70 border border-slate-200 shadow-sm'
    : 'rounded-[30px] p-2 bg-gradient-to-b from-white/[0.1] to-white/[0.02] border border-white/[0.08] backdrop-blur-2xl';
  const cardInner = isLightMode
    ? 'rounded-[22px] p-6 sm:p-8 bg-white border border-slate-200 shadow-md shadow-slate-200/50'
    : 'rounded-[24px] p-6 sm:p-8 bg-[#090C13]/95 border border-white/[0.05]';
  const subCardOuter = isLightMode
    ? 'rounded-[24px] p-1.5 bg-slate-200/50 border border-slate-200/80 shadow-sm'
    : 'rounded-[28px] p-2 bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] backdrop-blur-xl';
  const subCardInner = isLightMode
    ? 'rounded-[20px] p-6 bg-white border border-slate-200 shadow-sm'
    : 'rounded-[22px] p-6 bg-[#090C13]/90 border border-white/[0.04]';
  const textHeading = isLightMode ? 'text-slate-900' : 'text-white';
  const textMuted = isLightMode ? 'text-slate-500' : 'text-neutral-400';
  const inputStyle = isLightMode
    ? 'w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-red-500 outline-none transition-all'
    : 'w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-600 focus:border-red-500 transition-colors outline-none';
  const textareaStyle = isLightMode
    ? 'w-full p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-red-500 outline-none resize-y transition-all'
    : 'w-full p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-600 focus:border-red-500 transition-colors outline-none resize-y';
  const selectStyle = isLightMode
    ? 'w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-300 text-sm text-slate-900 focus:bg-white focus:border-red-500 outline-none transition-all cursor-pointer'
    : 'w-full h-11 px-4 rounded-xl bg-[#090C13] border border-white/10 text-sm text-white focus:border-red-500 transition-colors outline-none cursor-pointer';
  const optionSelectClass = isLightMode ? 'bg-white text-slate-900' : 'bg-[#0D111A] text-white';

  return (
    <div className={`min-h-screen ${bgMain} p-4 sm:p-8 relative selection:bg-red-500/30 transition-colors duration-200`}>
      {!isLightMode && <GsapSecurityBackground />}

      <main className="relative z-10 max-w-3xl mx-auto space-y-6 pt-4 pb-20">
        {/* Brand Header */}
        <header className={`flex flex-wrap items-center justify-between gap-3 border-b pb-5 transition-colors ${isLightMode ? 'border-slate-200' : 'border-white/[0.08]'}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full p-1 bg-gradient-to-br from-[#EE2C24] via-[#D11A12] to-[#800A05] border border-red-500/40 shadow-lg shadow-red-600/20 flex items-center justify-center shrink-0">
              <img src="/claro-icon.png" alt="Claro" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className={`font-extrabold text-sm tracking-tight ${textHeading}`}>
                Gestão <span className="text-red-600">REDE EXTERNA</span>
              </div>
              <div className={`text-[10px] uppercase tracking-widest font-mono ${textMuted}`}>
                Formulário Oficial de Campo
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Alternar Modo Sol / Campo (Fundo Branco) vs Modo Escuro */}
            <button
              type="button"
              onClick={() => setIsLightMode(!isLightMode)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300'
                  : 'bg-white/[0.08] hover:bg-white/[0.15] text-neutral-200 border border-white/10'
              }`}
              title="Alternar entre modo sol (fundo branco) e modo escuro"
            >
              {isLightMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>Modo Sol (Fundo Branco)</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span>Modo Escuro</span>
                </>
              )}
            </button>
            <span className={`text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full border ${
              isLightMode ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-white/[0.05] border-white/10 text-neutral-300'
            }`}>
              {form?.category || 'Inspeção'}
            </span>
          </div>
        </header>

        {submitSuccess ? (
          /* Confirmation Success Screen */
          <div className={cardOuter}>
            <div className={`${cardInner} text-center space-y-5`}>
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <span className={`text-[10px] font-mono uppercase tracking-[0.2em] px-3 py-1 rounded-full border ${
                  isLightMode
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                }`}>
                  Protocolo: {protocol}
                </span>
                <h1 className={`text-2xl font-black tracking-tight mt-3 ${textHeading}`}>
                  Resposta Registrada com Sucesso!
                </h1>
                <p className={`text-xs mt-2 max-w-md mx-auto leading-relaxed ${textMuted}`}>
                  As informações e evidências fotográficas foram salvas diretamente na base de dados do{' '}
                  <strong className={textHeading}>Gestão Rede Externa Claro</strong>.
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
                  className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-xs tracking-wide uppercase transition-colors border cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] text-white border-white/10'
                  }`}
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
            <div className={cardOuter}>
              <div className={`${cardInner} space-y-3`}>
                <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${textHeading}`}>
                  {form?.title}
                </h1>
                {form?.description && (
                  <p className={`text-xs sm:text-sm leading-relaxed whitespace-pre-line border-t pt-3 ${
                    isLightMode ? 'text-slate-600 border-slate-200' : 'text-neutral-300 border-white/[0.06]'
                  }`}>
                    {form.description}
                  </p>
                )}
                <div className="text-[11px] text-red-500 font-semibold pt-1">
                  * Indica campo de preenchimento obrigatório
                </div>
              </div>
            </div>

            {error && (
              <div className={`p-4 rounded-2xl border text-xs flex items-center gap-3 ${
                isLightMode
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-red-950/40 border-red-800/30 text-red-300'
              }`}>
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Respondent Identification Card */}
            <div className={subCardOuter}>
              <div className={`${subCardInner} space-y-4`}>
                <div className={`flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider border-b pb-3 ${
                  isLightMode ? 'text-slate-700 border-slate-200' : 'text-neutral-300 border-white/[0.06]'
                }`}>
                  <User className="w-4 h-4 text-red-500" />
                  <span>Identificação do Técnico / Colaborador</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isLightMode ? 'text-slate-700' : 'text-neutral-300'}`}>
                      Nome Completo do Técnico <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: João Silva da Silva"
                      value={technicianName}
                      onChange={(e) => setTechnicianName(e.target.value)}
                      className={inputStyle}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isLightMode ? 'text-slate-700' : 'text-neutral-300'}`}>
                      Telefone / WhatsApp / TOA (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: (21) 98888-7777 ou Login TOA"
                      value={technicianPhone}
                      onChange={(e) => setTechnicianPhone(e.target.value)}
                      className={inputStyle}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Converted Questions */}
            {form?.questions && form.questions.length > 0 ? (
              <div className="space-y-4">
                {form.questions.map((q, idx) => (
                  <div key={idx} className={subCardOuter}>
                    <div className={`${subCardInner} space-y-3`}>
                      <div className="flex items-start justify-between gap-3">
                        <label className={`text-sm font-bold leading-snug ${textHeading}`}>
                          <span className={`font-mono text-xs mr-2 ${textMuted}`}>
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
                          className={inputStyle}
                        />
                      )}

                      {q.type === 'textarea' && (
                        <textarea
                          rows={3}
                          required={q.required}
                          placeholder="Digite detalhadamente..."
                          value={answers[q.title] || ''}
                          onChange={(e) => handleAnswerChange(q.title, e.target.value)}
                          className={textareaStyle}
                        />
                      )}

                      {q.type === 'radio' && q.options && (
                        <div className="space-y-2 pt-1">
                          {q.options.map((opt, oIdx) => {
                            const isSelected = answers[q.title] === opt;
                            return (
                              <label
                                key={oIdx}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                  isSelected
                                    ? isLightMode
                                      ? 'bg-red-50 border-red-500 text-red-950 font-bold shadow-sm'
                                      : 'bg-red-950/20 border-red-500/40 text-white font-semibold'
                                    : isLightMode
                                      ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                                      : 'bg-white/[0.02] border-white/[0.06] text-neutral-300 hover:bg-white/[0.04]'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`q_${idx}`}
                                  required={q.required}
                                  checked={isSelected}
                                  onChange={() => handleAnswerChange(q.title, opt)}
                                  className="w-4 h-4 accent-red-600"
                                />
                                <span className="text-xs font-medium">{opt}</span>
                              </label>
                            );
                          })}
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
                                    ? isLightMode
                                      ? 'bg-red-50 border-red-500 text-red-950 font-bold shadow-sm'
                                      : 'bg-red-950/20 border-red-500/40 text-white font-semibold'
                                    : isLightMode
                                      ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
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
                          className={selectStyle}
                        >
                          <option value="" className={optionSelectClass}>
                            Selecione uma opção...
                          </option>
                          {q.options.map((opt, oIdx) => (
                            <option key={oIdx} value={opt} className={optionSelectClass}>
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
                          className={inputStyle}
                        />
                      )}

                      {q.type === 'time' && (
                        <input
                          type="time"
                          required={q.required}
                          value={answers[q.title] || ''}
                          onChange={(e) => handleAnswerChange(q.title, e.target.value)}
                          className={inputStyle}
                        />
                      )}

                      {q.type === 'scale' && (
                        <div className="flex items-center justify-between gap-1 sm:gap-2 pt-2 overflow-x-auto pb-1">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                            const isSelected = answers[q.title] === String(num);
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => handleAnswerChange(q.title, String(num))}
                                className={`flex-1 min-w-[36px] h-11 rounded-xl text-xs font-mono font-bold flex items-center justify-center transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 scale-105 border border-red-500'
                                    : isLightMode
                                      ? 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200'
                                      : 'bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.08]'
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {q.type === 'file' && (
                        <div className="space-y-3 pt-1">
                          {files[q.title] && filePreviews[q.title] ? (
                            <div className={`relative rounded-2xl overflow-hidden border max-w-sm ${
                              isLightMode ? 'border-slate-300 bg-slate-100' : 'border-white/15 bg-black/40'
                            }`}>
                              <img
                                src={filePreviews[q.title]}
                                alt="Evidência"
                                className="w-full h-48 object-cover"
                              />
                              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFile(q.title)}
                                  className="p-1.5 rounded-lg bg-black/70 hover:bg-black text-white text-xs backdrop-blur-md transition-colors cursor-pointer shadow-md"
                                  title="Remover foto"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className={`p-2.5 text-xs truncate font-medium ${
                                isLightMode ? 'bg-white text-slate-800 border-t border-slate-200' : 'bg-black/70 text-neutral-300'
                              }`}>
                                {files[q.title]?.name}
                              </div>
                            </div>
                          ) : (
                            <div className={`p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-3 transition-all ${
                              isLightMode
                                ? 'border-slate-300 bg-slate-50/70 hover:bg-slate-100/60'
                                : 'border-white/15 bg-white/[0.02] hover:bg-white/[0.04]'
                            }`}>
                              <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${
                                isLightMode
                                  ? 'bg-white border-slate-200 text-red-600 shadow-sm'
                                  : 'bg-white/[0.04] border-white/10 text-red-500'
                              }`}>
                                <Camera className="w-6 h-6" />
                              </div>

                              <div>
                                <span className={`text-xs font-bold block ${textHeading}`}>
                                  Anexar Foto de Evidência
                                </span>
                                <span className={`text-[11px] block mt-0.5 ${textMuted}`}>
                                  Tire uma foto na hora ou escolha uma foto já salva na sua galeria
                                </span>
                              </div>

                              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2 w-full max-w-sm">
                                {/* Botão 1: Câmera Direta */}
                                <label className={`w-full sm:flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-bold text-xs transition-all cursor-pointer shadow-sm active:scale-[0.98] ${
                                  isLightMode
                                    ? 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700'
                                    : 'bg-red-600/20 hover:bg-red-600/30 border-red-500/40 text-red-300'
                                }`}>
                                  <Camera className="w-4 h-4 shrink-0" />
                                  <span>Tirar Foto</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(e) => handleFileSelect(q.title, e)}
                                    className="hidden"
                                  />
                                </label>

                                {/* Botão 2: Galeria / Arquivos (Sem capture!) */}
                                <label className={`w-full sm:flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-bold text-xs transition-all cursor-pointer shadow-sm active:scale-[0.98] ${
                                  isLightMode
                                    ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                                    : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/15 text-white'
                                }`}>
                                  <ImageIcon className="w-4 h-4 shrink-0" />
                                  <span>Galeria / Arquivo</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleFileSelect(q.title, e)}
                                    className="hidden"
                                  />
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Fallback if no questions are converted yet */
              <div className={subCardOuter}>
                <div className={`${subCardInner} text-center space-y-3`}>
                  <FileText className={`w-10 h-10 mx-auto ${textMuted}`} />
                  <p className={`text-sm font-semibold ${textHeading}`}>
                    Formulário sem perguntas configuradas.
                  </p>
                  <p className={`text-xs ${textMuted}`}>
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
