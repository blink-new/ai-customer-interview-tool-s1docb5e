import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import Stripe from "npm:stripe@^14.21.0"
import { createClient } from "npm:@supabase/supabase-js@2"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
})

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: { 
        "Access-Control-Allow-Origin": "*", 
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
      } 
    })
  }

  try {
    console.log('Portal function received request')
    const { userId } = await req.json()

    if (!userId) {
      console.error('Missing userId in request body')
      return new Response(JSON.stringify({ error: "Missing required field: userId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    console.log('Fetching subscription for user:', userId)
    // Get the user's subscription to find their Stripe customer ID
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (subError || !subscription?.stripe_customer_id) {
      console.warn('No active subscription or customer ID found for user:', userId, subError)
      return new Response(JSON.stringify({ error: "No active subscription found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    console.log('Found customer ID:', subscription.stripe_customer_id)
    // Get the origin for return URL
    const origin = req.headers.get("origin") || "https://ai-customer-interview-tool-s1docb5e.live.blink.new"

    console.log('Creating Stripe billing portal session...')
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    })

    console.log('Stripe portal session created, redirecting to:', session.url)
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })

  } catch (error: unknown) {
    console.error("Error creating portal session:", error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to create portal session" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
})