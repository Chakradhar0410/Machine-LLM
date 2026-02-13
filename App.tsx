import React, { useState, useCallback } from 'react';
import { AppState, Course, Message, Quiz } from './types';
import Header from './components/Header';
import CourseSidebar from './components/CourseSidebar';
import ChatInterface from './components/ChatInterface';
import QuizModal from './components/QuizModal';
import { generateCourseCurriculum, streamChatResponse, generateQuizForModule } from './services/geminiService';
import { Search, Loader2, Sparkles, Brain } from 'lucide-react';

function App() {
  const [state, setState] = useState<AppState>({
    currentView: 'landing',
    courses: [],
    activeCourseId: null,
    activeModuleIndex: null,
    activeLessonIndex: null,
    chatHistory: [],
    activeQuiz: null,
    isLoading: false,
  });
  
  const [topicInput, setTopicInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const activeCourse = state.courses.find(c => c.id === state.activeCourseId);
  const activeModule = activeCourse && state.activeModuleIndex !== null ? activeCourse.modules[state.activeModuleIndex] : null;
  const activeLesson = activeModule && state.activeLessonIndex !== null ? activeModule.lessons[state.activeLessonIndex] : null;

  const handleGenerateCurriculum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicInput.trim()) return;

    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const course = await generateCourseCurriculum(topicInput);
      setState(prev => ({
        ...prev,
        courses: [...prev.courses, course],
        activeCourseId: course.id,
        currentView: 'course',
        activeModuleIndex: 0,
        activeLessonIndex: 0,
        chatHistory: [], // Reset chat for new course
        isLoading: false
      }));
      
      // Initial greeting for the new course
      const greeting: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        content: `Welcome to **${course.title}**! I'm your AI tutor. We'll start with **${course.modules[0].lessons[0].title}**. \n\n${course.modules[0].lessons[0].description}\n\nAsk me anything to begin!`
      };
      setState(prev => ({ ...prev, chatHistory: [greeting] }));

    } catch (error) {
      console.error(error);
      alert("Failed to generate curriculum. Please try again.");
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleSelectLesson = useCallback((moduleIndex: number, lessonIndex: number) => {
    if (!activeCourse) return;
    
    const module = activeCourse.modules[moduleIndex];
    const lesson = module.lessons[lessonIndex];

    setState(prev => ({
      ...prev,
      activeModuleIndex: moduleIndex,
      activeLessonIndex: lessonIndex,
      // Add a system message separator in chat or just keep history? 
      // Let's add a context switch message to the user locally but clear history for cleaner context in this simple app
      // actually keeping history is better for "I remember what we discussed"
      // but providing context of new lesson is crucial.
    }));
    
    // Inject a context switch message
    const contextMsg: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        content: `Moving on to **${module.title}: ${lesson.title}**.\n\n${lesson.description}\n\nReady?`
    };
    setState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, contextMsg] }));
  }, [activeCourse]);

  const handleSendMessage = async (text: string) => {
    if (!activeCourse || !activeModule || !activeLesson) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    setState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, userMsg] }));
    setIsStreaming(true);

    const modelMsgId = crypto.randomUUID();
    const initialModelMsg: Message = { id: modelMsgId, role: 'model', content: '', isStreaming: true };
    
    setState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, initialModelMsg] }));

    // Prepare history for API (map to Gemini format)
    // We include a system prompt context about the current lesson in the history logic or prompt
    const historyForApi = state.chatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));
    
    // Add current user message
    historyForApi.push({ role: 'user', parts: [{ text: text }] });

    // Add explicit context about current lesson to the latest prompt mostly invisibly via system instruction 
    // or by appending to the user prompt. Let's append context to user prompt for statelessness in simple service.
    const contextAwarePrompt = `[Current Context: Course "${activeCourse.title}", Module "${activeModule.title}", Lesson "${activeLesson.title}"]\nUser Question: ${text}`;

    try {
      let fullResponse = '';
      await streamChatResponse(
        // Pass previous history normally
        state.chatHistory.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] })), 
        contextAwarePrompt, 
        (chunk) => {
          fullResponse += chunk;
          setState(prev => ({
            ...prev,
            chatHistory: prev.chatHistory.map(msg => 
              msg.id === modelMsgId ? { ...msg, content: fullResponse } : msg
            )
          }));
        }
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
      setState(prev => ({
        ...prev,
        chatHistory: prev.chatHistory.map(msg => 
          msg.id === modelMsgId ? { ...msg, isStreaming: false } : msg
        )
      }));
    }
  };

  const handleTakeQuiz = async (moduleIndex: number) => {
    if (!activeCourse) return;
    const module = activeCourse.modules[moduleIndex];
    
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const quiz = await generateQuizForModule(module.title, activeCourse.topic);
      setState(prev => ({
        ...prev,
        activeQuiz: quiz,
        isLoading: false
      }));
    } catch (e) {
      console.error(e);
      setState(prev => ({ ...prev, isLoading: false }));
      alert("Could not generate quiz. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-slate-200 font-sans selection:bg-primary/30 selection:text-white">
      <Header onHomeClick={() => setState(prev => ({ ...prev, currentView: 'landing' }))} />
      
      {state.activeQuiz && (
        <QuizModal 
          quiz={state.activeQuiz} 
          onClose={() => setState(prev => ({ ...prev, activeQuiz: null }))} 
        />
      )}

      <main className="pt-16 min-h-screen flex">
        {state.currentView === 'landing' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[128px] pointer-events-none"></div>

            <div className="max-w-2xl w-full text-center z-10 space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-sm text-slate-400">
                <Brain className="w-4 h-4 text-primary" />
                <span>Powered by Gemini 3.0 Flash</span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white">
                Master <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">Machine Learning</span>
              </h1>
              
              <p className="text-xl text-slate-400 leading-relaxed max-w-lg mx-auto">
                Generate custom curriculums, visualize concepts, and test your skills with an AI tutor that adapts to you.
              </p>

              <form onSubmit={handleGenerateCurriculum} className="relative max-w-md mx-auto group">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                <div className="relative flex items-center bg-surface border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
                    <Search className="w-6 h-6 ml-4 text-slate-500" />
                    <input
                        type="text"
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        placeholder="What do you want to learn? (e.g. Transformers)"
                        className="w-full bg-transparent border-none px-4 py-4 text-white placeholder:text-slate-500 focus:outline-none"
                    />
                    <button 
                        type="submit"
                        disabled={state.isLoading || !topicInput.trim()}
                        className="mr-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {state.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-amber-300" />}
                    </button>
                </div>
              </form>

              {/* Suggestions */}
              <div className="flex flex-wrap justify-center gap-3 pt-4">
                {['Neural Networks', 'Reinforcement Learning', 'Computer Vision', 'LLMs'].map(topic => (
                    <button 
                        key={topic}
                        onClick={() => setTopicInput(topic)}
                        className="px-4 py-1.5 text-sm rounded-full bg-slate-800/50 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 transition-all text-slate-400 hover:text-white"
                    >
                        {topic}
                    </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeCourse && (
              <CourseSidebar 
                course={activeCourse} 
                activeModuleIndex={state.activeModuleIndex}
                activeLessonIndex={state.activeLessonIndex}
                onSelectLesson={handleSelectLesson}
                onTakeQuiz={handleTakeQuiz}
              />
            )}
            
            <div className="flex-1 min-w-0">
               {activeLesson && (
                   <ChatInterface 
                     messages={state.chatHistory}
                     onSendMessage={handleSendMessage}
                     isStreaming={isStreaming}
                     contextTitle={activeLesson.title}
                     contextDescription={activeLesson.description}
                   />
               )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;