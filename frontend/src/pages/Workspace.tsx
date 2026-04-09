import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { client } from '@/lib/api';
import {
  normalizeJDProfile,
  normalizeResumeProfile,
  resolveStructuredAnalysisResponse,
  type JDProfile,
  type ResumeProfile,
} from '@/lib/analysis';
import { getAPIBaseURL } from '@/lib/config';

interface InterviewSession {
  id: number;
  title: string;
  language: string;
  status: string;
  duration: number;
  created_at: string;
  resume_summary?: string;
  jd_summary?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Sub-components for analysis display ─────────────────────────────

function TagList({ items, color }: { items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-500/10 text-purple-300/90 border-purple-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-300/90 border-cyan-500/20',
    red: 'bg-red-500/10 text-red-300/90 border-red-500/20',
    green: 'bg-green-500/10 text-green-300/90 border-green-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-300/90 border-yellow-500/20',
    white: 'bg-white/[0.04] text-white/50 border-white/[0.08]',
  };
  const cls = colorMap[color] || colorMap.white;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className={`px-2.5 py-1 text-[11px] rounded-lg border font-medium ${cls}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

function SectionTitle({ children, icon, color = 'white' }: { children: React.ReactNode; icon?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    purple: 'text-purple-400/80',
    cyan: 'text-cyan-400/80',
    red: 'text-red-400/80',
    green: 'text-green-400/80',
    yellow: 'text-yellow-400/80',
    white: 'text-white/50',
  };
  return (
    <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5 ${colorMap[color] || colorMap.white}`}>
      {icon && <span>{icon}</span>}
      {children}
    </p>
  );
}

function ResumeCard({ profile }: { profile: ResumeProfile }) {
  return (
    <div className="rounded-2xl border border-purple-500/15 bg-gradient-to-b from-purple-500/[0.06] to-transparent p-6 space-y-5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-purple-300 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-400">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          Resume Analysis
        </h3>
        {profile.years_of_experience && (
          <span className="text-[11px] px-3 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20 font-medium">
            {profile.years_of_experience}
          </span>
        )}
      </div>

      {/* Name */}
      {profile.candidate_name && (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-violet-500/30 flex items-center justify-center text-lg font-bold text-purple-300">
            {profile.candidate_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-base font-semibold text-white/90">{profile.candidate_name}</p>
            {profile.education && profile.education.length > 0 && (
              <p className="text-[11px] text-white/35">{profile.education[0]}</p>
            )}
          </div>
        </div>
      )}

      {/* Technical Skills */}
      {profile.technical_skills && profile.technical_skills.length > 0 && (
        <div>
          <SectionTitle icon="⚡" color="purple">Technical Skills</SectionTitle>
          <TagList items={profile.technical_skills} color="purple" />
        </div>
      )}

      {/* Soft Skills */}
      {profile.soft_skills && profile.soft_skills.length > 0 && (
        <div>
          <SectionTitle icon="💡" color="green">Soft Skills</SectionTitle>
          <TagList items={profile.soft_skills} color="green" />
        </div>
      )}

      {/* Work Experience */}
      {profile.work_experiences && profile.work_experiences.length > 0 && (
        <div>
          <SectionTitle icon="💼" color="purple">Work Experience</SectionTitle>
          <div className="space-y-3">
            {profile.work_experiences.map((exp, i) => (
              <div key={i} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-white/85 font-semibold">{exp.title || 'N/A'}</span>
                  {exp.duration && <span className="text-[10px] text-white/30 font-mono">{exp.duration}</span>}
                </div>
                {exp.company && <p className="text-[11px] text-white/40">{exp.company}</p>}
                {exp.achievements && exp.achievements.length > 0 && (
                  <ul className="space-y-0.5 mt-1">
                    {exp.achievements.slice(0, 3).map((a, j) => (
                      <li key={j} className="text-[11px] text-white/35 flex items-start gap-1.5">
                        <span className="text-purple-400/60 mt-0.5 shrink-0">▸</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {profile.projects && profile.projects.length > 0 && (
        <div>
          <SectionTitle icon="🚀" color="purple">Key Projects</SectionTitle>
          <div className="space-y-2.5">
            {profile.projects.slice(0, 5).map((proj, i) => (
              <div key={i} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-white/85 font-semibold">{proj.name || 'N/A'}</span>
                  {proj.role && <span className="text-[10px] text-white/30">{proj.role}</span>}
                </div>
                {proj.tech_stack && proj.tech_stack.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {proj.tech_stack.map((t, j) => (
                      <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300/60 border border-purple-500/10">{t}</span>
                    ))}
                  </div>
                )}
                {proj.highlights && proj.highlights.length > 0 && (
                  <ul className="space-y-0.5 mt-1">
                    {proj.highlights.slice(0, 2).map((h, j) => (
                      <li key={j} className="text-[11px] text-white/35 flex items-start gap-1.5">
                        <span className="text-purple-400/60 mt-0.5 shrink-0">▸</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {profile.education && profile.education.length > 1 && (
        <div>
          <SectionTitle icon="🎓" color="purple">Education</SectionTitle>
          <ul className="space-y-1">
            {profile.education.map((edu, i) => (
              <li key={i} className="text-[12px] text-white/50 flex items-start gap-1.5">
                <span className="text-purple-400/60 mt-0.5 shrink-0">▸</span>
                <span>{edu}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Certifications */}
      {profile.certifications && profile.certifications.length > 0 && (
        <div>
          <SectionTitle icon="📜" color="purple">Certifications</SectionTitle>
          <TagList items={profile.certifications} color="purple" />
        </div>
      )}

      {/* Strongest Points */}
      {profile.strongest_points && profile.strongest_points.length > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/[0.08] to-violet-500/[0.04] border border-purple-500/15">
          <SectionTitle icon="⭐" color="purple">Interview Selling Points</SectionTitle>
          <ul className="space-y-1.5">
            {profile.strongest_points.map((pt, i) => (
              <li key={i} className="text-[12px] text-white/60 flex items-start gap-2">
                <span className="text-purple-400 mt-0.5 shrink-0 font-bold">{i + 1}.</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function JDCard({ profile }: { profile: JDProfile }) {
  return (
    <div className="rounded-2xl border border-cyan-500/15 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-6 space-y-5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-cyan-300 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-cyan-400">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          JD Analysis
        </h3>
        <div className="flex items-center gap-2">
          {profile.level && (
            <span className="text-[11px] px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/20 font-medium">
              {profile.level}
            </span>
          )}
          {profile.years_experience_required && (
            <span className="text-[11px] px-3 py-1 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.08] font-medium">
              {profile.years_experience_required}
            </span>
          )}
        </div>
      </div>

      {/* Title & Company */}
      {profile.job_title && (
        <div>
          <p className="text-base font-semibold text-white/90">{profile.job_title}</p>
          {profile.company && <p className="text-[12px] text-white/40 mt-0.5">{profile.company}{profile.team ? ` · ${profile.team}` : ''}</p>}
        </div>
      )}

      {/* Required Skills */}
      {profile.required_skills && profile.required_skills.length > 0 && (
        <div>
          <SectionTitle icon="🔴" color="red">Required Skills (Must-Have)</SectionTitle>
          <TagList items={profile.required_skills} color="red" />
        </div>
      )}

      {/* Preferred Skills */}
      {profile.preferred_skills && profile.preferred_skills.length > 0 && (
        <div>
          <SectionTitle icon="🟢" color="green">Preferred Skills (Nice-to-Have)</SectionTitle>
          <TagList items={profile.preferred_skills} color="green" />
        </div>
      )}

      {/* Tech Stack */}
      {profile.tech_stack && profile.tech_stack.length > 0 && (
        <div>
          <SectionTitle icon="🛠" color="cyan">Tech Stack</SectionTitle>
          <TagList items={profile.tech_stack} color="cyan" />
        </div>
      )}

      {/* Responsibilities */}
      {profile.responsibilities && profile.responsibilities.length > 0 && (
        <div>
          <SectionTitle icon="📋" color="cyan">Key Responsibilities</SectionTitle>
          <ul className="space-y-1.5">
            {profile.responsibilities.slice(0, 6).map((r, i) => (
              <li key={i} className="text-[12px] text-white/50 flex items-start gap-2">
                <span className="text-cyan-400/60 mt-0.5 shrink-0">▸</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Interview Focus Areas */}
      {profile.interview_focus_areas && profile.interview_focus_areas.length > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-yellow-500/[0.06] to-orange-500/[0.03] border border-yellow-500/15">
          <SectionTitle icon="🎯" color="yellow">Predicted Interview Focus</SectionTitle>
          <ul className="space-y-1.5">
            {profile.interview_focus_areas.map((area, i) => (
              <li key={i} className="text-[12px] text-white/55 flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5 shrink-0 font-bold">{i + 1}.</span>
                <span>{area}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Keywords */}
      {profile.keywords && profile.keywords.length > 0 && (
        <div>
          <SectionTitle icon="🏷" color="white">Keywords to Use in Answers</SectionTitle>
          <TagList items={profile.keywords} color="white" />
        </div>
      )}

      {/* Requirements breakdown */}
      {profile.requirements && profile.requirements.length > 0 && (
        <div>
          <SectionTitle icon="📝" color="cyan">All Requirements</SectionTitle>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
            {profile.requirements.map((req, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${req.is_required ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
                  {req.is_required ? 'REQ' : 'PREF'}
                </span>
                <span className="text-white/45">{req.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function Workspace() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [language, setLanguage] = useState('zh');
  const [resumeProfile, setResumeProfile] = useState<ResumeProfile | null>(null);
  const [jdProfile, setJdProfile] = useState<JDProfile | null>(null);
  const [resumeContext, setResumeContext] = useState('');
  const [jdContext, setJdContext] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState('');
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [activeTab, setActiveTab] = useState<'prepare' | 'history'>('prepare');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Confirm / Refine state
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showRefineChat, setShowRefineChat] = useState<'resume' | 'jd' | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Load sessions
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/interview/sessions',
        method: 'GET',
        data: { skip: 0, limit: 50 },
      });
      const items = response?.data?.items || response?.data || [];
      setSessions(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // File upload handler
  const handleFileUpload = async (file: File) => {
    const validExts = ['.pdf', '.doc', '.docx', '.md', '.txt'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validExts.includes(ext)) {
      alert(`Unsupported format. Please upload: ${validExts.join(', ')}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.');
      return;
    }

    setIsUploading(true);
    setUploadedFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const baseUrl = getAPIBaseURL();
      const resp = await fetch(`${baseUrl}/api/v1/interview/upload-resume`, {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(err.detail || 'Upload failed');
      }

      const data = await resp.json();
      setResumeText(data.text || '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      alert(msg);
      setUploadedFileName('');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  // Analyze resume and JD with structured output
  const handleAnalyze = async () => {
    if (!resumeText.trim() && !jdText.trim()) return;
    setIsAnalyzing(true);
    setIsConfirmed(false);
    setShowRefineChat(null);
    setChatMessages([]);

    try {
      if (resumeText.trim()) {
        setAnalyzeStep('Extracting resume profile with Gemini Pro...');
        const resumeResp = await client.apiCall.invoke({
          url: '/api/v1/interview/analyze-structured',
          method: 'POST',
          data: { text: resumeText, type: 'resume', language },
        });
        // SDK wraps in response.data; backend returns {structured, concise_context}
        const raw = resumeResp?.data;
        const data = resolveStructuredAnalysisResponse<ResumeProfile>(raw);
        console.log('[Analyze Resume] raw response:', JSON.stringify(raw));
        console.log('[Analyze Resume] resolved data:', JSON.stringify(data));
        if (data?.structured) {
          setResumeProfile(normalizeResumeProfile(data.structured as ResumeProfile));
        }
        if (data?.concise_context) setResumeContext(data.concise_context);
      }

      if (jdText.trim()) {
        setAnalyzeStep('Extracting JD profile with Gemini Pro...');
        const jdResp = await client.apiCall.invoke({
          url: '/api/v1/interview/analyze-structured',
          method: 'POST',
          data: { text: jdText, type: 'jd', language },
        });
        const raw = jdResp?.data;
        const data = resolveStructuredAnalysisResponse<JDProfile>(raw);
        console.log('[Analyze JD] raw response:', JSON.stringify(raw));
        console.log('[Analyze JD] resolved data:', JSON.stringify(data));
        if (data?.structured) {
          setJdProfile(normalizeJDProfile(data.structured as JDProfile));
        }
        if (data?.concise_context) setJdContext(data.concise_context);
      }

      setAnalyzeStep('');
    } catch (err) {
      console.error('Analysis error:', err);
      setAnalyzeStep('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Confirm analysis
  const handleConfirm = () => {
    setIsConfirmed(true);
    setShowRefineChat(null);
  };

  // Open refine chat
  const handleRequestChanges = (type: 'resume' | 'jd') => {
    setShowRefineChat(type);
    setChatMessages([{
      role: 'assistant',
      content: type === 'resume'
        ? "I'm ready to help refine the resume analysis. What would you like to change? You can ask me to add, remove, or modify any fields."
        : "I'm ready to help refine the JD analysis. What would you like to change? You can ask me to add, remove, or modify any fields.",
    }]);
    setChatInput('');
  };

  // Send refine message
  const handleSendRefine = async () => {
    if (!chatInput.trim() || isRefining || !showRefineChat) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsRefining(true);

    try {
      const currentStructured = showRefineChat === 'resume'
        ? resumeProfile
        : jdProfile;

      const resp = await client.apiCall.invoke({
        url: '/api/v1/interview/refine-analysis',
        method: 'POST',
        data: {
          current_structured: currentStructured,
          feedback: userMsg,
          type: showRefineChat,
          language,
        },
      });

      const raw = resp?.data;
      const data = resolveStructuredAnalysisResponse<ResumeProfile | JDProfile>(raw);
      console.log('[Refine] raw response:', JSON.stringify(raw));
      if (data?.structured) {
        if (showRefineChat === 'resume') {
          setResumeProfile(normalizeResumeProfile(data.structured as ResumeProfile));
          if (data.concise_context) setResumeContext(data.concise_context);
        } else {
          setJdProfile(normalizeJDProfile(data.structured as JDProfile));
          if (data.concise_context) setJdContext(data.concise_context);
        }
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: '✅ Analysis updated! Check the card on the left. Want to make more changes, or are you satisfied?',
        }]);
      }
    } catch (err) {
      console.error('Refine error:', err);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Failed to refine. Please try again or rephrase your request.',
      }]);
    } finally {
      setIsRefining(false);
    }
  };

  // Start interview
  const handleStartInterview = async () => {
    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/interview/sessions',
        method: 'POST',
        data: {
          resume_text: resumeText,
          jd_text: jdText,
          resume_summary: resumeContext,
          jd_summary: jdContext,
          language,
          title: `Interview ${new Date().toLocaleDateString()}`,
        },
      });
      const sessionId = response?.data?.id;
      if (sessionId) {
        navigate(`/interview/${sessionId}`, {
          state: { resumeContext, jdContext, language, resumeText, jdText },
        });
      }
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleDeleteSession = async (id: number) => {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/interview/sessions/${id}`,
        method: 'DELETE',
      });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const analysisReady = !!(resumeProfile || jdProfile);

  return (
    <div className="min-h-screen bg-[#07070A] text-white flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/[0.07] rounded-full blur-[120px]" />
        <div className="absolute -top-20 -right-40 w-96 h-96 bg-cyan-600/[0.05] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-60 bg-purple-600/[0.04] rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-white/[0.06] bg-black/30 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#07070A]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              Interview Copilot
            </h1>
            <p className="text-[11px] text-white/35 font-medium -mt-0.5">
              Gemini Pro · Gemini Flash · Volcano STT
            </p>
          </div>
        </div>

        {/* Tabs in header */}
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-full p-1 border border-white/[0.06]">
          <button
            onClick={() => setActiveTab('prepare')}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
              activeTab === 'prepare'
                ? 'bg-gradient-to-r from-purple-500/20 to-cyan-500/20 text-white shadow-inner border border-white/10'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            ✦ Prepare
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
              activeTab === 'history'
                ? 'bg-gradient-to-r from-purple-500/20 to-cyan-500/20 text-white shadow-inner border border-white/10'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            History {sessions.length > 0 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-white/10">{sessions.length}</span>}
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        {activeTab === 'prepare' ? (
          <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
            {/* Language Selection */}
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Language</span>
              <div className="flex gap-2">
                {[
                  { value: 'zh', label: '中文', icon: '🇨🇳' },
                  { value: 'en', label: 'English', icon: '🇺🇸' },
                  { value: 'mixed', label: '混合', icon: '🌐' },
                ].map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => setLanguage(lang.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 border ${
                      language === lang.value
                        ? 'bg-gradient-to-r from-purple-500/15 to-cyan-500/15 border-purple-500/30 text-white shadow-lg shadow-purple-500/10'
                        : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:bg-white/[0.05] hover:text-white/60'
                    }`}
                  >
                    <span className="mr-1.5">{lang.icon}</span>
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Resume Upload Area */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-white/60 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-purple-500/20 flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-400">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    Resume / 简历
                  </label>
                  {uploadedFileName && (
                    <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                      📎 {uploadedFileName}
                    </span>
                  )}
                </div>

                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => !resumeText && fileInputRef.current?.click()}
                  className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 ${
                    isDragOver
                      ? 'border-purple-400/60 bg-purple-500/10 scale-[1.01]'
                      : resumeText
                        ? 'border-transparent bg-transparent'
                        : 'border-white/[0.08] bg-white/[0.02] hover:border-purple-500/30 hover:bg-purple-500/[0.03] cursor-pointer'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.md,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.target.value = '';
                    }}
                  />

                  {isUploading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-purple-400">Parsing {uploadedFileName}...</p>
                    </div>
                  ) : resumeText ? (
                    <div className="relative">
                      <Textarea
                        value={resumeText}
                        onChange={(e) => setResumeText(e.target.value)}
                        className="min-h-[200px] bg-white/[0.03] border border-white/[0.06] text-white/90 placeholder:text-white/15 resize-none rounded-2xl focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
                      />
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-purple-500/20 text-white/30 hover:text-purple-400 transition-all"
                          title="Upload new file"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setResumeText('');
                            setUploadedFileName('');
                            setResumeProfile(null);
                            setResumeContext('');
                            setIsConfirmed(false);
                          }}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all"
                          title="Clear"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/25">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 flex items-center justify-center border border-purple-500/10">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-400/60">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-white/40">Drop resume file here</p>
                        <p className="text-[11px] text-white/25 mt-1">PDF, DOCX, MD, TXT · Max 10MB</p>
                      </div>
                      <span className="text-[10px] text-white/20 mt-1">or click to browse</span>
                    </div>
                  )}
                </div>
              </div>

              {/* JD Input */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-white/60 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/20 flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-cyan-400">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  Job Description / 职位描述
                </label>
                <Textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste the job description here..."
                  className="min-h-[200px] bg-white/[0.03] border border-white/[0.06] text-white/90 placeholder:text-white/15 resize-none rounded-2xl focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-4">
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing || (!resumeText.trim() && !jdText.trim())}
                className="relative bg-gradient-to-r from-purple-600 to-violet-600 text-white px-8 py-2.5 rounded-xl font-semibold hover:from-purple-500 hover:to-violet-500 transition-all duration-300 disabled:opacity-30 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
              >
                {isAnalyzing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                    {analyzeStep || 'Analyzing...'}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    {analysisReady ? 'Re-analyze with Gemini Pro' : 'Analyze with Gemini Pro'}
                  </span>
                )}
              </Button>

              {analysisReady && !isConfirmed && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-xs text-yellow-400 font-medium">Review analysis below, then confirm or request changes</span>
                </div>
              )}

              {isConfirmed && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-400">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-xs text-green-400 font-medium">Analysis confirmed — ready to start</span>
                </div>
              )}
            </div>

            {/* ─── Analysis Results + Confirm/Refine ─────────────────────── */}
            {analysisReady && (
              <div className="space-y-6">
                {/* Analysis Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {resumeProfile && <ResumeCard profile={resumeProfile} />}
                  {jdProfile && <JDCard profile={jdProfile} />}
                </div>

                {/* Confirm / Request Changes Buttons */}
                {!isConfirmed && (
                  <div className="flex items-center justify-center gap-4 py-2">
                    <Button
                      onClick={handleConfirm}
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-10 py-3 rounded-xl font-bold shadow-lg shadow-green-500/20 hover:shadow-green-500/30 transition-all duration-300"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Confirm Analysis
                    </Button>

                    {resumeProfile && (
                      <Button
                        onClick={() => handleRequestChanges('resume')}
                        className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 border ${
                          showRefineChat === 'resume'
                            ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                            : 'bg-white/[0.03] border-white/[0.08] text-white/50 hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-300'
                        }`}
                      >
                        ✏️ Refine Resume
                      </Button>
                    )}

                    {jdProfile && (
                      <Button
                        onClick={() => handleRequestChanges('jd')}
                        className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 border ${
                          showRefineChat === 'jd'
                            ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                            : 'bg-white/[0.03] border-white/[0.08] text-white/50 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-300'
                        }`}
                      >
                        ✏️ Refine JD
                      </Button>
                    )}
                  </div>
                )}

                {/* Refine Chatbot */}
                {showRefineChat && !isConfirmed && (
                  <div className={`rounded-2xl border p-5 space-y-4 backdrop-blur-sm ${
                    showRefineChat === 'resume'
                      ? 'border-purple-500/20 bg-gradient-to-b from-purple-500/[0.04] to-transparent'
                      : 'border-cyan-500/20 bg-gradient-to-b from-cyan-500/[0.04] to-transparent'
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        showRefineChat === 'resume' ? 'bg-purple-500/20' : 'bg-cyan-500/20'
                      }`}>
                        <span className="text-xs">💬</span>
                      </div>
                      <h4 className={`text-sm font-bold ${
                        showRefineChat === 'resume' ? 'text-purple-300' : 'text-cyan-300'
                      }`}>
                        Refine {showRefineChat === 'resume' ? 'Resume' : 'JD'} Analysis
                      </h4>
                      <button
                        onClick={() => setShowRefineChat(null)}
                        className="ml-auto p-1 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-all"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>

                    {/* Chat messages */}
                    <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-gradient-to-r from-purple-500/20 to-violet-500/20 text-white/90 border border-purple-500/20'
                              : 'bg-white/[0.04] text-white/70 border border-white/[0.06]'
                          }`}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {isRefining && (
                        <div className="flex justify-start">
                          <div className="px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                              <span className="text-[12px] text-white/40">Gemini Pro is refining...</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Chat input */}
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendRefine()}
                        placeholder="Tell Gemini Pro what to change..."
                        className="flex-1 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/90 placeholder:text-white/20 text-sm focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
                        disabled={isRefining}
                      />
                      <Button
                        onClick={handleSendRefine}
                        disabled={!chatInput.trim() || isRefining}
                        className={`px-5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-30 ${
                          showRefineChat === 'resume'
                            ? 'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white'
                            : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                        }`}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Start Interview CTA */}
            <div className="pt-2 pb-8">
              <Button
                onClick={handleStartInterview}
                disabled={analysisReady && !isConfirmed}
                className="w-full relative overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white py-7 rounded-2xl text-lg font-bold shadow-xl shadow-green-500/20 hover:shadow-green-500/30 transition-all duration-300 group disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                  Start Interview
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              </Button>
              <p className="text-[11px] text-white/25 text-center mt-3">
                {!analysisReady
                  ? 'You can start without uploading resume/JD — or add them for personalized AI answers'
                  : !isConfirmed
                    ? '⚠ Please confirm the analysis above before starting the interview'
                    : '✦ Gemini Flash will use your confirmed structured context for fast, personalized answers'}
              </p>
            </div>
          </div>
        ) : (
          /* History Tab */
          <div className="max-w-4xl mx-auto px-8 py-8 space-y-4">
            {loadingSessions ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/25 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center border border-white/[0.06]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                </div>
                <p className="text-sm font-medium">No interview records yet</p>
                <Button
                  onClick={() => setActiveTab('prepare')}
                  className="bg-gradient-to-r from-purple-600 to-violet-600 text-white px-6 rounded-xl font-medium hover:from-purple-500 hover:to-violet-500 transition-all"
                >
                  Start your first interview
                </Button>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex items-center justify-between hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 cursor-pointer group"
                  onClick={() =>
                    navigate(`/interview/${session.id}`, {
                      state: {
                        resumeContext: session.resume_summary || '',
                        jdContext: session.jd_summary || '',
                        language: session.language || 'en',
                        viewOnly: session.status === 'completed',
                      },
                    })
                  }
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        session.status === 'completed'
                          ? 'bg-green-400'
                          : session.status === 'active'
                            ? 'bg-yellow-400 animate-pulse'
                            : 'bg-white/15'
                      }`}
                    />
                    <div>
                      <h3 className="text-sm font-semibold text-white/85 group-hover:text-white transition-colors">
                        {session.title || `Interview #${session.id}`}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-white/30">{formatDate(session.created_at)}</span>
                        <span className="text-[11px] text-white/30 font-mono">{formatDuration(session.duration)}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-lg bg-white/[0.04] text-white/35 border border-white/[0.06]">
                          {session.language === 'zh' ? '中文' : session.language === 'mixed' ? '中英' : 'EN'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] px-3 py-1 rounded-full font-medium ${
                        session.status === 'completed'
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : session.status === 'active'
                            ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                            : 'bg-white/[0.04] text-white/30 border border-white/[0.06]'
                      }`}
                    >
                      {session.status}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      className="p-2 rounded-xl hover:bg-red-500/10 text-white/15 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
