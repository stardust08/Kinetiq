"""
Sending an OTP by SMS, via AWS SNS.

The client is built lazily rather than at import. Building it at import time meant this
module - and therefore the auth service, and therefore the whole application - could not
be imported without AWS credentials, which is how a missing SMS key turned into a server
that would not start.

With no credentials configured, `send_otp` reports that it is not configured instead of
raising. The caller already treats a failed send as non-fatal; see OTPService.
"""

from typing import Any, Dict, Optional

from app.core.config import settings

#: Created on first use and reused. None until then, or when SMS is not configured.
_client: Optional[Any] = None


def _get_client() -> Optional[Any]:
    """The SNS client, or None when there are no credentials to build one with."""
    global _client
    if not settings.sms_configured:
        return None
    if _client is None:
        import boto3

        _client = boto3.client(
            "sns",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _client


def send_otp(phone: str, otp: str) -> Dict[str, Any]:
    """
    Send an OTP to a phone number.

    Returns a result rather than raising, because failing to send an SMS must not fail
    the request that generated the code - the code is already stored and can be
    delivered another way.

    Args:
        phone: Phone number to send the OTP to.
        otp: The one-time code.

    Returns:
        {"success": bool, "message": str, "configured": bool}
    """
    client = _get_client()
    if client is None:
        return {
            "success": False,
            "configured": False,
            "message": (
                "SMS is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY "
                "to send OTPs by SMS."
            ),
        }

    try:
        client.publish(
            PhoneNumber=phone,
            Message=f"Your OTP for Neura-AI is {otp}. It will expire in 10 minutes.",
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {
                    "DataType": "String",
                    "StringValue": "Transactional",
                }
            },
        )
        return {"success": True, "configured": True, "message": "SMS sent successfully"}
    except Exception as exc:  # noqa: BLE001 - reported, never raised at the caller
        import logging

        logging.getLogger(__name__).warning("failed to send OTP SMS: %s", exc)
        return {"success": False, "configured": True, "message": "Failed to send SMS"}
