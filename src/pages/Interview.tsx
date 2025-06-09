import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Send, MessageSquare, Sparkles, User, Bot, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

interface Message {
  id: string;
  type: 'ai' | 'user';
  content: string;
  timestamp: string;
}

interface ProjectDetails {
  id: string;
  title: string;
  product_idea_prompt: string | null;
  user_id: string;
  interview_guide?: { questions?: Array<{ id: string; text: string; type: string }> } | null;
}

interface FounderPersona {
  name: string | null;
  companyName: string | null;
}

interface ConversationRow {
  sender_type: string;
  content: string;
}

export default function InterviewPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<Message[]>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [interviewStarted, setInterviewStarted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null)
  const [founderPersona, setFounderPersona] = useState<FounderPersona | null>(null)
  const [currentInterviewId, setCurrentInterviewId] = useState<string | null>(null)
  const [interviewConcluded, setInterviewConcluded] = useState(false)

  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [insightsSuccess, setInsightsSuccess] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(scrollToBottom, [messages])

  useEffect(() => {
    if (!projectId) {
      setError("No project ID provided.")
      setIsLoading(false)
      return
    }

    const fetchDetails = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('id, title, product_idea_prompt, user_id, interview_guide')
          .eq('id', projectId)
          .single()

        if (projectError || !projectData) {
          throw new Error(projectError?.message || "Project not found or access denied.")
        }
        setProjectDetails(projectData)

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', projectData.user_id)
        
        if (profileError) {
          console.warn("Could not fetch founder profile, using defaults:", profileError.message)
          setFounderPersona({ name: 'Founder', companyName: projectData.title || 'Startup' })
        } else {
          setFounderPersona({ 
            name: profileData?.full_name || 'Founder',
            companyName: projectData.title || 'Startup' 
          })
        }

      } catch (err: Error) {
        setError(err.message || "Failed to load interview details.")
        console.error("Error fetching interview details:", err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchDetails()
  }, [projectId])

  const startInterviewSession = async () => {
    if (!projectDetails || !founderPersona) return
    setInterviewStarted(true)
    setIsTyping(true)

    try {
      const { data: interviewEntry, error: interviewError } = await supabase
        .from('interviews')
        .insert({
          project_id: projectDetails.id,
          user_id: projectDetails.user_id,
          status: 'started',
          started_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (interviewError || !interviewEntry) {
        throw new Error(interviewError?.message || "Could not start interview session.")
      }
      setCurrentInterviewId(interviewEntry.id)

      const firstQuestionFromGuide = projectDetails.interview_guide?.questions?.[0]?.text;
      const firstQuestion = firstQuestionFromGuide || 
        `Hi there! I'm ${founderPersona.name}, and I'm working on a new idea: ${projectDetails.title}. Thanks for taking the time to chat! Could you start by telling me a bit about your experiences related to this?`;
      
      const aiMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: firstQuestion,
        timestamp: new Date().toISOString(),
      }
      setMessages([aiMessage])

      await supabase.from('conversations').insert({
        interview_id: interviewEntry.id,
        sender_type: 'ai',
        content: firstQuestion,
      })

    } catch (err: Error) {
      setError(err.message || "Failed to initialize interview.")
      console.error("Error starting interview session:", err)
      setInterviewStarted(false)
    } finally {
      setIsTyping(false)
    }
  }

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || !projectDetails || !founderPersona || !currentInterviewId || interviewConcluded) return

    const userMsgContent = currentMessage.trim()
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: userMsgContent,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMessage])
    setCurrentMessage('')
    setIsTyping(true)

    try {
      await supabase.from('conversations').insert({
        interview_id: currentInterviewId,
        sender_type: 'user',
        content: userMsgContent,
      })

      const { data: aiResponseData, error: functionError } = await supabase.functions.invoke(
        'ai-interviewer',
        {
          body: {
            productIdea: projectDetails.product_idea_prompt || projectDetails.title,
            founderPersona: founderPersona,
            conversationHistory: messages.slice(-10),
            userResponse: userMsgContent,
          },
        }
      )

      if (functionError) throw new Error(`AI Function Error: ${functionError.message}`)
      if (aiResponseData.error) throw new Error(`AI Response Error: ${aiResponseData.error}`)

      const aiMsgContent = aiResponseData.aiResponse || "Sorry, I had a glitch. Could you repeat that?"
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiMsgContent,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, aiMessage])

      await supabase.from('conversations').insert({
        interview_id: currentInterviewId,
        sender_type: 'ai',
        content: aiMsgContent,
      })

      const updatedMessages = [...messages, userMessage, aiMessage]
      const userMessageCount = updatedMessages.filter(m => m.type === 'user').length
      
      console.log('User message count:', userMessageCount, 'AI response contains thank you:', aiMsgContent.toLowerCase().includes("thank you for your time"))
      
      if (userMessageCount >= 4 || aiMsgContent.toLowerCase().includes("thank you for your time")) {
        console.log('Interview concluded, starting insights processing...')
        setInterviewConcluded(true)
        await supabase.from('interviews').update({ 
          status: 'completed', 
          completed_at: new Date().toISOString() 
        }).eq('id', currentInterviewId)
      }

    } catch (err: Error) {
      console.error("Error sending message or getting AI response:", err)
      const errorAiMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: "I seem to be having some trouble connecting. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorAiMsg])
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  useEffect(() => {
    const processInsights = async () => {
      if (!interviewConcluded || !currentInterviewId || !projectDetails || !founderPersona) {
        console.log('Insights processing skipped:', { 
          interviewConcluded, 
          currentInterviewId: !!currentInterviewId, 
          projectDetails: !!projectDetails, 
          founderPersona: !!founderPersona 
        })
        return
      }
      
      console.log('Starting insights processing for interview:', currentInterviewId)
      setInsightsLoading(true)
      setInsightsError(null)
      setInsightsSuccess(false)
      
      try {
        // Fetch full conversation
        console.log('Fetching conversation data...')
        const { data: convoData, error: convoError } = await supabase
          .from('conversations')
          .select('sender_type, content')
          .eq('interview_id', currentInterviewId)
          .order('id', { ascending: true })
          
        if (convoError || !convoData) {
          console.error('Failed to fetch conversation:', convoError)
          throw new Error(convoError?.message || 'Failed to fetch conversation')
        }
        
        console.log('Conversation data fetched, messages:', convoData.length)
        
        const fullConversation = (convoData as ConversationRow[]).map((msg) => ({
          type: msg.sender_type === 'ai' ? 'ai' : 'user',
          content: msg.content
        }))
        
        // Call Edge Function
        console.log('Calling process-interview-insights function...')
        const { data: insights, error: insightsFnError } = await supabase.functions.invoke('process-interview-insights', {
          body: {
            productIdea: projectDetails.product_idea_prompt || projectDetails.title,
            founderPersona,
            fullConversation
          }
        })
        
        if (insightsFnError) {
          console.error('Insights function error:', insightsFnError)
          throw new Error(insightsFnError.message)
        }
        if (insights.error) {
          console.error('Insights response error:', insights.error)
          throw new Error(insights.error)
        }
        
        console.log('Insights generated successfully:', insights)
        
        // Save to insights table
        console.log('Saving insights to database...')
        const { error: saveError } = await supabase.from('insights').insert({
          interview_id: currentInterviewId,
          project_id: projectDetails.id,
          user_id: projectDetails.user_id,
          summary_text: insights.executiveSummary?.whatWeLearned || '',
          key_learnings: insights.executiveSummary || {},
          pain_points: insights.painPoints || [],
          quotes: insights.notableQuotes || [],
          objections: insights.objections || [],
          product_ideas: insights.productIdeas || [],
        })
        
        if (saveError) {
          console.error('Failed to save insights:', saveError)
          throw new Error(saveError.message)
        }
        
        console.log('Insights saved successfully!')
        setInsightsSuccess(true)
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to process insights'
        console.error('Insights processing error:', errorMessage)
        setInsightsError(errorMessage)
        setInsightsSuccess(false)
      } finally {
        setInsightsLoading(false)
      }
    }
    if (interviewConcluded) processInsights()
  }, [interviewConcluded, currentInterviewId, projectDetails, founderPersona])

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
        <p className="text-slate-700 text-lg">Loading interview...</p>
      </div>
    )
  }

  if (error || !projectDetails || !founderPersona) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-semibold text-red-700 mb-2">Error Loading Interview</h2>
        <p className="text-slate-600 mb-6">{error || "Could not load the necessary details for this interview."}</p>
        <Button onClick={() => navigate('/')} variant="outline">Go to Homepage</Button>
      </div>
    )
  }

  if (!interviewStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full shadow-2xl">
          <CardHeader className="text-center pb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl mb-2">Customer Interview</CardTitle>
            <div className="space-y-2">
              <Badge variant="secondary" className="px-3 py-1">
                <Sparkles className="w-4 h-4 mr-2" />
                {founderPersona.companyName}
              </Badge>
              <h3 className="text-xl font-semibold text-slate-900">{projectDetails.title}</h3>
              <p className="text-slate-600">
                {projectDetails.product_idea_prompt ? 
                  `We're exploring an idea: "${projectDetails.product_idea_prompt.substring(0,100)}${projectDetails.product_idea_prompt.length > 100 ? '...' : ''}"` 
                  : "Help us understand your experiences."
                }
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <div className="flex items-start space-x-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-blue-600 text-white">
                    {(founderPersona.name || 'F').split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-slate-900">{founderPersona.name}</p>
                  <p className="text-sm text-slate-600">Founder, {founderPersona.companyName}</p>
                  <p className="text-sm text-slate-700 mt-2">
                    "Hi! I'm excited to learn about your experience. 
                    This conversation will help us build something that truly helps people like you."
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-slate-900">What to expect:</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                  A few conversational questions (~5-7 minutes)
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                  Natural chat about your experiences and thoughts
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                  Your insights are anonymous and help shape our product
                </li>
              </ul>
            </div>

            <Button 
              onClick={startInterviewSession}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 py-6 text-lg"
              disabled={isTyping}
            >
              {isTyping ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <MessageSquare className="w-5 h-5 mr-2" />}
              {isTyping ? 'Initializing...' : 'Start Interview'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{founderPersona.companyName}</p>
                <p className="text-sm text-slate-600">Interview with {founderPersona.name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-xl border border-slate-200 h-[calc(100vh-200px)] flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[80%] ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end space-x-2 space-x-reverse`}>
                  <Avatar className={`w-8 h-8 flex-shrink-0 ${message.type === 'user' ? 'ml-2' : 'mr-2'}`}>
                    <AvatarFallback className={message.type === 'ai' ? 'bg-blue-600 text-white' : 'bg-slate-600 text-white'}>
                      {message.type === 'ai' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`rounded-2xl px-4 py-3 message-bubble ${
                    message.type === 'user' 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none' 
                      : 'bg-slate-100 text-slate-900 rounded-bl-none'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex space-x-3 items-end">
                  <Avatar className="w-8 h-8 mr-2">
                    <AvatarFallback className="bg-blue-600 text-white">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-slate-100 text-slate-900 rounded-2xl px-4 py-3 rounded-bl-none">
                    <div className="flex space-x-1 items-center h-5 typing-indicator">
                      <div className="w-2 h-2 bg-slate-400 rounded-full dot"></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full dot"></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full dot"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t bg-slate-50 p-4">
            {interviewConcluded ? (
              <div className="text-center py-3">
                <p className="text-slate-700 font-medium">This interview has concluded. Thank you for your participation!</p>
                <p className="text-sm text-slate-500 mt-1">Your insights are valuable.</p>
                {insightsLoading && (
                  <div className="flex flex-col items-center mt-4">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
                    <span className="text-blue-700">Processing interview insights...</span>
                  </div>
                )}
                {insightsError && (
                  <div className="mt-4 text-red-600 text-sm">{insightsError}</div>
                )}
                {insightsSuccess && (
                  <div className="mt-4 text-green-700 text-sm font-medium">Interview insights have been generated and saved!</div>
                )}
                {/* Optionally show a summary preview here */}
              </div>
            ) : (
              <div className="flex space-x-4">
                <Input
                  placeholder="Type your response..."
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1"
                  disabled={isTyping || interviewConcluded}
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={!currentMessage.trim() || isTyping || interviewConcluded}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                >
                  {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}