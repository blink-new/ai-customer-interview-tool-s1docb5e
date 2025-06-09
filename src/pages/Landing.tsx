import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowRight, MessageSquare, Brain, Target, TrendingUp, Users, Zap, CheckCircle, LogIn, UserPlus, LogOut, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'

// Price IDs from Stripe
const PRICE_IDS = {
  starter: 'price_1RXug3ISLwoTHKI7fI5ewzlg', // $99/month
  pro: 'price_1RXug7ISLwoTHKI7jlAxytLn', // $299/month
}

export default function Landing() {
  const navigate = useNavigate()
  const { session, user, signOut, loading } = useAuth()
  const [isSignInOpen, setIsSignInOpen] = useState(false)
  const [isSignUpOpen, setIsSignUpOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null) // Track which plan is loading

  const features = [
    { icon: Brain, title: "AI Interview Guide", description: "Generate smart questions tailored to your product idea" },
    { icon: MessageSquare, title: "Human-like Conversations", description: "AI that asks follow-ups and captures emotion naturally" },
    { icon: Target, title: "Pain Point Discovery", description: "Uncover deep insights and customer objections" },
    { icon: TrendingUp, title: "Executive Summaries", description: "Get \"What we learned\" and \"What to build next\"" },
    { icon: Users, title: "Cross-interview Analytics", description: "Spot patterns across all customer conversations" },
    { icon: Zap, title: "Instant Insights", description: "Auto-summarize every conversation into actionable insights" }
  ]

  const pricingPlans = [
    {
      name: "Starter", 
      price: "$99", 
      period: "/month", 
      description: "Perfect for early-stage founders",
      features: ["100 interview responses/month", "AI interview guide generation", "Automated insights & summaries", "Basic analytics dashboard", "Email support"],
      popular: true,
      priceId: PRICE_IDS.starter
    },
    {
      name: "Pro", 
      price: "$299", 
      period: "/month", 
      description: "For growing product teams",
      features: ["500 interview responses/month", "Advanced analytics & patterns", "Team collaboration features", "Custom interview templates", "Priority support", "Export capabilities"],
      popular: false,
      priceId: PRICE_IDS.pro
    }
  ]

  const handleCheckout = async (priceId: string, planName: string) => {
    if (!user) {
      setIsSignUpOpen(true)
      return
    }

    setCheckoutLoading(planName)
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { 
          priceId, 
          userId: user.id,
          userEmail: user.email 
        }
      })

      if (error) {
        console.error('Supabase function error:', error)
        throw new Error(`Function error: ${error.message}`)
      }
      
      if (data?.error) {
        console.error('Stripe checkout error:', data.error)
        throw new Error(`Checkout error: ${data.error}`)
      }

      // Redirect to Stripe Checkout
      if (data?.url) {
        console.log('Redirecting to Stripe checkout:', data.url)
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned from Stripe')
      }
    } catch (error: unknown) {
      console.error('Checkout error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      alert(`Failed to start checkout: ${errorMessage}. Please try again or contact support.`)
    } finally {
      setCheckoutLoading(null)
    }
  }

  // ... existing auth functions ...

  const handleSignIn = async () => {
    setAuthLoading(true)
    setAuthError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setIsSignInOpen(false)
      navigate('/dashboard')
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : 'Failed to sign in.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignUp = async () => {
    setAuthLoading(true)
    setAuthError(null)
    try {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      setIsSignUpOpen(false)
      navigate('/dashboard') 
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : 'Failed to sign up.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  // ... existing useEffect ...

  useEffect(() => {
    if (session) {
      setIsSignInOpen(false)
      setIsSignUpOpen(false)
    }
  }, [session])

  return (
    <div className="min-h-screen">
      {/* ... existing nav section ... */}
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
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
              {loading ? (
                <Button variant="ghost" disabled>Loading...</Button>
              ) : session ? (
                <>
                  <Button variant="outline" onClick={() => navigate('/dashboard')}>
                    Dashboard
                  </Button>
                  <Button onClick={handleSignOut} variant="destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Dialog open={isSignInOpen} onOpenChange={setIsSignInOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost">
                        <LogIn className="w-4 h-4 mr-2" />
                        Sign In
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Sign In</DialogTitle>
                        <DialogDescription>Access your InterviewAI dashboard.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="email-signin">Email</Label>
                          <Input id="email-signin" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password-signin">Password</Label>
                          <Input id="password-signin" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                        </div>
                        {authError && <p className="text-sm text-red-600">{authError}</p>}
                      </div>
                      <Button onClick={handleSignIn} className="w-full" disabled={authLoading}>
                        {authLoading ? 'Signing In...' : 'Sign In'}
                      </Button>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={isSignUpOpen} onOpenChange={setIsSignUpOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Sign Up Free
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Sign Up</DialogTitle>
                        <DialogDescription>Create your InterviewAI account.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="email-signup">Email</Label>
                          <Input id="email-signup" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password-signup">Password</Label>
                          <Input id="password-signup" type="password" placeholder="Create a strong password" value={password} onChange={(e) => setPassword(e.target.value)} />
                        </div>
                        {authError && <p className="text-sm text-red-600">{authError}</p>}
                      </div>
                      <Button onClick={handleSignUp} className="w-full" disabled={authLoading}>
                        {authLoading ? 'Creating Account...' : 'Sign Up'}
                      </Button>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ... existing hero and features sections ... */}
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6 px-4 py-2">
            <Zap className="w-4 h-4 mr-2" />
            AI-Powered Customer Discovery
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-900 bg-clip-text text-transparent leading-tight">
            Validate Your Ideas with
            <br />
            <span className="text-blue-600">AI Customer Interviews</span>
          </h1>
          <p className="text-xl text-slate-600 mb-10 max-w-3xl mx-auto leading-relaxed">
            Generate smart interview guides, conduct AI-powered conversations, and get instant insights 
            that help you build products customers actually want.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              className="px-8 py-6 text-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              onClick={() => session ? navigate('/dashboard') : setIsSignUpOpen(true)}
            >
              {session ? 'Go to Dashboard' : 'Start Free Trial'}
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" className="px-8 py-6 text-lg">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-slate-900">
              Everything you need to validate ideas
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              From generating questions to analyzing patterns, our AI handles the entire interview process
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
                <CardHeader>
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <feature.icon className="w-6 h-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-slate-900">
              Simple, transparent pricing
            </h2>
            <p className="text-xl text-slate-600">
              Start validating your ideas today
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <Card key={index} className={`relative border-2 ${plan.popular ? 'border-blue-500 shadow-xl' : 'border-slate-200'}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription className="text-base">{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                    <span className="text-slate-600">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center">
                        <CheckCircle className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                        <span className="text-slate-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button 
                    className={`w-full ${plan.popular ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700' : ''}`}
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={() => handleCheckout(plan.priceId, plan.name)}
                    disabled={checkoutLoading === plan.name}
                  >
                    {checkoutLoading === plan.name ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Get Started'
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">InterviewAI</span>
            </div>
            <p className="text-slate-400">
              &copy; 2024 InterviewAI. Built for founders who ship.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}