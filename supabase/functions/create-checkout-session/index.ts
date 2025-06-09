import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import Stripe from "npm:stripe@^14.21.0"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
})

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
    const { priceId, userId, userEmail } = await req.json()

    if (!priceId || !userId) {
      return new Response(JSON.stringify({ error: "Missing required fields: priceId, userId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    // Get the origin for redirect URLs
    const origin = req.headers.get("origin") || "https://ai-customer-interview-tool-s1docb5e.live.blink.new"

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      client_reference_id: userId, // Link this checkout to our user
      customer_email: userEmail, // Pre-fill email if available
      metadata: {
        userId: userId,
      },
      allow_promotion_codes: true,
    })

    return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })

  } catch (error: unknown) {
    console.error("Error creating checkout session:", error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to create checkout session" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
})