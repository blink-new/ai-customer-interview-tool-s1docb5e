import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { 
  Plus, 
  MessageSquare, 
  Users, 
  TrendingUp, 
  Calendar, 
  ExternalLink, 
  Settings,
  BarChart3,
  Copy,
  Sparkles,
  LogOut,
  Loader2,
  AlertTriangle,
  Lightbulb,
  CreditCard
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient' 

// Interface matching the projects table schema
interface InterviewProject {
  id: string; // UUID
  user_id: string; // UUID, matches auth.users.id
  title: string;
  description?: string;
  product_idea_prompt?: string;
  interview_guide?: { questions?: Array<Record<string, unknown>>; [key: string]: unknown }; // More specific than any
  status?: string; // e.g., draft, active, completed
  max_responses?: number;
  created_at?: string; // TIMESTAMPTZ
  updated_at?: string; // TIMESTAMPTZ
  // Frontend specific fields (not in DB, or calculated)
  responses_count?: number; // We'll need to fetch this separately or calculate
  last_activity_display?: string; // For display purposes
}

// Interface for recent insights
interface RecentInsight {
  id: string;
  project_id: string;
  project_title?: string; // We'll join to get this
  summary_text?: string; // Or a specific key learning
  pain_points?: Array<{ point: string; severity: string }>;
  created_at?: string;
  // A way to determine the type of insight for icon/color
  insight_type?: 'pain' | 'opportunity' | 'summary'; 
}

// Define a specific type for Supabase insight query result.
interface InsightFromSupabase {
  id: string;
  project_id: string;
  summary_text: string | null;
  pain_points: Array<{ point: string; severity: string }> | null;
  created_at: string;
  projects: { title: string } | null; // For the joined project title
}

// Interface for subscription data
interface Subscription {
  id: string;
  user_id: string;
  plan_type: string;
  status: string;
  response_limit: number | null;
  responses_used: number;
  current_period_end: string;
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, session, signOut, loading: authLoading } = useAuth()
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    productIdeaPrompt: '' 
  })
  const [projects, setProjects] = useState<InterviewProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [createProjectLoading, setCreateProjectLoading] = useState(false)
  const [recentInsights, setRecentInsights] = useState<RecentInsight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/')
      return
    }

    const fetchData = async () => {
      if (!user) return;
      setProjectsLoading(true)
      setInsightsLoading(true)
      setProjectsError(null)
      setInsightsError(null)

      try {
        const { data: projectsData, error: projectsErr } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }); // Order by updated_at for more relevant last activity
        
        if (projectsErr) throw projectsErr;

        let fetchedProjectsWithCounts: InterviewProject[] = [];
        if (projectsData) {
          fetchedProjectsWithCounts = await Promise.all(
            projectsData.map(async (p) => {
              const { count, error: countError } = await supabase
                .from('interviews')
                .select('id', { count: 'exact', head: true })
                .eq('project_id', p.id)
                .eq('status', 'completed');

              // Fetch last activity (latest interview completion or project update)
              let lastActivity = p.updated_at ? new Date(p.updated_at) : new Date(p.created_at || 0);
              const { data: lastInterview, error: lastInterviewError } = await supabase
                .from('interviews')
                .select('completed_at, created_at')
                .eq('project_id', p.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

              if (!lastInterviewError && lastInterview) {
                const lastInterviewDate = new Date(lastInterview.completed_at || lastInterview.created_at || 0);
                if (lastInterviewDate > lastActivity) {
                  lastActivity = lastInterviewDate;
                }
              }
              
              return {
                ...p,
                responses_count: countError ? 0 : count || 0,
                last_activity_display: lastActivity ? formatDistanceToNow(lastActivity, { addSuffix: true }) : 'N/A'
              };
            })
          );
        }
        setProjects(fetchedProjectsWithCounts);

        // Fetch subscription status
        const { data: subscriptionData, error: subscriptionErr } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .single()
        
        if (!subscriptionErr && subscriptionData) {
          setSubscription(subscriptionData)
        }

        // Fetch recent insights (joining with projects for title)
        const { data: insightsData, error: insightsErr } = await supabase
          .from('insights')
          .select(`
            id,
            project_id,
            summary_text,
            pain_points,
            created_at,
            projects (title) 
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5)

        if (insightsErr) throw insightsErr;
        
        const formattedInsights = (insightsData as InsightFromSupabase[] | null)?.map((insight) => ({
          id: insight.id,
          project_id: insight.project_id,
          project_title: insight.projects?.title || 'Unknown Project',
          summary_text: insight.summary_text || (insight.pain_points?.[0]?.point ? `Pain point: ${insight.pain_points[0].point}` : 'No summary available'),
          created_at: insight.created_at,
          insight_type: insight.pain_points?.[0] ? 'pain' : 'summary',
        })) || [];
        setRecentInsights(formattedInsights);

      } catch (error: unknown) { 
        console.error("Error fetching dashboard data:", error)
        if (!projectsLoading) setProjectsError(error instanceof Error ? error.message : 'Failed to fetch projects.')
        setInsightsError(error instanceof Error ? error.message : 'Failed to fetch insights.')
      } finally {
        setProjectsLoading(false)
        setInsightsLoading(false)
      }
    }

    if (user) {
      fetchData()
    }
  }, [user, session, authLoading, navigate])

  const handleManageBilling = async () => {
    if (!user) return
    setBillingLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { userId: user.id }
      })

      if (error) throw error
      if (data.error) throw new Error(data.error)

      // Redirect to Stripe Customer Portal
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error: unknown) {
      console.error('Billing portal error:', error)
      alert(`Failed to open billing portal: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setBillingLoading(false)
    }
  }

  const handleCreateProject = async () => {
    if (!user || !newProject.title || !newProject.productIdeaPrompt) return;
    setCreateProjectLoading(true)
    let createdProjectId: string | null = null;
    try {
      const { data: projectData, error: projectInsertError } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          title: newProject.title,
          description: newProject.description,
          product_idea_prompt: newProject.productIdeaPrompt,
          status: 'draft'
        })
        .select('id, title, description, product_idea_prompt, status, user_id, created_at') 
        .single()

      if (projectInsertError) throw projectInsertError;
      if (!projectData) throw new Error("Project created but no data returned.");
      
      createdProjectId = projectData.id;

      // Now, generate the interview guide
      let generatedGuide = null;
      try {
        const { data: guideFnResponse, error: guideFnError } = await supabase.functions.invoke(
          'generate-interview-guide',
          { body: { productIdeaPrompt: newProject.productIdeaPrompt } }
        );

        if (guideFnError) throw new Error(`Guide generation failed: ${guideFnError.message}`);
        if (guideFnResponse.error) throw new Error(`Guide generation error: ${guideFnResponse.error}`);
        
        generatedGuide = guideFnResponse; // This should be the JSON object like { questions: [...] }

        // Update the project with the generated guide
        const { error: updateError } = await supabase
          .from('projects')
          .update({ interview_guide: generatedGuide })
          .eq('id', createdProjectId);

        if (updateError) throw new Error(`Failed to save interview guide: ${updateError.message}`);
        
      } catch (guideError: unknown) {
        console.warn("Could not generate or save interview guide:", guideError instanceof Error ? guideError.message : String(guideError));
        // Proceed without guide, or show a partial success message
        // For now, we'll just log it and the project will exist without a guide
      }

      const newProjectForState: InterviewProject = {
        ...projectData,
        id: createdProjectId,
        interview_guide: generatedGuide, // Add guide to local state too
        responses_count: 0,
        last_activity_display: 'Just now'
      };

      setProjects(prev => [newProjectForState, ...prev]);
      setIsCreateDialogOpen(false);
      setNewProject({ title: '', description: '', productIdeaPrompt: '' });
      navigate(`/interview/${createdProjectId}`);

    } catch (error: unknown) {
      console.error("Error creating project or guide:", error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error during project creation'}`);
    } finally {
      setCreateProjectLoading(false);
    }
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'draft': return 'bg-gray-100 text-gray-800'
      default: return 'bg-yellow-100 text-yellow-800' // Default for unknown or new
    }
  }

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'active': return 'Active'
      case 'completed': return 'Completed'
      case 'draft': return 'Draft'
      default: return 'New'
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  if (authLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="ml-2 text-slate-700">Loading dashboard...</p>
      </div>
    )
  }

  // Mock stats for now
  const totalInterviews = projects.reduce((sum, p) => sum + (p.responses_count || 0), 0);
  const activeProjectsCount = projects.filter(p => p.status === 'active').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                InterviewAI
              </span>
            </div>
            <div className="flex items-center space-x-4">
              {subscription && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleManageBilling}
                  disabled={billingLoading}
                >
                  {billingLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4 mr-2" />
                  )}
                  Manage Billing
                </Button>
              )}
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/analytics')}>
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics
              </Button>
              <Button variant="destructive" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome back, {user?.email?.split('@')[0] || 'Founder'}!</h1>
          <p className="text-lg text-slate-600">Ready to validate your next big idea?</p>
          {subscription && (
            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    {subscription.plan_type === 'starter' ? 'Starter Plan' : 'Pro Plan'} • {subscription.status === 'active' ? 'Active' : subscription.status}
                  </p>
                  <p className="text-sm text-blue-600">
                    {subscription.responses_used} / {subscription.response_limit || '∞'} responses used this month
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-blue-600">
                    Renews {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {subscription.response_limit && (
                <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full" 
                    style={{ width: `${(subscription.responses_used / subscription.response_limit) * 100}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalInterviews}</div>
              {/* <p className="text-xs text-muted-foreground">+12% from last month</p> */}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeProjectsCount}</div>
              {/* <p className="text-xs text-muted-foreground">90 responses collected</p> */}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{projects.length}</div>
              {/* <p className="text-xs text-muted-foreground">Key findings discovered</p> */}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="projects" className="space-y-6">
          <div className="flex justify-between items-center">
            <TabsList>
              <TabsTrigger value="projects">Interview Projects</TabsTrigger>
              <TabsTrigger value="insights">Recent Insights</TabsTrigger> 
            </TabsList>
            
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                  <Plus className="w-4 h-4 mr-2" />
                  New Interview Project
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <Sparkles className="w-5 h-5 mr-2 text-blue-600" />
                    Create New Interview Project
                  </DialogTitle>
                  <DialogDescription>
                    Describe your product idea. We'll use this to tailor the AI interview.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Project Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., AI Writing Assistant for Students"
                      value={newProject.title}
                      onChange={(e) => setNewProject({...newProject, title: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Short Description (Optional)</Label>
                    <Input
                      id="description"
                      placeholder="Brief description of what you're validating"
                      value={newProject.description}
                      onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="productIdeaPrompt">Product Idea & Validation Goals</Label>
                    <Textarea
                      id="productIdeaPrompt"
                      placeholder="Describe your product idea, target audience, key features, and what you want to validate... This will guide the AI interviewer."
                      className="min-h-[120px]"
                      value={newProject.productIdeaPrompt}
                      onChange={(e) => setNewProject({...newProject, productIdeaPrompt: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={createProjectLoading}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateProject}
                    disabled={!newProject.title || !newProject.productIdeaPrompt || createProjectLoading}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  >
                    {createProjectLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {createProjectLoading ? 'Creating Project...' : 'Create Project & Start'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <TabsContent value="projects" className="space-y-6">
            {projectsLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="ml-2 text-slate-700">Loading projects...</p>
              </div>
            )}
            {projectsError && (
              <Card className="border-red-500 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-700">Error Loading Projects</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-red-600">{projectsError}</p>
                  <Button onClick={() => window.location.reload()} className="mt-4">Try Again</Button>
                </CardContent>
              </Card>
            )}
            {!projectsLoading && !projectsError && projects.length === 0 && (
              <Card className="text-center py-10">
                <CardHeader>
                  <CardTitle>No projects yet!</CardTitle>
                  <CardDescription>Click "New Interview Project" to get started.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setIsCreateDialogOpen(true)} size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                    <Plus className="w-5 h-5 mr-2" />
                    Create Your First Project
                  </Button>
                </CardContent>
              </Card>
            )}
            {!projectsLoading && !projectsError && projects.length > 0 && (
              <div className="grid gap-6">
                {projects.map((project) => (
                  <Card key={project.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-lg truncate" title={project.title}>{project.title}</CardTitle>
                            <Badge className={getStatusColor(project.status)}>
                              {getStatusText(project.status)}
                            </Badge>
                          </div>
                          <CardDescription className="truncate" title={project.description || 'No description'}>{project.description || 'No description'}</CardDescription>
                        </div>
                        <div className="flex space-x-2 flex-shrink-0 ml-4">
                          <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/interview/${project.id}`)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Link
                          </Button>
                           {/* Share button can be implemented later */}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 items-end">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-slate-600">Responses</p>
                          <p className="text-2xl font-bold text-slate-900">
                            {project.responses_count || 0} / {project.max_responses || 100}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-slate-600">Created</p>
                          <p className="text-sm text-slate-700 flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            {project.created_at ? new Date(project.created_at).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-slate-600">Last Activity</p>
                          <p className="text-sm text-slate-700">{project.last_activity_display || 'N/A'}</p>
                        </div>
                        <div className="flex items-end space-x-2 justify-self-end md:justify-self-auto">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => navigate(`/interview/${project.id}`)}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View/Start Interview
                          </Button>
                          <Button 
                            size="sm"
                            onClick={() => navigate('/analytics')} 
                            disabled 
                          >
                            <BarChart3 className="w-4 h-4 mr-2" />
                            Insights
                          </Button>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full" 
                          style={{ width: `${((project.responses_count || 0) / (project.max_responses || 100)) * 100}%` }}
                        ></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            {insightsLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="ml-2 text-slate-700">Loading recent insights...</p>
              </div>
            )}
            {insightsError && (
              <Card className="border-red-500 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-700">Error Loading Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-red-600">{insightsError}</p>
                  {/* <Button onClick={() => window.location.reload()} className="mt-4">Try Again</Button> */}
                </CardContent>
              </Card>
            )}
            {!insightsLoading && !insightsError && recentInsights.length === 0 && (
              <Card className="text-center py-10">
                <CardHeader>
                  <CardTitle>No insights yet!</CardTitle>
                  <CardDescription>Complete some interviews to see AI-generated insights here.</CardDescription>
                </CardHeader>
              </Card>
            )}
            {!insightsLoading && !insightsError && recentInsights.length > 0 && (
              <div className="grid gap-6">
                {recentInsights.map((insight) => (
                  <Card key={insight.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center space-x-3 mb-2">
                        {insight.insight_type === 'pain' ? 
                          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" /> : 
                          <Lightbulb className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                        }
                        <CardTitle className="text-lg truncate" title={insight.summary_text}>{insight.summary_text}</CardTitle>
                      </div>
                      <CardDescription>
                        From project: <span className="font-medium text-blue-600">{insight.project_title}</span>
                        {insight.created_at && ` • ${new Date(insight.created_at).toLocaleDateString()}`}
                      </CardDescription>
                    </CardHeader>
                    {/* Optionally, add a CardContent here to show more details or a link to the full analytics */}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}