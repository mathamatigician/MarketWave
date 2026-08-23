import os
import uuid
import logging
import razorpay
from typing import Dict, Any, Optional
from config import settings
import database

logger = logging.getLogger("Subscription")

# 3 Subscription Plans (in INR ₹)
SUBSCRIPTION_PLANS: Dict[str, Dict[str, Any]] = {
    "free": {
        "id": "free",
        "name": "Starter",
        "tagline": "Essential market monitoring for retail investors",
        "price_inr": 0,
        "amount_paise": 0,
        "billing": "Forever Free",
        "badge": "FREE",
        "popular": False,
        "features": [
            "Access to global sentiment heatmap",
            "Up to 3 watchlist tickers",
            "Daily top news summaries",
            "Standard AI assistant response speed",
            "Community support"
        ]
    },
    "pro": {
        "id": "pro",
        "name": "Pro Trader",
        "tagline": "Advanced sentiment analytics & real-time AI watchdog",
        "price_inr": 159,
        "amount_paise": 15900,  # 159 INR in paise
        "billing": "₹159/- / month",
        "badge": "PRO",
        "popular": True,
        "features": [
            "Unlimited stock watchlist",
            "Real-time streaming AI thought logs",
            "Granular 18-topic sentiment breakdown",
            "Hourly sentiment watchdog alerts",
            "Stock price vs sentiment correlation charts",
            "Priority AI assistant processing"
        ]
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "tagline": "Institutional-grade sentiment intelligence & API access",
        "price_inr": 299,
        "amount_paise": 29900,  # 299 INR in paise
        "billing": "₹299/- / month",
        "badge": "ENTERPRISE",
        "popular": False,
        "features": [
            "Everything in Pro Trader",
            "Multi-market comparison (US & NSE/BSE India)",
            "Custom web scraper & pipeline triggers",
            "Raw dataset export (CSV & JSON API)",
            "Dedicated account manager",
            "24/7 priority SLA support"
        ]
    }
}

def get_razorpay_client() -> Optional[razorpay.Client]:
    """Instantiates Razorpay Client using configured key credentials."""
    key_id = settings.razorpay_key_id or os.getenv("RAZORPAY_KEY_ID")
    key_secret = settings.razorpay_key_secret or os.getenv("RAZORPAY_KEY_SECRET")
    
    if not key_id or not key_secret:
        logger.error("Razorpay API credentials missing.")
        return None
        
    try:
        return razorpay.Client(auth=(key_id, key_secret))
    except Exception as e:
        logger.error(f"Error creating Razorpay client: {e}")
        return None

def create_subscription_order(plan_id: str, email: str) -> Dict[str, Any]:
    """Creates a Razorpay payment order for the specified plan ID."""
    if plan_id not in SUBSCRIPTION_PLANS:
        raise ValueError(f"Invalid subscription plan: {plan_id}")
        
    plan = SUBSCRIPTION_PLANS[plan_id]
    
    # Starter plan is 0 INR (free)
    if plan["price_inr"] == 0:
        order_id = f"free_ord_{uuid.uuid4().hex[:12]}"
        database.save_order(order_id, {"plan_id": plan_id, "email": email.lower(), "amount_paise": 0})
        return {
            "is_free": True,
            "plan_id": plan_id,
            "amount": 0,
            "currency": "INR",
            "order_id": order_id
        }

    client = get_razorpay_client()
    if not client:
        raise RuntimeError("Razorpay payment gateway client is not initialized.")

    order_data = {
        "amount": plan["amount_paise"],
        "currency": "INR",
        "receipt": f"rcpt_{uuid.uuid4().hex[:10]}",
        "notes": {
            "email": email,
            "plan_id": plan_id,
            "plan_name": plan["name"]
        }
    }

    try:
        razorpay_order = client.order.create(data=order_data)
        # Record what this order was actually created for. Payment verification
        # later must grant this stored plan_id, never a client-supplied one,
        # so a signature that's genuinely valid for a cheaper plan's order can't
        # be replayed to claim a more expensive plan.
        database.save_order(razorpay_order["id"], {
            "plan_id": plan_id,
            "email": email.lower(),
            "amount_paise": plan["amount_paise"]
        })
        return {
            "is_free": False,
            "order_id": razorpay_order["id"],
            "amount": razorpay_order["amount"],
            "currency": razorpay_order["currency"],
            "key_id": settings.razorpay_key_id or os.getenv("RAZORPAY_KEY_ID"),
            "plan_id": plan_id,
            "plan_name": plan["name"]
        }
    except Exception as e:
        logger.error(f"Failed to create Razorpay order: {e}")
        raise RuntimeError(f"Razorpay order creation failed: {str(e)}")

def resolve_verified_plan_id(razorpay_order_id: str, email: str) -> Optional[str]:
    """Looks up which plan a given order was actually created for.

    Returns the stored plan_id only if the order exists and belongs to the
    requesting email; returns None otherwise. Callers must grant this value,
    never a client-supplied plan_id, when finalizing a paid subscription.
    """
    order = database.get_order(razorpay_order_id)
    if not order:
        logger.warning(f"No stored order found for {razorpay_order_id}")
        return None
    if order.get("email", "").lower() != email.lower():
        logger.warning(f"Order {razorpay_order_id} does not belong to {email}")
        return None
    return order.get("plan_id")

def verify_payment_signature(razorpay_order_id: str, razorpay_payment_id: str, razorpay_signature: str) -> bool:
    """Verifies Razorpay HMAC SHA256 payment signature."""
    client = get_razorpay_client()
    if not client:
        return False
        
    params_dict = {
        'razorpay_order_id': razorpay_order_id,
        'razorpay_payment_id': razorpay_payment_id,
        'razorpay_signature': razorpay_signature
    }
    
    try:
        client.utility.verify_payment_signature(params_dict)
        return True
    except razorpay.errors.SignatureVerificationError:
        logger.warning(f"Signature verification failed for order {razorpay_order_id}")
        return False
    except Exception as e:
        logger.error(f"Payment verification error: {e}")
        return False
