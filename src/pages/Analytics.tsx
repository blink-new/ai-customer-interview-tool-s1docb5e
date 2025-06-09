import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { 
  ArrowLeft,
  MessageSquare, 
  TrendingUp, 
  Users, 
  Target,
  Quote,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  Download,
  Loader2 // Added Loader2
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'

// Interfaces for structured insights data from DB
interface ExecutiveSummaryDB {
  whatWeLearned?: string;
  whatToBuildNext?: string;
}
interface PainPointDB {
  point?: string;
  severity?: string;
}
interface QuoteDB {
  quote?: string;
  speaker?: string;
  sentiment?: string;
}
interface ObjectionDB {
  objection?: string;
  type?: string;
}
interface ProductIdeaDB {
  idea?: string;
  source?: string;
}

interface InsightRecord {
  id: string;
  project_id: string;
  user_id: string;
  summary_text: string | null;
  key_learnings: ExecutiveSummaryDB | null; // This is executiveSummary in the function
  pain_points: PainPointDB[] | null;
  quotes: QuoteDB[] | null;
  objections: ObjectionDB[] | null;
  product_ideas: ProductIdeaDB[] | null;
  created_at: string;
  projects?: { title: string } | null; // For joined project title
}

// Interfaces for aggregated/displayed analytics
interface AggregatedPainPoint {
  point: string;
  frequency: number;
  responses: number; // Count of interviews mentioning this
}
interface AggregatedFeatureRequest {
  feature: string;
  frequency: number;
  responses: number;
}
interface DisplayQuote extends QuoteDB {
  project_title?: string;
  respondent?: string; // Assuming speaker might be just 'User' from AI, add respondent later if available
}
interface DisplayKeyInsight {
  type: 'pain' | 'opportunity' | 'pricing' | 'objection' | 'summary';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  project: string;
  responses: number;
}

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const { user, session, loading: authLoading } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [allInsights, setAllInsights] = useState<InsightRecord[]>([])
  
  // Processed data for display
  const [executiveSummary, setExecutiveSummary] = useState<{ learned: string[]; build: string[] }>({ learned: [], build: [] })
  const [topPainPoints, setTopPainPoints] = useState<AggregatedPainPoint[]>([])
  const [topFeatureRequests, setTopFeatureRequests] = useState<AggregatedFeatureRequest[]>([])
  const [displayQuotes, setDisplayQuotes] = useState<DisplayQuote[]>([])
  const [displayKeyInsights, setDisplayKeyInsights] = useState<DisplayKeyInsight[]>([])
  const [overviewStats, setOverviewStats] = useState({
    totalInterviews: 0,
    // avgResponseRate: 0, // Harder to calculate without total sent invites
    topPainPointText: "N/A",
    keyInsightText: "N/A"
  })

  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/');
      return;
    }
    if (user) {
      fetchAndProcessInsights();
    }
  }, [user, session, authLoading, navigate]);

  const fetchAndProcessInsights = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('insights')
        .select('*, projects(title)') // Fetch all fields and joined project title
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (dbError) throw dbError;
      setAllInsights(data || []);
      processDataForDisplay(data || []);

    } catch (err: unknown) { // Changed to unknown
      setError(err instanceof Error ? err.message : 'Failed to load analytics data.');
      console.error("Analytics fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const processDataForDisplay = (insights: InsightRecord[]) => {
    if (!insights || insights.length === 0) {
        setOverviewStats({ totalInterviews: 0, topPainPointText: "N/A", keyInsightText: "N/A" });
        return;
    }

    // --- Executive Summary ---
    const learnedPoints: string[] = [];
    const buildPoints: string[] = [];
    insights.forEach(i => {
      if (i.key_learnings?.whatWeLearned) learnedPoints.push(i.key_learnings.whatWeLearned);
      if (i.key_learnings?.whatToBuildNext) buildPoints.push(i.key_learnings.whatToBuildNext);
    });
    // Simple concatenation for now, could be more sophisticated (e.g., unique points)
    setExecutiveSummary({ learned: learnedPoints.slice(0,5), build: buildPoints.slice(0,5) });

    // --- Pain Points ---
    const painPointCounts: Record<string, { count: number, severities: string[] }> = {};
    insights.forEach(i => {
      i.pain_points?.forEach(pp => {
        if (pp.point) {
          if (!painPointCounts[pp.point]) painPointCounts[pp.point] = { count: 0, severities: [] };
          painPointCounts[pp.point].count++;
          if(pp.severity) painPointCounts[pp.point].severities.push(pp.severity);
        }
      });
    });
    const aggregatedPains = Object.entries(painPointCounts)
      .map(([point, data]) => ({ point, responses: data.count, frequency: (data.count / insights.length) * 100 }))
      .sort((a, b) => b.responses - a.responses)
      .slice(0, 5);
    setTopPainPoints(aggregatedPains);

    // --- Feature Requests (from product_ideas) ---
    const featureCounts: Record<string, number> = {};
    insights.forEach(i => {
      i.product_ideas?.forEach(idea => {
        if (idea.idea) {
          featureCounts[idea.idea] = (featureCounts[idea.idea] || 0) + 1;
        }
      });
    });
    const aggregatedFeatures = Object.entries(featureCounts)
      .map(([feature, count]) => ({ feature, responses: count, frequency: (count / insights.length) * 100 }))
      .sort((a, b) => b.responses - a.responses)
      .slice(0, 5);
    setTopFeatureRequests(aggregatedFeatures);

    // --- Quotes ---
    const quotes: DisplayQuote[] = [];
    insights.forEach(i => {
      i.quotes?.forEach(q => {
        if (q.quote) {
          quotes.push({ 
            ...q, 
            project_title: i.projects?.title || 'Unknown Project',
            respondent: q.speaker === 'User' ? 'Interviewee' : q.speaker // Placeholder for respondent
          });
        }
      });
    });
    setDisplayQuotes(quotes.slice(0, 5));

    // --- Key Insights (simplified for display) ---
    const keyInsightsList: DisplayKeyInsight[] = [];
    insights.slice(0, 5).forEach(i => {
        if (i.summary_text) {
            keyInsightsList.push({
                type: 'summary',
                title: i.summary_text.substring(0, 100) + (i.summary_text.length > 100 ? '...' : ''),
                description: i.projects?.title || 'General Insight',
                impact: 'medium', // Placeholder
                project: i.projects?.title || 'N/A',
                responses: 1 // Each insight record is one "response" in this context
            });
        }
    });
    setDisplayKeyInsights(keyInsightsList);
    
    // --- Overview Stats ---
    setOverviewStats({
        totalInterviews: insights.length, // Each insight record corresponds to one interview
        topPainPointText: aggregatedPains[0]?.point || "N/A",
        keyInsightText: learnedPoints[0]?.substring(0,50) + (learnedPoints[0]?.length > 50 ? '...':'') || "N/A"
    });
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getInsightIcon = (type: DisplayKeyInsight['type']) => {
    switch (type) {
      case 'pain': return <AlertTriangle className="w-4 h-4" />
      case 'opportunity': return <Lightbulb className="w-4 h-4" />
      case 'pricing': return <Target className="w-4 h-4" />
      case 'objection': return <MessageSquare className="w-4 h-4" />
      case 'summary': return <TrendingUp className="w-4 h-4" />
      default: return <TrendingUp className="w-4 h-4" />
    }
  }

  if (authLoading || (!user && !session)) { // Adjusted loading condition
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="ml-2 text-slate-700">Loading analytics...</p>
      </div>
    )
  }
  
  if (isLoading) { // Separate loading for data fetching
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="ml-2 text-slate-700">Fetching insights data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-4">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-semibold text-red-700 mb-2">Error Loading Analytics</h2>
        <p className="text-slate-600 mb-6">{error}</p>
        <Button onClick={() => fetchAndProcessInsights()} variant="outline">Try Again</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="h-6 w-px bg-slate-300"></div>
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Analytics
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" disabled> {/* Export coming soon */}
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Interview Analytics</h1>
          <p className="text-lg text-slate-600 mb-6">Key insights and patterns from your customer interviews</p>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Interviews</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overviewStats.totalInterviews}</div>
                <p className="text-xs text-muted-foreground">
                  Analyzed interviews
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{[...new Set(allInsights.map(i => i.project_id))].length}</div>
                <p className="text-xs text-muted-foreground">
                  With generated insights
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Top Pain Point</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold text-slate-900 truncate" title={overviewStats.topPainPointText}>{overviewStats.topPainPointText}</div>
                {topPainPoints[0] && <p className="text-xs text-muted-foreground">{topPainPoints[0].frequency.toFixed(0)}% of interviews</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Key Learning</CardTitle>
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold text-slate-900 truncate" title={overviewStats.keyInsightText}>{overviewStats.keyInsightText}</div>
                {/* <p className="text-xs text-muted-foreground">Critical for strategy</p> */}
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs defaultValue="insights" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="insights">Key Insights</TabsTrigger>
            <TabsTrigger value="patterns">Pain Points</TabsTrigger>
            <TabsTrigger value="features">Feature Requests</TabsTrigger>
            <TabsTrigger value="quotes">Quotes</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="space-y-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
                    Executive Summary
                  </CardTitle>
                  <CardDescription>Aggregated learnings and next steps from all interviews</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border-l-4 border-blue-500 pl-6 py-4 bg-blue-50 rounded-r-lg">
                    <h3 className="font-semibold text-slate-900 mb-2">What We Learned</h3>
                    {executiveSummary.learned.length > 0 ? (
                      <ul className="space-y-2 text-slate-700">
                        {executiveSummary.learned.map((item, idx) => <li key={`learned-${idx}`}>• {item}</li>)}
                      </ul>
                    ) : <p className="text-slate-500 italic">No summary points generated yet.</p>}
                  </div>
                  <div className="border-l-4 border-green-500 pl-6 py-4 bg-green-50 rounded-r-lg">
                    <h3 className="font-semibold text-slate-900 mb-2">What We Should Build Next</h3>
                    {executiveSummary.build.length > 0 ? (
                      <ul className="space-y-2 text-slate-700">
                        {executiveSummary.build.map((item, idx) => <li key={`build-${idx}`}>• {item}</li>)}
                      </ul>
                    ) : <p className="text-slate-500 italic">No next step suggestions generated yet.</p>}
                  </div>
                </CardContent>
              </Card>

              {displayKeyInsights.length > 0 && (
                <div className="grid gap-4">
                  {displayKeyInsights.map((insight, index) => (
                    <Card key={index} className="hover:shadow-lg transition-shadow">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              {getInsightIcon(insight.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-slate-900 mb-1 truncate" title={insight.title}>{insight.title}</h3>
                              <p className="text-slate-600 mb-2 truncate" title={insight.description}>{insight.description}</p>
                              <div className="flex items-center space-x-2 text-sm text-slate-500">
                                <span>{insight.project}</span>
                                {/* <span>•</span>
                                <span>{insight.responses} responses</span> */}
                              </div>
                            </div>
                          </div>
                          <Badge className={getImpactColor(insight.impact)}>
                            {insight.impact} impact
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="patterns" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
                  Top Pain Points
                </CardTitle>
                <CardDescription>Most frequently mentioned problems across all interviews</CardDescription>
              </CardHeader>
              <CardContent>
                {topPainPoints.length > 0 ? (
                  <div className="space-y-4">
                    {topPainPoints.map((pain, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-900 truncate" title={pain.point}>{pain.point}</span>
                          <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                            <span className="text-sm text-slate-600">{pain.responses} interviews</span>
                            <Badge variant="secondary">{pain.frequency.toFixed(0)}%</Badge>
                          </div>
                        </div>
                        <Progress value={pain.frequency} className="h-2" />
                      </div>
                    ))}
                  </div>
                ) : <p className="text-slate-500 italic">No pain points data available yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Lightbulb className="w-5 h-5 mr-2 text-yellow-600" />
                  Most Requested Features
                </CardTitle>
                <CardDescription>Features customers want most, derived from product ideas</CardDescription>
              </CardHeader>
              <CardContent>
                {topFeatureRequests.length > 0 ? (
                  <div className="space-y-4">
                    {topFeatureRequests.map((feature, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-900 truncate" title={feature.feature}>{feature.feature}</span>
                          <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                            <span className="text-sm text-slate-600">{feature.responses} mentions</span>
                            <Badge variant="secondary">{feature.frequency.toFixed(0)}%</Badge>
                          </div>
                        </div>
                        <Progress value={feature.frequency} className="h-2" />
                      </div>
                    ))}
                  </div>
                ) : <p className="text-slate-500 italic">No feature request data available yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quotes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Quote className="w-5 h-5 mr-2 text-indigo-600" />
                  Customer Quotes
                </CardTitle>
                <CardDescription>Direct feedback from your interview participants</CardDescription>
              </CardHeader>
              <CardContent>
                {displayQuotes.length > 0 ? (
                  <div className="space-y-6">
                    {displayQuotes.map((quote, index) => (
                      <div key={index} className="border-l-4 border-slate-200 pl-4 py-3">
                        <blockquote className="text-slate-700 italic mb-3">
                          "{quote.quote}"
                        </blockquote>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-600">— {quote.respondent || 'Interviewee'} (Project: {quote.project_title})</p>
                          {quote.sentiment && (
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${
                                quote.sentiment === 'frustrated' || quote.sentiment === 'negative' ? 'bg-red-100 text-red-800' :
                                quote.sentiment === 'interested' || quote.sentiment === 'positive' ? 'bg-green-100 text-green-800' :
                                'bg-yellow-100 text-yellow-800' // neutral or concerned
                              }`}
                            >
                              {quote.sentiment}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-slate-500 italic">No quotes available yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}