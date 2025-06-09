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
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature"
      } 
    })
  }

  try {
    const signature = req.headers.get("stripe-signature")!
    const body = await req.text()
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")

    if (!webhookSecret) {
      console.error("Missing STRIPE_WEBHOOK_SECRET")
      return new Response("Webhook secret not configured", { status: 500 })
    }

    // Verify the webhook signature
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)

    console.log(`Received event: ${event.type}`)

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        
        if (session.mode === "subscription" && session.client_reference_id) {
          const userId = session.client_reference_id
          const customerId = session.customer as string
          const subscriptionId = session.subscription as string

          // Fetch the subscription details to get the price/plan info
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const priceId = subscription.items.data[0]?.price.id
          
          // Determine the plan based on price metadata
          const price = await stripe.prices.retrieve(priceId!)
          const planType = price.metadata.plan || "starter" // fallback
          const responseLimit = price.metadata.response_limit === "unlimited" ? null : parseInt(price.metadata.response_limit || "100")

          // Update or create user subscription record
          const { error } = await supabase
            .from('subscriptions')
            .upsert({
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              stripe_price_id: priceId,
              plan_type: planType,
              status: subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              response_limit: responseLimit,
              responses_used: 0, // Reset on new subscription
            }, {
              onConflict: 'user_id'
            })

          if (error) {
            console.error("Error updating subscription:", error)
            return new Response("Database error", { status: 500 })
          }

          console.log(`Successfully processed subscription for user ${userId}`)
        }
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        
        // Find user by customer ID
        const { data: existingSubscription } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (existingSubscription) {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              status: subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            })
            .eq('user_id', existingSubscription.user_id)

          if (error) {
            console.error("Error updating subscription status:", error)
            return new Response("Database error", { status: 500 })
          }
        }
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        
        // Find user by customer ID and mark subscription as canceled
        const { error } = await supabase
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error("Error canceling subscription:", error)
          return new Response("Database error", { status: 500 })
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response("OK", { status: 200 })

  } catch (error: unknown) {
    console.error("Webhook error:", error)
    return new Response(error instanceof Error ? error.message : "Webhook error", { status: 400 })
  }
})