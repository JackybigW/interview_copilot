# Interview Copilot - Workspace & Volcano STT Upgrade

## Design Guidelines

### Design References
- Dark professional theme matching existing Interview Copilot UI
- Glassmorphism cards with subtle borders

### Color Palette
- Primary BG: #0A0A0A (Deep Black)
- Card BG: rgba(255,255,255,0.03) with border rgba(255,255,255,0.06)
- Accent Purple: #A855F7 (purple-500)
- Accent Cyan: #06B6D4 (cyan-500)
- Accent Green: #22C55E (green-500)
- Text Primary: #FFFFFF
- Text Secondary: rgba(255,255,255,0.6)
- Text Muted: rgba(255,255,255,0.3)

### Typography
- Headings: Inter/system font, bold
- Body: Inter/system font, regular 14px
- Mono: Font-mono for timestamps/codes

---

## Architecture

### Backend Files (new/modified)
1. `backend/services/volcano_stt_service.py` - Volcano Engine WebSocket STT proxy service
2. `backend/routers/interview.py` - Interview API routes (analyze resume/JD, generate answers, save sessions, WebSocket STT)
3. `backend/requirements.txt` - Add websockets dependency

### Frontend Files (new/modified)
4. `frontend/src/pages/Workspace.tsx` - Main workspace page (upload resume/JD, language select, history)
5. `frontend/src/pages/Interview.tsx` - Interview page (refactored from Index.tsx with session support)
6. `frontend/src/hooks/useVolcanoSTT.ts` - WebSocket hook for Volcano Engine streaming STT
7. `frontend/src/hooks/useInterviewAI.ts` - Updated to use MiniMax LLM with resume/JD context
8. `frontend/src/App.tsx` - Updated routes

### Flow
1. User logs in → Workspace page
2. Upload resume + JD (stored in Object Storage "resumes" bucket)
3. Backend analyzes resume/JD with MiniMax LLM → structured summaries
4. User starts interview → creates session in DB
5. Volcano STT streams real-time transcription via WebSocket
6. MiniMax LLM detects questions + generates personalized answers using resume/JD context
7. Interview ends → save transcript + AI responses to DB
8. View history on Workspace page

---

## Tasks

1. [x] Create database table `interview_sessions`
2. [x] Create object storage bucket `resumes`
3. [ ] Write `backend/services/volcano_stt_service.py`
4. [ ] Write `backend/routers/interview.py`
5. [ ] Update `backend/requirements.txt`
6. [ ] Write `frontend/src/pages/Workspace.tsx`
7. [ ] Write `frontend/src/pages/Interview.tsx`
8. [ ] Write `frontend/src/hooks/useVolcanoSTT.ts`
9. [ ] Update `frontend/src/hooks/useInterviewAI.ts`
10. [ ] Update `frontend/src/App.tsx` routes
11. [ ] Update `frontend/index.html` title
12. [ ] Lint & build