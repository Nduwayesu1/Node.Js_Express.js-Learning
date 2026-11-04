import hashlib
import hmac
import os
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Virtual Loan Payment Simulator", version="1.0.0")

PaymentChannel = Literal["mtn_mobile_money", "airtel_mobile_money", "bank_transfer", "virtual_account"]


class PaymentRequest(BaseModel):
    amount: int = Field(gt=0, le=9_000_000_000_000_000)
    currency: Literal["RWF"]
    channel: PaymentChannel
    idempotency_key: UUID
    simulate_failure: bool = False


def build_payment_result(request: PaymentRequest, reference_secret: str) -> dict[str, object]:
    reference_hash = hmac.new(
        reference_secret.encode("utf-8"),
        str(request.idempotency_key).encode("ascii"),
        hashlib.sha256,
    ).hexdigest()[:20].upper()
    status = "failed" if request.simulate_failure else "succeeded"

    return {
        "status": status,
        "amount": request.amount,
        "currency": request.currency,
        "channel": request.channel,
        "reference": f"VIRT-{reference_hash}",
        "receipt_number": f"RCP-{reference_hash}",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "simulation": True,
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "simulation"}


@app.post("/v1/payments")
def simulate_payment(
    request: PaymentRequest,
    service_key: str | None = Header(default=None, alias="X-Payment-Service-Key"),
) -> dict[str, object]:
    configured_key = os.getenv("PAYMENT_SIMULATOR_API_KEY", "")
    if not configured_key:
        raise HTTPException(status_code=503, detail="Payment simulator service key is not configured")
    if service_key is None or not hmac.compare_digest(service_key, configured_key):
        raise HTTPException(status_code=401, detail="Payment service authentication failed")

    return build_payment_result(request, configured_key)
